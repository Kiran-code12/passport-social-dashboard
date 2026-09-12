const supabase = require("../config/supabase");
const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");

/*
|--------------------------------------------------------------------------
| Helper: Apply post filters
|--------------------------------------------------------------------------
*/

const buildPostsQuery = (req) => {
    const {
        platform,
        region,
        creator,
        language,
        category,
        sentiment,
        from,
        to,
        last24h
    } = req.query;

    let query = supabase
        .from("posts")
        .select("*")
        .eq("is_relevant", true)
        .eq("is_gibberish", false);

    if (platform) {
        query = query.eq("platform", platform);
    }

    if (region) {
        query = query.eq("region", region);
    }

    if (creator) {
        query = query.or(
            `creator_name.ilike.%${creator}%,creator_handle.ilike.%${creator}%`
        );
    }

    if (language) {
        query = query.eq("language", language);
    }

    /*
     * category is currently stored as a JSON string, for example:
     *
     * {"category":"Renewal","score":1,"method":"domain_rule"}
     *
     * Therefore we search inside the stored JSON text instead of
     * checking for exact equality.
     */
    if (category) {
        query = query.ilike(
            "category",
            `%"category":"${category}"%`
        );
    }

    if (sentiment) {
        query = query.eq("sentiment", sentiment);
    }

    /*
     * Explicit time range
     */
    if (from) {
        query = query.gte("published_at", from);
    }

    if (to) {
        query = query.lte("published_at", to);
    }

    /*
     * Optional last-24-hours filter.
     *
     * The scraper is responsible for collecting recent posts,
     * while this option allows the API/dashboard to explicitly
     * request the last 24 hours.
     */
    if (last24h === "true") {
        const now = new Date();
        const twentyFourHoursAgo = new Date(
            now.getTime() - 24 * 60 * 60 * 1000
        );

        query = query.gte(
            "published_at",
            twentyFourHoursAgo.toISOString()
        );

        query = query.lte(
            "published_at",
            now.toISOString()
        );
    }

    return query;
};

/*
|--------------------------------------------------------------------------
| Helper: Calculate engagement
|--------------------------------------------------------------------------
*/

const addEngagement = (posts) => {
    return (posts || []).map(post => {
        const engagement = post.engagement || {};

        const totalEngagement =
            Number(engagement.views || 0) +
            Number(engagement.likes || 0) +
            Number(engagement.comments || 0);

        return {
            ...post,
            total_engagement: totalEngagement
        };
    });
};

/*
|--------------------------------------------------------------------------
| Helper: Get category name from stored JSON string
|--------------------------------------------------------------------------
*/

const getCategoryName = (category) => {
    if (!category) {
        return "";
    }

    if (typeof category === "object") {
        return category.category || "";
    }

    try {
        const parsed = JSON.parse(category);
        return parsed.category || "";
    } catch {
        return String(category);
    }
};

/*
|--------------------------------------------------------------------------
| GET /api/posts
|--------------------------------------------------------------------------
*/

const getPosts = async (req, res) => {
    try {
        const {
            minEngagement,
            sort = "published_at",
            order = "desc"
        } = req.query;

        const allowedSortFields = [
            "published_at",
            "created_at",
            "platform",
            "category",
            "engagement"
        ];

        const sortField = allowedSortFields.includes(sort)
            ? sort
            : "published_at";

        const ascending =
            order.toLowerCase() === "asc";

        let query = buildPostsQuery(req);

        /*
         * Engagement is stored inside JSONB, so it is calculated
         * and sorted in JavaScript.
         */
        if (sortField !== "engagement") {
            query = query.order(sortField, {
                ascending
            });
        }

        const { data, error } = await query;

        if (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch posts",
                error: error.message
            });
        }

        let filteredData = addEngagement(data);

        /*
         * Minimum engagement filter
         */
        if (minEngagement !== undefined) {
            const minimum = Number(minEngagement);

            if (!Number.isNaN(minimum)) {
                filteredData = filteredData.filter(
                    post =>
                        post.total_engagement >= minimum
                );
            }
        }

        /*
         * Engagement sorting
         */
        if (sortField === "engagement") {
            filteredData.sort((a, b) => {
                if (ascending) {
                    return (
                        a.total_engagement -
                        b.total_engagement
                    );
                }

                return (
                    b.total_engagement -
                    a.total_engagement
                );
            });
        }

        res.json({
            success: true,
            count: filteredData.length,

            filters: {
                platform:
                    req.query.platform || null,

                region:
                    req.query.region || null,

                creator:
                    req.query.creator || null,

                language:
                    req.query.language || null,

                category:
                    req.query.category || null,

                sentiment:
                    req.query.sentiment || null,

                minEngagement:
                    minEngagement || null,

                from:
                    req.query.from || null,

                to:
                    req.query.to || null,

                last24h:
                    req.query.last24h === "true",

                sort: sortField,

                order:
                    ascending
                        ? "asc"
                        : "desc"
            },

            data: filteredData
        });

    } catch (error) {
        console.error(
            "Get posts error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

/*
|--------------------------------------------------------------------------
| GET /api/posts/search
|--------------------------------------------------------------------------
*/

const searchPosts = async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({
                success: false,
                message: "Search query is required"
            });
        }

        const searchTerm = q.trim().toLowerCase();

        const { data, error } = await supabase
            .from("posts")
            .select("*")
            .eq("is_relevant", true)
            .eq("is_gibberish", false)
            .order("published_at", {
                ascending: false
            });

        if (error) {
            return res.status(500).json({
                success: false,
                message: "Search failed",
                error: error.message
            });
        }

        const filteredPosts = data.filter(post => {

            /*
             * Original content
             */
            const originalMatch =
                (post.original_text || "")
                    .toLowerCase()
                    .includes(searchTerm);

            /*
             * AI summary
             */
            const summaryMatch =
                (post.summary || "")
                    .toLowerCase()
                    .includes(searchTerm);

            /*
             * Translations
             */
            const translationMatch =
                Object.values(
                    post.translations || {}
                ).some(translation =>
                    String(translation)
                        .toLowerCase()
                        .includes(searchTerm)
                );

            return (
                originalMatch ||
                summaryMatch ||
                translationMatch
            );
        });

        res.json({
            success: true,
            query: q.trim(),
            count: filteredPosts.length,
            data: filteredPosts
        });

    } catch (error) {
        console.error(
            "Search error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

/*
|--------------------------------------------------------------------------
| GET /api/posts/export/csv
|--------------------------------------------------------------------------
*/

const exportCSV = async (req, res) => {
    try {
        let query = buildPostsQuery(req);

        query = query.order(
            "published_at",
            {
                ascending: false
            }
        );

        const { data, error } = await query;

        if (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch posts",
                error: error.message
            });
        }

        let exportData = addEngagement(data);

        /*
         * Apply minimum engagement to exported data as well.
         */
        const { minEngagement } = req.query;

        if (minEngagement !== undefined) {
            const minimum = Number(minEngagement);

            if (!Number.isNaN(minimum)) {
                exportData = exportData.filter(
                    post =>
                        post.total_engagement >= minimum
                );
            }
        }

        /*
         * Convert category JSON into a readable category name.
         */
        exportData = exportData.map(post => ({
            ...post,
            category: getCategoryName(
                post.category
            )
        }));

        const fields = [
            "platform",
            "post_id",
            "creator_name",
            "creator_handle",
            "original_text",
            "post_url",
            "published_at",
            "language",
            "region",
            "category",
            "sentiment",
            "total_engagement",
            "summary"
        ];

        const parser = new Parser({
            fields
        });

        const csv = parser.parse(
            exportData
        );

        res.header(
            "Content-Type",
            "text/csv"
        );

        res.attachment(
            "passport-posts.csv"
        );

        res.send(csv);

    } catch (error) {
        console.error(
            "CSV export error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "CSV export failed",
            error: error.message
        });
    }
};

/*
|--------------------------------------------------------------------------
| GET /api/posts/export/pdf
|--------------------------------------------------------------------------
*/

const exportPDF = async (req, res) => {
    try {
        let query = buildPostsQuery(req);

        query = query.order(
            "published_at",
            {
                ascending: false
            }
        );

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        let exportData = addEngagement(data);

        /*
         * Apply minimum engagement filter
         */
        const { minEngagement } = req.query;

        if (minEngagement !== undefined) {
            const minimum = Number(minEngagement);

            if (!Number.isNaN(minimum)) {
                exportData = exportData.filter(
                    post =>
                        post.total_engagement >= minimum
                );
            }
        }

        const doc = new PDFDocument({
            margin: 40
        });

        res.setHeader(
            "Content-Type",
            "application/pdf"
        );

        res.setHeader(
            "Content-Disposition",
            'attachment; filename="passport-posts.pdf"'
        );

        doc.pipe(res);

        doc.fontSize(20).text(
            "Passport Social Media Posts",
            {
                align: "center"
            }
        );

        doc.moveDown();

        doc.fontSize(10).text(
            `Total Posts: ${exportData.length}`
        );

        doc.moveDown();

        exportData.forEach((post, index) => {

            doc.fontSize(12).text(
                `${index + 1}. ${post.platform || "Unknown Platform"}`
            );

            doc.fontSize(10).text(
                `Creator: ${
                    post.creator_name ||
                    "Unknown"
                }`
            );

            doc.text(
                `Category: ${
                    getCategoryName(
                        post.category
                    ) || "Unknown"
                }`
            );

            doc.text(
                `Sentiment: ${
                    post.sentiment ||
                    "Unknown"
                }`
            );

            doc.text(
                `Engagement: ${
                    post.total_engagement
                }`
            );

            doc.moveDown(0.5);

            doc.text(
                post.original_text ||
                "No content"
            );

            if (post.summary) {
                doc.moveDown(0.5);

                doc.text(
                    `Summary: ${post.summary}`
                );
            }

            if (post.post_url) {
                doc.moveDown(0.5);

                doc.text(
                    `URL: ${post.post_url}`
                );
            }

            doc.moveDown();

            /*
             * Prevent content from going outside
             * the printable page area.
             */
            if (doc.y > 720) {
                doc.addPage();
            }
        });

        doc.end();

    } catch (error) {
        console.error(
            "PDF export failed:",
            error
        );

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "PDF export failed",
                error: error.message
            });
        }
    }
};

module.exports = {
    getPosts,
    searchPosts,
    exportCSV,
    exportPDF
};