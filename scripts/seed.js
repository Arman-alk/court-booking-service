require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Member = require("../models/Member");
const Venue = require("../models/Venue");
const Court = require("../models/Court");
const Pricing = require("../models/Pricing");
const Hold = require("../models/Hold");
const Booking = require("../models/Booking");

const seedDatabase = async () => {
    try {
        await connectDB();
        console.log("Clearing existing data...");

        await Promise.all([
            Member.deleteMany({}),
            Venue.deleteMany({}),
            Court.deleteMany({}),
            Pricing.deleteMany({}),
            Hold.deleteMany({}),
            Booking.deleteMany({})
        ]);

        console.log("Creating demo Venues...");
        const venue1 = await Venue.create({
            name: "Grand Slam Sports Arena",
            address: {
                street: "123 Stadium Way",
                city: "Metropolis",
                state: "NY",
                zipCode: "10001"
            },
            operatingHours: {
                open: "07:00",
                close: "22:00"
            },
            slotDurationMinutes: 60
        });

        const venue2 = await Venue.create({
            name: "Metro Racquet & Fitness Club",
            address: {
                street: "450 Fitness Ave",
                city: "Metropolis",
                state: "NY",
                zipCode: "10002"
            },
            operatingHours: {
                open: "06:00",
                close: "21:00"
            },
            slotDurationMinutes: 60
        });

        console.log("Creating demo Courts...");
        const tennisCourt1 = await Court.create({
            name: "Center Court 1 (Tennis)",
            venue: venue1._id,
            sportType: "tennis",
            status: "available"
        });

        const badmintonCourt1 = await Court.create({
            name: "Badminton Court A",
            venue: venue1._id,
            sportType: "badminton",
            status: "available"
        });

        const squashCourt1 = await Court.create({
            name: "Squash Court 1",
            venue: venue2._id,
            sportType: "squash",
            status: "available"
        });

        const pickleballCourt1 = await Court.create({
            name: "Pickleball Court 1",
            venue: venue2._id,
            sportType: "pickleball",
            status: "available"
        });

        const basketballCourt1 = await Court.create({
            name: "Indoor Basketball Court",
            venue: venue1._id,
            sportType: "basketball",
            status: "available"
        });

        console.log("Creating demo Members...");
        const member = await Member.create({
            name: "Alex Johnson",
            email: "alex@example.com",
            password: "hashed_secure_password_123",
            role: "member",
            status: "active"
        });

        const staffMember = await Member.create({
            name: "Sarah Staff",
            email: "sarah@example.com",
            password: "hashed_secure_password_123",
            role: "staff",
            status: "active"
        });

        console.log("Creating demo Pricing...");
        await Pricing.create([
            {
                venue: venue1._id,
                sportType: "tennis",
                peakHourPrice: 65,
                offPeakPrice: 40,
                peakHours: { start: "17:00", end: "21:00" }
            },
            {
                venue: venue1._id,
                sportType: "badminton",
                peakHourPrice: 35,
                offPeakPrice: 25,
                peakHours: { start: "17:00", end: "21:00" }
            },
            {
                venue: venue2._id,
                sportType: "squash",
                peakHourPrice: 45,
                offPeakPrice: 30,
                peakHours: { start: "17:00", end: "21:00" }
            },
            {
                venue: venue2._id,
                sportType: "pickleball",
                peakHourPrice: 40,
                offPeakPrice: 25,
                peakHours: { start: "17:00", end: "21:00" }
            }
        ]);

        console.log("Creating demo Bookings...");
        // Confirmed booking for Alex tomorrow
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        tomorrow.setUTCHours(10, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrow.getTime() + 60 * 60 * 1000);

        await Booking.create({
            member: member._id,
            court: tennisCourt1._id,
            bookingDate: tomorrow,
            startTime: tomorrow,
            endTime: tomorrowEnd,
            status: "confirmed",
            totalPrice: 40,
            payment: {
                status: "paid",
                method: "credit_card",
                transactionId: "TXN-INIT-101",
                paidAt: new Date()
            }
        });

        console.log("\n==============================================");
        console.log("Database Seeded Successfully!");
        console.log("==============================================");
        console.log(`Demo Member ID : ${member._id} (${member.email})`);
        console.log(`Demo Court ID  : ${tennisCourt1._id} (${tennisCourt1.name})`);
        console.log(`Demo Venue ID  : ${venue1._id} (${venue1.name})`);
        console.log("==============================================");
        console.log(`Web App URL    : http://localhost:5000/`);
        console.log(`My Bookings    : http://localhost:5000/my-bookings?memberId=${member._id}`);
        console.log(`Availability   : http://localhost:5000/courts/${tennisCourt1._id}/availability?date=2026-11-10`);
        console.log("==============================================\n");

        process.exit(0);
    } catch (error) {
        console.error("Seeding failed:", error.message);
        process.exit(1);
    }
};

seedDatabase();
