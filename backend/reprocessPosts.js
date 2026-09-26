require("dotenv").config();

const supabase = require("./src/config/supabase");
const { analyzeText } = require("./src/nlp/gibberishFilter");

const SUPPORTED_PLATFORMS = ["youtube", "reddit", "bluesky"];

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

            const text = (post.original_text || "").trim();

            const analysis = analyzeText(text);

            const newLanguage = analysis.detectedLanguage || null;
            const oldLanguage = post.language || null;

            if (oldLanguage === newLanguage) {
                totalUnchanged++;
                continue;
            }

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