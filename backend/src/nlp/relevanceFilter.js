const PASSPORT_TERMS = [
    "passport",
    "passports",
    "passport application",
    "passport renewal",
    "passport appointment",
    "passport office",
    "passport service",
    "passport seva",
    "passport verification",
    "passport police verification",
    "passport number",
    "passport validity",
    "passport biometric",
    "passport photo",
    "passport issue",
    "passport rejected",
    "passport approved",
    "passport visa",
    "visa",
    "immigration",
    "travel document",
    "travel documents",
    "tatkal passport"
];

const IRRELEVANT_PATTERNS = [
    "my passport backup",
    "passport holder",
    "passport wallet",
    "passport cover",
    "bike & brew passport",
    "passport to worlds",
    "passport to world",
    "passport compartment"
];

function checkRelevance(text) {
    const normalized = (text || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    if (!normalized) {
        return {
            isRelevant: false,
            reason: "empty_text"
        };
    }

    const matchedTerm = PASSPORT_TERMS.find((term) =>
        normalized.includes(term)
    );

    if (!matchedTerm) {
        return {
            isRelevant: false,
            reason: "no_passport_topic_term"
        };
    }

    const matchedIrrelevantPattern = IRRELEVANT_PATTERNS.find((pattern) =>
        normalized.includes(pattern)
    );

    if (matchedIrrelevantPattern) {
        return {
            isRelevant: false,
            reason: "irrelevant_passport_usage",
            matchedTerm,
            matchedIrrelevantPattern
        };
    }

    return {
        isRelevant: true,
        reason: "passport_topic_detected",
        matchedTerm
    };
}

module.exports = {
    checkRelevance
};