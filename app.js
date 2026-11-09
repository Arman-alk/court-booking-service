const express = require("express");
const cors = require("cors");
const path = require("path");

const courtRoutes = require("./routes/courtRoutes");
const holdRoutes = require("./routes/holdRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const reportRoutes = require("./routes/reportRoutes");
const webRoutes = require("./routes/webRoutes");

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

// Web Frontend Routes (EJS)
app.use("/", webRoutes);

// API Routes
app.use("/courts", courtRoutes);
app.use("/holds", holdRoutes);
app.use("/bookings", bookingRoutes);
app.use("/reports", reportRoutes);

// 404 Handler
app.use((req, res) => {
    if (req.accepts("html")) {
        return res.status(404).send("Page not found");
    }
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
