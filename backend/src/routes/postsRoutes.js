const express = require("express");

const {
    getPosts,
    searchPosts,
    exportCSV,
    exportPDF
} = require("../controllers/postsController");

const router = express.Router();

router.get("/", getPosts);
router.get("/search", searchPosts);
router.get("/export/csv", exportCSV);
router.get("/export/pdf", exportPDF);

module.exports = router;