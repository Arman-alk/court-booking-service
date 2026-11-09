const mongoose = require("mongoose");
const Hold = require("../models/Hold");
const Booking = require("../models/Booking");
const Court = require("../models/Court");
const Member = require("../models/Member");
const { createRecurringHold } = require("../controllers/holdController");
const { createRecurringHolds } = require("../services/holdService");

// Mock Mongoose models
jest.mock("../models/Hold");
jest.mock("../models/Booking");
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

describe("Day 5: Court Booking System - Recurring Bookings (Rule 8)", () => {
    const validMemberId = new mongoose.Types.ObjectId().toString();
    const validCourtId = new mongoose.Types.ObjectId().toString();

    const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const futureEnd = new Date(Date.now() + 3 * 60 * 60 * 1000);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("1. Validation & Inputs", () => {
        test("Test 1: Missing required fields returns 400 Bad Request", async () => {
            const req = { body: { memberId: validMemberId } };
            const res = mockResponse();

            await createRecurringHold(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/missing required fields/i)
                })
            );
        });

        test("Test 2: Invalid weeks count (< 2 or > 12) returns 400 Bad Request", async () => {
            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });

            const req = {
                body: {
                    memberId: validMemberId,
                    courtId: validCourtId,
                    startTime: futureStart.toISOString(),
                    endTime: futureEnd.toISOString(),
                    weeksCount: 1 // Invalid: less than 2
                }
            };
            const res = mockResponse();

            await createRecurringHold(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/between 2 and 12 weeks/i)
                })
            );
        });
    });

    describe("2. Rule 8: Availability Check For Every Occurrence", () => {
        test("Test 3: Successfully creates recurring holds when all occurrences are available", async () => {
            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });

            // No conflicting booking or hold on any week
            Booking.findOne.mockResolvedValue(null);
            Hold.findOne.mockResolvedValue(null);

            Hold.create.mockImplementation((data) => {
                return Promise.resolve({
                    _id: new mongoose.Types.ObjectId(),
                    ...data
                });
            });

            const req = {
                body: {
                    memberId: validMemberId,
                    courtId: validCourtId,
                    startTime: futureStart.toISOString(),
                    endTime: futureEnd.toISOString(),
                    weeksCount: 4
                }
            };
            const res = mockResponse();

            await createRecurringHold(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    count: 4,
                    message: expect.stringMatching(/all 4 recurring weekly occurrences/i)
                })
            );
            expect(Hold.create).toHaveBeenCalledTimes(4);
        });

        test("Test 4: Aborts entire recurring hold if ANY occurrence is already booked (409 Conflict)", async () => {
            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });

            // Week 1 and 2 are open, but Week 3 has a conflicting booking
            let callIndex = 0;
            Booking.findOne.mockImplementation(() => {
                callIndex++;
                if (callIndex === 3) {
                    // Conflicting booking on week 3!
                    return Promise.resolve({
                        _id: new mongoose.Types.ObjectId(),
                        status: "confirmed"
                    });
                }
                return Promise.resolve(null);
            });

            Hold.findOne.mockResolvedValue(null);

            const req = {
                body: {
                    memberId: validMemberId,
                    courtId: validCourtId,
                    startTime: futureStart.toISOString(),
                    endTime: futureEnd.toISOString(),
                    weeksCount: 4
                }
            };
            const res = mockResponse();

            await createRecurringHold(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringMatching(/Week 3 .* is already booked/i)
                })
            );
            // Crucial: No holds should be created because the transaction aborted
            expect(Hold.create).not.toHaveBeenCalled();
        });
    });
});
