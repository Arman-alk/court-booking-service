const mongoose = require("mongoose");

const pricingSchema = new mongoose.Schema(
    {
        venue: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Venue"
        },
        court: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Court"
        },
        sportType: {
            type: String,
            lowercase: true
        },
        peakHourPrice: {
            type: Number,
            required: [true, "Peak hour price is required"],
            min: [0, "Price cannot be negative"]
        },
        offPeakPrice: {
            type: Number,
            required: [true, "Off-peak price is required"],
            min: [0, "Price cannot be negative"]
        },
        peakHours: {
            start: {
                type: String,
                default: "17:00" // 5:00 PM
            },
            end: {
                type: String,
                default: "21:00" // 9:00 PM
            }
        },
        currency: {
            type: String,
            default: "USD"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Pricing", pricingSchema);
