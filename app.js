const express = require("express");
const cors = require("cors");
const path = require("path");

const courtRoutes = require("./routes/courtRoutes");
const holdRoutes = require("./routes/holdRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// EJS configuration
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Home route
app.get("/", (req, res) => {
    res.send("Court Booking System API is running!");
});

// API Routes
app.use("/courts", courtRoutes);
app.use("/holds", holdRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Endpoint not found"
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("Unhandled Application Error:", err);
    res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
    });
});

// Export app
module.exports = app;
