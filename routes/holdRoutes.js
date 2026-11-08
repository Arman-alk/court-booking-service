const express = require("express");
const router = express.Router();
const { createHold } = require("../controllers/holdController");

// POST /holds
router.post("/", createHold);

module.exports = router;
