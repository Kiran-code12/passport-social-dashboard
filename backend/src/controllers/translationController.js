const supabase = require("../config/supabase");

const {
    translateText,
    getSupportedTargetLanguages,
    MAX_INPUT_CHARS
} = require("../nlp/translator");

const MAX_PERSIST_RETRIES = 5;

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
    }

    throw new Error(
        `Failed to persist translation for post ${postId} after ${MAX_PERSIST_RETRIES} concurrent-write retries`
    );
}

async function translatePost(req, res, next) {
    try {
        const { text, sourceLanguage, targetLanguage, postId } = req.body;

        if (!text || typeof text !== "string") {
            return res.status(400).json({
                success: false,
                error: "text is required and must be a string"
            });
        }

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