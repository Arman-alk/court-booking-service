const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
    {
        member: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Member",
            required: [true, "Member reference is required"]
        },
        court: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Court",
            required: [true, "Court reference is required"]
        },
        holdId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Hold"
        },
        startTime: {
            type: Date,
            required: [true, "Start time is required"]
        },
        endTime: {
            type: Date,
            required: [true, "End time is required"]
        },
        status: {
            type: String,
            enum: ["confirmed", "cancelled", "completed"],
            default: "confirmed"
        },
        totalPrice: {
            type: Number,
            required: true,
            min: [0, "Total price cannot be negative"]
        },
        payment: {
            status: {
                type: String,
                enum: ["pending", "paid", "refunded", "failed"],
                default: "pending"
            },
            method: {
                type: String,
                default: "credit_card"
            },
            transactionId: {
                type: String
            },
            paidAt: {
                type: Date
            }
        }
    },
    {
        timestamps: true
    }
);

// Compound index to quickly find conflicting confirmed bookings
bookingSchema.index({ court: 1, status: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
