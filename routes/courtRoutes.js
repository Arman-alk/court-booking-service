const express = require("express");
const router = express.Router();
const { getAvailability } = require("../controllers/courtController");

// GET /courts/:id/availability
router.get("/:id/availability", getAvailability);

module.exports = router;
