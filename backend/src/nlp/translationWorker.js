// Translation worker.
//
// Runs the local Xenova/opus-mt models in a worker thread, off the
// main thread. onnxruntime-node executes model inference synchronously,
// and transformers.js chains those calls back to back, so running them
// on the main thread blocks the event loop for the whole translation
// (seconds for a short post, ~30s for a 512-character one) and every
// other API request (posts, search, filters, health) hangs until it
// finishes. Here it can only block this worker.
//
// Started lazily by translator.js; not meant to be required directly.

const { parentPort } = require("worker_threads");

// Cache loaded translation pipelines.
const pipelineCache = {};

/**
 * Load and cache a translation pipeline.
 *
 * Translation models are downloaded the first time they are used.
 * Network connections can occasionally terminate during a large
 * model download, so failed loads are retried.
 *
 * If a model fails to load, its rejected Promise is removed from
 * the cache so the next translation attempt can try again.
 */
async function getPipeline(modelId) {
    if (pipelineCache[modelId]) {
        return pipelineCache[modelId];
    }

    const loadPromise = (async () => {
        const MAX_ATTEMPTS = 3;

        let lastError = null;

        for (
            let attempt = 1;
            attempt <= MAX_ATTEMPTS;
            attempt++
        ) {
            try {
                const { pipeline } =
                    await import("@xenova/transformers");

                console.log(
                    `Loading translation model ${modelId} ` +
                    `(attempt ${attempt}/${MAX_ATTEMPTS})...`
                );

                const lastLogged = {};

                const translator = await pipeline(
                    "translation",
                    modelId,
                    {
                        progress_callback: (data) => {
                            if (data.status === "progress") {
                                const pct =
                                    Math.round(
                                        data.progress
                                    );

                                if (
                                    lastLogged[data.file] !==
                                    pct
                                ) {
                                    lastLogged[data.file] =
                                        pct;

                                    console.log(
                                        `  ${data.file}: ${pct}%`
                                    );
                                }
                            } else {
                                console.log(
                                    `  [${data.status}] ` +
                                    `${data.file || ""}`
                                );
                            }
                        }
                    }
                );

                console.log(
                    `Translation model ${modelId} ` +
                    `loaded successfully.`
                );

                return translator;

            } catch (error) {
                lastError = error;

                console.error(
                    `Failed loading ${modelId} ` +
                    `(attempt ${attempt}/${MAX_ATTEMPTS}):`,
                    error
                );

                if (
                    attempt < MAX_ATTEMPTS
                ) {
                    const delay =
                        attempt * 3000;

                    console.log(
                        `Retrying ${modelId} in ` +
                        `${delay / 1000} seconds...`
                    );

                    await new Promise(
                        (resolve) =>
                            setTimeout(
                                resolve,
                                delay
                            )
                    );
                }
            }
        }

        throw (
            lastError ||
            new Error(
                `Failed to load translation model ${modelId}.`
            )
        );
    })();

    pipelineCache[modelId] = loadPromise;

    try {
        return await loadPromise;
    } catch (error) {
        // IMPORTANT:
        // Do not leave a failed Promise in the cache.
        delete pipelineCache[modelId];

        throw error;
    }
}

/**
 * Messages from translator.js:
 *   { id, type: "load",      modelId }        -> load/cache the model
 *   { id, type: "translate", modelId, text }  -> translate `text`
 * Every message is answered with { id, ok, text?, error? }.
 */
parentPort.on("message", async ({ id, type, modelId, text }) => {
    try {
        const translator = await getPipeline(modelId);

        if (type === "load") {
            parentPort.postMessage({ id, ok: true });
            return;
        }

        const result = await translator(text);

        if (
            !result ||
            !result[0] ||
            !result[0].translation_text
        ) {
            throw new Error(
                `Translation model "${modelId}" ` +
                `returned no translation.`
            );
        }

        parentPort.postMessage({
            id,
            ok: true,
            text: result[0].translation_text
        });
    } catch (error) {
        parentPort.postMessage({
            id,
            ok: false,
            error: error.message
        });
    }
});
