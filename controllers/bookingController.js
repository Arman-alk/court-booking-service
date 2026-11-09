const {
    cancelBooking,
    getMemberBookings,
    getBookingById
} = require("../services/bookingService");

/**
 * Controller to cancel a booking
 * Route: POST /bookings/:id/cancel
 */
const cancelBookingController = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body || {};

        const updatedBooking = await cancelBooking(id, { reason });

        const isFullRefund = updatedBooking.cancellation?.refundStatus === "full";
        const message = isFullRefund
            ? `Booking cancelled successfully. A full refund of $${updatedBooking.cancellation.refundAmount} has been issued.`
            : `Booking cancelled successfully. Per policy, cancellations within 24 hours receive no refund.`;

        return res.status(200).json({
            success: true,
            message,
            data: updatedBooking
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Failed to cancel booking"
        });
    }
};

/**
 * Controller to fetch bookings by member
 * Route: GET /bookings?memberId=XYZ&status=confirmed
 */
const getBookingsController = async (req, res) => {
    try {
        const { memberId, status } = req.query;

        if (!memberId) {
            return res.status(400).json({
                success: false,
                message: "Query parameter 'memberId' is required"
            });
        }

        const bookings = await getMemberBookings(memberId, status);

        return res.status(200).json({
            success: true,
            count: bookings.length,
            data: bookings
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Failed to retrieve bookings"
        });
    }
};

/**
 * Controller to fetch a single booking
 * Route: GET /bookings/:id
 */
const getBookingByIdController = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await getBookingById(id);

        return res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Failed to retrieve booking"
        });
    }
};

module.exports = {
    cancelBookingController,
    getBookingsController,
    getBookingByIdController
};
