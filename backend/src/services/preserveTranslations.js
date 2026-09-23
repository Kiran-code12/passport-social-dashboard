const supabase = require("../config/supabase");

/*
 * Scrapers upsert every post they find on every cycle, and an upsert
 * overwrites every column present in the payload. Each scraper's
 * payload includes `translations: {}`, so every post that is fetched
 * again (YouTube and Bluesky only look at the last 24 hours, so all
 * recent posts are fetched again every 20 minutes) would silently lose
 * the translations that /api/translate saved on the row, along with
 * the ability to find the post by its translated text.
 *
 * This looks up what is already stored for the batch and puts it back
 * into the payload, so the upsert rewrites the existing value instead
 * of clearing it. New posts are untouched and still get `{}`.
 *
 * If the lookup fails, this throws rather than continuing: carrying on
 * would perform exactly the overwrite this exists to prevent.
 */

// Bluesky post ids are ~70 characters, so keep each lookup URL short.
const LOOKUP_CHUNK_SIZE = 25;

const rowKey = (platform, postId) => `${platform}\u0000${postId}`;

async function preserveExistingTranslations(posts, client = supabase) {
    if (!posts.length) {
        return posts;
    }

    const idsByPlatform = new Map();

    for (const post of posts) {
        if (!idsByPlatform.has(post.platform)) {
            idsByPlatform.set(post.platform, []);
        }

        idsByPlatform.get(post.platform).push(post.post_id);
    }

    const saved = new Map();

    for (const [platform, ids] of idsByPlatform) {
        for (let i = 0; i < ids.length; i += LOOKUP_CHUNK_SIZE) {
            const { data, error } = await client
                .from("posts")
                .select("platform, post_id, translations")
                .eq("platform", platform)
                .in("post_id", ids.slice(i, i + LOOKUP_CHUNK_SIZE));

            if (error) {
                throw new Error(
                    `Failed to look up existing translations: ${error.message}`
                );
            }

            for (const row of data || []) {
                if (
                    row.translations &&
                    Object.keys(row.translations).length > 0
                ) {
                    saved.set(
                        rowKey(row.platform, row.post_id),
                        row.translations
                    );
                }
            }
        }
    }

    return posts.map((post) => {
        const translations = saved.get(
            rowKey(post.platform, post.post_id)
        );

        return translations ? { ...post, translations } : post;
    });
}

module.exports = { preserveExistingTranslations };
