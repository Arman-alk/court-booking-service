const mongoose = require("mongoose");
const { getCourtAvailability } = require("../services/availabilityService");

/**
 * Controller to fetch court availability by court ID and date
 * Route: GET /courts/:id/availability?date=YYYY-MM-DD
 */
const getAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.query;

        // 1. Validate court ID format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Court ID format"
            });
        }

        // 2. Validate date query parameter
        const targetDate = date || new Date().toISOString().split("T")[0];
        if (isNaN(new Date(targetDate).getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format. Expected format: YYYY-MM-DD"
            });
        }

        // 3. Query availability service
        const availability = await getCourtAvailability(id, targetDate);

        return res.status(200).json({
            success: true,
            data: availability
        });
    } catch (error) {
        if (error.message === "Court not found") {
            return res.status(404).json({
                success: false,
                message: "Court not found"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve court availability",
            error: error.message
        });
    }
};

module.exports = {
    getAvailability
};
