const express = require("express");
const router = express.Router();
const {
    createHold,
    createRecurringHold,
    confirmHold
} = require("../controllers/holdController");

// POST /holds - Create a single temporary hold
router.post("/", createHold);

// POST /holds/recurring - Create weekly recurring holds (Rule 8)
router.post("/recurring", createRecurringHold);

// POST /holds/:id/confirm - Confirm a hold into a permanent booking
router.post("/:id/confirm", confirmHold);

module.exports = router;
