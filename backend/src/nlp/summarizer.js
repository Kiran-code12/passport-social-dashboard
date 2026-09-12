const MAX_INPUT_CHARS = 1024;

// If the original text is already this short or shorter, running an
// abstractive summarization model on it doesn't produce a real summary —
// it either near-copies the input or pads/hallucinates to hit a target
// length. Below this threshold we just pass the original text through.
const SKIP_SUMMARY_WORD_COUNT = 35;

function countWords(text) {
    return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
}

// Known weak point: this local model is trained on English news text.
// On long, list-heavy, or code-mixed (e.g. Hindi/English) input it can
// produce degenerate output — the same word or phrase repeated back to
// back ("step-by-step step-by-step"). Rather than present that as a
// real summary, we detect it and fall back to an honest extractive
// summary (the post's own opening words) instead.
function hasDegenerateRepetition(text) {
    // Hyphenated stutters (e.g. "step-by-step step- by-step") can tokenize
    // inconsistently, hiding the repeated word behind mismatched hyphen
    // placement. Normalizing hyphens to spaces first exposes it reliably.
    const words = text
        .toLowerCase()
        .replace(/[-–—]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

    for (let i = 0; i < words.length - 1; i++) {
        if (words[i] === words[i + 1] && words[i].length > 2) {
            return true;
        }
    }
    return false;
}

function extractiveFallback(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const excerpt = words.slice(0, 30).join(" ");
    return words.length > 30 ? `${excerpt}...` : excerpt;
}

let summarizerPromise = null;

function getSummarizer() {
    if (!summarizerPromise) {
        summarizerPromise = (async () => {
            const { pipeline } = await import("@xenova/transformers");

            console.log(
                "Loading local summarization model (first run downloads it)..."
            );

            const lastLogged = {};

            return pipeline(
                "summarization",
                "Xenova/distilbart-cnn-6-6",
                {
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
                }
            );
        })();
    }
    return summarizerPromise;
}

async function summarizeText(rawText) {
    const fullText = normalizeText(rawText);
    const truncatedText = fullText.slice(0, MAX_INPUT_CHARS);

    if (!fullText) {
        return { summary: null, method: "none" };
    }

    if (countWords(fullText) <= SKIP_SUMMARY_WORD_COUNT) {
        return { summary: fullText, method: "passthrough_short_text" };
    }

    const summarizer = await getSummarizer();

    const result = await summarizer(truncatedText, {
        min_length: 20,
        max_length: 45
    });

    const modelSummary = result[0].summary_text.trim();

    if (hasDegenerateRepetition(modelSummary)) {
        return {
            summary: extractiveFallback(fullText),
            method: "extractive_fallback_repetition"
        };
    }

    return {
        summary: modelSummary,
        method: "local_model"
    };
}

module.exports = { summarizeText };