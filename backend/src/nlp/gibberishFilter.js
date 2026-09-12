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

function repeatedCharRatio(text) {
    // catches spam like "aaaaaaaa" or "!!!!!!!!"
    const matches = text.match(/(.)\1{3,}/g) || [];
    const repeatedCharsCount = matches.reduce((sum, m) => sum + m.length, 0);
    return text.length ? repeatedCharsCount / text.length : 0;
}

function symbolRatio(text) {
    // fraction of characters that aren't letters, numbers, or whitespace
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
const REPEATED_CHAR_STRONG_RATIO = 0.3;   // e.g. "aaaaaaaaaaaaaaaa"
const SYMBOL_STRONG_RATIO = 0.5;          // e.g. "!!!!####@@@@"
const REPEATED_WORD_STRONG_RATIO = 0.5;   // e.g. "buy buy buy passport passport"

// WEAK signals: on their own they're not proof of gibberish (plenty of
// real posts are short, or use a language franc struggles with) — two
// weak signals together are treated as suspicious.
const WEAK_SCORE = 2;
// franc is unreliable on very short strings, so we only trust an
// "undetermined" verdict once there's enough text to actually analyze.
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

    // Local NLP check: statistical language identification (franc).
    let detectedLanguage = null;
    if (textWithoutUrls.length >= MIN_LENGTH_TO_TRUST_LANGUAGE_CHECK) {
        const langCode = franc(textWithoutUrls);
        detectedLanguage = langCode === "und" ? null : langCode;

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