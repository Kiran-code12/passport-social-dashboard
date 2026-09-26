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

const LIBRETRANSLATE_URL =
    process.env.LIBRETRANSLATE_URL ||
    "https://libretranslate.com/translate";

const LIBRETRANSLATE_API_KEY =
    process.env.LIBRETRANSLATE_API_KEY || "";

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

const TRANSLATION_MODE = process.env.TRANSLATION_MODE || "local";

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || "";
const MYMEMORY_TIMEOUT_MS = 15000;
const MYMEMORY_MAX_QUERY_BYTES = 450;

const FRANC_TO_MYMEMORY_ISO = {
    eng: "en",
    hin: "hi",
    spa: "es",
    fra: "fr",
    deu: "de",
    arb: "ar",
    ara: "ar",
    cmn: "zh-CN",
    zho: "zh-CN",
    rus: "ru",
    jpn: "ja",
    vie: "vi",
    ind: "id",
    pan: "pa"
};

function splitTextForMyMemory(text, maxBytes = MYMEMORY_MAX_QUERY_BYTES) {
    if (Buffer.byteLength(text, "utf8") <= maxBytes) {
        return [text];
    }

    const sentences = text.split(/(?<=[.!?\n])\s+/).filter(Boolean);
    const chunks = [];
    let current = "";

    const pushCurrent = () => {
        if (current) {
            chunks.push(current);
            current = "";
        }
    };

    for (const sentence of sentences) {
        const candidate = current ? `${current} ${sentence}` : sentence;

        if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
            current = candidate;
            continue;
        }

        pushCurrent();

        if (Buffer.byteLength(sentence, "utf8") <= maxBytes) {
            current = sentence;
            continue;
        }

        let piece = "";

        for (const ch of sentence) {
            const candidatePiece = piece + ch;

            if (Buffer.byteLength(candidatePiece, "utf8") > maxBytes) {
                if (piece) {
                    chunks.push(piece);
                }

                piece = ch;
            } else {
                piece = candidatePiece;
            }
        }

        current = piece;
    }

    pushCurrent();

    return chunks.length ? chunks : [text.slice(0, maxBytes)];
}

async function callMyMemory(chunk, sourceIso, targetIso) {
    const params = new URLSearchParams({
        q: chunk,
        langpair: `${sourceIso}|${targetIso}`
    });

    if (MYMEMORY_EMAIL) {
        params.set("de", MYMEMORY_EMAIL);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MYMEMORY_TIMEOUT_MS);

    let response;

    try {
        response = await fetch(`${MYMEMORY_URL}?${params.toString()}`, {
            signal: controller.signal
        });
    } catch (networkError) {
        throw new Error(
            `Cannot translate: the remote MyMemory translation service ` +
            `could not be reached (${networkError.message}).`
        );
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(
            `Cannot translate: the remote MyMemory translation service ` +
            `rejected the request (HTTP ${response.status}).`
        );
    }

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            `Cannot translate: the remote MyMemory translation service ` +
            `returned an unreadable response.`
        );
    }

    const translated = data?.responseData?.translatedText;

    if (
        Number(data?.responseStatus) !== 200 ||
        !translated ||
        translated.startsWith("MYMEMORY WARNING") ||
        translated.startsWith("QUERY LENGTH LIMIT")
    ) {
        throw new Error(
            `Cannot translate: the remote MyMemory translation service ` +
            `returned an invalid result ` +
            `(${translated || data?.responseStatus || "unknown error"}).`
        );
    }

    return translated;
}

async function translateViaMyMemory(text, sourceIso, targetIso) {
    const chunks = splitTextForMyMemory(text);
    const translatedChunks = [];

    for (const chunk of chunks) {
        translatedChunks.push(await callMyMemory(chunk, sourceIso, targetIso));
    }

    return translatedChunks.join(" ");
}

async function runRemoteTranslation(text, sourceIso, targetIso) {
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

    sco: "eng",

    und: null,
    unknown: null
};

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

    if (FRANC_TO_MODEL_SUFFIX[value]) {
        return value;
    }

    return null;
}

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

    if (/^[a-z]{2,3}$/.test(value)) {
        return value;
    }

    return null;
}

function normalizeTargetLanguage(targetLanguage) {
    if (!targetLanguage) {
        return null;
    }

    return String(targetLanguage)
        .trim()
        .toLowerCase();
}

function getSupportedTargetLanguages() {
    return Object.keys(
        TARGET_LANGUAGES
    );
}

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

    return [...new Set(modelIds)];
}

async function warmUpModels() {
    if (TRANSLATION_MODE === "remote") {
        console.log("[Translator] TRANSLATION_MODE=remote — skipping local model warm-up.");
        return;
    }

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

async function runPipeline(modelId, text) {
    return callTranslationWorker({
        type: "translate",
        modelId,
        text
    });
}

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
        throw new Error(
            `Source language "${sourceFrancCode}" ` +
            `is not supported.`
        );
    }

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

    const truncated =
        text.slice(
            0,
            MAX_INPUT_CHARS
        );

    const truncatedAt =
        text.length > MAX_INPUT_CHARS
            ? MAX_INPUT_CHARS
            : null;

    if (TRANSLATION_MODE === "remote") {
        const sourceIso =
            !usedFallbackSourceModel &&
            FRANC_TO_MYMEMORY_ISO[sourceFrancCode];

        const targetIso = FRANC_TO_MYMEMORY_ISO[target.code];

        if (!sourceIso) {
            throw new Error(
                `Cannot translate: the source language ` +
                `"${sourceFrancCode}" is not supported in remote ` +
                `translation mode.`
            );
        }

        if (!targetIso) {
            throw new Error(
                `Cannot translate: the target language ` +
                `"${targetLanguageName}" is not supported in remote ` +
                `translation mode.`
            );
        }

        const translatedText = await translateViaMyMemory(
            truncated,
            sourceIso,
            targetIso
        );

        return {
            translatedText,
            method: "remote_mymemory",
            truncatedAt
        };
    }

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