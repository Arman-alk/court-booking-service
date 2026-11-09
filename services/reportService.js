const Court = require("../models/Court");
const Venue = require("../models/Venue");
const Booking = require("../models/Booking");
const mongoose = require("mongoose");

/**
 * Calculates weekly court utilization for club staff.
 *
 * Formula:
 * Utilization % = (Total Confirmed Booking Hours / Total Available Operating Hours) * 100
 *
 * @param {string} courtId - MongoDB ObjectId of the court
 * @param {string|Date} weekStartInput - Start date of the 7-day week (YYYY-MM-DD)
 * @returns {Promise<Object>} Utilization report
 */
const getCourtUtilization = async (courtId, weekStartInput) => {
    if (!mongoose.Types.ObjectId.isValid(courtId)) {
        const error = new Error("Invalid Court ID format");
        error.statusCode = 400;
        throw error;
    }

    const court = await Court.findById(courtId).populate("venue");
    if (!court) {
        const error = new Error("Court not found");
        error.statusCode = 404;
        throw error;
    }

    const startDate = new Date(weekStartInput);
    if (isNaN(startDate.getTime())) {
        const error = new Error("Invalid week start date format. Expected YYYY-MM-DD");
        error.statusCode = 400;
        throw error;
    }

    // Standardize to UTC start of day
    const weekStart = new Date(Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
        0, 0, 0, 0
    ));

    // 7-day window
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Calculate daily operating hours
    const openTime = court.venue?.operatingHours?.open || "07:00";
    const closeTime = court.venue?.operatingHours?.close || "22:00";

    const [openH, openM] = openTime.split(":").map(Number);
    const [closeH, closeM] = closeTime.split(":").map(Number);

    const dailyOperatingHours = (closeH + closeM / 60) - (openH + openM / 60);
    const totalOperatingHours = dailyOperatingHours * 7;

    // Fetch confirmed bookings in the 7-day window
    const bookings = await Booking.find({
        court: court._id,
        status: "confirmed",
        startTime: { $lt: weekEnd },
        endTime: { $gt: weekStart }
    }).select("startTime endTime status");

    // Sum booked hours
    let bookedHours = 0;
    for (const b of bookings) {
        const bStart = Math.max(new Date(b.startTime).getTime(), weekStart.getTime());
        const bEnd = Math.min(new Date(b.endTime).getTime(), weekEnd.getTime());
        const durationHours = (bEnd - bStart) / (1000 * 60 * 60);
        if (durationHours > 0) {
            bookedHours += durationHours;
        }
    }

    const utilizationPercentage = totalOperatingHours > 0
        ? Number(((bookedHours / totalOperatingHours) * 100).toFixed(2))
        : 0;

    return {
        court: {
            id: court._id,
            name: court.name,
            sportType: court.sportType,
            venue: court.venue?.name || "Community Sports Complex"
        },
        week: {
            start: weekStart.toISOString().split("T")[0],
            end: new Date(weekEnd.getTime() - 1000).toISOString().split("T")[0]
        },
        operatingHoursPerDay: dailyOperatingHours,
        totalOperatingHours: Number(totalOperatingHours.toFixed(2)),
        bookedHours: Number(bookedHours.toFixed(2)),
        utilizationPercentage: utilizationPercentage
    };
};

module.exports = {
    getCourtUtilization
};
