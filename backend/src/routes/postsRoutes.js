const express = require("express");
const { getPosts } = require("../controllers/postsController");

const router = express.Router();

router.get("/", getPosts);

module.exports = router;