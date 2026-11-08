const { createTemporaryHold } = require("../services/holdService");

/**
 * Controller to create a temporary court hold
 * Route: POST /holds
 */
const createHold = async (req, res) => {
    try {
        const { memberId, courtId, startTime, endTime, holdDurationMinutes } = req.body;

        if (!memberId || !courtId || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: memberId, courtId, startTime, endTime"
            });
        }

        const hold = await createTemporaryHold({
            memberId,
            courtId,
            startTime,
            endTime,
            holdDurationMinutes: holdDurationMinutes ? Number(holdDurationMinutes) : undefined
        });

        return res.status(201).json({
            success: true,
            message: "Temporary hold created successfully. Slot reserved for confirmation.",
            data: hold
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Failed to create temporary hold"
        });
    }
};

module.exports = {
    createHold
};
