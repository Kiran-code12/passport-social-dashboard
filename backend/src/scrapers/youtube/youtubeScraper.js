require("dotenv").config();

const supabase = require("../../config/supabase");
const { preserveExistingTranslations } = require("../../services/preserveTranslations");
const { analyzeText } = require("../../nlp/gibberishFilter");
const { categorizeText } = require("../../nlp/categorizer");
const { checkRelevance } = require("../../nlp/relevanceFilter");
const { summarizeText } = require("../../nlp/summarizer");
const { analyzeSentiment } = require("../../nlp/sentimentAnalyzer");
const { detectRegion } = require("../../nlp/regionDetector");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

const SEARCH_KEYWORD = "passport";

function getLast24HoursISO() {
    return new Date(
        Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();
}

async function searchRecentVideos(keyword) {
    const params = new URLSearchParams({
        key: YOUTUBE_API_KEY,
        part: "snippet",
        q: keyword,
        type: "video",
        order: "date",
        publishedAfter: getLast24HoursISO(),
        maxResults: "50"
    });

    const res = await fetch(
        `${SEARCH_URL}?${params.toString()}`
    );

    const data = await res.json();

    if (data.error) {
        throw new Error(
            `YouTube search failed: ${data.error.message}`
        );
    }

    return data.items || [];
}

async function fetchVideoStats(videoIds) {
    if (videoIds.length === 0) {
        return {};
    }

    const params = new URLSearchParams({
        key: YOUTUBE_API_KEY,
        part: "snippet,statistics",
        id: videoIds.join(",")
    });

    const res = await fetch(
        `${VIDEOS_URL}?${params.toString()}`
    );

    const data = await res.json();

    if (data.error) {
        throw new Error(
            `YouTube videos.list failed: ${data.error.message}`
        );
    }

    const statsMap = {};

    for (const item of data.items || []) {
        statsMap[item.id] = {
            statistics: item.statistics,
            fullDescription: item.snippet
                ? item.snippet.description
                : null
        };
    }

    return statsMap;
}

async function normalizeVideo(item, stats) {
    const videoId = item.id.videoId;
    const snippet = item.snippet;

    const videoStats = stats[videoId] || {};

    // Prefer the full description
    const fullDescription =
        videoStats.fullDescription ||
        snippet.description ||
        "";

    const combinedText =
        `${snippet.title}\n\n${fullDescription}`.trim();

    // Step 1: Gibberish / spam analysis
    const analysis = analyzeText(combinedText);

    // Step 2: Relevance check
    const relevance =
        checkRelevance(combinedText);

    let category = null;
    let summary = null;

    // Step 3: Categorization + summary
    if (
        !analysis.isGibberish &&
        relevance.isRelevant
    ) {
        const categoryResult =
            await categorizeText(combinedText);

        category = categoryResult.category;

        const summaryResult =
            await summarizeText(combinedText);

        summary = summaryResult.summary;
    }

    // Step 4: Sentiment analysis
    const sentiment =
        analyzeSentiment(combinedText);

    return {
        platform: "youtube",

        post_id: videoId,

        creator_name:
            snippet.channelTitle || null,

        creator_handle:
            snippet.channelId || null,

        original_text: combinedText,

        post_url:
            `https://www.youtube.com/watch?v=${videoId}`,

        published_at:
            snippet.publishedAt,

        language:
            analysis.detectedLanguage,
region: detectRegion(combinedText),

        category,

        sentiment,

        engagement: {
            views:
                Number(
                    videoStats.statistics?.viewCount
                ) || 0,

            likes:
                Number(
                    videoStats.statistics?.likeCount
                ) || 0,

            comments:
                Number(
                    videoStats.statistics?.commentCount
                ) || 0
        },

        summary,

        translations: {},

        is_gibberish:
            analysis.isGibberish,

        is_relevant:
            relevance.isRelevant,

        cluster_id: null,

        raw_data: item
    };
}

async function saveToSupabase(posts) {
    if (posts.length === 0) {
        console.log("No posts to save.");
        return;
    }

    // Keep translations already saved on re-fetched posts (see helper).
    const rows = await preserveExistingTranslations(posts);

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
        `Saved/updated ${data.length} posts.`
    );
}

async function runYoutubeScraper() {
    if (!YOUTUBE_API_KEY) {
        throw new Error(
            "YOUTUBE_API_KEY is missing from .env"
        );
    }

    console.log(
        `Searching YouTube for "${SEARCH_KEYWORD}" (last 24h)...`
    );

    const rawResults =
        await searchRecentVideos(
            SEARCH_KEYWORD
        );

    console.log(
        `Found ${rawResults.length} videos.`
    );

    const videoIds =
        rawResults.map(
            (item) => item.id.videoId
        );

    const stats =
        await fetchVideoStats(videoIds);

    const normalized = [];

    for (
        let i = 0;
        i < rawResults.length;
        i++
    ) {
        normalized.push(
            await normalizeVideo(
                rawResults[i],
                stats
            )
        );

        console.log(
            `  Processed ${i + 1}/${rawResults.length}`
        );
    }

    await saveToSupabase(normalized);

    return normalized;
}

if (require.main === module) {
    runYoutubeScraper()
        .then(() => {
            console.log(
                "YouTube scraper completed successfully."
            );

            process.exit(0);
        })
        .catch((err) => {
            console.error(
                "Scraper failed:",
                err.message
            );

            process.exit(1);
        });
}

module.exports = {
    runYoutubeScraper
};