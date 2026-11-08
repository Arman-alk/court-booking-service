const mongoose = require("mongoose");

const courtSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Court name is required"],
            trim: true
        },
        venue: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Venue",
            required: [true, "Court must belong to a venue"]
        },
        sportType: {
            type: String,
            required: [true, "Sport type is required"],
            enum: ["tennis", "badminton", "squash", "basketball", "pickleball"],
            lowercase: true,
            trim: true
        },
        status: {
            type: String,
            enum: ["available", "maintenance", "inactive"],
            default: "available"
        }
    },
    {
        timestamps: true
    }
);

// Index court by venue and sport type for quick availability searches
courtSchema.index({ venue: 1, sportType: 1 });

module.exports = mongoose.model("Court", courtSchema);
