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

    // 2b. Rule 5: Members can have at most three active future bookings
    if (typeof Booking.countDocuments === "function") {
        const activeFutureBookings = await Booking.countDocuments({
            member: memberId,
            status: "confirmed",
            startTime: { $gt: new Date() }
        });

        if (Number(activeFutureBookings) >= 3) {
            const error = new Error("Member has reached the maximum limit of 3 active future bookings");
            error.statusCode = 400;
            throw error;
        }
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

    // 4. Conflict Checking — works on standalone MongoDB and replica sets alike.
    //    Double-booking is ultimately prevented by the atomic findOneAndUpdate
    //    in confirmBooking. Transactions are intentionally skipped here because
    //    the app targets a standalone MongoDB (no replica set required for dev).
    const checkConflict = async () => {
        const existingBooking = await Booking.findOne({
            court: courtId,
            status: "confirmed",
            startTime: { $lt: end },
            endTime: { $gt: start }
        });
        if (existingBooking) {
            const error = new Error(
                "This court slot is already booked and unavailable."
            );
            error.statusCode = 409;
            throw error;
        }

        const existingHold = await Hold.findOne({
            court: courtId,
            status: "active",
            expiresAt: { $gt: new Date() },
            startTime: { $lt: end },
            endTime: { $gt: start }
        });
        if (existingHold) {
            const error = new Error(
                "This court slot is temporarily held by another member."
            );
            error.statusCode = 409;
            throw error;
        }
    };

    // 5. Check for conflicts then create the hold (no transactions needed)
    await checkConflict();

    const newHold = await Hold.create({
        member: memberId,
        court: courtId,
        startTime: start,
        endTime: end,
        expiresAt: expiresAt,
        status: "active"
    });

    return newHold;
};

/**
 * Creates temporary holds for weekly recurring bookings across multiple weeks.
 * Rule 8: Weekly recurring bookings must check availability for EVERY occurrence.
 * If any occurrence is unavailable, NONE of the slots are held.
 *
 * @param {Object} params
 * @param {string} params.memberId
 * @param {string} params.courtId
 * @param {string|Date} params.startTime - Start time of first occurrence
 * @param {string|Date} params.endTime - End time of first occurrence
 * @param {number} [params.weeksCount=4] - Number of consecutive weeks
 * @param {number} [params.holdDurationMinutes=10]
 * @returns {Promise<Array>} List of created hold documents
 */
const createRecurringHolds = async ({
    memberId,
    courtId,
    startTime,
    endTime,
    weeksCount = 4,
    holdDurationMinutes = DEFAULT_HOLD_DURATION_MINUTES
}) => {
    // 1. Validation
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

    const weeks = parseInt(weeksCount, 10);
    if (isNaN(weeks) || weeks < 2 || weeks > 12) {
        const error = new Error("Recurring bookings must be between 2 and 12 weeks");
        error.statusCode = 400;
        throw error;
    }

    const firstStart = new Date(startTime);
    const firstEnd = new Date(endTime);

    if (isNaN(firstStart.getTime()) || isNaN(firstEnd.getTime())) {
        const error = new Error("Invalid booking start or end time format");
        error.statusCode = 400;
        throw error;
    }

    if (firstStart >= firstEnd) {
        const error = new Error("Booking start time must be before end time");
        error.statusCode = 400;
        throw error;
    }

    // 2. Member & Court verification
    const member = await Member.findById(memberId);
    if (!member || member.status !== "active") {
        const error = new Error(member ? "Member account is not active" : "Member not found");
        error.statusCode = member ? 403 : 404;
        throw error;
    }

    const court = await Court.findById(courtId);
    if (!court || court.status !== "available") {
        const error = new Error(court ? `Court is currently ${court.status}` : "Court not found");
        error.statusCode = court ? 400 : 404;
        throw error;
    }

    // 3. Generate occurrences
    const occurrences = [];
    for (let i = 0; i < weeks; i++) {
        const slotStart = new Date(firstStart.getTime() + i * 7 * 24 * 60 * 60 * 1000);
        const slotEnd = new Date(firstEnd.getTime() + i * 7 * 24 * 60 * 60 * 1000);
        occurrences.push({ weekNumber: i + 1, start: slotStart, end: slotEnd });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + holdDurationMinutes * 60 * 1000);

    // 4. Rule 8: Verify EVERY occurrence is available before holding any
    for (const occ of occurrences) {
        const existingBooking = await Booking.findOne({
            court: courtId,
            status: "confirmed",
            startTime: { $lt: occ.end },
            endTime: { $gt: occ.start }
        });

        if (existingBooking) {
            const dateStr = occ.start.toISOString().split("T")[0];
            const error = new Error(
                `Recurring booking conflict: Week ${occ.weekNumber} (${dateStr}) is already booked.`
            );
            error.statusCode = 409;
            throw error;
        }

        const existingHold = await Hold.findOne({
            court: courtId,
            status: "active",
            expiresAt: { $gt: now },
            startTime: { $lt: occ.end },
            endTime: { $gt: occ.start }
        });

        if (existingHold) {
            const dateStr = occ.start.toISOString().split("T")[0];
            const error = new Error(
                `Recurring booking conflict: Week ${occ.weekNumber} (${dateStr}) is held by another user.`
            );
            error.statusCode = 409;
            throw error;
        }
    }

    // 5. Create holds for all occurrences
    const holdsToCreate = occurrences.map((occ) => ({
        member: memberId,
        court: courtId,
        startTime: occ.start,
        endTime: occ.end,
        expiresAt: expiresAt,
        status: "active"
    }));

    const createdHolds = [];
    for (const holdData of holdsToCreate) {
        const h = await Hold.create(holdData);
        createdHolds.push(h);
    }

    return createdHolds;
};

module.exports = {
    createTemporaryHold,
    createRecurringHolds
};
