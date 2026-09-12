const Sentiment = require("sentiment");

const sentiment = new Sentiment();

function analyzeSentiment(text) {
    const result = sentiment.analyze(text || "");

    if (result.score > 1) return "Positive";
    if (result.score < -1) return "Negative";

    return "Neutral";
}

module.exports = {
    analyzeSentiment
};