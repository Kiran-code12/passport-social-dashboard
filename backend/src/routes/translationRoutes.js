const express = require("express");

const {
    translatePost,
    getTranslationLanguages
} = require("../controllers/translationController");

const router = express.Router();

// Get supported translation languages
router.get("/languages", getTranslationLanguages);

// Translate text
router.post("/", translatePost);

module.exports = router;