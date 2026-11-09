const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
    {
        member: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Member",
            required: [true, "Member (User) reference is required"]
        },
        court: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Court",
            required: [true, "Court reference is required"]
        },
        holdId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Hold",
            unique: true,
            sparse: true
        },
        bookingDate: {
            type: Date,
            default: function () {
                return this.startTime;
            }
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
            default: 0,
            min: [0, "Total price cannot be negative"]
        },
        payment: {
            status: {
                type: String,
                enum: ["pending", "paid", "refunded", "failed"],
                default: "paid"
            },
            method: {
                type: String,
                default: "credit_card"
            },
            transactionId: {
                type: String
            },
            paidAt: {
                type: Date,
                default: Date.now
            }
        },
        cancellation: {
            cancelledAt: {
                type: Date
            },
            reason: {
                type: String,
                trim: true
            },
            refundAmount: {
                type: Number,
                default: 0,
                min: 0
            },
            refundStatus: {
                type: String,
                enum: ["none", "full", "partial"],
                default: "none"
            }
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Virtual aliases for user and court IDs
bookingSchema.virtual("userId").get(function () {
    return this.member;
});

bookingSchema.virtual("courtId").get(function () {
    return this.court;
});

// Compound index to quickly find conflicting confirmed bookings
bookingSchema.index({ court: 1, status: 1, startTime: 1, endTime: 1 });

// Index for fast lookup of member's bookings
bookingSchema.index({ member: 1, status: 1, startTime: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
