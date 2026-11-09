const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Hold = require("../models/Hold");
const Court = require("../models/Court");
const Member = require("../models/Member");
const { cancelBookingController, getBookingsController } = require("../controllers/bookingController");
const { cancelBooking } = require("../services/bookingService");
const { createTemporaryHold } = require("../services/holdService");
const { getCourtAvailability } = require("../services/availabilityService");

// Mock Mongoose models
jest.mock("../models/Booking");
jest.mock("../models/Hold");
jest.mock("../models/Court");
jest.mock("../models/Member");
jest.mock("../models/Pricing");

// Helper to mock Express req and res
const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe("Day 4: Court Booking System - Cancellation, Refunds & Booking Limits", () => {
    const validBookingId = new mongoose.Types.ObjectId().toString();
    const validMemberId = new mongoose.Types.ObjectId().toString();
    const validCourtId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("1. Validation & Error Handling", () => {
        test("Test 1: Invalid booking ID returns 400 Bad Request", async () => {
            const req = { params: { id: "invalid-id" }, body: {} };
            const res = mockResponse();

            await cancelBookingController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/invalid booking ID/i)
                })
            );
        });

        test("Test 2: Non-existent booking returns 404 Not Found", async () => {
            Booking.findById.mockResolvedValue(null);

            const req = { params: { id: validBookingId }, body: {} };
            const res = mockResponse();

            await cancelBookingController(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/booking not found/i)
                })
            );
        });

        test("Test 3: Already cancelled booking cannot be cancelled again (400 Bad Request)", async () => {
            const mockCancelledBooking = {
                _id: validBookingId,
                status: "cancelled",
                startTime: new Date(Date.now() + 48 * 60 * 60 * 1000)
            };

            Booking.findById.mockResolvedValue(mockCancelledBooking);

            const req = { params: { id: validBookingId }, body: {} };
            const res = mockResponse();

            await cancelBookingController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/already cancelled/i)
                })
            );
        });

        test("Test 4: Past or ongoing booking cannot be cancelled (400 Bad Request)", async () => {
            const pastStartTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
            const mockPastBooking = {
                _id: validBookingId,
                status: "confirmed",
                startTime: pastStartTime
            };

            Booking.findById.mockResolvedValue(mockPastBooking);

            const req = { params: { id: validBookingId }, body: {} };
            const res = mockResponse();

            await cancelBookingController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/cannot cancel a past or ongoing booking/i)
                })
            );
        });
    });

    describe("2. Refund Policy Rules", () => {
        test("Test 5: Cancellation >= 24 hours in advance issues a 100% full refund", async () => {
            const futureStartTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours in future
            const mockBooking = {
                _id: validBookingId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStartTime,
                endTime: new Date(futureStartTime.getTime() + 60 * 60 * 1000),
                status: "confirmed",
                totalPrice: 80,
                payment: {
                    status: "paid",
                    method: "credit_card"
                },
                save: jest.fn().mockResolvedValue(true)
            };

            Booking.findById.mockResolvedValue(mockBooking);

            const req = {
                params: { id: validBookingId },
                body: { reason: "Change of schedule" }
            };
            const res = mockResponse();

            await cancelBookingController(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockBooking.status).toBe("cancelled");
            expect(mockBooking.cancellation.refundStatus).toBe("full");
            expect(mockBooking.cancellation.refundAmount).toBe(80);
            expect(mockBooking.payment.status).toBe("refunded");
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringMatching(/full refund/i)
                })
            );
        });

        test("Test 6: Cancellation < 24 hours in advance issues no refund (0%)", async () => {
            const nearFutureStartTime = new Date(Date.now() + 5 * 60 * 60 * 1000); // 5 hours in future (< 24h)
            const mockBooking = {
                _id: validBookingId,
                member: validMemberId,
                court: validCourtId,
                startTime: nearFutureStartTime,
                endTime: new Date(nearFutureStartTime.getTime() + 60 * 60 * 1000),
                status: "confirmed",
                totalPrice: 60,
                payment: {
                    status: "paid",
                    method: "credit_card"
                },
                save: jest.fn().mockResolvedValue(true)
            };

            Booking.findById.mockResolvedValue(mockBooking);

            const req = {
                params: { id: validBookingId },
                body: { reason: "Sudden conflict" }
            };
            const res = mockResponse();

            await cancelBookingController(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(mockBooking.status).toBe("cancelled");
            expect(mockBooking.cancellation.refundStatus).toBe("none");
            expect(mockBooking.cancellation.refundAmount).toBe(0);
            expect(mockBooking.payment.status).toBe("paid"); // Not refunded
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringMatching(/no refund/i)
                })
            );
        });
    });

    describe("3. Rule 5: Member Active Booking Limit (Max 3)", () => {
        test("Test 7: Member with 3 active future bookings cannot create a 4th hold", async () => {
            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });

            // Mock 3 active future bookings
            Booking.countDocuments.mockResolvedValue(3);

            const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
            const end = new Date(Date.now() + 3 * 60 * 60 * 1000);

            await expect(
                createTemporaryHold({
                    memberId: validMemberId,
                    courtId: validCourtId,
                    startTime: start.toISOString(),
                    endTime: end.toISOString()
                })
            ).rejects.toMatchObject({
                statusCode: 400,
                message: expect.stringMatching(/maximum limit of 3 active future bookings/i)
            });
        });
    });

    describe("4. Court Slot Availability Release", () => {
        test("Test 8: Cancelled booking does not block availability (slot returns to available)", async () => {
            const mockVenue = {
                operatingHours: { open: "08:00", close: "10:00" },
                slotDurationMinutes: 60
            };
            const mockCourt = {
                _id: validCourtId,
                name: "Tennis Court 1",
                sportType: "tennis",
                status: "available",
                venue: mockVenue
            };

            Court.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockCourt)
            });

            // Booking.find only queries { status: "confirmed" }
            // Cancelled bookings with status: "cancelled" are excluded!
            Booking.find.mockReturnValue({
                select: jest.fn().mockResolvedValue([])
            });
            Hold.find.mockReturnValue({
                select: jest.fn().mockResolvedValue([])
            });

            const availability = await getCourtAvailability(validCourtId, "2026-11-10");

            expect(availability.totalSlots).toBe(2);
            expect(availability.availableSlots).toBe(2);
            expect(availability.slots[0].status).toBe("available");
            expect(availability.slots[1].status).toBe("available");
        });
    });

    describe("5. Member Bookings Listing API (GET /bookings)", () => {
        test("Test 9: Missing memberId in query returns 400 Bad Request", async () => {
            const req = { query: {} };
            const res = mockResponse();

            await getBookingsController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/memberId/i)
                })
            );
        });

        test("Test 10: Successfully returns member booking history", async () => {
            const mockBookings = [
                {
                    _id: validBookingId,
                    member: validMemberId,
                    court: { name: "Court 1", sportType: "tennis" },
                    status: "confirmed"
                }
            ];

            Booking.find.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    sort: jest.fn().mockResolvedValue(mockBookings)
                })
            });

            const req = { query: { memberId: validMemberId } };
            const res = mockResponse();

            await getBookingsController(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 1,
                    data: mockBookings
                })
            );
        });
    });
});
