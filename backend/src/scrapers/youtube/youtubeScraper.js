require("dotenv").config();
const supabase = require("../../config/supabase");
const { analyzeText } = require("../../nlp/gibberishFilter");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

// Keep this to ONE keyword for now — each search.list call costs 100 of your
// 10,000 daily quota units. We can widen this later once the pipeline works.
const SEARCH_KEYWORD = "passport";

function getLast24HoursISO() {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
        throw new Error(`YouTube search failed: ${data.error.message}`);
    }

    return data.items || [];
}

async function fetchVideoStats(videoIds) {
    if (videoIds.length === 0) return {};

    const params = new URLSearchParams({
        key: YOUTUBE_API_KEY,
        part: "statistics",
        id: videoIds.join(",")
    });

    const res = await fetch(`${VIDEOS_URL}?${params.toString()}`);
    const data = await res.json();

    if (data.error) {
        throw new Error(`YouTube videos.list failed: ${data.error.message}`);
    }

    const statsMap = {};
    for (const item of data.items || []) {
        statsMap[item.id] = item.statistics;
    }
    return statsMap;
}

function normalizeVideo(item, stats) {
    const videoId = item.id.videoId;
    const snippet = item.snippet;
    const videoStats = stats[videoId] || {};

    const combinedText = `${snippet.title}\n\n${snippet.description}`.trim();
    const analysis = analyzeText(combinedText);

    return {
        platform: "youtube",
        post_id: videoId,
        creator_name: snippet.channelTitle || null,
        creator_handle: snippet.channelId || null,
        original_text: combinedText,
        post_url: `https://www.youtube.com/watch?v=${videoId}`,
        published_at: snippet.publishedAt,
        language: analysis.detectedLanguage,   // set by franc, no guessing
        region: null,        // filled in later
        category: null,      // Feature 3
        sentiment: null,     // Feature 3/NLP
        engagement: {
            views: Number(videoStats.viewCount) || 0,
            likes: Number(videoStats.likeCount) || 0,
            comments: Number(videoStats.commentCount) || 0
        },
        summary: null,        // Feature 5
        translations: {},     // Feature 2
        is_gibberish: analysis.isGibberish,
        is_relevant: true,
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
        .upsert(posts, { onConflict: "platform,post_id" })
        .select();

    if (error) {
        throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    console.log(`Saved/updated ${data.length} posts.`);
}

async function runYoutubeScraper() {
    if (!YOUTUBE_API_KEY) {
        throw new Error("YOUTUBE_API_KEY is missing from .env");
    }

    console.log(`Searching YouTube for "${SEARCH_KEYWORD}" (last 24h)...`);
    const rawResults = await searchRecentVideos(SEARCH_KEYWORD);
    console.log(`Found ${rawResults.length} videos.`);

    const videoIds = rawResults.map((item) => item.id.videoId);
    const stats = await fetchVideoStats(videoIds);

    const normalized = rawResults.map((item) => normalizeVideo(item, stats));
    await saveToSupabase(normalized);

    return normalized;
}

// Allows running this file directly: node src/scrapers/youtube/youtubeScraper.js
if (require.main === module) {
    runYoutubeScraper()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error("Scraper failed:", err.message);
            process.exit(1);
        });
}

module.exports = { runYoutubeScraper };