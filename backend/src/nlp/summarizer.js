"use strict";

/* ------------------------------------------------------------------
 * AI SUMMARY
 *
 * Public interface is unchanged:
 *     summarizeText(rawText) -> Promise<{ summary, method }>
 *
 * Nothing outside this file needs to change.
 * ------------------------------------------------------------------ */

/* --------------------------- tunables --------------------------- */

const MAX_INPUT_CHARS = 4200;

const TARGET_SUMMARY_WORDS = 30;
const MAX_SUMMARY_WORDS = 35;
const MIN_SUMMARY_WORDS = 7;

// At or below this, there is genuinely nothing to compress.
const TINY_POST_WORD_COUNT = 8;

// Below this, bart-large-cnn reliably returns the lead sentence
// verbatim, so the deterministic compressor is used instead.
// Set to 0 to always call the neural model.
const MODEL_MIN_WORD_COUNT = 45;

// Reject a model summary if more than this share of its content
// words never appear in the source text.
const MAX_UNSUPPORTED_TOKEN_RATIO = 0.34;

const MODEL_NAME = "Xenova/bart-large-cnn";

/* --------------------------- basics ----------------------------- */

function normalizeText(text) {
    return (text || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function countWords(text) {
    return (text || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
}

function capitalize(text) {
    const t = normalizeText(text);
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1);
}

function ensureTerminalPunctuation(text) {
    const t = normalizeText(text);
    if (!t) return t;
    if (/[.!?…]$/.test(t)) return t;
    return `${t}.`;
}

/**
 * Trim to a word budget, preferring a clause boundary so the summary
 * does not end mid-phrase.
 */
function limitWords(text, maxWords = MAX_SUMMARY_WORDS) {
    const normalized = normalizeText(text);
    const words = normalized.split(/\s+/).filter(Boolean);

    if (words.length <= maxWords) {
        return normalized;
    }

    let slice = words.slice(0, maxWords).join(" ");

    // Prefer to end on a clause boundary within the budget.
    const boundary = Math.max(
        slice.lastIndexOf(", "),
        slice.lastIndexOf("; "),
        slice.lastIndexOf(" and "),
        slice.lastIndexOf(" but "),
        slice.lastIndexOf(" because ")
    );

    if (boundary > slice.length * 0.5) {
        slice = slice.slice(0, boundary);
    }

    slice = slice
        .replace(/\s+(https?:\/\/\S*|www\.\S*)$/i, "")
        .replace(/[,:;\-–—]+$/, "")
        .replace(/\s+\b(and|but|or|because|that|which|with|the|a|an|to|of|in|on|for|due|without|before|after|when|if|unless|while|about)\b$/i, "")
        .trim();

    return ensureTerminalPunctuation(slice);
}

/* ------------------------ text cleaning ------------------------- */

const FILLER_PATTERN = new RegExp(
    "\\b(" +
        [
            "lowkey", "highkey", "ngl", "tbh", "imo", "imho", "fr fr", "fr",
            "literally", "honestly", "basically", "actually", "seriously",
            "like i said", "i mean", "you know", "kinda", "sorta",
            "pretty much", "at the end of the day", "to be fair",
            "long story short", "anyway", "anyways", "so yeah", "edit",
            "update", "tldr", "tl;dr"
        ].join("|") +
    ")\\b",
    "gi"
);

function stripEmoji(text) {
    return (text || "").replace(/\p{Extended_Pictographic}/gu, " ");
}

/**
 * Collapse an immediate, literal repeat of the same word or short
 * phrase ("Passport Passport", "new passport rules new passport
 * rules"). This is NOT the near-duplicate-sentence check below
 * (that compares two whole sentences for topical overlap) — this
 * catches word/phrase-level duplication that survives hashtag/CTA
 * stripping or that was already duplicated in the source post, and
 * would otherwise read as "Passport Passport..." in the summary.
 */
function collapseRepeatedRuns(text) {
    const normalized = normalizeText(text);
    if (!normalized) return normalized;

    const singleWords = normalized.split(/\s+/);
    const deduped = [];
    for (const word of singleWords) {
        const prev = deduped[deduped.length - 1];
        if (
            prev &&
            word.toLowerCase() === prev.toLowerCase() &&
            word.replace(/[^\p{L}\p{N}]/gu, "").length > 2
        ) {
            continue;
        }
        deduped.push(word);
    }

    let tokens = deduped;
    for (let size = 4; size >= 2; size--) {
        const result = [];
        let i = 0;
        while (i < tokens.length) {
            if (i + size * 2 <= tokens.length) {
                const a = tokens.slice(i, i + size).join(" ").toLowerCase();
                const b = tokens.slice(i + size, i + size * 2).join(" ").toLowerCase();
                if (a.length > 6 && a === b) {
                    result.push(...tokens.slice(i, i + size));
                    i += size * 2;
                    continue;
                }
            }
            result.push(tokens[i]);
            i++;
        }
        tokens = result;
    }

    return tokens.join(" ");
}

/**
 * Remove platform noise that should never drive the summary.
 * Rule 7: usernames, URLs, hashtags, submission metadata, boilerplate.
 */
function cleanForSummarization(text) {
    const cleaned = stripEmoji(normalizeText(text))
        .replace(/https?:\/\/\S+/gi, " ")
        .replace(/www\.\S+/gi, " ")
        .replace(/\/?(u|r)\/[A-Za-z0-9_-]+/g, " ")
        .replace(/(^|\s)@[\p{L}\p{N}_.-]+/gu, "$1")
        .replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, "$1")
        .replace(/\[(deleted|removed)\]/gi, " ")
        .replace(
            /\b(submitted by|posted by|follow me|follow us|subscribe|like and subscribe|link in bio|read more|click here|watch till the end|don'?t forget to (like|subscribe)|smash (the )?like button|hit (the )?subscribe( button)?|turn on notifications|check (out )?the description|comment below|drop a comment|ring the bell)\b/gi,
            " "
        )
        .replace(/[#*_`>|]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return collapseRepeatedRuns(cleaned);
}

/**
 * If the author wrote their own TL;DR, that is the most faithful
 * summary available. Use it rather than generating one.
 */
function extractAuthorTldr(text) {
    const match = normalizeText(text).match(
        /\b(?:tl\s*;?\s*dr|tldr)\b\s*[:\-–—]?\s*(.+)$/i
    );

    if (!match) return null;

    const candidate = cleanForSummarization(match[1]);
    const words = countWords(candidate);

    if (words < MIN_SUMMARY_WORDS || words > MAX_SUMMARY_WORDS + 15) {
        return null;
    }

    return candidate;
}

function splitSentences(text) {
    const normalized = normalizeText(text);
    if (!normalized) return [];

    return normalized
        .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9"“‘])/u)
        .map((s) => s.trim())
        .filter(Boolean);
}

const STOP_WORDS = new Set([
    "the", "and", "that", "this", "with", "from", "have", "has", "had",
    "for", "are", "was", "were", "been", "being", "into", "about",
    "just", "they", "them", "their", "there", "here", "what", "when",
    "where", "which", "will", "would", "could", "should", "you", "your",
    "our", "but", "not", "who", "how", "why", "can", "also", "more",
    "than", "then", "only", "very", "its", "it's", "his", "her", "she",
    "him", "all", "get", "got", "one", "out", "now", "some", "any",
    "because", "been", "over", "after", "before", "much", "many"
]);

function contentTokens(text) {
    return normalizeText(text)
        .toLowerCase()
        .replace(/https?:\/\/\S+/gi, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .filter((w) => !STOP_WORDS.has(w));
}

function tokenizeForComparison(text) {
    return normalizeText(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);
}

/* ------------------- post-type classification ------------------- */

function isQuestionPost(text) {
    const t = normalizeText(text);
    return (
        /\?/.test(t) ||
        /^(does|do|is|are|can|should|would|could|has|have|why|how|what|when|where|which|who|any(one|body)|has anyone)\b/i.test(t)
    );
}

function isPromotionalPost(text) {
    const t = normalizeText(text);
    let score = 0;

    // Currency alone is NOT promotional — news reports prices too.
    if (/[€$£¥]\s?\d/.test(t)) score += 1;
    if (/\d+\s?(%|percent)\s+off\b/i.test(t)) score += 2;
    if (/\b(deal|discount|sale|coupon|promo|now only|buy now|shop now|order now|free shipping|limited time|in stock)\b/i.test(t)) score += 2;
    if (/\binstead of\s*[€$£¥]?\s?\d/i.test(t)) score += 2;
    if (/\b(mb\/s|gb\/s|\d+\s?(tb|gb|mb)\b)/i.test(t)) score += 1;

    return score >= 3;
}

// The sentence carrying the actual problem/complaint (principle A:
// "the main complaint/problem") — used to boost that sentence the
// same way a question sentence is boosted below.
const COMPLAINT_PATTERN = /\b(problem|issue|complain(t|ing)?|denied|rejected|declined|refused|refuse(d)? to|delay(ed)?|stuck|scam|unacceptable|not working|broken|frustrat\w*|annoy\w*|worst|terrible|awful|ridiculous|wrong|error|mistake|failed|failure|no refund|no response|still no|never (received|got|heard)|unresponsive|ignored|waste of)\b/i;

function isFirstPerson(text) {
    return /\b(i|i'm|i've|i'd|i'll|my|mine|me|myself|we|our|us)\b/i.test(text);
}

/* ---------------- first-person -> third-person ------------------ */

/**
 * "they" takes the same base verb form as "I", so this substitution
 * stays grammatical for arbitrary verbs ("I went" -> "they went").
 * Only the irregular auxiliaries need explicit handling.
 */
function depersonalize(text) {
    let t = ` ${normalizeText(text)} `;

    // Protect proper nouns such as "WD My Passport" — a capitalised
    // "My"/"Our" followed by another capitalised word is part of a
    // product or brand name, not a possessive pronoun.
    const guarded = [];
    t = t.replace(/\b(My|Our)\s+(?=[A-Z])/g, (match) => {
        guarded.push(match);
        return `\u0000${guarded.length - 1}\u0000`;
    });

    const rules = [
        [/\bI\s+am\b/gi, "they are"],
        [/\bI'm\b/gi, "they are"],
        [/\bI\s+have\b/gi, "they have"],
        [/\bI've\b/gi, "they have"],
        [/\bI'd\b/gi, "they would"],
        [/\bI'll\b/gi, "they will"],
        [/\bI\b/g, "they"],
        [/\bmyself\b/gi, "themselves"],
        [/\bmine\b/gi, "theirs"],
        [/\bmy\b/gi, "their"],
        [/\bme\b/gi, "them"],
        [/\bourselves\b/gi, "themselves"],
        [/\bours\b/gi, "theirs"],
        [/\bour\b/gi, "their"],
        [/\bwe\s+are\b/gi, "they are"],
        [/\bwe're\b/gi, "they are"],
        [/\bwe\b/gi, "they"],
        [/\bus\b/gi, "them"]
    ];

    for (const [pattern, replacement] of rules) {
        t = t.replace(pattern, replacement);
    }

    t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => guarded[Number(i)]);

    return normalizeText(t);
}

function stripFillers(text) {
    return normalizeText(
        normalizeText(text)
            .replace(FILLER_PATTERN, " ")
            .replace(/\s*[,;]\s*(?=[,;])/g, " ")
            .replace(/^\s*[,;:\-–—]+\s*/, "")
            .replace(/\s+([,.;!?])/g, "$1")
            .replace(/\s+/g, " ")
    );
}

/* ---------------- deterministic core-clause picker -------------- */

/**
 * Domain-neutral sentence scoring: frequency centrality, position,
 * informativeness (numbers / proper nouns), length.
 */
function scoreSentences(sentences, frequency) {
    return sentences.map((sentence, index) => {
        const tokens = contentTokens(sentence);
        const unique = new Set(tokens);

        const centrality = tokens.reduce(
            (sum, token) => sum + Math.min(frequency.get(token) || 1, 3),
            0
        ) / Math.max(unique.size, 1);

        // Concrete facts are worth keeping (rule 8).
        const informative =
            (/\d/.test(sentence) ? 1.2 : 0) +
            (/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|fifty|hundred|weeks?|days?|months?|years?|hours?)\b/i.test(sentence) ? 0.7 : 0) +
            (/[€$£¥]/.test(sentence) ? 0.8 : 0) +
            (sentence.match(/\b[A-Z][a-z]{2,}/g) || []).length * 0.18;

        const lengthBonus = Math.min(tokens.length, 24) / 24;

        // Weaker than before: a strong lead bias is what made the old
        // fallback grab the opening sentence regardless of content.
        const positionBonus =
            index === 0 ? 1.1 : 1 / (1 + index * 0.05);

        // Content-free openers and sign-offs carry no information.
        // Biographical/background lead-ins are down-weighted too
        // (principle A / H): a post's central point is rarely "I'm
        // a 28-year-old teacher who has been to 12 countries" even
        // though that sentence is often number- and proper-noun-
        // dense, which otherwise scores it artificially high.
        const meta =
            /^(so|ok|okay|hi|hey|hello)\b/i.test(sentence) ||
            /\b(i (just )?want(ed)? to (share|say|ask|tell)|thanks in advance|any advice|sorry for the long post|first post here)\b/i.test(
                sentence
            ) ||
            /\b(a little about me|(just|quick) (some )?(context|background)|for (some )?(context|background)|about myself|i'?m an?\s+\d+[\s-]?year[\s-]?old|been (living|working|based) (in|at)\b.*\bfor\b)\b/i.test(
                sentence
            )
                ? 0.45
                : 1;

        return {
            sentence,
            index,
            // Centrality (does this sentence share vocabulary with
            // the rest of the post?) is weighted above raw
            // informativeness (numbers/proper nouns), which was
            // letting number- or name-dense incidental detail
            // outscore the sentence the post is actually about.
            score:
                (centrality * 1.5 + informative * 0.6) *
                positionBonus *
                meta *
                (0.75 + lengthBonus)
        };
    });
}

function selectCoreSentences(cleaned, budgetWords, maxSentences = 2) {
    const sentences = splitSentences(cleaned);
    if (!sentences.length) return [];

    const frequency = new Map();
    for (const token of contentTokens(cleaned)) {
        frequency.set(token, (frequency.get(token) || 0) + 1);
    }

    // A question post is about the question being asked (rule 9).
    const questionSentence = sentences.find((s) => /\?/.test(s));

    // If it isn't a question, the central point may instead be a
    // complaint/problem (principle A) — boost that sentence too,
    // but only when there's no question already anchoring the
    // summary, so the two boosts don't compete.
    const complaintSentence = !questionSentence
        ? sentences.find((s) => COMPLAINT_PATTERN.test(s))
        : null;

    const scored = scoreSentences(sentences, frequency).sort(
        (a, b) => b.score - a.score
    );

    if (questionSentence) {
        const q = scored.find((s) => s.sentence === questionSentence);
        if (q) q.score += 2.5;
        scored.sort((a, b) => b.score - a.score);
    } else if (complaintSentence) {
        const c = scored.find((s) => s.sentence === complaintSentence);
        if (c) c.score += 1.8;
        scored.sort((a, b) => b.score - a.score);
    }

    const selected = [];
    let total = 0;

    for (const item of scored) {
        const words = countWords(item.sentence);
        if (!words) continue;

        const candidate = new Set(contentTokens(item.sentence));

        const redundant = selected.some((existing) => {
            const other = new Set(contentTokens(existing.sentence));
            const overlap = [...candidate].filter((x) => other.has(x)).length;
            const union = new Set([...candidate, ...other]).size;
            // 0.7 only caught near-identical sentences. Posts that
            // restate the same point in slightly different words
            // (a literal repeated sentence plus a paraphrased
            // version of it, both common in scraped/reposted
            // content) shared ~0.6 of their vocabulary and both
            // got selected, producing "new passport rules... new
            // passport rules..."-style repetition in the summary.
            return union > 0 && overlap / union > 0.55;
        });

        if (redundant) continue;

        if (selected.length > 0 && total + words > budgetWords) continue;

        selected.push(item);
        total += words;

        if (selected.length >= maxSentences || total >= budgetWords - 6) break;
    }

    selected.sort((a, b) => a.index - b.index);
    return selected.map((item) => item.sentence);
}

/**
 * For posts long enough that MAX_INPUT_CHARS truncation would cut
 * off content, blindly feeding the model the first N characters
 * means it only ever sees the opening of the post. That is what
 * produces "only shortens the first sentence" / "misses the main
 * point" / "summarizes the wrong part" on long posts: the model
 * never sees the part of the post the point is actually in.
 *
 * Instead, pre-select the highest-scoring sentences (same scoring
 * already used by the compressor) spanning the WHOLE post, in their
 * original order, as the model's input. The model still does the
 * actual abstractive summarization; this only changes what it gets
 * to read.
 */
function buildModelInput(cleanedText) {
    if (cleanedText.length <= MAX_INPUT_CHARS) return cleanedText;

    const core = selectCoreSentences(cleanedText, 320, 10);
    const condensed = core.join(" ");

    // Fall back to plain truncation if sentence selection somehow
    // produced nothing usable (e.g. no sentence punctuation at all).
    if (!condensed || condensed.length < 40) {
        return cleanedText.slice(0, MAX_INPUT_CHARS);
    }

    return condensed.slice(0, MAX_INPUT_CHARS);
}

/* ---------------------- framing / labelling --------------------- */

function frameFor(text) {
    if (isQuestionPost(text)) return "The author asks ";
    if (/\b(hate|love|angry|frustrat|annoy|embarrass|humiliat|disappoint|worst|amazing|terrible|awful|ridiculous)\b/i.test(text)) {
        return "The author describes how ";
    }
    return "The author says ";
}

/**
 * Remove low-content padding inside a sentence so third-person text
 * (news, announcements) is genuinely shortened rather than copied.
 * Only drops words that carry no fact.
 */
function compressSentence(sentence) {
    return normalizeText(
        normalizeText(sentence)
            .replace(/\b(announced|said|stated|confirmed|reported)\s+(today|yesterday|this week|on \w+day)\s+that\b/gi, "$1 that")
            .replace(/\b(it (is|was) (reported|announced|said) that|according to reports|sources say)\b/gi, " ")
            // Note: "so" is deliberately excluded — it is load-bearing
            // in "so X that Y" constructions.
            .replace(/\b(really|quite|rather|absolutely|completely|totally|simply|truly)\s+/gi, " ")
            .replace(/\b(in order to)\b/gi, "to")
            .replace(/\b(at this (point in )?time|at the moment|as of right now)\b/gi, "now")
            .replace(/\b(a total of|a number of|the fact that)\b/gi, " ")
            .replace(/\s+([,.;!?])/g, "$1")
            .replace(/\s+/g, " ")
    );
}

/**
 * The deterministic compressor. This is what the anti-copy and
 * anti-hallucination guards fall back to, so it must actually
 * compress and rephrase rather than extract verbatim.
 */
function compressText(rawText, budgetWords = TARGET_SUMMARY_WORDS) {
    const cleaned = cleanForSummarization(rawText);
    if (!cleaned) return null;

    // Promotional posts are usually dense spec/price lists with no
    // redundancy to remove. Keep the facts, drop only the noise.
    if (isPromotionalPost(cleaned)) {
        const core = selectCoreSentences(cleaned, budgetWords);
        const promo = stripFillers(core.length ? core.join(" ") : cleaned);
        return ensureTerminalPunctuation(
            capitalize(limitWords(promo, MAX_SUMMARY_WORDS))
        );
    }

    const core = selectCoreSentences(cleaned, budgetWords);
    const sentences = core.length ? core : [cleaned];

    let framed = false;

    const parts = sentences.map((raw) => {
        let sentence = stripFillers(compressSentence(raw));

        // A question is already the summary of itself — never wrap it.
        if (/\?/.test(sentence)) {
            return sentence;
        }

        if (isFirstPerson(sentence)) {
            sentence = depersonalize(sentence);

            if (!framed) {
                framed = true;

                // "they" keeps the base verb form that "I" used, so
                // prefixing a frame stays grammatical for any verb.
                // Rewriting "they" -> "The author" would not
                // ("I want" -> "The author want").
                sentence = `${frameFor(raw)}${sentence
                    .charAt(0)
                    .toLowerCase()}${sentence.slice(1)}`;
            }
        }

        return sentence;
    });

    const body = collapseRepeatedRuns(
        parts
            .map((part) => capitalize(part))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
    );

    return ensureTerminalPunctuation(
        capitalize(limitWords(body, Math.min(budgetWords + 5, MAX_SUMMARY_WORDS)))
    ).replace(/\.{2,}/g, ".");
}

/**
 * Tiny posts: label rather than echo (rule 13 + the
 * "New Passport Rules 2026" case). No content is invented.
 */
function labelTinyPost(rawText) {
    const cleaned = cleanForSummarization(rawText);
    if (!cleaned) return null;

    // A short post that is already a complete, punctuated sentence is
    // its own summary (rule 13) — return it rather than padding it.
    const looksLikeSentence =
        /[.!?]$/.test(normalizeText(rawText)) && countWords(cleaned) >= 4;

    if (looksLikeSentence) {
        return ensureTerminalPunctuation(capitalize(cleaned));
    }

    const kind = isQuestionPost(cleaned)
        ? "Short post asking about"
        : "Short post about";

    const subject = cleaned.replace(/[.!?]+$/, "").trim();

    // Nothing left to label (punctuation/emoji only).
    if (!/[\p{L}\p{N}]/u.test(subject)) {
        return ensureTerminalPunctuation(capitalize(cleaned));
    }

    return `${kind} ${subject.charAt(0).toLowerCase()}${subject.slice(1)}.`;
}

/* -------------------------- guards ------------------------------ */

function hasDegenerateRepetition(text) {
    const words = normalizeText(text)
        .toLowerCase()
        .replace(/[-–—]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

    for (let i = 0; i < words.length - 1; i++) {
        if (words[i] === words[i + 1] && words[i].length > 2) return true;
    }

    for (let size = 2; size <= 4; size++) {
        for (let i = 0; i + size * 2 <= words.length; i++) {
            const a = words.slice(i, i + size).join(" ");
            const b = words.slice(i + size, i + size * 2).join(" ");
            if (a.length > 8 && a === b) return true;
        }
    }

    return false;
}

function normalizeForPhraseCheck(text) {
    return tokenizeForComparison(text).join(" ");
}

function hasLongCopiedPhrase(input, summary) {
    const inputWords = normalizeForPhraseCheck(input).split(" ").filter(Boolean);
    const summaryWords = normalizeForPhraseCheck(summary).split(" ").filter(Boolean);

    if (summaryWords.length < 8 || inputWords.length < 12) return false;

    const n = 6;
    const inputSet = new Set();

    for (let i = 0; i + n <= inputWords.length; i++) {
        inputSet.add(inputWords.slice(i, i + n).join(" "));
    }

    let copied = 0;
    let total = 0;

    for (let i = 0; i + n <= summaryWords.length; i++) {
        total++;
        if (inputSet.has(summaryWords.slice(i, i + n).join(" "))) copied++;
    }

    return total > 0 && copied / total >= 0.55;
}

function isVerbatimPrefixCopy(input, summary) {
    const inputWords = tokenizeForComparison(input);
    const summaryWords = tokenizeForComparison(summary);

    if (summaryWords.length < 8) return false;

    return (
        inputWords.slice(0, summaryWords.length).join(" ") ===
        summaryWords.join(" ")
    );
}

/**
 * Faithfulness guard (rule 5).
 *
 * Rejects summaries that introduce numbers, prices or dates absent
 * from the source, or that are built largely from content words the
 * source never used. This is what catches the
 * "world's most expensive SSDs" class of hallucination.
 */
function isUnfaithful(source, summary) {
    const sourceNumbers = new Set(
        (source.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "."))
    );

    const summaryNumbers = (summary.match(/\d+(?:[.,]\d+)?/g) || []).map((n) =>
        n.replace(",", ".")
    );

    for (const num of summaryNumbers) {
        if (!sourceNumbers.has(num)) return true;
    }

    const sourceTokens = new Set(contentTokens(source));
    const summaryTokens = contentTokens(summary);

    if (!summaryTokens.length) return false;

    const unsupported = summaryTokens.filter((t) => {
        if (sourceTokens.has(t)) return false;
        // Allow simple morphological variants.
        for (const s of sourceTokens) {
            if (s.startsWith(t.slice(0, 5)) || t.startsWith(s.slice(0, 5))) {
                return false;
            }
        }
        return true;
    }).length;

    return unsupported / summaryTokens.length > MAX_UNSUPPORTED_TOKEN_RATIO;
}

function stripBoilerplateLeadIn(text) {
    return normalizeText(text)
        .replace(
            /^(summary|in summary|the article|the post|this post|this video|the video)\s*[:,-]?\s*/i,
            ""
        )
        .trim();
}

/* ------------------------ model loading ------------------------- */

let summarizerPromise = null;

function getSummarizer() {
    if (!summarizerPromise) {
        summarizerPromise = (async () => {
            const { pipeline } = await import("@xenova/transformers");

            console.log(`Loading local summarization model: ${MODEL_NAME}`);
            console.log("First run may download several GB of ONNX model files.");

            const lastLogged = {};

            return pipeline("summarization", MODEL_NAME, {
                progress_callback: (data) => {
                    if (data.status === "progress") {
                        const pct = Math.round(data.progress);
                        if (lastLogged[data.file] !== pct) {
                            lastLogged[data.file] = pct;
                            console.log(`  ${data.file}: ${pct}%`);
                        }
                    } else {
                        console.log(`  [${data.status}] ${data.file || ""}`);
                    }
                }
            });
        })();
    }

    return summarizerPromise;
}

/* --------------------------- main ------------------------------- */

async function summarizeText(rawText) {
    const fullText = normalizeText(rawText);

    if (!fullText) {
        return { summary: null, method: "none" };
    }

    const originalWordCount = countWords(fullText);

    // 0. The author's own TL;DR beats anything we can generate.
    const tldr = extractAuthorTldr(fullText);
    if (tldr) {
        return {
            summary: ensureTerminalPunctuation(
                capitalize(limitWords(tldr, MAX_SUMMARY_WORDS))
            ),
            method: "author_tldr"
        };
    }

    // 1. Tiny posts: label, never echo.
    if (originalWordCount <= TINY_POST_WORD_COUNT) {
        const labelled = labelTinyPost(fullText);
        return {
            summary: labelled || limitWords(fullText),
            method: "tiny_post_label"
        };
    }

    const cleanedText = cleanForSummarization(fullText);

    if (!cleanedText) {
        return {
            summary: limitWords(fullText),
            method: "cleaned_empty"
        };
    }

    // 2. Short/medium posts: the neural model copies these, so
    //    compress deterministically instead.
    if (originalWordCount < MODEL_MIN_WORD_COUNT) {
        const compressed = compressText(fullText);
        return {
            summary: compressed || limitWords(cleanedText),
            method: "compressor_short_post"
        };
    }

    // 2b. Questions and promotional posts have a specific, checkable
    // correctness requirement (rule 4: stay a question; keep the
    // price/spec) that the compressor already guarantees by
    // construction (it boosts and preserves the question sentence
    // unmodified, and for promo posts keeps facts rather than
    // paraphrasing them away). The neural model has no such
    // guarantee, so route these straight to the compressor
    // regardless of length instead of relying on guards to catch
    // it after the fact.
    if (isQuestionPost(fullText) || isPromotionalPost(cleanedText)) {
        const compressed = compressText(fullText);
        if (compressed) {
            return { summary: compressed, method: "compressor_type_routed" };
        }
    }

    // 3. Long posts: neural summarization, scaled to input length.
    const modelInput = buildModelInput(cleanedText);
    const longPost = originalWordCount > 140;

    let modelSummary = "";

    try {
        const summarizer = await getSummarizer();

        const result = await summarizer(modelInput, {
            min_length: 18,
            max_length: longPost ? 58 : 46,
            num_beams: 4,
            // <= 1.0 favours shorter beams; the old 1.35 pushed the
            // model toward input-length (i.e. copied) output.
            length_penalty: longPost ? 1.0 : 0.85,
            no_repeat_ngram_size: 3,
            repetition_penalty: 1.12,
            early_stopping: true
        });

        modelSummary = stripBoilerplateLeadIn(
            normalizeText(result?.[0]?.summary_text || "")
                .replace(/[#*_`]+/g, " ")
                .replace(/\s+/g, " ")
        );

        modelSummary = limitWords(modelSummary, MAX_SUMMARY_WORDS);
    } catch (error) {
        console.error("Summarization model failed:", error);
        return {
            summary: compressText(fullText) || limitWords(cleanedText),
            method: "compressor_model_error"
        };
    }

    if (!modelSummary) {
        return {
            summary: compressText(fullText) || limitWords(cleanedText),
            method: "compressor_model_empty"
        };
    }

    // 4. Guards. Every failure now routes to the compressor, which
    //    rephrases, instead of to verbatim sentence extraction.
    const summaryWordCount = countWords(modelSummary);

    const failed =
        hasDegenerateRepetition(modelSummary) ||
        hasLongCopiedPhrase(cleanedText, modelSummary) ||
        isVerbatimPrefixCopy(cleanedText, modelSummary) ||
        isUnfaithful(cleanedText, modelSummary) ||
        (summaryWordCount < MIN_SUMMARY_WORDS && originalWordCount > 18) ||
        // Belt-and-suspenders for the 2b routing above: catches any
        // question post that slips through isQuestionPost() (e.g. a
        // rhetorical question with unusual phrasing) if the model
        // rewrote it into a statement.
        (isQuestionPost(fullText) && !/\?/.test(modelSummary));

    if (failed) {
        return {
            summary: compressText(fullText) || limitWords(cleanedText),
            method: "compressor_quality_guard"
        };
    }

    return {
        summary: ensureTerminalPunctuation(capitalize(modelSummary)),
        method: "local_model_bart_large_cnn"
    };
}
module.exports = {
    summarizeText
};