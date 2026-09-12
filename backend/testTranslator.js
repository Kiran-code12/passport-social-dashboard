const { translateText } = require("./src/nlp/translator");

(async () => {
    const text =
        "The passport office announced new online renewal guidelines.";

    // English → Hindi
    console.log(
        await translateText(
            text,
            "eng",
            "hindi"
        )
    );

    // English → Vietnamese
    console.log(
        await translateText(
            text,
            "eng",
            "vietnamese"
        )
    );

    // English → Spanish
    console.log(
        await translateText(
            text,
            "eng",
            "spanish"
        )
    );

    // English → French
    console.log(
        await translateText(
            text,
            "eng",
            "french"
        )
    );

    // English → German
    console.log(
        await translateText(
            text,
            "eng",
            "german"
        )
    );

    // Should throw a clear error, not guess:
    try {
        await translateText(
            "Some text",
            null,
            "hindi"
        );
    } catch (err) {
        console.log(
            "Expected error:",
            err.message
        );
    }
})();