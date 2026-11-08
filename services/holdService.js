const mongoose = require("mongoose");
const Hold = require("../models/Hold");
const Booking = require("../models/Booking");
const Court = require("../models/Court");
const Member = require("../models/Member");

const DEFAULT_HOLD_DURATION_MINUTES = 10;

/**
 * Creates a temporary hold on a court slot with double-booking prevention.
 * Uses MongoDB transactions when supported by the database engine.
 *
 * @param {Object} params
 * @param {string} params.memberId
 * @param {string} params.courtId
 * @param {string|Date} params.startTime
 * @param {string|Date} params.endTime
 * @param {number} [params.holdDurationMinutes=10]
 */
const createTemporaryHold = async ({
    memberId,
    courtId,
    startTime,
    endTime,
    holdDurationMinutes = DEFAULT_HOLD_DURATION_MINUTES
}) => {
    // 1. Input parameter validation
    if (!mongoose.Types.ObjectId.isValid(memberId)) {
        const error = new Error("Invalid Member ID");
        error.statusCode = 400;
        throw error;
    }

    if (!mongoose.Types.ObjectId.isValid(courtId)) {
        const error = new Error("Invalid Court ID");
        error.statusCode = 400;
        throw error;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        const error = new Error("Invalid booking start or end time format");
        error.statusCode = 400;
        throw error;
    }

    if (start >= end) {
        const error = new Error("Booking start time must be before end time");
        error.statusCode = 400;
        throw error;
    }

    // 2. Verify Member exists and is active
    const member = await Member.findById(memberId);
    if (!member) {
        const error = new Error("Member not found");
        error.statusCode = 404;
        throw error;
    }
    if (member.status !== "active") {
        const error = new Error("Member account is not active");
        error.statusCode = 403;
        throw error;
    }

    // 3. Verify Court exists and is available
    const court = await Court.findById(courtId);
    if (!court) {
        const error = new Error("Court not found");
        error.statusCode = 404;
        throw error;
    }
    if (court.status !== "available") {
        const error = new Error(`Court is currently ${court.status}`);
        error.statusCode = 400;
        throw error;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + holdDurationMinutes * 60 * 1000);

    // 4. Concurrency Protection & Conflict Checking
    // Check overlapping confirmed bookings: (start < existingEnd AND end > existingStart)
    const checkConflict = async (session = null) => {
        const bookingQuery = Booking.findOne({
            court: courtId,
            status: "confirmed",
            startTime: { $lt: end },
            endTime: { $gt: start }
        });
        if (session) bookingQuery.session(session);

        const existingBooking = await bookingQuery;
        if (existingBooking) {
            const error = new Error(
                "This court slot is already booked and unavailable."
            );
            error.statusCode = 409; // Conflict
            throw error;
        }

        // Check overlapping active holds that haven't expired yet
        const holdQuery = Hold.findOne({
            court: courtId,
            status: "active",
            expiresAt: { $gt: new Date() },
            startTime: { $lt: end },
            endTime: { $gt: start }
        });
        if (session) holdQuery.session(session);

        const existingHold = await holdQuery;
        if (existingHold) {
            const error = new Error(
                "This court slot is temporarily held by another member."
            );
            error.statusCode = 409; // Conflict
            throw error;
        }
    };

    // Attempt MongoDB Transaction for ACID isolation when connected to a cluster
    let session = null;
    let supportsTransactions = false;

    if (mongoose.connection && mongoose.connection.readyState === 1) {
        try {
            session = await mongoose.startSession();
            session.startTransaction();
            supportsTransactions = true;
        } catch {
            // Standalone MongoDB instances do not support replica transactions
            supportsTransactions = false;
            if (session) session.endSession();
            session = null;
        }
    }

    try {
        if (supportsTransactions && session) {
            await checkConflict(session);

            const [newHold] = await Hold.create(
                [
                    {
                        member: memberId,
                        court: courtId,
                        startTime: start,
                        endTime: end,
                        expiresAt: expiresAt,
                        status: "active"
                    }
                ],
                { session }
            );

            await session.commitTransaction();
            session.endSession();
            return newHold;
        } else {
            // Atomic fallback for standalone environments
            await checkConflict(null);

            const newHold = await Hold.create({
                member: memberId,
                court: courtId,
                startTime: start,
                endTime: end,
                expiresAt: expiresAt,
                status: "active"
            });

            return newHold;
        }
    } catch (error) {
        if (supportsTransactions && session) {
            await session.abortTransaction();
            session.endSession();
        }
        throw error;
    }
};

module.exports = {
    createTemporaryHold
};
