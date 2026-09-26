const { franc } = require("franc");

const MIN_MEANINGFUL_LENGTH = 15;
const GIBBERISH_SCORE_THRESHOLD = 4;

function stripUrls(text) {
    return text.replace(/https?:\/\/\S+/g, " ").trim();
}

function stripHtml(text) {
    return text
        .replace(/\\u003C/gi, "<")
        .replace(/\\u003E/gi, ">")
        .replace(/\\u0026/gi, "&")
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

// --------------------------------------------------
// Script-level language guard
// --------------------------------------------------

const SCRIPT_LANGUAGE_RANGES = [
    { code: "pan", pattern: /[\u0A00-\u0A7F]/gu }, // Gurmukhi (Punjabi)
    { code: "hin", pattern: /[\u0900-\u097F]/gu }, // Devanagari (Hindi)
    { code: "arb", pattern: /[\u0600-\u06FF]/gu }, // Arabic
    { code: "heb", pattern: /[\u0590-\u05FF]/gu }, // Hebrew
    { code: "ben", pattern: /[\u0980-\u09FF]/gu }, // Bengali
    { code: "guj", pattern: /[\u0A80-\u0AFF]/gu }, // Gujarati
    { code: "tam", pattern: /[\u0B80-\u0BFF]/gu }, // Tamil
    { code: "tel", pattern: /[\u0C00-\u0C7F]/gu }, // Telugu
    { code: "kan", pattern: /[\u0C80-\u0CFF]/gu }, // Kannada
    { code: "mal", pattern: /[\u0D00-\u0D7F]/gu }, // Malayalam
    { code: "tha", pattern: /[\u0E00-\u0E7F]/gu }, // Thai
    { code: "lao", pattern: /[\u0E80-\u0EFF]/gu }, // Lao
    { code: "bod", pattern: /[\u0F00-\u0FFF]/gu }, // Tibetan
    { code: "mya", pattern: /[\u1000-\u109F]/gu }, // Myanmar
    { code: "kat", pattern: /[\u10A0-\u10FF]/gu }, // Georgian
    { code: "hye", pattern: /[\u0530-\u058F]/gu }, // Armenian
    { code: "ell", pattern: /[\u0370-\u03FF]/gu }, // Greek
    { code: "rus", pattern: /[\u0400-\u04FF]/gu }, // Cyrillic
];

const MIN_SCRIPT_CHAR_COUNT = 6;
const MIN_SCRIPT_RATIO = 0.15;

function stripHashtagsAndMentions(text) {
    return text.replace(/[#@][\w-]+/gu, " ");
}

function detectDominantScript(text) {
    const cleaned = stripHashtagsAndMentions(text || "");

    const totalLetters = (cleaned.match(/\p{L}/gu) || []).length;

    if (totalLetters === 0) {
        return null;
    }

    let bestCode = null;
    let bestCount = 0;

    for (const { code, pattern } of SCRIPT_LANGUAGE_RANGES) {
        const count = (cleaned.match(pattern) || []).length;

        if (count > bestCount) {
            bestCount = count;
            bestCode = code;
        }
    }

    if (!bestCode) {
        return null;
    }

    const ratio = bestCount / totalLetters;

    if (bestCount >= MIN_SCRIPT_CHAR_COUNT && ratio >= MIN_SCRIPT_RATIO) {
        return bestCode;
    }

    return null;
}

// --------------------------------------------------
// Latin-script language refinement
// --------------------------------------------------

const SUPPORTED_LATIN_LANGUAGES = new Set([
    "eng", "spa", "fra", "deu", "ind", "vie"
]);

const MIN_LATIN_LETTER_RATIO = 0.5;

function stripLanguageNoise(text) {
    return text
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[#@][\p{L}\p{N}_-]+/gu, " ")
        .replace(/[^\p{L}\p{M}\s'’]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function refineLatinScriptLanguage(text, francCode) {
    const cleaned = stripLanguageNoise(text);

    const letters = (cleaned.match(/\p{L}/gu) || []).length;
    const latinLetters = (
        cleaned.match(/\p{Script=Latin}/gu) || []
    ).length;

    if (letters === 0 || latinLetters / letters < MIN_LATIN_LETTER_RATIO) {
        return francCode;
    }

    const refined =
        cleaned.length >= MIN_LENGTH_TO_TRUST_LANGUAGE_CHECK
            ? franc(cleaned)
            : "und";

    return SUPPORTED_LATIN_LANGUAGES.has(refined) ? refined : "eng";
}

function repeatedCharRatio(text) {
    const matches = text.match(/(.)\1{3,}/g) || [];
    const repeatedCharsCount = matches.reduce((sum, m) => sum + m.length, 0);
    return text.length ? repeatedCharsCount / text.length : 0;
}

function symbolRatio(text) {
    const symbols = text.replace(/[\p{L}\p{N}\s]/gu, "");
    return text.length ? symbols.length / text.length : 0;
}
function repeatedWordRatio(text) {
    const STOP_WORDS = new Set([
        "the", "a", "an", "and", "or", "but", "if", "then",
        "is", "are", "was", "were", "be", "been", "being",
        "to", "of", "in", "on", "for", "with", "from", "by",
        "at", "as", "it", "this", "that", "these", "those",
        "i", "you", "he", "she", "we", "they", "my", "your",
        "his", "her", "our", "their", "me", "us", "them",
        "do", "does", "did", "have", "has", "had",
        "will", "would", "can", "could", "should",
        "not", "no", "so", "than", "also"
    ]);

    const words = text
        .toLowerCase()
        .match(/\b[\p{L}\p{N}]+\b/gu) || [];

    const meaningfulWords = words.filter(
        word => word.length >= 3 && !STOP_WORDS.has(word)
    );

    if (meaningfulWords.length < 4) return 0;

    const counts = {};

    for (const word of meaningfulWords) {
        counts[word] = (counts[word] || 0) + 1;
    }

    const repeatedWordsCount = Object.entries(counts)
        .filter(([, count]) => count >= 3)
        .reduce((sum, [, count]) => sum + count, 0);

    return repeatedWordsCount / meaningfulWords.length;
}

const STRONG_SCORE = 4;
const REPEATED_CHAR_STRONG_RATIO = 0.3;
const SYMBOL_STRONG_RATIO = 0.5;
const REPEATED_WORD_STRONG_RATIO = 0.5;

const WEAK_SCORE = 2;
const MIN_LENGTH_TO_TRUST_LANGUAGE_CHECK = 20;

function analyzeText(rawText) {
    const reasons = [];
    let score = 0;

   const text = stripHtml(rawText || "");
const textWithoutUrls = stripUrls(text);

    if (textWithoutUrls.length < MIN_MEANINGFUL_LENGTH) {
        reasons.push("too_short");
        score += WEAK_SCORE;
    }

    const repRatio = repeatedCharRatio(text);
    if (repRatio > REPEATED_CHAR_STRONG_RATIO) {
        reasons.push("repeated_characters");
        score += STRONG_SCORE;
    }

    const symRatio = symbolRatio(text);
    if (symRatio > SYMBOL_STRONG_RATIO) {
        reasons.push("high_symbol_ratio");
        score += STRONG_SCORE;
    }

    const wordRepRatio = repeatedWordRatio(text);
    if (wordRepRatio > REPEATED_WORD_STRONG_RATIO) {
        reasons.push("repeated_words");
        score += STRONG_SCORE;
    }

    let detectedLanguage = null;

    const scriptLanguage = detectDominantScript(textWithoutUrls);

    if (scriptLanguage) {
        detectedLanguage = scriptLanguage;
    } else if (textWithoutUrls.length >= MIN_LENGTH_TO_TRUST_LANGUAGE_CHECK) {
        const langCode = franc(textWithoutUrls);

        detectedLanguage =
            langCode === "und"
                ? null
                : refineLatinScriptLanguage(textWithoutUrls, langCode);

        if (langCode === "und") {
            reasons.push("language_undetermined");
            score += WEAK_SCORE;
        }
    }

    return {
        isGibberish: score >= GIBBERISH_SCORE_THRESHOLD,
        score,
        reasons,
        detectedLanguage
    };
}

module.exports = { analyzeText };