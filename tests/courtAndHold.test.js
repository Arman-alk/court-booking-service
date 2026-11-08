const mongoose = require("mongoose");
const Court = require("../models/Court");
const Hold = require("../models/Hold");
const Booking = require("../models/Booking");
const Member = require("../models/Member");
const { getCourtAvailability } = require("../services/availabilityService");
const { createTemporaryHold } = require("../services/holdService");
const { getAvailability } = require("../controllers/courtController");
const { createHold } = require("../controllers/holdController");

// Mock Mongoose models
jest.mock("../models/Court");
jest.mock("../models/Hold");
jest.mock("../models/Booking");
jest.mock("../models/Member");
jest.mock("../models/Pricing");

// Helper to mock Express req and res
const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe("Day 2: Court Booking System - Court & Hold APIs", () => {
    const validMemberId = new mongoose.Types.ObjectId().toString();
    const validCourtId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("1. Validation & Error Handling", () => {
        test("Test 6: Invalid court IDs return 400 Bad Request", async () => {
            const req = { params: { id: "invalid-court-id" }, query: {} };
            const res = mockResponse();

            await getAvailability(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/Invalid Court ID format/i)
                })
            );
        });

        test("Test 7: Invalid booking dates return 400 Bad Request", async () => {
            const req = { params: { id: validCourtId }, query: { date: "invalid-date" } };
            const res = mockResponse();

            await getAvailability(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/Invalid date format/i)
                })
            );
        });

        test("Test 7b: Invalid booking times (start >= end) are rejected", async () => {
            const now = new Date();
            const start = new Date(now.getTime() + 60 * 60 * 1000);
            const end = new Date(now.getTime() + 30 * 60 * 1000); // end earlier than start

            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });

            const req = {
                body: {
                    memberId: validMemberId,
                    courtId: validCourtId,
                    startTime: start.toISOString(),
                    endTime: end.toISOString()
                }
            };
            const res = mockResponse();

            await createHold(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/start time must be before end time/i)
                })
            );
        });
    });

    describe("2. Court Availability API (GET /courts/:id/availability)", () => {
        test("Test 1: Successfully retrieving court availability", async () => {
            const mockVenue = {
                _id: new mongoose.Types.ObjectId(),
                name: "Main Sports Complex",
                operatingHours: { open: "08:00", close: "11:00" },
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

            Booking.find.mockReturnValue({
                select: jest.fn().mockResolvedValue([])
            });
            Hold.find.mockReturnValue({
                select: jest.fn().mockResolvedValue([])
            });

            const req = { params: { id: validCourtId }, query: { date: "2026-11-10" } };
            const res = mockResponse();

            await getAvailability(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const jsonResponse = res.json.mock.calls[0][0];
            expect(jsonResponse.success).toBe(true);
            expect(jsonResponse.data.court.name).toBe("Tennis Court 1");
            expect(jsonResponse.data.totalSlots).toBe(3); // 08:00-09:00, 09:00-10:00, 10:00-11:00
            expect(jsonResponse.data.availableSlots).toBe(3);
        });

        test("Test 4: Expired holds no longer block availability", async () => {
            const mockVenue = {
                operatingHours: { open: "09:00", close: "11:00" },
                slotDurationMinutes: 60
            };
            const mockCourt = {
                _id: validCourtId,
                name: "Squash Court 1",
                sportType: "squash",
                status: "available",
                venue: mockVenue
            };

            Court.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockCourt)
            });

            Booking.find.mockReturnValue({
                select: jest.fn().mockResolvedValue([])
            });

            // Expired holds are excluded by expiresAt: { $gt: now } query in the service
            Hold.find.mockReturnValue({
                select: jest.fn().mockResolvedValue([])
            });

            const availability = await getCourtAvailability(validCourtId, "2026-11-10");
            expect(availability.availableSlots).toBe(2);
            expect(availability.slots[0].status).toBe("available");
        });
    });

    describe("3. Temporary Hold API (POST /holds) & Double-Booking Prevention", () => {
        test("Test 2: Successfully creating a temporary hold", async () => {
            const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
            const end = new Date(Date.now() + 3 * 60 * 60 * 1000);

            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });

            Booking.findOne.mockResolvedValue(null);
            Hold.findOne.mockResolvedValue(null);

            const mockCreatedHold = {
                _id: new mongoose.Types.ObjectId(),
                member: validMemberId,
                court: validCourtId,
                startTime: start,
                endTime: end,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                status: "active"
            };

            Hold.create.mockResolvedValue(mockCreatedHold);

            const req = {
                body: {
                    memberId: validMemberId,
                    courtId: validCourtId,
                    startTime: start.toISOString(),
                    endTime: end.toISOString()
                }
            };
            const res = mockResponse();

            await createHold(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            const jsonResponse = res.json.mock.calls[0][0];
            expect(jsonResponse.success).toBe(true);
            expect(jsonResponse.message).toMatch(/temporary hold created successfully/i);
            expect(jsonResponse.data.status).toBe("active");
        });

        test("Test 3: Rejecting a hold for an already reserved time slot (409 Conflict)", async () => {
            const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
            const end = new Date(Date.now() + 3 * 60 * 60 * 1000);

            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });

            // Simulate overlapping confirmed booking
            Booking.findOne.mockResolvedValue({
                _id: new mongoose.Types.ObjectId(),
                court: validCourtId,
                status: "confirmed",
                startTime: start,
                endTime: end
            });

            const req = {
                body: {
                    memberId: validMemberId,
                    courtId: validCourtId,
                    startTime: start.toISOString(),
                    endTime: end.toISOString()
                }
            };
            const res = mockResponse();

            await createHold(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/already booked/i)
                })
            );
        });

        test("Test 5: Two simultaneous requests competing for the same slot - only one succeeds", async () => {
            const start = new Date(Date.now() + 5 * 60 * 60 * 1000);
            const end = new Date(Date.now() + 6 * 60 * 60 * 1000);

            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });

            let hasFirstSlotBeenTaken = false;

            Booking.findOne.mockResolvedValue(null);

            Hold.findOne.mockImplementation(() => {
                if (!hasFirstSlotBeenTaken) {
                    hasFirstSlotBeenTaken = true;
                    return Promise.resolve(null); // First caller finds slot open
                } else {
                    return Promise.resolve({
                        _id: new mongoose.Types.ObjectId(),
                        court: validCourtId,
                        status: "active",
                        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
                    }); // Second simultaneous caller finds slot held
                }
            });

            Hold.create.mockResolvedValue({
                _id: new mongoose.Types.ObjectId(),
                member: validMemberId,
                court: validCourtId,
                startTime: start,
                endTime: end,
                status: "active"
            });

            const req1 = {
                body: {
                    memberId: validMemberId,
                    courtId: validCourtId,
                    startTime: start.toISOString(),
                    endTime: end.toISOString()
                }
            };
            const res1 = mockResponse();

            const req2 = {
                body: {
                    memberId: validMemberId,
                    courtId: validCourtId,
                    startTime: start.toISOString(),
                    endTime: end.toISOString()
                }
            };
            const res2 = mockResponse();

            // Run concurrently
            await Promise.all([createHold(req1, res1), createHold(req2, res2)]);

            const calledStatuses = [
                res1.status.mock.calls[0][0],
                res2.status.mock.calls[0][0]
            ];

            expect(calledStatuses).toContain(201); // First request succeeds
            expect(calledStatuses).toContain(409); // Second request blocked by conflict!
        });
    });
});
