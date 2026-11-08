const mongoose = require("mongoose");

const holdSchema = new mongoose.Schema(
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
        startTime: {
            type: Date,
            required: [true, "Start time is required"]
        },
        endTime: {
            type: Date,
            required: [true, "End time is required"]
        },
        expiresAt: {
            type: Date,
            required: [true, "Expiration timestamp is required"]
        },
        status: {
            type: String,
            enum: ["active", "expired", "converted", "cancelled"],
            default: "active"
        }
    },
    {
        timestamps: true
    }
);

// TTL index: Automatic background cleanup when expiresAt is reached
holdSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for fast conflict checking on active holds
holdSchema.index({ court: 1, status: 1, startTime: 1, endTime: 1 });

/**
 * Helper method to verify if this hold is currently expired
 */
holdSchema.methods.isExpired = function () {
    return new Date() > this.expiresAt;
};

module.exports = mongoose.model("Hold", holdSchema);
