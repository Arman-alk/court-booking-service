const express = require("express");
const router = express.Router();
const { getUtilizationReport } = require("../controllers/reportController");

// GET /reports/utilization?courtId=XYZ&weekStart=YYYY-MM-DD
router.get("/utilization", getUtilizationReport);

module.exports = router;
