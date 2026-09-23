const express = require("express");

const {
    translatePost,
    getTranslationLanguages
} = require("../controllers/translationController");

const router = express.Router();

router.get("/languages", getTranslationLanguages);

router.post("/", translatePost);

module.exports = router;