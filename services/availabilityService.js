const Court = require("../models/Court");
const Venue = require("../models/Venue");
const Booking = require("../models/Booking");
const Hold = require("../models/Hold");
const Pricing = require("../models/Pricing");

/**
 * Parses operating hour string "HH:MM" into integer hours & minutes
 */
const parseTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return { hours, minutes };
};

/**
 * Checks whether a given slot overlaps with peak hours
 */
const isPeakHour = (slotStart, peakHours) => {
    if (!peakHours || !peakHours.start || !peakHours.end) return false;
    const startHour = slotStart.getUTCHours();
    const peakStart = parseInt(peakHours.start.split(":")[0], 10);
    const peakEnd = parseInt(peakHours.end.split(":")[0], 10);
    return startHour >= peakStart && startHour < peakEnd;
};

/**
 * Retrieves availability for a specific court on a given date (UTC)
 * @param {string} courtId - MongoDB ObjectId of the court
 * @param {string|Date} dateInput - YYYY-MM-DD string or Date object
 */
const getCourtAvailability = async (courtId, dateInput) => {
    // 1. Verify court exists
    const court = await Court.findById(courtId).populate("venue");
    if (!court) {
        throw new Error("Court not found");
    }

    if (court.status !== "available") {
        return {
            court: { id: court._id, name: court.name, status: court.status },
            date: dateInput,
            message: `Court is currently ${court.status}`,
            slots: []
        };
    }

    // 2. Determine target day boundaries in UTC
    const targetDate = new Date(dateInput);
    if (isNaN(targetDate.getTime())) {
        throw new Error("Invalid date format. Use YYYY-MM-DD");
    }

    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth();
    const day = targetDate.getUTCDate();

    // Default operating hours if venue hours are not set
    const openTime = court.venue?.operatingHours?.open || "06:00";
    const closeTime = court.venue?.operatingHours?.close || "22:00";
    const slotDurationMinutes = court.venue?.slotDurationMinutes || 60;

    const { hours: openHour, minutes: openMin } = parseTime(openTime);
    const { hours: closeHour, minutes: closeMin } = parseTime(closeTime);

    const dayStart = new Date(Date.UTC(year, month, day, openHour, openMin, 0));
    const dayEnd = new Date(Date.UTC(year, month, day, closeHour, closeMin, 0));

    // 3. Find pricing rules for this court/sport/venue
    const pricing = await Pricing.findOne({
        $or: [
            { court: court._id },
            { venue: court.venue?._id },
            { sportType: court.sportType }
        ]
    });

    const now = new Date();

    // 4. Fetch confirmed bookings for this court and day
    const confirmedBookings = await Booking.find({
        court: court._id,
        status: "confirmed",
        startTime: { $lt: dayEnd },
        endTime: { $gt: dayStart }
    }).select("startTime endTime status");

    // 5. Fetch active, unexpired holds for this court and day
    // Notice: We strictly filter expiresAt > now so expired holds NEVER block availability
    const activeHolds = await Hold.find({
        court: court._id,
        status: "active",
        expiresAt: { $gt: now },
        startTime: { $lt: dayEnd },
        endTime: { $gt: dayStart }
    }).select("startTime endTime expiresAt status");

    // 6. Generate time slots and calculate availability
    const slots = [];
    let currentSlotStart = new Date(dayStart);

    while (currentSlotStart < dayEnd) {
        const currentSlotEnd = new Date(
            currentSlotStart.getTime() + slotDurationMinutes * 60 * 1000
        );

        if (currentSlotEnd > dayEnd) break;

        // Check if overlaps with any confirmed booking
        const isBooked = confirmedBookings.some((booking) => {
            return (
                currentSlotStart < new Date(booking.endTime) &&
                currentSlotEnd > new Date(booking.startTime)
            );
        });

        // Check if overlaps with any active, unexpired hold
        const activeHold = activeHolds.find((hold) => {
            return (
                currentSlotStart < new Date(hold.endTime) &&
                currentSlotEnd > new Date(hold.startTime)
            );
        });

        // Determine slot pricing
        let price = 50; // default base price
        if (pricing) {
            const isPeak = isPeakHour(currentSlotStart, pricing.peakHours);
            price = isPeak ? pricing.peakHourPrice : pricing.offPeakPrice;
        }

        let slotStatus = "available";
        if (isBooked) {
            slotStatus = "booked";
        } else if (activeHold) {
            slotStatus = "held";
        }

        slots.push({
            startTime: currentSlotStart.toISOString(),
            endTime: currentSlotEnd.toISOString(),
            status: slotStatus,
            price: price,
            holdExpiresAt: activeHold ? activeHold.expiresAt.toISOString() : null
        });

        // Move to next slot
        currentSlotStart = new Date(currentSlotEnd);
    }

    return {
        court: {
            id: court._id,
            name: court.name,
            sportType: court.sportType,
            venue: court.venue?.name
        },
        date: dateInput,
        operatingHours: { open: openTime, close: closeTime },
        totalSlots: slots.length,
        availableSlots: slots.filter((s) => s.status === "available").length,
        slots
    };
};

module.exports = {
    getCourtAvailability
};
