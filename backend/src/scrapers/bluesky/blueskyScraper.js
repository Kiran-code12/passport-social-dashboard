require("dotenv").config();

const supabase = require("../../config/supabase");
const { preserveExistingTranslations } = require("../../services/preserveTranslations");

const { analyzeText } = require("../../nlp/gibberishFilter");
const { categorizeText } = require("../../nlp/categorizer");
const { checkRelevance } = require("../../nlp/relevanceFilter");
const { summarizeText } = require("../../nlp/summarizer");
const { analyzeSentiment } = require("../../nlp/sentimentAnalyzer");
const { detectRegion } = require("../../nlp/regionDetector");

const BLUESKY_HOST =
    process.env.BLUESKY_SEARCH_HOST || "https://api.bsky.app";

const BLUESKY_IDENTIFIER =
    process.env.BLUESKY_IDENTIFIER;

const BLUESKY_APP_PASSWORD =
    process.env.BLUESKY_APP_PASSWORD;

const SEARCH_KEYWORD = "passport";
const LIMIT = 100;

async function createSession() {
    if (!BLUESKY_IDENTIFIER || !BLUESKY_APP_PASSWORD) {
        throw new Error(
            "Missing BLUESKY_IDENTIFIER or BLUESKY_APP_PASSWORD in .env"
        );
    }

    const response = await fetch(
        "https://bsky.social/xrpc/com.atproto.server.createSession",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                identifier: BLUESKY_IDENTIFIER,
                password: BLUESKY_APP_PASSWORD
            })
        }
    );

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `Bluesky authentication failed: ${response.status} ${errorText}`
        );
    }

    return response.json();
}

async function searchRecentPosts(accessJwt) {
    const params = new URLSearchParams({
        q: SEARCH_KEYWORD,
        limit: String(LIMIT),
        sort: "latest"
    });

    const response = await fetch(
        `${BLUESKY_HOST}/xrpc/app.bsky.feed.searchPosts?${params.toString()}`,
        {
            headers: {
                Authorization: `Bearer ${accessJwt}`
            }
        }
    );

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `Bluesky search failed: ${response.status} ${errorText}`
        );
    }

    const data = await response.json();

    return data.posts || [];
}

function getLast24Hours() {
    return Date.now() - 24 * 60 * 60 * 1000;
}

function buildPostUrl(author, uri) {
    if (!author?.handle || !uri) {
        return null;
    }

    const rkey = uri.split("/").pop();

    return `https://bsky.app/profile/${author.handle}/post/${rkey}`;
}

async function normalizePost(post) {
    const record = post.record || {};

    const originalText =
        (record.text || "").trim();

    const publishedAt =
        record.createdAt ||
        post.indexedAt ||
        null;

    if (!originalText || !publishedAt) {
        return null;
    }

    const publishedTime =
        new Date(publishedAt).getTime();

    if (
        Number.isNaN(publishedTime) ||
        publishedTime < getLast24Hours()
    ) {
        return null;
    }

    const analysis =
        analyzeText(originalText);

    const relevance =
        checkRelevance(originalText);

    let category = null;
    let summary = null;

    if (
        !analysis.isGibberish &&
        relevance.isRelevant
    ) {
        const categoryResult =
            await categorizeText(originalText);

        category =
            categoryResult.category;

        const summaryResult =
            await summarizeText(originalText);

        summary =
            summaryResult.summary;
    }

    const author =
        post.author || {};

    const creatorHandle =
        author.handle || null;

    const creatorName =
        author.displayName ||
        creatorHandle ||
        null;

    return {
        platform: "bluesky",

        post_id:
            post.uri,

        creator_name:
            creatorName,

        creator_handle:
            creatorHandle,

        original_text:
            originalText,

        post_url:
            buildPostUrl(author, post.uri),

        published_at:
            publishedAt,

        language:
            analysis.detectedLanguage,

        region:
            detectRegion(originalText),

        category,

        sentiment:
            analyzeSentiment(originalText),

        engagement: {
            likes:
                Number(post.likeCount) || 0,

            comments:
                Number(post.replyCount) || 0,

            reposts:
                Number(post.repostCount) || 0,

            views: 0
        },

        summary,

        translations: {},

        is_gibberish:
            analysis.isGibberish,

        is_relevant:
            relevance.isRelevant,

        cluster_id: null,

        raw_data:
            post
    };
}

async function saveToSupabase(posts) {
    const validPosts =
        posts.filter(Boolean);

    if (!validPosts.length) {
        console.log(
            "No Bluesky posts to save."
        );

        return;
    }

    // Keep translations already saved on re-fetched posts (see helper).
    const rows =
        await preserveExistingTranslations(validPosts);

    const { data, error } =
        await supabase
            .from("posts")
            .upsert(rows, {
                onConflict: "platform,post_id"
            })
            .select();

    if (error) {
        throw new Error(
            `Supabase upsert failed: ${error.message}`
        );
    }

    console.log(
        `Saved/updated ${data.length} Bluesky posts.`
    );
}

async function runBlueskyScraper() {
    console.log(
        `Authenticating with Bluesky...`
    );

    const session =
        await createSession();

    console.log(
        `Authenticated as ${session.handle}`
    );

    console.log(
        `Searching Bluesky for "${SEARCH_KEYWORD}" (last 24h)...`
    );

    const rawPosts =
        await searchRecentPosts(
            session.accessJwt
        );

    console.log(
        `Found ${rawPosts.length} Bluesky search results.`
    );

    const normalized = [];

    for (
        let i = 0;
        i < rawPosts.length;
        i++
    ) {
        try {
            const post =
                await normalizePost(
                    rawPosts[i]
                );

            if (post) {
                normalized.push(post);
            }

            console.log(
                `  Processed ${i + 1}/${rawPosts.length}`
            );
        } catch (error) {
            console.error(
                `  Failed to process post ${i + 1}:`,
                error.message
            );
        }
    }

    console.log(
        `Found ${normalized.length} Bluesky posts from the last 24h.`
    );

    await saveToSupabase(normalized);

    return normalized;
}

if (require.main === module) {
    runBlueskyScraper()
        .then(() => {
            console.log(
                "Bluesky scraper completed successfully."
            );

            process.exit(0);
        })
        .catch((error) => {
            console.error(
                "Bluesky scraper failed:",
                error.message
            );

            process.exit(1);
        });
}

module.exports = {
    runBlueskyScraper
};