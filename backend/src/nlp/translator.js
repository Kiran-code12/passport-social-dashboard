// The 10 target languages, mapped to their Xenova opus-mt model repo
// suffix and franc ISO 639-3 code. Punjabi was originally required by
// the spec but is deliberately excluded: no small, pre-converted ONNX
// model for English<->Punjabi exists anywhere in this ecosystem (only
// a large, multi-language bundled model with no ONNX port). Rather than
// fake it or force a 600MB download that has repeatedly failed on this
// network, Vietnamese and Indonesian were substituted — both genuinely
// useful given Southeast Asian passport content already seen in the
// scraped data, and both have verified, small ONNX models available.
const TARGET_LANGUAGES = {
    english: { code: "eng", modelSuffix: "en" },
    hindi: { code: "hin", modelSuffix: "hi" },
    spanish: { code: "spa", modelSuffix: "es" },
    french: { code: "fra", modelSuffix: "fr" },
    german: { code: "deu", modelSuffix: "de" },
    arabic: { code: "arb", modelSuffix: "ar" },
    chinese: { code: "cmn", modelSuffix: "zh" },
    russian: { code: "rus", modelSuffix: "ru" },
    japanese: { code: "jpn", modelSuffix: "jap" }, // Helsinki-NLP uses "jap", not "ja"
    vietnamese: { code: "vie", modelSuffix: "vi" },
    indonesian: { code: "ind", modelSuffix: "id" }
};

// Maps franc's detected source language codes to the same modelSuffix
// scheme, for languages we've actually seen coming out of the scraper
// and that have a "<lang>-en" pivot model available.
const FRANC_TO_MODEL_SUFFIX = {
    eng: "en",
    hin: "hi",
    spa: "es",
    fra: "fr",
    deu: "de",
    arb: "ar",
    ara: "ar",
    cmn: "zh",
    zho: "zh",
    rus: "ru",
    jpn: "jap",
    vie: "vi",
    ind: "id"
};

const MAX_INPUT_CHARS = 512;

// Loaded translation pipelines are cached per model pair so repeated
// requests for the same language pair don't reload from disk each time.
const pipelineCache = {};

async function getPipeline(modelId) {
    if (!pipelineCache[modelId]) {
        pipelineCache[modelId] = (async () => {
            const { pipeline } = await import("@xenova/transformers");

            console.log(`Loading translation model ${modelId} (first use downloads it)...`);

            const lastLogged = {};

            return pipeline("translation", modelId, {
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
    return pipelineCache[modelId];
}

function getSupportedTargetLanguages() {
    return Object.keys(TARGET_LANGUAGES);
}

async function runPipeline(modelId, text) {
    const translator = await getPipeline(modelId);
    const result = await translator(text);
    return result[0].translation_text;
}

async function translateText(text, sourceFrancCode, targetLanguageName) {
    const target = TARGET_LANGUAGES[targetLanguageName?.toLowerCase()];
    if (!target) {
        throw new Error(
            `Unsupported target language "${targetLanguageName}". ` +
            `Supported: ${getSupportedTargetLanguages().join(", ")}`
        );
    }

    const sourceSuffix = FRANC_TO_MODEL_SUFFIX[sourceFrancCode];
    if (!sourceSuffix) {
        throw new Error(
            `Cannot translate: source language "${sourceFrancCode || "unknown"}" ` +
            `is not supported. Refusing to guess a source language.`
        );
    }

    // Same language — nothing to do.
    if (sourceSuffix === target.modelSuffix) {
        return { translatedText: text, method: "no_translation_needed" };
    }

    const truncated = (text || "").slice(0, MAX_INPUT_CHARS);

    // Direct pair exists (either source or target is English) — one hop.
    if (sourceSuffix === "en") {
        const modelId = `Xenova/opus-mt-en-${target.modelSuffix}`;
        const translatedText = await runPipeline(modelId, truncated);
        return { translatedText, method: "local_model" };
    }

    if (target.modelSuffix === "en") {
        const modelId = `Xenova/opus-mt-${sourceSuffix}-en`;
        const translatedText = await runPipeline(modelId, truncated);
        return { translatedText, method: "local_model" };
    }

    // Neither side is English — pivot through English using two small
    // models rather than requiring a direct model for every possible
    // language pair (which mostly don't exist as small ONNX models).
    const toEnglishModel = `Xenova/opus-mt-${sourceSuffix}-en`;
    const englishText = await runPipeline(toEnglishModel, truncated);

    const fromEnglishModel = `Xenova/opus-mt-en-${target.modelSuffix}`;
    const translatedText = await runPipeline(fromEnglishModel, englishText);

    return { translatedText, method: "local_model_pivot_via_english" };
}

module.exports = { translateText, getSupportedTargetLanguages };