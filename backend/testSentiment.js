const { analyzeSentiment } = require("./src/nlp/sentimentAnalyzer");

const tests = [
    "My passport application was approved quickly!",
    "My passport application was rejected and I am very frustrated.",
    "I submitted my passport application today."
];

tests.forEach(text => {
    console.log(text);
    console.log("Sentiment:", analyzeSentiment(text));
    console.log();
});