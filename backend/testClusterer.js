const { clusterPosts } = require("./src/nlp/clusterer");

const posts = [
    {
        original_text: "How to renew passport online"
    },
    {
        original_text: "Passport renewal online process"
    },
    {
        original_text: "Steps for renewing passport online"
    },
    {
        original_text: "Passport appointment booking available tomorrow"
    }
];

const result = clusterPosts(posts);

result.forEach((post, index) => {
    console.log(index + 1, post.cluster_id, post.original_text);
});