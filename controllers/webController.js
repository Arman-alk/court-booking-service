const Court = require("../models/Court");
const Member = require("../models/Member");
const { getCourtAvailability } = require("../services/availabilityService");
const { getMemberBookings } = require("../services/bookingService");

/**
 * Renders home page with list of courts
 */
const renderCourtsList = async (req, res) => {
    try {
        const { sport } = req.query;
        const query = { status: "available" };
        if (sport) {
            query.sportType = sport.toLowerCase();
        }

        const courts = await Court.find(query).populate("venue");

        return res.render("index", {
            courts,
            selectedSport: sport || ""
        });
    } catch (error) {
        return res.status(500).send("Error rendering courts: " + error.message);
    }
};

/**
 * Renders court detail and availability page
 */
const renderCourtDetails = async (req, res) => {
    try {
        const { id } = req.params;
        // Default to tomorrow so slots are always in the future when first opened
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const selectedDate = req.query.date || tomorrow.toISOString().split("T")[0];

        const court = await Court.findById(id).populate("venue");
        if (!court) {
            return res.status(404).send("Court not found");
        }

        const availability = await getCourtAvailability(id, selectedDate);

        // Find a demo member for convenience if available
        const demoMember = await Member.findOne({ status: "active" });

        return res.render("court-details", {
            court,
            availability,
            selectedDate,
            demoMemberId: demoMember ? demoMember._id.toString() : ""
        });
    } catch (error) {
        return res.status(500).send("Error rendering court availability: " + error.message);
    }
};

/**
 * Renders member's bookings dashboard
 */
const renderMyBookings = async (req, res) => {
    try {
        const { memberId } = req.query;
        let bookings = [];

        if (memberId) {
            bookings = await getMemberBookings(memberId);
        }

        return res.render("bookings", {
            memberId: memberId || "",
            bookings
        });
    } catch (error) {
        return res.status(500).send("Error rendering bookings: " + error.message);
    }
};

module.exports = {
    renderCourtsList,
    renderCourtDetails,
    renderMyBookings
};
