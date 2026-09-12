require("dotenv").config();

const supabase = require("./src/config/supabase");

const { checkRelevance } = require("./src/nlp/relevanceFilter");
const { analyzeText } = require("./src/nlp/gibberishFilter");
const { categorizeText } = require("./src/nlp/categorizer");
const { analyzeSentiment } = require("./src/nlp/sentimentAnalyzer");
const { detectRegion } = require("./src/nlp/regionDetector");

async function reprocessYouTubePosts() {
    console.log("Starting YouTube post reprocessing...\n");

    const { data: posts, error } = await supabase
        .from("posts")
        .select("*")
        .eq("platform", "youtube");

    if (error) {
        throw error;
    }

    if (!posts || posts.length === 0) {
        console.log("No YouTube posts found.");
        return;
    }

    console.log(`Found ${posts.length} YouTube posts.\n`);

    let relevantCount = 0;
    let irrelevantCount = 0;
    let gibberishCount = 0;

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];

        const text = [
            post.original_text || "",
            post.title || ""
        ]
            .join(" ")
            .trim();

        const gibberish = await analyzeText(text);
        const relevance = checkRelevance(text);

        const finalIsRelevant =
            relevance.isRelevant && !gibberish.isGibberish;

        let category = null;

        if (finalIsRelevant) {
            category = await categorizeText(text);
        }

        let sentiment = null;

        if (finalIsRelevant) {
            sentiment = await analyzeSentiment(text);
        }

        let region = null;

        if (finalIsRelevant) {
            region = detectRegion(text);
        }

        const { error: updateError } = await supabase
            .from("posts")
            .update({
                is_relevant: finalIsRelevant,
                is_gibberish: gibberish.isGibberish,
                category: finalIsRelevant ? category : null,
                sentiment: finalIsRelevant ? sentiment : null,
                region: finalIsRelevant ? region : null
            })
            .eq("post_id", post.post_id);

        if (updateError) {
            console.error(
                `Failed to update ${post.post_id}:`,
                updateError
            );
            continue;
        }

        if (gibberish.isGibberish) {
            gibberishCount++;
        } else if (finalIsRelevant) {
            relevantCount++;
        } else {
            irrelevantCount++;
        }

        console.log(`  Processed ${i + 1}/${posts.length}`);

        console.log({
            postId: post.post_id,
            relevant: finalIsRelevant,
            relevanceReason: relevance.reason,
            score: gibberish.score,
            reasons: gibberish.reasons
        });
    }

    console.log("\nYouTube reprocessing complete.");
    console.log(`Relevant: ${relevantCount}`);
    console.log(`Irrelevant: ${irrelevantCount}`);
    console.log(`Gibberish: ${gibberishCount}`);
}

reprocessYouTubePosts().catch((error) => {
    console.error("\nYouTube reprocessing failed:");
    console.error(error);
    process.exit(1);
});