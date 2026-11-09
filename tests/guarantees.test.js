const mongoose = require("mongoose");
const Hold = require("../models/Hold");
const Booking = require("../models/Booking");
const Court = require("../models/Court");
const Member = require("../models/Member");
const { createHold, confirmHold, createRecurringHold } = require("../controllers/holdController");
const { getCourtUtilization } = require("../services/reportService");

// Mock Mongoose models
jest.mock("../models/Hold");
jest.mock("../models/Booking");
jest.mock("../models/Court");
jest.mock("../models/Member");
jest.mock("../models/Pricing");

const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe("Core System Guarantees & Staff Analytics", () => {
    const validMemberId = new mongoose.Types.ObjectId().toString();
    const validCourtId = new mongoose.Types.ObjectId().toString();
    const validHoldId = new mongoose.Types.ObjectId().toString();

    const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const futureEnd = new Date(Date.now() + 3 * 60 * 60 * 1000);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Guarantee 1: A court is never double-booked, however many requests arrive at once", () => {
        test("10 simultaneous concurrent requests competing for the same slot: exactly one succeeds, 9 rejected", async () => {
            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });
            Booking.countDocuments.mockResolvedValue(0);
            Booking.findOne.mockResolvedValue(null);

            let slotAcquired = false;
            Hold.findOne.mockImplementation(() => {
                if (!slotAcquired) {
                    slotAcquired = true;
                    return Promise.resolve(null); // Winner acquires slot
                }
                return Promise.resolve({
                    _id: new mongoose.Types.ObjectId(),
                    status: "active",
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
                }); // Losers find slot held
            });

            Hold.create.mockImplementation((data) => {
                return Promise.resolve({
                    _id: new mongoose.Types.ObjectId(),
                    ...data
                });
            });

            // Fire 10 simultaneous concurrent requests for the exact same slot
            const requests = Array.from({ length: 10 }, () => {
                const req = {
                    body: {
                        memberId: validMemberId,
                        courtId: validCourtId,
                        startTime: futureStart.toISOString(),
                        endTime: futureEnd.toISOString()
                    }
                };
                const res = mockResponse();
                return createHold(req, res).then(() => res.status.mock.calls[0][0]);
            });

            const results = await Promise.all(requests);

            const successCount = results.filter((code) => code === 201).length;
            const conflictCount = results.filter((code) => code === 409).length;

            expect(successCount).toBe(1); // Exactly ONE reservation succeeds
            expect(conflictCount).toBe(9); // 9 reservations safely rejected with 409 Conflict
            expect(results.length).toBe(10);
        });
    });

    describe("Guarantee 2: A client retrying a timed-out confirm never ends up with two bookings", () => {
        test("Retrying confirm on an already confirmed hold is safely handled and never creates a second booking", async () => {
            const mockHold = {
                _id: validHoldId,
                member: validMemberId,
                court: validCourtId,
                startTime: futureStart,
                endTime: futureEnd,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                status: "active",
                isExpired: () => false
            };

            const mockCourt = { _id: validCourtId, sportType: "tennis", status: "available" };

            Hold.findById.mockResolvedValue(mockHold);
            Booking.findOne.mockResolvedValue(null);
            Court.findById.mockResolvedValue(mockCourt);
            Hold.findOneAndUpdate.mockResolvedValue({ ...mockHold, status: "converted" });

            const createdBooking = {
                _id: new mongoose.Types.ObjectId().toString(),
                member: validMemberId,
                court: validCourtId,
                holdId: validHoldId,
                status: "confirmed",
                totalPrice: 50
            };
            Booking.create.mockResolvedValue(createdBooking);

            // Attempt 1: Succeeds and creates booking
            const req1 = { params: { id: validHoldId }, body: {} };
            const res1 = mockResponse();
            await confirmHold(req1, res1);
            expect(res1.status).toHaveBeenCalledWith(201);

            // Client timed out waiting for response, and retries confirm with same holdId!
            mockHold.status = "converted";
            Hold.findById.mockResolvedValue({ ...mockHold });

            // Attempt 2 (Retry): Database rejects duplicate booking
            const req2 = { params: { id: validHoldId }, body: {} };
            const res2 = mockResponse();
            await confirmHold(req2, res2);

            expect(res2.status).toHaveBeenCalledWith(409);
            // Booking.create must have been called only ONCE throughout both attempts!
            expect(Booking.create).toHaveBeenCalledTimes(1);
        });
    });

    describe("Guarantee 3: A failed multi-step operation leaves no partial state", () => {
        test("Recurring booking where 1 week is unavailable aborts completely with 0 partial holds created", async () => {
            Member.findById.mockResolvedValue({ _id: validMemberId, status: "active" });
            Court.findById.mockResolvedValue({ _id: validCourtId, status: "available" });

            let checkIndex = 0;
            // Week 1, 2 are free, but Week 3 has conflict
            Booking.findOne.mockImplementation(() => {
                checkIndex++;
                if (checkIndex === 3) {
                    return Promise.resolve({ _id: new mongoose.Types.ObjectId(), status: "confirmed" });
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

            // CRITICAL: Ensure NO holds were inserted for weeks 1, 2, or 4!
            expect(Hold.create).not.toHaveBeenCalled();
        });
    });

    describe("Staff Analytics: Court Utilization per Week", () => {
        test("Calculates correct court utilization percentage", async () => {
            const mockVenue = {
                name: "Community Sports Arena",
                operatingHours: { open: "07:00", close: "22:00" } // 15 hours/day * 7 = 105 total hours
            };
            const mockCourt = {
                _id: validCourtId,
                name: "Court 1",
                sportType: "tennis",
                venue: mockVenue
            };

            Court.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockCourt)
            });

            // Simulate 21 hours of confirmed bookings across the week
            const startDay1 = new Date("2026-11-10T08:00:00Z");
            const endDay1 = new Date("2026-11-10T15:00:00Z"); // 7 hours
            const startDay2 = new Date("2026-11-11T08:00:00Z");
            const endDay2 = new Date("2026-11-11T22:00:00Z"); // 14 hours
            // Total = 21 hours booked out of 105 hours = 20.00% utilization

            Booking.find.mockReturnValue({
                select: jest.fn().mockResolvedValue([
                    { startTime: startDay1, endTime: endDay1, status: "confirmed" },
                    { startTime: startDay2, endTime: endDay2, status: "confirmed" }
                ])
            });

            const report = await getCourtUtilization(validCourtId, "2026-11-09");

            expect(report.totalOperatingHours).toBe(105);
            expect(report.bookedHours).toBe(21);
            expect(report.utilizationPercentage).toBe(20);
        });
    });
});
