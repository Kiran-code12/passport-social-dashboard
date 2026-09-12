const {
    translateText,
    getSupportedTargetLanguages
} = require("../nlp/translator");

async function translatePost(req, res, next) {
    try {
        const { text, sourceLanguage, targetLanguage } = req.body;

        // Validate input
        if (!text || typeof text !== "string") {
            return res.status(400).json({
                success: false,
                error: "text is required and must be a string"
            });
        }

        if (!sourceLanguage || typeof sourceLanguage !== "string") {
            return res.status(400).json({
                success: false,
                error: "sourceLanguage is required"
            });
        }

        if (!targetLanguage || typeof targetLanguage !== "string") {
            return res.status(400).json({
                success: false,
                error: "targetLanguage is required"
            });
        }

        const result = await translateText(
            text,
            sourceLanguage.toLowerCase(),
            targetLanguage.toLowerCase()
        );

        return res.json({
            success: true,
            sourceLanguage: sourceLanguage.toLowerCase(),
            targetLanguage: targetLanguage.toLowerCase(),
            originalText: text,
            translatedText: result.translatedText,
            method: result.method
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