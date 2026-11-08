const mongoose = require("mongoose");

const venueSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Venue name is required"],
            trim: true
        },
        address: {
            street: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String },
            zipCode: { type: String }
        },
        operatingHours: {
            open: {
                type: String,
                required: [true, "Opening time is required (e.g. 06:00)"],
                default: "06:00"
            },
            close: {
                type: String,
                required: [true, "Closing time is required (e.g. 22:00)"],
                default: "22:00"
            }
        },
        slotDurationMinutes: {
            type: Number,
            default: 60, // Standard 60-minute booking slots
            min: 30
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Venue", venueSchema);
