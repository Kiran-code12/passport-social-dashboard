const supabase = require("../config/supabase");

const {
    translateText,
    getSupportedTargetLanguages,
    MAX_INPUT_CHARS
} = require("../nlp/translator");

const MAX_PERSIST_RETRIES = 5;

/*
 * Merge a single translation into a post's `translations` column without
 * clobbering translations written concurrently by another in-flight
 * request for the same post (e.g. translating the same post into two
 * different languages at the same time).
 *
 * There's no read-then-write gap here: each attempt re-reads the current
 * value right before writing, and the write is guarded by an optimistic
 * concurrency check (`.eq("translations", <the value we just read>)`, or
 * `.is("translations", null)` for a never-set column). If another request
 * wrote in between our read and our write, the guard matches zero rows,
 * `.select()` comes back empty, and we retry with a fresh read instead of
 * overwriting whatever that other request just saved.
 */
async function persistTranslation(postId, normalizedTargetLanguage, translatedText) {
    for (let attempt = 0; attempt < MAX_PERSIST_RETRIES; attempt++) {
        const { data: existing, error: readError } = await supabase
            .from("posts")
            .select("translations")
            .eq("id", postId)
            .single();

        if (readError) {
            throw readError;
        }

        const currentTranslations = existing?.translations || {};
        const updatedTranslations = {
            ...currentTranslations,
            [normalizedTargetLanguage]: translatedText
        };

        let query = supabase
            .from("posts")
            .update({ translations: updatedTranslations })
            .eq("id", postId);

        query =
            existing?.translations == null
                ? query.is("translations", null)
                : query.eq("translations", JSON.stringify(currentTranslations));

        const { data: updated, error: updateError } = await query.select("id");

        if (updateError) {
            throw updateError;
        }

        if (updated && updated.length > 0) {
            return;
        }

        // Concurrent write detected between our read and our write; retry.
    }

    throw new Error(
        `Failed to persist translation for post ${postId} after ${MAX_PERSIST_RETRIES} concurrent-write retries`
    );
}

async function translatePost(req, res, next) {
    try {
        const { text, sourceLanguage, targetLanguage, postId } = req.body;

        // Validate input
        if (!text || typeof text !== "string") {
            return res.status(400).json({
                success: false,
                error: "text is required and must be a string"
            });
        }

        /*
         * sourceLanguage is allowed to be missing/empty: a post whose
         * language was never detected has `language: null` in the
         * database, and the frontend sends that through as `""`
         * (App.jsx: `sourceLanguage: post.language || ""`). Rejecting
         * that here would be wrong — translateText() below already has
         * its own fallback that detects the language directly from the
         * post's text when no usable sourceLanguage is given, so a
         * null-language post can still be translated. Only a genuinely
         * wrong type (not a string, and not missing/null) is rejected.
         */
        if (
            sourceLanguage !== undefined &&
            sourceLanguage !== null &&
            typeof sourceLanguage !== "string"
        ) {
            return res.status(400).json({
                success: false,
                error: "sourceLanguage must be a string"
            });
        }

        const safeSourceLanguage = sourceLanguage || "";

        if (!targetLanguage || typeof targetLanguage !== "string") {
            return res.status(400).json({
                success: false,
                error: "targetLanguage is required"
            });
        }

        const normalizedTargetLanguage = targetLanguage.toLowerCase();

        /*
         * Look up any translations already persisted on this post.
         * This is used both for the result-cache check below and,
         * further down, as the base object to merge a new
         * translation into (so we don't have to select twice).
         */
        let existingTranslations = null;

        if (postId) {
            try {
                const { data: existing } = await supabase
                    .from("posts")
                    .select("translations")
                    .eq("id", postId)
                    .single();

                existingTranslations = existing?.translations || null;
            } catch (lookupError) {
                console.error(
                    "Failed to look up existing translations:",
                    lookupError.message
                );
            }

            const cachedTranslation =
                existingTranslations &&
                existingTranslations[normalizedTargetLanguage];

            /*
             * If a valid, non-empty translation is already stored
             * for this post/target-language, return it directly.
             * No model load, no translateText() call, no database
             * write.
             */
            if (
                typeof cachedTranslation === "string" &&
                cachedTranslation.trim().length > 0
            ) {
                return res.json({
                    success: true,
                    sourceLanguage: safeSourceLanguage.toLowerCase(),
                    targetLanguage: normalizedTargetLanguage,
                    originalText: text,
                    translatedText: cachedTranslation,
                    method: "cached",
                    /*
                     * The stored value is only the translated string, so
                     * derive the flag. A stored copy identical to the
                     * text is a same-language no-op (never truncated).
                     */
                    truncatedAt:
                        text.length > MAX_INPUT_CHARS &&
                        cachedTranslation !== text
                            ? MAX_INPUT_CHARS
                            : null
                });
            }
        }

        const result = await translateText(
            text,
            safeSourceLanguage.toLowerCase(),
            normalizedTargetLanguage
        );

        /*
         * Persist the translation onto the post row so
         * /api/posts/search can find it later, and so future
         * requests for this post/target-language can be served
         * from the cache check above. This is best-effort: a
         * failure here shouldn't block the translation response
         * the user is waiting on. See persistTranslation() above for
         * how this avoids clobbering a concurrent translation of the
         * same post into a different language.
         */
        if (postId) {
            try {
                await persistTranslation(
                    postId,
                    normalizedTargetLanguage,
                    result.translatedText
                );
            } catch (persistError) {
                console.error(
                    "Failed to persist translation:",
                    persistError.message
                );
            }
        }

        return res.json({
            success: true,
            sourceLanguage: safeSourceLanguage.toLowerCase(),
            targetLanguage: normalizedTargetLanguage,
            originalText: text,
            translatedText: result.translatedText,
            method: result.method,
            truncatedAt: result.truncatedAt ?? null
        });

    } catch (error) {
        next(error);
    }
}

function getTranslationLanguages(req, res) {
    return res.json({
        success: true,
        languages: getSupportedTargetLanguages()
    });
}

module.exports = {
    translatePost,
    getTranslationLanguages
};