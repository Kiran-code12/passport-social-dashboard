// Supported translation targets.
//
// Punjabi has no small local ONNX model available, so it is
// routed through the free LibreTranslate API instead of a local
// Xenova pipeline (see runRemoteTranslation / TARGET_LANGUAGES.punjabi).
// Every other language uses local Xenova/opus-mt-* models.
//
// Do not expose a language as supported unless the backend can
// actually translate it.

const { franc, francAll } = require("franc");

const TARGET_LANGUAGES = {
    english: { code: "eng", modelSuffix: "en" },
    hindi: { code: "hin", modelSuffix: "hi" },
    spanish: { code: "spa", modelSuffix: "es" },
    french: { code: "fra", modelSuffix: "fr" },
    german: { code: "deu", modelSuffix: "de" },
    arabic: { code: "arb", modelSuffix: "ar" },
    chinese: { code: "cmn", modelSuffix: "zh" },
    russian: { code: "rus", modelSuffix: "ru" },
    japanese: { code: "jpn", modelSuffix: "jap" },
    vietnamese: { code: "vie", modelSuffix: "vi" },
    indonesian: { code: "ind", modelSuffix: "id" },
    punjabi: { code: "pan", modelSuffix: "pa", remote: true }
};

// franc language codes -> translation model suffix.
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
    ind: "id",
    pan: "pa"
};

/*
 * Fallback source-language model, used only when a source language has
 * no dedicated bilingual model above (e.g. Kannada). Helsinki-NLP's
 * "mul-en" ("multiple languages" -> English) model, already converted
 * to ONNX by Xenova, is trained on ~275 source languages including many
 * low-resource ones our per-language models don't cover. It always
 * translates INTO English, so it slots into the existing
 * source -> English -> target pivot as an alternate first hop: real
 * dedicated models are always tried first (better quality) and this is
 * only reached when none exists for the detected language.
 *
 * MUL_EN_SUPPORTED_SOURCE_CODES is the model's own documented source
 * language list (github.com/Helsinki-NLP/Tatoeba-Challenge mul-eng
 * README), with script-variant suffixes like "_Latn"/"_Hans" stripped
 * to their base ISO 639-3 code. We only ever route a language through
 * this fallback when it is confirmed to be in this list -- never as a
 * guess -- so it never gets asked to translate a language it was not
 * actually trained on.
 */
const MUL_EN_MODEL_ID = "Xenova/opus-mt-mul-en";

const MUL_EN_SUPPORTED_SOURCE_CODES = new Set([
    "abk", "acm", "ady", "afb", "afh", "afr", "akl", "aln", "amh", "ang",
    "apc", "ara", "arg", "arq", "ary", "arz", "asm", "ast", "avk", "awa",
    "aze", "bak", "bam", "bel", "ben", "bho", "bod", "bos", "bre", "brx",
    "bul", "cat", "ceb", "ces", "cha", "che", "chr", "chv", "cjy", "cmn",
    "cor", "cos", "crh", "csb", "cym", "dan", "deu", "dsb", "dtp", "dws",
    "egl", "ell", "enm", "epo", "est", "eus", "ewe", "ext", "fao", "fij",
    "fin", "fkv", "fra", "frm", "frr", "fry", "fuc", "fuv", "gan", "gcf",
    "gil", "gla", "gle", "glg", "glv", "gom", "gos", "got", "grc", "grn",
    "gsw", "guj", "hat", "hau", "haw", "heb", "hif", "hil", "hin", "hnj",
    "hoc", "hrv", "hsb", "hun", "hye", "iba", "ibo", "ido", "ike", "ile",
    "ilo", "ina", "ind", "isl", "ita", "izh", "jav", "jbo", "jdt", "jpn",
    "kab", "kal", "kan", "kat", "kaz", "kek", "kha", "khm", "kin", "kir",
    "kjh", "kpv", "krl", "ksh", "kum", "kur", "lad", "lao", "lat", "lav",
    "ldn", "lfn", "lij", "lin", "lit", "liv", "lkt", "lld", "lmo", "ltg",
    "ltz", "lug", "lzh", "mad", "mah", "mai", "mal", "mar", "max", "mdf",
    "mfe", "mhr", "mic", "min", "mkd", "mlg", "mlt", "mnw", "moh", "mon",
    "mri", "mwl", "mww", "mya", "myv", "nan", "nau", "nav", "nds", "niu",
    "nld", "nno", "nob", "nog", "non", "nov", "npi", "nya", "oci", "ori",
    "orv", "oss", "ota", "pag", "pan", "pap", "pau", "pdc", "pes", "pms",
    "pnb", "pol", "por", "ppl", "prg", "pus", "quc", "qya", "rap", "rif",
    "roh", "rom", "ron", "rue", "run", "rus", "sag", "sah", "san", "scn",
    "sco", "sgs", "shs", "shy", "sin", "sjn", "slv", "sma", "sme", "smo",
    "sna", "snd", "som", "spa", "sqi", "srp", "stq", "sun", "swe", "swg",
    "swh", "tah", "tam", "tat", "tel", "tet", "tgk", "tha", "tir", "tlh",
    "tly", "tmw", "toi", "ton", "tpw", "tso", "tuk", "tur", "tvl", "tyv",
    "tzl", "udm", "uig", "ukr", "umb", "urd", "uzb", "vec", "vie", "vol",
    "vro", "war", "wln", "wol", "wuu", "xal", "xho", "yid", "yor", "yue",
    "zho", "zlm", "zsm", "zul", "zza"
]);

const MAX_INPUT_CHARS = 512;

/*
 * Local model inference runs in a worker thread (translationWorker.js),
 * NOT on the main thread. onnxruntime-node runs inference
 * synchronously, so on the main thread a single translation blocks the
 * event loop for its whole duration and every other API request hangs
 * until it finishes. The worker is started lazily on first use and is
 * transparently restarted if it ever dies.
 */
const path = require("path");
const { Worker } = require("worker_threads");

let translationWorker = null;
let nextWorkerRequestId = 1;
const pendingWorkerRequests = new Map();

function getTranslationWorker() {
    if (translationWorker) {
        return translationWorker;
    }

    const worker = new Worker(
        path.join(__dirname, "translationWorker.js")
    );

    worker.on("message", ({ id, ok, text, error }) => {
        const pending = pendingWorkerRequests.get(id);

        if (!pending) {
            return;
        }

        pendingWorkerRequests.delete(id);

        if (ok) {
            pending.resolve(text);
        } else {
            pending.reject(new Error(error));
        }
    });

    // If the worker dies, fail only ITS in-flight requests and let the
    // next translation start a fresh worker.
    const handleWorkerFailure = (error) => {
        if (translationWorker === worker) {
            translationWorker = null;
        }

        for (const [id, pending] of pendingWorkerRequests) {
            if (pending.worker === worker) {
                pendingWorkerRequests.delete(id);
                pending.reject(error);
            }
        }
    };

    worker.on("error", handleWorkerFailure);

    worker.on("exit", (code) =>
        handleWorkerFailure(
            new Error(`Translation worker exited (code ${code}).`)
        )
    );

    translationWorker = worker;

    return worker;
}

function callTranslationWorker(message) {
    return new Promise((resolve, reject) => {
        const id = nextWorkerRequestId++;
        const worker = getTranslationWorker();

        pendingWorkerRequests.set(id, { resolve, reject, worker });

        worker.postMessage({ id, ...message });
    });
}

/*
 * Punjabi has no small local ONNX model, so it is routed
 * through the free LibreTranslate API instead. Everything
 * else stays fully local.
 */
const LIBRETRANSLATE_URL =
    process.env.LIBRETRANSLATE_URL ||
    "https://libretranslate.com/translate";

const LIBRETRANSLATE_API_KEY =
    process.env.LIBRETRANSLATE_API_KEY || "";

// Internal modelSuffix -> ISO 639-1 code LibreTranslate expects.
// Only "jap" differs from our internal suffix naming.
const MODEL_SUFFIX_TO_ISO = {
    en: "en",
    hi: "hi",
    es: "es",
    fr: "fr",
    de: "de",
    ar: "ar",
    zh: "zh",
    ru: "ru",
    jap: "ja",
    vi: "vi",
    id: "id",
    pa: "pa"
};

/**
 * Translate text via the LibreTranslate API.
 *
 * Used only for languages with no local ONNX model
 * (currently: Punjabi).
 */
async function runRemoteTranslation(text, sourceIso, targetIso) {
    /*
     * Every failure below is re-thrown with a message starting
     * "Cannot translate:" so it reaches the client as-is. server.js's
     * global error handler only passes an error's own message through
     * for a small set of known phrases (this one among them) and
     * replaces anything else with a generic "Internal server error" —
     * which previously hid exactly why a Punjabi translation failed
     * (e.g. the remote LibreTranslate service rejecting the request
     * because no API key is configured). The full error is still
     * logged server-side regardless; this only changes what the
     * client is told.
     */
    let response;

    try {
        response = await fetch(LIBRETRANSLATE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                q: text,
                source: sourceIso,
                target: targetIso,
                format: "text",
                ...(LIBRETRANSLATE_API_KEY
                    ? { api_key: LIBRETRANSLATE_API_KEY }
                    : {})
            })
        });
    } catch (networkError) {
        throw new Error(
            `Cannot translate: the remote Punjabi translation ` +
            `service could not be reached ` +
            `(${networkError.message}).`
        );
    }

    if (!response.ok) {
        const errText =
            await response.text().catch(() => "");

        throw new Error(
            `Cannot translate: the remote Punjabi translation ` +
            `service rejected the request ` +
            `(LibreTranslate ${response.status}: ` +
            `${errText || "no details"}).`
        );
    }

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            `Cannot translate: the remote Punjabi translation ` +
            `service returned an unreadable response.`
        );
    }

    if (!data || !data.translatedText) {
        throw new Error(
            `Cannot translate: the remote Punjabi translation ` +
            `service returned no translation.`
        );
    }

    return data.translatedText;
}

/*
 * Shared by normalizeSourceLanguage() and resolveRawSourceCode() below,
 * so common names/codes from the frontend resolve to the same franc
 * code regardless of which tier (dedicated model vs. fallback model)
 * ends up using it.
 */
const SOURCE_LANGUAGE_ALIASES = {
    english: "eng",
    en: "eng",

    hindi: "hin",
    hi: "hin",

    spanish: "spa",
    es: "spa",

    french: "fra",
    fr: "fra",

    german: "deu",
    de: "deu",

    arabic: "arb",
    ara: "arb",
    ar: "arb",

    chinese: "cmn",
    zho: "cmn",
    zh: "cmn",

    russian: "rus",
    ru: "rus",

    japanese: "jpn",
    ja: "jpn",

    vietnamese: "vie",
    vi: "vie",

    indonesian: "ind",
    id: "ind",

    punjabi: "pan",
    pa: "pan",

    // Existing posts may contain this value.
    // Keep compatibility with those existing records.
    sco: "eng",

    und: null,
    unknown: null
};

/**
 * Normalize source language values to a franc code with a DEDICATED
 * bilingual model (i.e. a FRANC_TO_MODEL_SUFFIX entry).
 *
 * The database normally stores franc ISO 639-3 codes.
 * This also accepts common names/codes from the frontend.
 */
function normalizeSourceLanguage(sourceLanguage) {
    if (!sourceLanguage) {
        return null;
    }

    const value = String(sourceLanguage)
        .trim()
        .toLowerCase();

    if (
        Object.prototype.hasOwnProperty.call(
            SOURCE_LANGUAGE_ALIASES,
            value
        )
    ) {
        const aliased = SOURCE_LANGUAGE_ALIASES[value];

        return aliased && FRANC_TO_MODEL_SUFFIX[aliased]
            ? aliased
            : null;
    }

    // Already a supported franc code.
    if (FRANC_TO_MODEL_SUFFIX[value]) {
        return value;
    }

    return null;
}

/**
 * Resolve source language values to a plain franc code, WITHOUT
 * requiring a dedicated bilingual model to exist for it. Used to check
 * a language against the broader multilingual fallback model
 * (MUL_EN_SUPPORTED_SOURCE_CODES) when no dedicated model covers it.
 */
function resolveRawSourceCode(sourceLanguage) {
    if (!sourceLanguage) {
        return null;
    }

    const value = String(sourceLanguage)
        .trim()
        .toLowerCase();

    if (
        Object.prototype.hasOwnProperty.call(
            SOURCE_LANGUAGE_ALIASES,
            value
        )
    ) {
        return SOURCE_LANGUAGE_ALIASES[value];
    }

    // A plain-looking language code (e.g. a franc ISO 639-3 code such
    // as "kan") that isn't one of the named aliases above.
    if (/^[a-z]{2,3}$/.test(value)) {
        return value;
    }

    return null;
}

/**
 * Normalize target language.
 */
function normalizeTargetLanguage(targetLanguage) {
    if (!targetLanguage) {
        return null;
    }

    return String(targetLanguage)
        .trim()
        .toLowerCase();
}

/**
 * Return languages that the backend can actually translate.
 */
function getSupportedTargetLanguages() {
    return Object.keys(
        TARGET_LANGUAGES
    );
}

/**
 * Model ids needed to warm up every supported non-English language
 * under the current pivot architecture (source -> English ->
 * target). Built directly from TARGET_LANGUAGES so this stays in
 * sync automatically if a language is ever added or removed there.
 *
 * Punjabi is excluded: it is routed through LibreTranslate
 * (remote: true), not a local Xenova pipeline, so there is no local
 * model to warm up for it.
 */
function getWarmUpModelIds() {
    const nonEnglishLocalSuffixes = Object.values(TARGET_LANGUAGES)
        .filter(
            (target) =>
                !target.remote &&
                target.modelSuffix !== "en"
        )
        .map((target) => target.modelSuffix);

    const modelIds = [];

    for (const suffix of nonEnglishLocalSuffixes) {
        modelIds.push(`Xenova/opus-mt-${suffix}-en`);
        modelIds.push(`Xenova/opus-mt-en-${suffix}`);
    }

    // Avoid loading the same model more than once.
    return [...new Set(modelIds)];
}

/**
 * Pre-warm every local translation model the pivot architecture
 * can need, so the first real translation request for a given
 * language pair doesn't have to pay the model download/load cost.
 *
 * This is fire-and-forget from the caller's perspective: it must
 * never block server startup, and a failure on any single model
 * must not stop the rest from warming up or crash the server.
 *
 * Loads go through the same worker (and its pipeline cache) that real
 * translations use, so warmed models are the ones that get reused.
 */
async function warmUpModels() {
    const modelIds = getWarmUpModelIds();

    console.log("[Translator] Starting model warm-up...");

    for (const modelId of modelIds) {
        const label = modelId.replace("Xenova/opus-mt-", "");

        try {
            await callTranslationWorker({ type: "load", modelId });

            console.log(`[Translator] Warmed: ${label}`);
        } catch (error) {
            console.error(
                `[Translator] Failed to warm ${label}:`,
                error.message
            );
        }
    }

    console.log("[Translator] Model warm-up complete.");
}

/**
 * Run a local translation model.
 */
async function runPipeline(modelId, text) {
    return callTranslationWorker({
        type: "translate",
        modelId,
        text
    });
}

/**
 * Rank franc's language guesses for a text, filtered to plausible
 * codes. Used by detectBestSourceLanguage() below.
 */
function getRankedFrancCodes(text) {
    if (
        !text ||
        typeof text !== "string"
    ) {
        return [];
    }

    const cleanedText =
        text.trim();

    if (
        cleanedText.length < 10
    ) {
        return [];
    }

    const results =
        francAll(cleanedText);

    if (
        !Array.isArray(results)
    ) {
        return [];
    }

    const codes = [];

    for (
        const result of results
    ) {
        if (
            !Array.isArray(result) ||
            !result[0]
        ) {
            continue;
        }

        codes.push(
            String(result[0])
                .trim()
                .toLowerCase()
        );
    }

    return codes;
}

/**
 * Detect a source language from the actual text, preferring
 * franc's own confidence ranking over which tier (dedicated model vs.
 * multilingual fallback model) happens to cover a language.
 *
 * IMPORTANT: this walks franc's ranked guesses ONCE, checking each
 * candidate against BOTH tiers before moving to the next-ranked
 * candidate. Checking every candidate against the dedicated-model
 * tier first (i.e. exhausting all ranks for tier 1 before ever
 * trying tier 2) would let a low-confidence dedicated-model guess
 * win over a much higher-confidence fallback-only guess -- e.g. for
 * text that mixes Kannada with English words, franc may correctly
 * rank "kan" first, but if "kan" is only ever checked against the
 * fallback tier LAST, a weaker lower-ranked guess with a dedicated
 * model would incorrectly win instead, producing a translation from
 * the wrong source language.
 *
 * The database can sometimes contain an incorrect or unsupported
 * language code, which is why this exists: instead of trusting that
 * value, inspect the actual text and choose the highest-ranked
 * language our translation system (either tier) can support.
 */
function detectBestSourceLanguage(text) {
    for (const detectedCode of getRankedFrancCodes(text)) {
        const normalized =
            normalizeSourceLanguage(
                detectedCode
            );

        if (normalized) {
            return { francCode: normalized, viaFallback: false };
        }

        if (MUL_EN_SUPPORTED_SOURCE_CODES.has(detectedCode)) {
            return { francCode: detectedCode, viaFallback: true };
        }
    }

    return null;
}

/**
 * Translate text.
 */
async function translateText(
    text,
    sourceLanguage,
    targetLanguageName
) {
    if (
        !text ||
        typeof text !== "string"
    ) {
        throw new Error(
            "Text is required for translation."
        );
    }

    const targetLanguage =
        normalizeTargetLanguage(
            targetLanguageName
        );

    const target =
        TARGET_LANGUAGES[
            targetLanguage
        ];

    if (!target) {
        throw new Error(
            `Unsupported target language ` +
            `"${targetLanguageName}". ` +
            `Supported: ` +
            `${getSupportedTargetLanguages().join(", ")}`
        );
    }

    /*
     * First try the language stored in the database/frontend, against
     * BOTH tiers (dedicated model, then the multilingual fallback
     * model) before ever falling back to text-based redetection. A
     * known, already-validated stored value (e.g. "kan", produced by
     * gibberishFilter.js's Unicode-script-aware detector) is a more
     * reliable signal than blindly re-running franc on the text, so
     * it takes priority over text redetection entirely -- not just
     * within one tier.
     */
    let sourceFrancCode =
        normalizeSourceLanguage(
            sourceLanguage
        );

    let usedFallbackSourceModel = false;

    if (!sourceFrancCode) {
        const rawCode =
            resolveRawSourceCode(sourceLanguage);

        if (
            rawCode &&
            MUL_EN_SUPPORTED_SOURCE_CODES.has(rawCode)
        ) {
            sourceFrancCode = rawCode;
            usedFallbackSourceModel = true;
        }
    }

    /*
     * The stored value was missing or not recognized in either tier.
     * Detect the language directly from the post text instead, still
     * respecting franc's own confidence ranking across both tiers
     * (see detectBestSourceLanguage's own comment for why this must
     * be rank-first, not tier-first).
     */
    if (!sourceFrancCode) {
        const detected =
            detectBestSourceLanguage(
                text
            );

        if (detected) {
            sourceFrancCode = detected.francCode;
            usedFallbackSourceModel = detected.viaFallback;
        }
    }

    if (!sourceFrancCode) {
        throw new Error(
            `Cannot translate: the source language ` +
            `"${sourceLanguage || "unknown"}" is not supported by ` +
            `any available translation model.`
        );
    }

    const sourceSuffix =
        usedFallbackSourceModel
            ? null
            : FRANC_TO_MODEL_SUFFIX[
                sourceFrancCode
            ];

    if (!usedFallbackSourceModel && !sourceSuffix) {
        // Unreachable given normalizeSourceLanguage/
        // detectBestSourceLanguage's non-fallback branch only ever
        // return codes present in FRANC_TO_MODEL_SUFFIX; kept as a
        // defensive guard.
        throw new Error(
            `Source language "${sourceFrancCode}" ` +
            `is not supported.`
        );
    }

    /*
     * Same language. Only possible for a dedicated-model match: a
     * fallback-tier code is by definition NOT one of
     * FRANC_TO_MODEL_SUFFIX's keys (otherwise tier 1 above would
     * have used the dedicated model instead), so it can never equal
     * a target's modelSuffix.
     */
    if (
        sourceSuffix &&
        sourceSuffix ===
        target.modelSuffix
    ) {
        return {
            translatedText: text,
            method: "no_translation_needed"
        };
    }

    /*
     * Limit input size for local models.
     */
    const truncated =
        text.slice(
            0,
            MAX_INPUT_CHARS
        );

    /*
     * Reported back to the caller (and shown in the UI) so a
     * translation that covers only the start of a long post is
     * never mistaken for a translation of the whole post.
     */
    const truncatedAt =
        text.length > MAX_INPUT_CHARS
            ? MAX_INPUT_CHARS
            : null;

    /*
     * Fallback multilingual source model: no dedicated model for
     * this source language, but the mul-en model is documented to
     * support it. It only ever translates INTO English, so it
     * becomes the first hop of the same source -> English -> target
     * pivot used below; a genuine per-language target model still
     * handles the second hop, so output quality/language for the
     * TARGET side is exactly as before.
     *
     * Punjabi target is intentionally excluded here: its only path
     * is the remote LibreTranslate service below, which needs a
     * reliable source ISO code we don't have for the ~275 fallback
     * languages. Rather than guess (risking a malformed request or a
     * silently wrong translation), this combination cleanly reports
     * that it isn't currently supported.
     */
    if (usedFallbackSourceModel) {
        if (target.modelSuffix === "pa") {
            throw new Error(
                `Cannot translate: this source language can only ` +
                `currently be translated into English or the other ` +
                `local target languages, not Punjabi.`
            );
        }

        const englishText =
            await runPipeline(
                MUL_EN_MODEL_ID,
                truncated
            );

        if (target.modelSuffix === "en") {
            return {
                translatedText: englishText,
                method: "local_model_fallback_multilingual",
                truncatedAt
            };
        }

        const fromEnglishModel =
            `Xenova/opus-mt-en-${target.modelSuffix}`;

        const translatedText =
            await runPipeline(
                fromEnglishModel,
                englishText
            );

        return {
            translatedText,
            method: "local_model_fallback_multilingual_pivot_via_english",
            truncatedAt
        };
    }

    /*
     * Punjabi has no local ONNX model on either side.
     * Route it through LibreTranslate instead.
     */
    if (
        sourceSuffix === "pa" ||
        target.modelSuffix === "pa"
    ) {
        const sourceIso =
            MODEL_SUFFIX_TO_ISO[
                sourceSuffix
            ] || sourceSuffix;

        const targetIso =
            MODEL_SUFFIX_TO_ISO[
                target.modelSuffix
            ] || target.modelSuffix;

        const translatedText =
            await runRemoteTranslation(
                truncated,
                sourceIso,
                targetIso
            );

        return {
            translatedText,
            method: "remote_libretranslate",
            truncatedAt
        };
    }

    /*
     * Source is English.
     */
    if (
        sourceSuffix === "en"
    ) {
        const modelId =
            `Xenova/opus-mt-en-${target.modelSuffix}`;

        const translatedText =
            await runPipeline(
                modelId,
                truncated
            );

        return {
            translatedText,
            method: "local_model",
            truncatedAt
        };
    }

    /*
     * Target is English.
     */
    if (
        target.modelSuffix === "en"
    ) {
        const modelId =
            `Xenova/opus-mt-${sourceSuffix}-en`;

        const translatedText =
            await runPipeline(
                modelId,
                truncated
            );

        return {
            translatedText,
            method: "local_model",
            truncatedAt
        };
    }

    /*
     * Neither language is English.
     *
     * Translate:
     *
     * source -> English -> target
     */
    const toEnglishModel =
        `Xenova/opus-mt-${sourceSuffix}-en`;

    const englishText =
        await runPipeline(
            toEnglishModel,
            truncated
        );

    const fromEnglishModel =
        `Xenova/opus-mt-en-${target.modelSuffix}`;

    const translatedText =
        await runPipeline(
            fromEnglishModel,
            englishText
        );

    return {
        translatedText,
        method: "local_model_pivot_via_english",
        truncatedAt
    };
}

module.exports = {
    translateText,
    getSupportedTargetLanguages,
    warmUpModels,
    MAX_INPUT_CHARS
};