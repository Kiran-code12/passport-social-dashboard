require("dotenv").config();

const supabase = require("./src/config/supabase");
const { clusterPosts } = require("./src/nlp/clusterer");

async function runClustering() {
    console.log("Fetching posts from Supabase...");

    const { data: posts, error } = await supabase
        .from("posts")
        .select("id, original_text, cluster_id")
        .eq("is_relevant", true)
        .eq("is_gibberish", false)
        .order("published_at", { ascending: false });

    if (error) {
        throw new Error(`Failed to fetch posts: ${error.message}`);
    }

    console.log(`Found ${posts.length} relevant posts.`);

    if (posts.length === 0) {
        console.log("No posts available for clustering.");
        return;
    }

    const clusteredPosts = clusterPosts(posts);

    console.log("Updating cluster IDs in Supabase...");

    for (const post of clusteredPosts) {
        const { error: updateError } = await supabase
            .from("posts")
            .update({
                cluster_id: post.cluster_id,
                updated_at: new Date().toISOString()
            })
            .eq("id", post.id);

        if (updateError) {
            console.error(
                `Failed to update post ${post.id}:`,
                updateError.message
            );
        }
    }

    const uniqueClusters = new Set(
        clusteredPosts.map(post => post.cluster_id)
    );

    console.log("Clustering completed.");
    console.log(`Posts processed: ${clusteredPosts.length}`);
    console.log(`Clusters created: ${uniqueClusters.size}`);
}

runClustering()
    .then(() => process.exit(0))
    .catch(error => {
        console.error("Clustering failed:", error.message);
        process.exit(1);
    });