const { createTemporaryHold, createRecurringHolds } = require("../services/holdService");
const { confirmBookingHold } = require("../services/bookingService");

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

/**
 * Controller to create weekly recurring holds
 * Route: POST /holds/recurring
 */
const createRecurringHold = async (req, res) => {
    try {
        const { memberId, courtId, startTime, endTime, weeksCount, holdDurationMinutes } = req.body;

        if (!memberId || !courtId || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: memberId, courtId, startTime, endTime"
            });
        }

        const holds = await createRecurringHolds({
            memberId,
            courtId,
            startTime,
            endTime,
            weeksCount: weeksCount ? Number(weeksCount) : 4,
            holdDurationMinutes: holdDurationMinutes ? Number(holdDurationMinutes) : undefined
        });

        return res.status(201).json({
            success: true,
            message: `Successfully reserved holds for all ${holds.length} recurring weekly occurrences.`,
            count: holds.length,
            data: holds
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Failed to create recurring holds"
        });
    }
};

/**
 * Controller to confirm a temporary hold into a confirmed booking
 * Route: POST /holds/:id/confirm
 */
const confirmHold = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentMethod, totalPrice, transactionId } = req.body || {};

        const booking = await confirmBookingHold(id, {
            paymentMethod,
            totalPrice,
            transactionId
        });

        return res.status(201).json({
            success: true,
            message: "Booking confirmed successfully",
            data: booking
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Failed to confirm booking hold"
        });
    }
};

module.exports = {
    createHold,
    createRecurringHold,
    confirmHold
};
