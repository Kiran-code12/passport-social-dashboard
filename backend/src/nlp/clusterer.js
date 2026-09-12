const crypto = require("crypto");

const STOP_WORDS = new Set([
    "passport",
    "passports",
    "travel",
    "travelling",
    "traveling",
    "visa",
    "visas",
    "country",
    "countries",
    "international",
    "people",
    "person",
    "help",
    "question",
    "advice",
    "information",
    "official",
    "online",
    "today",
    "new",
    "need",
    "needed",
    "like",
    "know",
    "want",
    "using",
    "use",
    "got",
    "get",
    "getting",
    "apply",
    "application"
]);

function normalizeText(text) {
    return (text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/*
 * YouTube original_text contains:
 *
 * TITLE
 *
 * DESCRIPTION
 *
 * We only want the title for the main clustering decision.
 */
function extractTitle(post) {
    if (post.title && typeof post.title === "string") {
        return post.title.trim();
    }

    const originalText = (post.original_text || "").trim();

    if (!originalText) {
        return "";
    }

    const lines = originalText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return "";
    }

    /*
     * First non-empty line is the YouTube title
     * in our normalized database records.
     */
    return lines[0];
}

function tokenize(text) {
    return [
        ...new Set(
            normalizeText(text)
                .split(/\s+/)
                .filter((word) => word.length > 2)
                .filter((word) => !STOP_WORDS.has(word))
        )
    ];
}

function similarity(textA, textB) {
    const a = tokenize(textA);
    const b = tokenize(textB);

    if (a.length === 0 || b.length === 0) {
        return 0;
    }

    const bSet = new Set(b);

    const common = a.filter((word) => bSet.has(word));

    /*
     * At least two meaningful shared words
     * are required.
     */
    if (common.length < 2) {
        return 0;
    }

    return common.length / Math.max(a.length, b.length);
}

function strongSimilarity(textA, textB) {
    const a = tokenize(textA);
    const b = tokenize(textB);

    if (a.length === 0 || b.length === 0) {
        return 0;
    }

    const bSet = new Set(b);

    const common = a.filter((word) => bSet.has(word));

    if (common.length === 0) {
        return 0;
    }

    return common.length / Math.min(a.length, b.length);
}

function sameCategory(postA, postB) {
    if (!postA.category || !postB.category) {
        return true;
    }

    return postA.category === postB.category;
}

function shouldCluster(postA, postB) {
    const titleA = extractTitle(postA);
    const titleB = extractTitle(postB);

    const normalScore = similarity(titleA, titleB);
    const strongScore = strongSimilarity(titleA, titleB);

    /*
     * Very similar titles can belong to the same story
     * even when the NLP categorizer assigned different
     * categories.
     */
    if (strongScore >= 0.75 && normalScore >= 0.5) {
        return true;
    }

    /*
     * Otherwise require the same category.
     */
    if (!sameCategory(postA, postB)) {
        return false;
    }

    /*
     * Normal clustering requires reasonably strong
     * title similarity.
     */
    return normalScore >= 0.5;
}

function clusterPosts(posts) {
    const clusters = [];

    for (const post of posts) {
        let matchedCluster = null;

        for (const cluster of clusters) {
            const representative = cluster.posts[0];

            if (shouldCluster(post, representative)) {
                matchedCluster = cluster;
                break;
            }
        }

        if (!matchedCluster) {
            matchedCluster = {
                cluster_id: crypto.randomUUID(),
                posts: []
            };

            clusters.push(matchedCluster);
        }

        matchedCluster.posts.push(post);
        post.cluster_id = matchedCluster.cluster_id;
    }

    return posts;
}

module.exports = {
    tokenize,
    similarity,
    clusterPosts
};