require("dotenv").config();

const supabase = require("../../config/supabase");
const { analyzeText } = require("../../nlp/gibberishFilter");
const { categorizeText } = require("../../nlp/categorizer");
const { checkRelevance } = require("../../nlp/relevanceFilter");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

// Keep this to ONE keyword for now.
// We can widen this later once the pipeline works.
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

    const res = await fetch(`${SEARCH_URL}?${params.toString()}`);
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
        part: "statistics",
        id: videoIds.join(",")
    });

    const res = await fetch(`${VIDEOS_URL}?${params.toString()}`);
    const data = await res.json();

    if (data.error) {
        throw new Error(
            `YouTube videos.list failed: ${data.error.message}`
        );
    }

    const statsMap = {};

    for (const item of data.items || []) {
        statsMap[item.id] = item.statistics;
    }

    return statsMap;
}

async function normalizeVideo(item, stats) {
    const videoId = item.id.videoId;
    const snippet = item.snippet;
    const videoStats = stats[videoId] || {};

    const combinedText =
        `${snippet.title}\n\n${snippet.description}`.trim();

    // Step 1: Gibberish / spam analysis
    const analysis = analyzeText(combinedText);

    // Step 2: Check whether the content is actually
    // relevant to passport-related topics
    const relevance = checkRelevance(combinedText);

    let category = null;

    // Step 3: Categorize only meaningful and relevant posts
    if (!analysis.isGibberish && relevance.isRelevant) {
        const categoryResult = await categorizeText(combinedText);
        category = categoryResult.category;
    }

    return {
        platform: "youtube",
        post_id: videoId,

        creator_name: snippet.channelTitle || null,
        creator_handle: snippet.channelId || null,

        original_text: combinedText,

        post_url:
            `https://www.youtube.com/watch?v=${videoId}`,

        published_at: snippet.publishedAt,

        language: analysis.detectedLanguage,
        region: null,

        category,

        sentiment: null,

        engagement: {
            views: Number(videoStats.viewCount) || 0,
            likes: Number(videoStats.likeCount) || 0,
            comments: Number(videoStats.commentCount) || 0
        },

        summary: null,
        translations: {},

        is_gibberish: analysis.isGibberish,
        is_relevant: relevance.isRelevant,

        cluster_id: null,

        raw_data: item
    };
}

async function saveToSupabase(posts) {
    if (posts.length === 0) {
        console.log("No posts to save.");
        return;
    }

    const { data, error } = await supabase
        .from("posts")
        .upsert(posts, {
            onConflict: "platform,post_id"
        })
        .select();

    if (error) {
        throw new Error(
            `Supabase upsert failed: ${error.message}`
        );
    }

    console.log(`Saved/updated ${data.length} posts.`);
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
        await searchRecentVideos(SEARCH_KEYWORD);

    console.log(
        `Found ${rawResults.length} videos.`
    );

    const videoIds = rawResults.map(
        (item) => item.id.videoId
    );

    const stats = await fetchVideoStats(videoIds);

    const normalized = [];

    for (const item of rawResults) {
        normalized.push(
            await normalizeVideo(item, stats)
        );
    }

    await saveToSupabase(normalized);

    return normalized;
}

// Allows running this file directly:
// node src/scrapers/youtube/youtubeScraper.js
if (require.main === module) {
    runYoutubeScraper()
        .then(() => process.exit(0))
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