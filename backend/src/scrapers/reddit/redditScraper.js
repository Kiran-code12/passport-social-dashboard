require("dotenv").config();

const Parser = require("rss-parser");

const supabase = require("../../config/supabase");

const { analyzeText } =
    require("../../nlp/gibberishFilter");

const { categorizeText } =
    require("../../nlp/categorizer");

const { checkRelevance } =
    require("../../nlp/relevanceFilter");

const { summarizeText } =
    require("../../nlp/summarizer");

const { analyzeSentiment } =
    require("../../nlp/sentimentAnalyzer");

const { detectRegion } =
    require("../../nlp/regionDetector");


const parser = new Parser();


const SUBREDDITS = [
    "passport",
    "immigration",
    "india",
    "travel"
];


const MAX_RETRIES = 2;

const RETRY_DELAY_MS = 3000;

const SUBREDDIT_DELAY_MS = 8000;


/**
 * Wait helper
 */
function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}


/**
 * Clean Reddit HTML / entities.
 *
 * Reddit RSS content can contain:
 * - HTML tags
 * - escaped HTML
 * - HTML comments
 * - HTML entities
 */
function decodeHtml(text) {

    if (!text) {
        return "";
    }

    let cleaned = String(text);


    // Decode escaped HTML characters
    cleaned = cleaned
        .replace(/\\u003C/gi, "<")
        .replace(/\\u003E/gi, ">")
        .replace(/\\u0026/gi, "&")
        .replace(/\\u0022/gi, '"')
        .replace(/\\u0027/gi, "'");


    // Remove Reddit HTML comments
    cleaned = cleaned.replace(
        /<!--[\s\S]*?-->/g,
        " "
    );


    // Convert common HTML tags to spaces
    cleaned = cleaned
        .replace(/<\/p>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/div>/gi, " ")
        .replace(/<\/li>/gi, " ")
        .replace(/<\/h[1-6]>/gi, " ");


    // Remove remaining HTML tags
    cleaned = cleaned.replace(
        /<[^>]*>/g,
        " "
    );


    // Decode common HTML entities
    cleaned = cleaned
        .replace(/&nbsp;/gi, " ")
        .replace(/&#32;/g, " ")
        .replace(/&#160;/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, "/");


    // Decode decimal HTML entities
    cleaned = cleaned.replace(
        /&#(\d+);/g,
        (_, code) => {

            try {
                return String.fromCodePoint(
                    Number(code)
                );
            } catch {
                return " ";
            }
        }
    );


    // Decode hexadecimal HTML entities
    cleaned = cleaned.replace(
        /&#x([0-9a-f]+);/gi,
        (_, code) => {

            try {
                return String.fromCodePoint(
                    parseInt(code, 16)
                );
            } catch {
                return " ";
            }
        }
    );


    // Normalize whitespace
    cleaned = cleaned
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s+([,.!?;:])/g, "$1")
        .trim();


    return cleaned;
}


/**
 * Clean title.
 */
function cleanTitle(title) {

    return decodeHtml(title || "")
        .replace(/\s+/g, " ")
        .trim();
}


/**
 * Clean content.
 */
function cleanContent(content) {

    return decodeHtml(content || "")
        .replace(/\s+/g, " ")
        .trim();
}


/**
 * Normalize one Reddit post.
 */
async function normalizePost(
    post,
    subreddit
) {

    const title =
        cleanTitle(post.title);


    const content =
        cleanContent(
            post.contentSnippet ||
            post.content ||
            ""
        );


    // Same structure used by YouTube:
    // title + description/content
    const combinedText =
        `${title}\n\n${content}`.trim();


    if (!combinedText) {
        return null;
    }


    // -----------------------------
    // Step 1: Gibberish analysis
    // -----------------------------

    const analysis =
        analyzeText(combinedText);


    // -----------------------------
    // Step 2: Relevance
    // -----------------------------

    const relevance =
        checkRelevance(combinedText);


    let category = null;

    let summary = null;


    // -----------------------------
    // Step 3: Category + summary
    // -----------------------------

    if (
        !analysis.isGibberish &&
        relevance.isRelevant
    ) {

        const categoryResult =
            await categorizeText(
                combinedText
            );

        category =
            categoryResult.category;


        const summaryResult =
            await summarizeText(
                combinedText
            );

        summary =
            summaryResult.summary;
    }


    // -----------------------------
    // Step 4: Sentiment
    // -----------------------------

    const sentiment =
        analyzeSentiment(
            combinedText
        );


    // -----------------------------
    // Step 5: Region
    // -----------------------------

    const region =
        detectRegion(
            combinedText
        );


    // -----------------------------
    // Return database object
    // -----------------------------

    return {

        platform: "reddit",


        // Reddit post ID
        post_id:
            post.guid ||
            post.id ||
            post.link,


        creator_name:
            post.creator ||
            post.author ||
            null,


        creator_handle:
            post.creator
                ? `u/${post.creator}`
                : null,


        original_text:
            combinedText,


        post_url:
            post.link ||
            null,


        published_at:
            post.isoDate ||
            post.pubDate ||
            new Date().toISOString(),


        language:
            analysis.detectedLanguage,


        region,


        category,


        sentiment,


        engagement: {
            views: 0,
            likes: 0,
            comments: 0
        },


        summary,


        translations: {},


        is_gibberish:
            analysis.isGibberish,


        is_relevant:
            relevance.isRelevant,


        cluster_id:
            null,


        raw_data: {
            ...post,

            subreddit
        }
    };
}


/**
 * Fetch a subreddit RSS feed.
 */
async function fetchSubreddit(
    subreddit
) {

    const url =
        `https://www.reddit.com/r/${subreddit}/new.rss`;


    let lastError = null;


    for (
        let attempt = 0;
        attempt <= MAX_RETRIES;
        attempt++
    ) {

        try {

            console.log(
                `Fetching Reddit /r/${subreddit} ` +
                `(attempt ${attempt + 1})...`
            );


            const response =
                await fetch(
                    url,
                    {
                        headers: {
                            "User-Agent":
                                "nodejs:passport-social-dashboard:v1.0 (by /u/Few-Sand7706)",

                            "Accept":
                                "application/rss+xml, application/xml, text/xml"
                        }
                    }
                );


            if (!response.ok) {

                throw new Error(
                    `Reddit returned HTTP ${response.status}`
                );
            }


            const xml =
                await response.text();


            const feed =
                await parser.parseString(
                    xml
                );


            console.log(
                `/r/${subreddit}: ` +
                `${feed.items.length} posts found`
            );


            return feed.items;


        } catch (error) {

            lastError = error;


            console.error(
                `/r/${subreddit} attempt ` +
                `${attempt + 1} failed:`,
                error.message
            );


            if (
                attempt < MAX_RETRIES
            ) {

                const delay =
                    RETRY_DELAY_MS *
                    Math.pow(2, attempt);


                console.log(
                    `Retrying in ${delay / 1000}s...`
                );


                await sleep(delay);
            }
        }
    }


    console.error(
        `Failed to fetch /r/${subreddit} ` +
        `after all retries:`,
        lastError?.message
    );


    return [];
}


/**
 * Save posts to Supabase.
 */
async function saveToSupabase(
    posts
) {

    if (posts.length === 0) {

        console.log(
            "No Reddit posts to save."
        );

        return;
    }


    const {
        data,
        error
    } =
        await supabase
            .from("posts")
            .upsert(
                posts,
                {
                    onConflict:
                        "platform,post_id"
                }
            )
            .select();


    if (error) {

        throw new Error(
            `Supabase upsert failed: ` +
            `${error.message}`
        );
    }


    console.log(
        `Saved/updated ${data.length} Reddit posts.`
    );
}


/**
 * Run Reddit scraper.
 */
async function runRedditScraper() {

    console.log(
        "\n========================================"
    );

    console.log(
        "Starting Reddit scraper"
    );

    console.log(
        "========================================\n"
    );


    let totalFound = 0;

    let totalProcessed = 0;

    let totalSaved = 0;

    let totalSkipped = 0;


    const cutoffTime =
        Date.now() -
        24 * 60 * 60 * 1000;


    for (
        const subreddit of SUBREDDITS
    ) {

        const posts =
            await fetchSubreddit(
                subreddit
            );


        totalFound +=
            posts.length;


        const normalizedPosts = [];


        for (
            const post of posts
        ) {

            try {

                const publishedTime =
                    new Date(
                        post.isoDate ||
                        post.pubDate ||
                        0
                    ).getTime();


                // Last 24 hours only
                if (
                    !publishedTime ||
                    publishedTime < cutoffTime
                ) {

                    continue;
                }


                const normalized =
                    await normalizePost(
                        post,
                        subreddit
                    );


                if (!normalized) {

                    totalSkipped++;

                    continue;
                }


                normalizedPosts.push(
                    normalized
                );


                totalProcessed++;


            } catch (error) {

                console.error(
                    "Error processing Reddit post:",
                    error.message
                );
            }
        }


        if (
            normalizedPosts.length > 0
        ) {

            await saveToSupabase(
                normalizedPosts
            );


            totalSaved +=
                normalizedPosts.length;
        }


        // Avoid hammering Reddit
        await sleep(
            SUBREDDIT_DELAY_MS
        );
    }


    console.log(
        "\n========================================"
    );

    console.log(
        "Reddit scraper complete"
    );

    console.log(
        "========================================"
    );


    console.log(
        `Total posts found: ${totalFound}`
    );

    console.log(
        `Total posts processed: ${totalProcessed}`
    );

    console.log(
        `Total posts saved/updated: ${totalSaved}`
    );

    console.log(
        `Total posts skipped: ${totalSkipped}`
    );


    return {
        totalFound,
        totalProcessed,
        totalSaved,
        totalSkipped
    };
}


/**
 * Run directly with:
 *
 * node src/scrapers/reddit/redditScraper.js
 */
if (
    require.main === module
) {

    runRedditScraper()
        .then(() => {

            console.log(
                "Reddit scraper completed successfully."
            );

            process.exit(0);
        })
        .catch(error => {

            console.error(
                "Reddit scraper failed:",
                error.message
            );

            process.exit(1);
        });
}


module.exports = {
    runRedditScraper,
    decodeHtml,
    cleanTitle,
    cleanContent
};