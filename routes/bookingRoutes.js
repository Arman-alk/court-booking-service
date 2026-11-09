const express = require("express");
const router = express.Router();
const {
    cancelBookingController,
    getBookingsController,
    getBookingByIdController
} = require("../controllers/bookingController");

// POST /bookings/:id/cancel - Cancel a booking and process refund
router.post("/:id/cancel", cancelBookingController);

// GET /bookings - Get bookings (filtered by memberId and status)
router.get("/", getBookingsController);

// GET /bookings/:id - Get a single booking by ID
router.get("/:id", getBookingByIdController);

module.exports = router;
