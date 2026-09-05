require("dotenv").config();

const supabase = require("./src/config/supabase");
const { analyzeText } = require("./src/nlp/gibberishFilter");
const { checkRelevance } = require("./src/nlp/relevanceFilter");
const { categorizeText } = require("./src/nlp/categorizer");

async function reprocessPosts() {
    console.log("Loading existing YouTube posts...");

    const { data: posts, error } = await supabase
        .from("posts")
        .select("id, original_text")
        .eq("platform", "youtube");

    if (error) {
        throw new Error(
            `Failed to load posts: ${error.message}`
        );
    }

    console.log(`Found ${posts.length} YouTube posts.`);

    let relevantCount = 0;
    let irrelevantCount = 0;
    let gibberishCount = 0;

    for (const post of posts) {
        const text = post.original_text || "";

        const analysis = analyzeText(text);
        const relevance = checkRelevance(text);

        let category = null;

        if (!analysis.isGibberish && relevance.isRelevant) {
            const result = await categorizeText(text);
            category = result.category;
        }

        const { error: updateError } = await supabase
            .from("posts")
            .update({
                language: analysis.detectedLanguage,
                category,
                is_gibberish: analysis.isGibberish,
                is_relevant: relevance.isRelevant
            })
            .eq("id", post.id);

        if (updateError) {
            throw new Error(
                `Failed to update ${post.id}: ${updateError.message}`
            );
        }

        if (analysis.isGibberish) {
            gibberishCount++;
        } else if (relevance.isRelevant) {
            relevantCount++;
        } else {
            irrelevantCount++;
        }
    }

    console.log("");
    console.log("Reprocessing complete.");
    console.log(`Relevant: ${relevantCount}`);
    console.log(`Irrelevant: ${irrelevantCount}`);
    console.log(`Gibberish: ${gibberishCount}`);
}

reprocessPosts()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Reprocessing failed:", error.message);
        process.exit(1);
    });