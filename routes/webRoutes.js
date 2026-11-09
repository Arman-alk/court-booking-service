const express = require("express");
const router = express.Router();
const {
    renderCourtsList,
    renderCourtDetails,
    renderMyBookings
} = require("../controllers/webController");

// Home page - list all courts with sport filter
router.get("/", renderCourtsList);

// Court detail and booking view
router.get("/courts/:id/view", renderCourtDetails);

// User bookings dashboard
router.get("/my-bookings", renderMyBookings);

module.exports = router;
