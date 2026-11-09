const mongoose = require("mongoose");
const Hold = require("../models/Hold");
const Booking = require("../models/Booking");
const Court = require("../models/Court");
const Pricing = require("../models/Pricing");
const { confirmHold } = require("../controllers/holdController");
const { confirmBookingHold } = require("../services/bookingService");

// Mock Mongoose models
jest.mock("../models/Hold");
jest.mock("../models/Booking");
jest.mock("../models/Court");
jest.mock("../models/Pricing");
jest.mock("../models/Member");

// Helper to mock Express req and res
const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe("Day 3: Court Booking System - Booking Confirmation API (POST /holds/:id/confirm)", () => {
    const validHoldId = new mongoose.Types.ObjectId().toString();
    const validMemberId = new mongoose.Types.ObjectId().toString();
    const validCourtId = new mongoose.Types.ObjectId().toString();

    const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const futureEnd = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const unexpiredTime = new Date(Date.now() + 10 * 60 * 1000);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("1. Validation & Error Handling", () => {
        test("Test 1: Invalid hold ID returns 400 Bad Request", async () => {
            const req = { params: { id: "invalid-hold-id" }, body: {} };
            const res = mockResponse();

            await confirmHold(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/invalid hold ID/i)
                })
            );
        });

        test("Test 2: Non-existent hold ID returns 404 Not Found", async () => {
            const nonExistentId = new mongoose.Types.ObjectId().toString();
            Hold.findById.mockResolvedValue(null);

            const req = { params: { id: nonExistentId }, body: {} };
            const res = mockResponse();

            await confirmHold(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/hold not found/i)
                })
            );
        });

        test("Test 3: Court unavailable or in maintenance returns 400 Bad Request", async () => {
            const mockHold = {
                _id: validHoldId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStart,
                endTime: futureEnd,
                expiresAt: unexpiredTime,
                status: "active",
                isExpired: () => false
            };

            Hold.findById.mockResolvedValue(mockHold);
            Booking.findOne.mockResolvedValue(null);
            Court.findById.mockResolvedValue({
                _id: validCourtId,
                status: "maintenance"
            });

            const req = { params: { id: validHoldId }, body: {} };
            const res = mockResponse();

            await confirmHold(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/court is unavailable/i)
                })
            );
        });
    });

    describe("2. Expired Hold Handling", () => {
        test("Test 4: Expired hold returns 400 Bad Request and updates status", async () => {
            const expiredTime = new Date(Date.now() - 5 * 60 * 1000); // Expired 5 mins ago
            const mockExpiredHold = {
                _id: validHoldId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStart,
                endTime: futureEnd,
                expiresAt: expiredTime,
                status: "active",
                isExpired: () => true
            };

            Hold.findById.mockResolvedValue(mockExpiredHold);
            Booking.findOne.mockResolvedValue(null);
            Hold.updateOne.mockResolvedValue({ modifiedCount: 1 });

            const req = { params: { id: validHoldId }, body: {} };
            const res = mockResponse();

            await confirmHold(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/hold has expired/i)
                })
            );
            expect(Hold.updateOne).toHaveBeenCalledWith(
                { _id: validHoldId },
                { status: "expired" }
            );
        });
    });

    describe("3. Successful Booking Confirmation", () => {
        test("Test 5: Successfully converts valid hold into confirmed booking (201 Created)", async () => {
            const mockHold = {
                _id: validHoldId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStart,
                endTime: futureEnd,
                expiresAt: unexpiredTime,
                status: "active",
                isExpired: () => false
            };

            const mockCourt = {
                _id: validCourtId,
                sportType: "tennis",
                status: "available"
            };

            const mockBooking = {
                _id: new mongoose.Types.ObjectId().toString(),
                member: validMemberId,
                court: validCourtId,
                holdId: validHoldId,
                bookingDate: futureStart,
                startTime: futureStart,
                endTime: futureEnd,
                status: "confirmed",
                totalPrice: 65,
                payment: {
                    status: "paid",
                    method: "credit_card",
                    transactionId: "TXN-TEST-1234",
                    paidAt: new Date()
                }
            };

            Hold.findById.mockResolvedValue(mockHold);
            Booking.findOne.mockResolvedValue(null);
            Court.findById.mockResolvedValue(mockCourt);
            Hold.findOneAndUpdate.mockResolvedValue({ ...mockHold, status: "converted" });
            Pricing.findOne.mockResolvedValue({
                peakHourPrice: 65,
                offPeakPrice: 40,
                peakHours: { start: "17:00", end: "21:00" }
            });
            Booking.create.mockResolvedValue(mockBooking);

            const req = {
                params: { id: validHoldId },
                body: {
                    paymentMethod: "credit_card",
                    totalPrice: 65
                }
            };
            const res = mockResponse();

            await confirmHold(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: expect.stringMatching(/booking confirmed successfully/i),
                    data: expect.objectContaining({
                        status: "confirmed",
                        holdId: validHoldId
                    })
                })
            );
            expect(Hold.findOneAndUpdate).toHaveBeenCalled();
            expect(Booking.create).toHaveBeenCalled();
        });
    });

    describe("4. Duplicate & Already Confirmed Bookings", () => {
        test("Test 6: Already converted hold returns 409 Conflict", async () => {
            const mockConvertedHold = {
                _id: validHoldId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStart,
                endTime: futureEnd,
                expiresAt: unexpiredTime,
                status: "converted",
                isExpired: () => false
            };

            Hold.findById.mockResolvedValue(mockConvertedHold);

            const req = { params: { id: validHoldId }, body: {} };
            const res = mockResponse();

            await confirmHold(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/already been confirmed/i)
                })
            );
        });

        test("Test 6b: Duplicate confirmation requests - second sequential request is rejected with 409 Conflict", async () => {
            const mockHold = {
                _id: validHoldId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStart,
                endTime: futureEnd,
                expiresAt: unexpiredTime,
                status: "active",
                isExpired: () => false
            };

            const mockCourt = {
                _id: validCourtId,
                sportType: "tennis",
                status: "available"
            };

            Hold.findById.mockResolvedValue(mockHold);
            Booking.findOne.mockResolvedValue(null);
            Court.findById.mockResolvedValue(mockCourt);
            Hold.findOneAndUpdate.mockResolvedValue({ ...mockHold, status: "converted" });
            Pricing.findOne.mockResolvedValue({
                peakHourPrice: 65,
                offPeakPrice: 40
            });
            Booking.create.mockResolvedValue({
                _id: new mongoose.Types.ObjectId().toString(),
                status: "confirmed"
            });

            // First confirmation request: should succeed with 201
            const req1 = { params: { id: validHoldId }, body: {} };
            const res1 = mockResponse();
            await confirmHold(req1, res1);
            expect(res1.status).toHaveBeenCalledWith(201);

            // Hold is now converted in database
            mockHold.status = "converted";
            Hold.findById.mockResolvedValue({ ...mockHold });

            // Second confirmation request for the same hold: must be rejected with 409
            const req2 = { params: { id: validHoldId }, body: {} };
            const res2 = mockResponse();
            await confirmHold(req2, res2);
            expect(res2.status).toHaveBeenCalledWith(409);
            expect(res2.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/already been confirmed/i)
                })
            );
        });

        test("Test 7: Reject confirmation if booking already exists for the hold", async () => {
            const mockHold = {
                _id: validHoldId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStart,
                endTime: futureEnd,
                expiresAt: unexpiredTime,
                status: "active",
                isExpired: () => false
            };

            Hold.findById.mockResolvedValue(mockHold);
            // Simulate an existing confirmed booking with this holdId
            Booking.findOne.mockResolvedValue({
                _id: new mongoose.Types.ObjectId(),
                holdId: validHoldId,
                status: "confirmed"
            });

            const req = { params: { id: validHoldId }, body: {} };
            const res = mockResponse();

            await confirmHold(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/already been confirmed/i)
                })
            );
        });

        test("Test 8: Database duplicate key error (code 11000) returns 409 Conflict", async () => {
            const mockHold = {
                _id: validHoldId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStart,
                endTime: futureEnd,
                expiresAt: unexpiredTime,
                status: "active",
                isExpired: () => false
            };

            Hold.findById.mockResolvedValue(mockHold);
            Booking.findOne.mockResolvedValue(null);
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });
            Hold.findOneAndUpdate.mockResolvedValue({ ...mockHold, status: "converted" });

            // Simulate unique index violation on holdId
            const duplicateKeyError = new Error("E11000 duplicate key error collection");
            duplicateKeyError.code = 11000;
            Booking.create.mockRejectedValue(duplicateKeyError);

            const req = { params: { id: validHoldId }, body: {} };
            const res = mockResponse();

            await confirmHold(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/already been confirmed/i)
                })
            );
        });
    });

    describe("5. Concurrency & Race Conditions", () => {
        test("Test 9: Concurrent booking confirmation - only one request succeeds", async () => {
            const mockHold = {
                _id: validHoldId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStart,
                endTime: futureEnd,
                expiresAt: unexpiredTime,
                status: "active",
                isExpired: () => false
            };

            const mockCourt = {
                _id: validCourtId,
                sportType: "tennis",
                status: "available"
            };

            let isFirstCaller = true;

            Hold.findById.mockImplementation(() => {
                return Promise.resolve(mockHold);
            });

            Booking.findOne.mockResolvedValue(null);
            Court.findById.mockResolvedValue(mockCourt);

            // Simulate atomic findOneAndUpdate: only the first request successfully mutates status from 'active' to 'converted'
            Hold.findOneAndUpdate.mockImplementation(() => {
                if (isFirstCaller) {
                    isFirstCaller = false;
                    mockHold.status = "converted";
                    return Promise.resolve({ ...mockHold });
                } else {
                    // Second concurrent request finds hold is no longer 'active'
                    return Promise.resolve(null);
                }
            });

            Booking.create.mockResolvedValue({
                _id: new mongoose.Types.ObjectId().toString(),
                member: validMemberId,
                court: validCourtId,
                holdId: validHoldId,
                status: "confirmed"
            });

            const req1 = { params: { id: validHoldId }, body: {} };
            const res1 = mockResponse();

            const req2 = { params: { id: validHoldId }, body: {} };
            const res2 = mockResponse();

            // Fire two simultaneous requests
            await Promise.all([confirmHold(req1, res1), confirmHold(req2, res2)]);

            const calledStatuses = [
                res1.status.mock.calls[0][0],
                res2.status.mock.calls[0][0]
            ];

            // Exactly one request must succeed with 201 Created
            expect(calledStatuses).toContain(201);
            // The other request must be rejected with 409 Conflict
            expect(calledStatuses).toContain(409);
        });
    });
});
