require("dotenv").config();

const supabase = require("./src/config/supabase");
const { analyzeText } = require("./src/nlp/gibberishFilter");

// All platforms currently stored in the posts table.
const SUPPORTED_PLATFORMS = ["youtube", "reddit", "bluesky"];

// Process posts in batches.
const BATCH_SIZE = 500;

async function reprocessPostLanguages() {
    console.log("Starting language reprocessing...\n");

    let offset = 0;

    let totalScanned = 0;
    let totalChanged = 0;
    let totalUnchanged = 0;
    let totalErrors = 0;

    const changeCounts = {};

    while (true) {
        /*
         * IMPORTANT:
         * Your posts table does NOT have a `title` column.
         *
         * We therefore only retrieve columns that actually exist:
         * post_id, original_text, language, platform.
         */
        const { data: posts, error } = await supabase
            .from("posts")
            .select("post_id, original_text, language, platform")
            .in("platform", SUPPORTED_PLATFORMS)
            .range(offset, offset + BATCH_SIZE - 1);

        if (error) {
            throw error;
        }

        if (!posts || posts.length === 0) {
            break;
        }

        console.log(
            `Processing posts ${offset + 1}-${offset + posts.length}...\n`
        );

        for (const post of posts) {
            totalScanned++;

            /*
             * Use the actual stored post text.
             *
             * The new analyzeText() contains the Unicode-script
             * language guard:
             *
             * Gurmukhi     -> pan
             * Devanagari   -> hin
             * Arabic       -> arb
             * Bengali      -> ben
             * etc.
             *
             * If there is no strong Unicode-script signal,
             * analyzeText() falls back to franc().
             */
            const text = (post.original_text || "").trim();

            const analysis = analyzeText(text);

            const newLanguage = analysis.detectedLanguage || null;
            const oldLanguage = post.language || null;

            /*
             * Nothing to update if the detected language is
             * already the stored language.
             */
            if (oldLanguage === newLanguage) {
                totalUnchanged++;
                continue;
            }

            /*
             * VERY IMPORTANT:
             *
             * Update ONLY the language column.
             *
             * This script does NOT modify:
             * - translations
             * - summaries
             * - relevance
             * - gibberish status
             * - category
             * - sentiment
             * - region
             * - original_text
             * - platform
             */
            const { error: updateError } = await supabase
                .from("posts")
                .update({
                    language: newLanguage
                })
                .eq("post_id", post.post_id);

            if (updateError) {
                totalErrors++;

                console.error(
                    `Failed to update ${post.post_id}:`,
                    updateError
                );

                continue;
            }

            totalChanged++;

            const changeKey = `${oldLanguage || "null"} -> ${
                newLanguage || "null"
            }`;

            changeCounts[changeKey] =
                (changeCounts[changeKey] || 0) + 1;

            console.log(
                `[CHANGED] ${post.post_id}: ` +
                `${oldLanguage || "null"} -> ` +
                `${newLanguage || "null"} ` +
                `(${post.platform})`
            );
        }

        offset += posts.length;

        /*
         * If this batch contains fewer than BATCH_SIZE posts,
         * we've reached the end.
         */
        if (posts.length < BATCH_SIZE) {
            break;
        }
    }

    console.log("\n========================================");
    console.log("LANGUAGE REPROCESSING COMPLETE");
    console.log("========================================");

    console.log(`Posts scanned:     ${totalScanned}`);
    console.log(`Languages changed: ${totalChanged}`);
    console.log(`Unchanged:         ${totalUnchanged}`);
    console.log(`Errors:            ${totalErrors}`);

    console.log("\nLanguage changes:");

    if (Object.keys(changeCounts).length === 0) {
        console.log("  No language values changed.");
    } else {
        for (const [change, count] of Object.entries(changeCounts)) {
            console.log(`  ${change}: ${count}`);
        }
    }

    console.log("\nTargeted checks:");

    console.log(
        `  fra -> pan: ${changeCounts["fra -> pan"] || 0}`
    );

    console.log(
        `  fra -> hin: ${changeCounts["fra -> hin"] || 0}`
    );

    console.log("\nOnly the `language` column was modified.");
}

reprocessPostLanguages().catch((error) => {
    console.error("\nLanguage reprocessing failed:");
    console.error(error);
    process.exit(1);
});