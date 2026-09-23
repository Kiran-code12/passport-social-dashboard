const express = require("express");
const cors = require("cors");
require("dotenv").config();

const supabase = require("./src/config/supabase");
const postsRoutes = require("./src/routes/postsRoutes");
const translationRoutes = require("./src/routes/translationRoutes");
const { startScraperScheduler } = require("./src/services/scraperScheduler");
const { warmUpModels } = require("./src/nlp/translator");

const app = express();

// ========================================
// MIDDLEWARE
// ========================================

app.use(cors());
app.use(express.json());


// ========================================
// HEALTH CHECK
// ========================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Passport Dashboard API is running"
    });
});


// ========================================
// DATABASE CONNECTION TEST
// ========================================

app.get("/api/test-db", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("posts")
            .select("id")
            .limit(1);

        if (error) {
            return res.status(500).json({
                success: false,
                message: "Database connection failed",
                error: error.message
            });
        }

        res.json({
            success: true,
            message: "Supabase connection is working",
            data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: error.message
        });
    }
});


// ========================================
// POSTS API
// ========================================

app.use("/api/posts", postsRoutes);


// ========================================
// TRANSLATION API
// ========================================

app.use("/api/translate", translationRoutes);


// ========================================
// 404 HANDLER
// ========================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found"
    });
});


// ========================================
// GLOBAL ERROR HANDLER
// ========================================

app.use((err, req, res, next) => {
    console.error("Server Error:", err);

    /*
     * Translation validation / unsupported-language
     * errors should be reported as a client error,
     * not as a generic 500 server error.
     */
    const message = err?.message || "Internal server error";

    const isClientError =
        message.includes("Cannot translate") ||
        message.includes("Unsupported target language") ||
        message.includes("Source language") ||
        message.includes("Text is required");

    if (isClientError) {
        return res.status(400).json({
            success: false,
            message
        });
    }

    /*
     * Unexpected errors remain genuine 500 errors.
     */
    return res.status(500).json({
        success: false,
        message: "Internal server error"
    });
});


// ========================================
// START SERVER
// ========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

startScraperScheduler();

  
  warmUpModels().catch((error) => {
    console.error("[Translator] Warm-up failed to start:", error.message);
  });
});