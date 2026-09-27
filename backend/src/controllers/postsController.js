const supabase = require("../config/supabase");
const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");

const POST_COLUMNS =
    "id, platform, post_id, creator_name, creator_handle, original_text, " +
    "post_url, published_at, language, region, category, sentiment, summary, " +
    "is_gibberish, is_relevant, cluster_id, engagement, translations, " +
    "created_at, updated_at";

/*
|--------------------------------------------------------------------------
| Engagement calculation
|--------------------------------------------------------------------------
*/

const calculateEngagement = (post) => {
    const engagement = post.engagement || {};
    const platform = String(post.platform || "").toLowerCase();

    if (platform === "youtube") {
        return (
            Number(engagement.views || 0) +
            Number(engagement.likes || 0) +
            Number(engagement.comments || 0)
        );
    }

    if (platform === "reddit") {
        return (
            Number(
                engagement.score ??
                engagement.likes ??
                0
            ) +
            Number(engagement.comments || 0)
        );
    }

    if (platform === "bluesky") {
        return (
            Number(engagement.likes || 0) +
            Number(engagement.reposts || 0) +
            Number(engagement.comments || 0)
        );
    }

    return Number(post.total_engagement || 0);
};


/*
|--------------------------------------------------------------------------
| Add calculated engagement to posts
|--------------------------------------------------------------------------
*/

const addEngagement = (posts) => {
    return posts.map((post) => ({
        ...post,
        total_engagement: calculateEngagement(post)
    }));
};


/*
|--------------------------------------------------------------------------
| Category helper
|--------------------------------------------------------------------------
*/

const getCategoryName = (post) => {
    if (!post.category) {
        return "";
    }

    if (typeof post.category === "string") {
        try {
            const parsed = JSON.parse(post.category);

            if (
                typeof parsed === "object" &&
                parsed !== null
            ) {
                return (
                    parsed.category ||
                    parsed.name ||
                    parsed.label ||
                    parsed.primary ||
                    ""
                );
            }

            return String(parsed);
        } catch {
            return post.category;
        }
    }

    if (typeof post.category === "object") {
        return (
            post.category.category ||
            post.category.name ||
            post.category.label ||
            post.category.primary ||
            ""
        );
    }

    return "";
};


/*
|--------------------------------------------------------------------------
| Export sort helper
|--------------------------------------------------------------------------
*/

const EXPORT_SORT_FIELDS = [
    "published_at",
    "created_at",
    "platform",
    "category",
    "engagement"
];

const sortPostsForExport = (posts, sort, order) => {
    const field = EXPORT_SORT_FIELDS.includes(sort)
        ? sort
        : "published_at";

    const descending = String(order).toLowerCase() !== "asc";

    const toNumber = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const toTimestamp = (value) => {
        if (!value) {
            return 0;
        }

        const t = new Date(value).getTime();
        return Number.isFinite(t) ? t : 0;
    };

    const sortKey = (post) => {
        if (field === "engagement") {
            return toNumber(post.total_engagement);
        }

        if (field === "platform") {
            return String(post.platform || "").toLowerCase();
        }

        if (field === "category") {
            return getCategoryName(post).toLowerCase();
        }

        return toTimestamp(post[field]);
    };

    const idOf = (post) => String(post.id || post.post_id || "");

    return [...posts].sort((a, b) => {
        const av = sortKey(a);
        const bv = sortKey(b);

        if (av === bv) {
            return idOf(a).localeCompare(idOf(b));
        }

        if (typeof av === "string") {
            const c = av.localeCompare(bv);
            return descending ? -c : c;
        }

        return descending ? bv - av : av - bv;
    });
};


/*
|--------------------------------------------------------------------------
| Build common posts query
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
        .select(POST_COLUMNS)
        .eq("is_relevant", true)
        .eq("is_gibberish", false);

    if (platform) {
        query = query.eq(
            "platform",
            platform.toLowerCase()
        );
    }

    if (region) {
        const normalizedRegion = region.replace(/\s+/g, "");

        query = query.ilike(
            "region",
            `%${normalizedRegion}%`
        );
    }

    if (creator) {
        const quoted = `"%${String(creator).replace(/[\\"]/g, "\\$&")}%"`;

        query = query.or(
            `creator_name.ilike.${quoted},creator_handle.ilike.${quoted}`
        );
    }

    if (language) {
        query = query.eq(
            "language",
            language
        );
    }

    if (category) {
        query = query.ilike(
            "category",
            `%${category}%`
        );
    }

    if (sentiment) {
        query = query.eq(
            "sentiment",
            sentiment
        );
    }

    if (from) {
        query = query.gte(
            "published_at",
            from
        );
    }

    if (to) {
        query = query.lte(
            "published_at",
            to
        );
    }

    if (last24h === "true") {
        const twentyFourHoursAgo =
            new Date(
                Date.now() - 24 * 60 * 60 * 1000
            ).toISOString();

        query = query.gte(
            "published_at",
            twentyFourHoursAgo
        );
    }

    return query;
};


/*
|--------------------------------------------------------------------------
| GET POSTS
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

        const sortField =
            allowedSortFields.includes(sort)
                ? sort
                : "published_at";

        const ascending =
            String(order).toLowerCase() === "asc";


        if (sortField === "engagement") {

            const { data, error } =
                await buildPostsQuery(req);

            if (error) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to fetch posts",
                    error: error.message
                });
            }

            let posts = addEngagement(
                data || []
            );


            if (minEngagement !== undefined) {
                const minimum =
                    Number(minEngagement);

                if (!Number.isNaN(minimum)) {
                    posts = posts.filter(
                        (post) =>
                            post.total_engagement >=
                            minimum
                    );
                }
            }

            posts.sort((a, b) => {

                const aValue =
                    a.total_engagement;

                const bValue =
                    b.total_engagement;

                return ascending
                    ? aValue - bValue
                    : bValue - aValue;
            });


            return res.json({
                success: true,
                count: posts.length,

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

                data: posts
            });
        }


        let query =
            buildPostsQuery(req);

        query = query.order(
            sortField,
            {
                ascending
            }
        );


        const {
            data,
            error
        } = await query;


        if (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch posts",
                error: error.message
            });
        }


        let posts = addEngagement(
            data || []
        );


        if (minEngagement !== undefined) {

            const minimum =
                Number(minEngagement);

            if (!Number.isNaN(minimum)) {
                posts = posts.filter(
                    (post) =>
                        post.total_engagement >=
                        minimum
                );
            }
        }

        return res.json({
            success: true,

            count: posts.length,

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

            data: posts
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
| Text search helper
|--------------------------------------------------------------------------
*/

const matchesSearchTerm = (post, searchTerm) => {
    const originalMatch = (post.original_text || "")
        .toLowerCase()
        .includes(searchTerm);

    const summaryMatch = (post.summary || "")
        .toLowerCase()
        .includes(searchTerm);

    const translationMatch = Object.values(
        post.translations || {}
    ).some((translation) =>
        String(translation).toLowerCase().includes(searchTerm)
    );

    return originalMatch || summaryMatch || translationMatch;
};


/*
|--------------------------------------------------------------------------
| SEARCH POSTS
|--------------------------------------------------------------------------
*/

const searchPosts = async (req, res) => {
    try {

        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({
                success: false,
                message:
                    "Search query is required"
            });
        }

        const searchTerm =
            q.trim().toLowerCase();


        const {
            data,
            error
        } = await supabase
            .from("posts")
            .select(POST_COLUMNS)
            .eq("is_relevant", true)
            .eq("is_gibberish", false)
            .order(
                "published_at",
                {
                    ascending: false
                }
            );


        if (error) {
            return res.status(500).json({
                success: false,
                message: "Search failed",
                error: error.message
            });
        }


        const filteredPosts =
            (data || []).filter((post) =>
                matchesSearchTerm(post, searchTerm)
            );


        const posts =
            addEngagement(
                filteredPosts
            );


        return res.json({
            success: true,
            query: q.trim(),
            count: posts.length,
            data: posts
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
| CSV EXPORT
|--------------------------------------------------------------------------
*/

const exportCSV = async (req, res) => {
    try {

        let query =
            buildPostsQuery(req);

        query = query.order(
            "published_at",
            {
                ascending: false
            }
        );


        const {
            data,
            error
        } = await query;


        if (error) {
            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch posts",
                error: error.message
            });
        }


        let posts =
            addEngagement(
                data || []
            );

        if (req.query.q && req.query.q.trim()) {
            const searchTerm = req.query.q.trim().toLowerCase();

            posts = posts.filter((post) =>
                matchesSearchTerm(post, searchTerm)
            );
        }

        if (
            req.query.minEngagement !==
            undefined
        ) {

            const minimum =
                Number(
                    req.query.minEngagement
                );

            if (!Number.isNaN(minimum)) {

                posts = posts.filter(
                    (post) =>
                        post.total_engagement >=
                        minimum
                );
            }
        }

        posts = sortPostsForExport(
            posts,
            req.query.sort,
            req.query.order
        );

        const exportData =
            posts.map((post) => ({
                ...post,

                category:
                    getCategoryName(post)
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


        const parser =
            new Parser({
                fields
            });


        const csv =
            parser.parse(
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
            message:
                "CSV export failed",
            error: error.message
        });
    }
};


/*
|--------------------------------------------------------------------------
| PDF EXPORT
|--------------------------------------------------------------------------
*/

const exportPDF = async (req, res) => {
    try {

        let query =
            buildPostsQuery(req);

        query = query.order(
            "published_at",
            {
                ascending: false
            }
        );


        const {
            data,
            error
        } = await query;


        if (error) {
            throw error;
        }


        let posts =
            addEngagement(
                data || []
            );


        if (req.query.q && req.query.q.trim()) {
            const searchTerm = req.query.q.trim().toLowerCase();

            posts = posts.filter((post) =>
                matchesSearchTerm(post, searchTerm)
            );
        }

        if (
            req.query.minEngagement !==
            undefined
        ) {

            const minimum =
                Number(
                    req.query.minEngagement
                );

            if (!Number.isNaN(minimum)) {

                posts = posts.filter(
                    (post) =>
                        post.total_engagement >=
                        minimum
                );
            }
        }

        posts = sortPostsForExport(
            posts,
            req.query.sort,
            req.query.order
        );

        const doc =
            new PDFDocument({
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
            "Passport Social Intelligence",
            {
                align: "center"
            }
        );


        doc.fontSize(10).text(
            `Posts exported: ${posts.length}`,
            {
                align: "center"
            }
        );


        doc.moveDown();


        posts.forEach(
            (post, index) => {

                const category =
                    getCategoryName(
                        post
                    );


                doc
                    .fontSize(12)
                    .text(
                        `${index + 1}. ${
                            post.platform
                        }`
                    );


                doc
                    .fontSize(10)
                    .text(
                        `Creator: ${
                            post.creator_name ||
                            "Unknown"
                        }`
                    );


                if (category) {
                    doc.text(
                        `Category: ${category}`
                    );
                }


                if (post.sentiment) {
                    doc.text(
                        `Sentiment: ${
                            post.sentiment
                        }`
                    );
                }


                doc.text(
                    `Engagement: ${
                        post.total_engagement
                    }`
                );


                doc.moveDown(0.3);


                doc.text(
                    post.original_text ||
                    "No content"
                );


                if (post.summary) {

                    doc.moveDown(0.3);

                    doc.text(
                        `Summary: ${
                            post.summary
                        }`
                    );
                }


                if (post.post_url) {

                    doc.moveDown(0.3);

                    doc.text(
                        `URL: ${
                            post.post_url
                        }`
                    );
                }


                doc.moveDown();


                if (doc.y > 720) {
                    doc.addPage();
                }
            }
        );


        doc.end();

    } catch (error) {

        console.error(
            "PDF export failed:",
            error
        );


        if (!res.headersSent) {

            res.status(500).json({
                success: false,
                message:
                    "PDF export failed",
                error: error.message
            });
        }
    }
};


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
    getPosts,
    searchPosts,
    exportCSV,
    exportPDF
};