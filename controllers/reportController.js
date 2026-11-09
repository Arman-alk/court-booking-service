const { getCourtUtilization } = require("../services/reportService");

/**
 * Controller to fetch weekly court utilization report
 * Route: GET /reports/utilization?courtId=XYZ&weekStart=YYYY-MM-DD
 */
const getUtilizationReport = async (req, res) => {
    try {
        const { courtId, weekStart } = req.query;

        if (!courtId) {
            return res.status(400).json({
                success: false,
                message: "Missing required query parameter: courtId"
            });
        }

        const report = await getCourtUtilization(
            courtId,
            weekStart || new Date().toISOString().split("T")[0]
        );

        return res.status(200).json({
            success: true,
            data: report
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            message: error.message || "Failed to calculate court utilization"
        });
    }
};

module.exports = {
    getUtilizationReport
};
