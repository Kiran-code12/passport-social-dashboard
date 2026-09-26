const PASSPORT_CONTEXT_PATTERNS = [
    /\bpassport\s+(application|applications)\b/i,
    /\bpassport\s+(apply|applying|applied)\b/i,
    /\bapply\s+for\s+(a\s+)?passport\b/i,

    /\bnew\s+passport\b/i,

    /\bpassport\s+(renewal|renew|renewing|renewed)\b/i,
    /\brenew\s+(my|your|a)\s+passport\b/i,

    /\bpassport\s+(reissue|re-issue)\b/i,
    /\bre-?issue\s+(my|your|a)\s+passport\b/i,

    /\bexpired\s+passport\b/i,

    /\bpassport\s+appointment\b/i,
    /\bpassport\s+office\b/i,
    /\bpassport\s+seva\b/i,
    /\bpassport\s+service\b/i,

    /\bpassport\s+(verification|police verification)\b/i,

    /\bpassport\s+(documents?|requirements?|eligibility)\b/i,

    /\bpassport\s+(number|validity|biometric|photo)\b/i,

    /\bpassport\s+(issue|issues|problem|problems)\b/i,

    /\bpassport\s+(rejected|rejection|approved|approval)\b/i,

    /\bpassport\s+(and|or|with)\s+(visa|travel|immigration|border|airport)\b/i,

    /\b(visa|travel|immigration|border|airport)\s+(and|with|using)\s+(my\s+)?passport\b/i,

    /\b(chinese|indian|british|american|us|uk|canadian|australian|portuguese|french|german)\s+passport\b/i,

    /\bpassport\s+(name|names|holder|holders)\b/i,

    /\bmy\s+passport\b/i,
    /\bpassport\s+was\b/i,
    /\bpassport\s+has\b/i,
    /\bpassport\s+is\b/i
];

const WEAK_RELATED_TERMS = [
    "visa",
    "immigration",
    "travel document",
    "travel documents"
];

const IRRELEVANT_PATTERNS = [
    "my passport backup",
    "passport holder",
    "passport wallet",
    "passport cover",
    "passport compartment",

    "bike & brew passport",
    "passport to worlds",
    "passport to world",

    // Vehicle/product usage.
    "honda passport",
    "passport trailsport",
    "passport trail sport",
    "passport suv",
    "passport model",
    "passport vehicle",

    // Gaming / entertainment / promotional usage.
    "freefire passport",
    "free fire passport",
    "passport game",

    // Food / event / tourism promotion usage.
    "coffee passport",
    "food passport",
    "beer passport",
    "brewery passport",
    "summer passport",
    "passport challenge"
];

function normalizeText(text) {
    return (text || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function checkRelevance(text) {
    const normalized = normalizeText(text);

    if (!normalized) {
        return {
            isRelevant: false,
            reason: "empty_text"
        };
    }

    const matchedIrrelevantPattern = IRRELEVANT_PATTERNS.find(
        (pattern) => normalized.includes(pattern)
    );

    if (matchedIrrelevantPattern) {
        return {
            isRelevant: false,
            reason: "irrelevant_passport_usage",
            matchedIrrelevantPattern
        };
    }

    const matchedContextPattern = PASSPORT_CONTEXT_PATTERNS.find(
        (pattern) => pattern.test(normalized)
    );

    if (matchedContextPattern) {
        return {
            isRelevant: true,
            reason: "passport_context_detected"
        };
    }

    if (normalized.includes("passport")) {
        return {
            isRelevant: false,
            reason: "passport_without_meaningful_context"
        };
    }

    const matchedRelatedTerm = WEAK_RELATED_TERMS.find(
        (term) => normalized.includes(term)
    );

    if (matchedRelatedTerm) {
        return {
            isRelevant: false,
            reason: "related_topic_without_passport_context",
            matchedTerm: matchedRelatedTerm
        };
    }

    return {
        isRelevant: false,
        reason: "no_passport_topic_term"
    };
}

module.exports = {
    checkRelevance
};