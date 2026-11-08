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

        console.log("Creating demo Venue...");
        const venue = await Venue.create({
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

        console.log("Creating demo Courts...");
        const tennisCourt = await Court.create({
            name: "Center Court (Tennis)",
            venue: venue._id,
            sportType: "tennis",
            status: "available"
        });

        const badmintonCourt = await Court.create({
            name: "Court B (Badminton)",
            venue: venue._id,
            sportType: "badminton",
            status: "available"
        });

        console.log("Creating demo Member...");
        const member = await Member.create({
            name: "Alex Johnson",
            email: "alex@example.com",
            password: "hashed_secure_password_123",
            role: "member",
            status: "active"
        });

        console.log("Creating demo Pricing...");
        await Pricing.create({
            venue: venue._id,
            sportType: "tennis",
            peakHourPrice: 65,
            offPeakPrice: 40,
            peakHours: {
                start: "17:00",
                end: "21:00"
            }
        });

        console.log("\n==============================================");
        console.log("Database Seeded Successfully!");
        console.log("==============================================");
        console.log(`Demo Member ID : ${member._id} (${member.email})`);
        console.log(`Demo Court ID  : ${tennisCourt._id} (${tennisCourt.name})`);
        console.log(`Demo Venue ID  : ${venue._id} (${venue.name})`);
        console.log("==============================================");
        console.log(`Test URL in browser or Postman:`);
        console.log(`http://localhost:5000/courts/${tennisCourt._id}/availability?date=2026-11-10`);
        console.log("==============================================\n");

        process.exit(0);
    } catch (error) {
        console.error("Seeding failed:", error.message);
        process.exit(1);
    }
};

seedDatabase();
