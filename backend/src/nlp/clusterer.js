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

function sharesMeaningfulTerm(textA, textB) {
    const a = tokenize(textA);
    const b = tokenize(textB);

    if (a.length === 0 || b.length === 0) {
        return false;
    }

    const bSet = new Set(b);

    return a.some((word) => bSet.has(word));
}

function getClusterText(post) {
    const englishTranslation =
        post.translations &&
        typeof post.translations.english === "string"
            ? post.translations.english.trim()
            : "";

    if (englishTranslation) {
        return englishTranslation;
    }

    const title = extractTitle(post);
    const summary = (post.summary || "").trim();

    if (title && summary) {
        return `${title}. ${summary}`;
    }

    if (summary) return summary;
    if (title) return title;

    return (post.original_text || "").trim().slice(0, 400);
}

const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

let embedderPromise = null;

function getEmbedder() {
    if (!embedderPromise) {
        embedderPromise = (async () => {
            const { pipeline } = await import("@xenova/transformers");

            console.log(
                "Loading local sentence-embedding model for clustering (first run downloads it)..."
            );

            const lastLogged = {};

            return pipeline(
                "feature-extraction",
                EMBEDDING_MODEL,
                {
                    progress_callback: (data) => {
                        if (data.status === "progress") {
                            const pct = Math.round(data.progress);

                            if (lastLogged[data.file] !== pct) {
                                lastLogged[data.file] = pct;

                                console.log(
                                    `  ${data.file}: ${pct}%`
                                );
                            }
                        } else {
                            console.log(
                                `  [${data.status}] ${data.file || ""}`
                            );
                        }
                    }
                }
            );
        })();
    }

    return embedderPromise;
}

async function embedText(text) {
    const normalized = (text || "").trim();

    if (!normalized) {
        return null;
    }

    const embedder = await getEmbedder();

    const output = await embedder(normalized, {
        pooling: "mean",
        normalize: true
    });

    return Array.from(output.data);
}

function cosineSimilarity(vectorA, vectorB) {
    if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
        return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
        dot += vectorA[i] * vectorB[i];
        normA += vectorA[i] * vectorA[i];
        normB += vectorB[i] * vectorB[i];
    }

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function sameCategory(postA, postB) {
    if (!postA.category || !postB.category) {
        return true;
    }

    return postA.category === postB.category;
}

const HIGH_SEMANTIC_THRESHOLD = 0.62;
const MODERATE_SEMANTIC_THRESHOLD = 0.48;

function shouldClusterBySimilarity(
    embeddingA,
    embeddingB,
    postA,
    postB
) {
    if (!embeddingA || !embeddingB) {
        return false;
    }

    const semanticScore = cosineSimilarity(
        embeddingA,
        embeddingB
    );

    if (semanticScore >= HIGH_SEMANTIC_THRESHOLD) {
        return true;
    }

    if (semanticScore < MODERATE_SEMANTIC_THRESHOLD) {
        return false;
    }

    if (!sameCategory(postA, postB)) {
        return false;
    }

    return sharesMeaningfulTerm(
        extractTitle(postA) + " " + (postA.summary || ""),
        extractTitle(postB) + " " + (postB.summary || "")
    );
}

async function clusterPosts(posts) {
    const embeddings = new Map();

    for (const post of posts) {
        embeddings.set(
            post,
            await embedText(getClusterText(post))
        );
    }

    const clusters = [];

    for (const post of posts) {
        let matchedCluster = null;

        for (const cluster of clusters) {
            const representative = cluster.posts[0];

            if (
                shouldClusterBySimilarity(
                    embeddings.get(post),
                    embeddings.get(representative),
                    post,
                    representative
                )
            ) {
                matchedCluster = cluster;
                break;
            }
        }

        if (!matchedCluster) {
            matchedCluster = {
                cluster_id: post.cluster_id || crypto.randomUUID(),
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
    cosineSimilarity,
    clusterPosts
};
