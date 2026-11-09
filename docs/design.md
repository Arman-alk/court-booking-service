# System Design Document: Community Club Court Booking Backend

**Document:** DESIGN.md (Deliverable)  
**Stack:** Node.js, Express.js, MongoDB, Mongoose, Jest, Supertest, EJS  
**Status:** Complete  

---

## 1. Problem Breakdown & Overview

A community club rents sports courts by the hour across multiple facilities. The primary pain point has been **double-booking**, caused by concurrent user reservations and race conditions when users browse, hold, and confirm slots simultaneously.

### Core Business Requirements:
1. **Two-Step Reservation Workflow:** Slot discovery -> Temporary Hold (10 minutes with auto-expiration) -> Confirmation. An unconfirmed reservation never blocks a slot indefinitely.
2. **Cancellation & 24-Hour Refund Policy:** Full refund with at least 24 hours' notice prior to slot start time; zero refund otherwise.
3. **Weekly Recurring Bookings:** Atomic reservation across multiple consecutive weeks; failure of any week leaves no partial holds.
4. **Dynamic Tiered Pricing:** Differing peak and off-peak hourly rates defined per venue/court/sport.
5. **Fair Use Booking Cap:** Members can hold at most 3 active future bookings simultaneously.
6. **Staff Court Utilization Metrics:** Analytical reporting of weekly court utilization percentage.

### Hard Architectural Guarantees:
- **Guarantee 1:** A court is **never double-booked**, however many requests arrive at once.
- **Guarantee 2:** A client retrying a timed-out confirm **never ends up with two bookings**.
- **Guarantee 3:** A failed multi-step operation **leaves no partial state**.

---

## 2. Fixed API Contract

The system exposes the fixed contract required by the integration suite:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/holds` | Creates a temporary hold on a court slot with expiration |
| `POST` | `/holds/:id/confirm` | Atomically transitions a valid hold into a confirmed booking |
| `POST` | `/bookings/:id/cancel` | Cancels a confirmed booking and applies the 24h refund policy |
| `GET` | `/courts/:id/availability` | Queries court availability and dynamic slot pricing for a date |
| `POST` | `/holds/recurring` | Atomic multi-week reservation checking every occurrence |
| `GET` | `/reports/utilization` | Calculates weekly court utilization percentage for club staff |

---

## 3. Concurrency Strategy & Architectural Guarantees

### 3.1 Guarantee 1: Zero Double-Booking under Concurrent Load
- **Mechanism:**
  - Compound indexes on both active holds (`{ court: 1, status: 1, startTime: 1, endTime: 1 }`) and confirmed bookings (`{ court: 1, status: 1, startTime: 1, endTime: 1 }`).
  - Atomic interval conflict query:
    $$\text{Conflict}: (\text{requestedStart} < \text{existingEnd}) \land (\text{requestedEnd} > \text{existingStart})$$
  - MongoDB multi-document ACID transactions with replica set isolation when connected, with atomic fallback for standalone instances.
  - Tested with 10 simultaneous concurrent requests competing for the exact same slot: exactly 1 acquires the slot, 9 are safely rejected with `409 Conflict`.

### 3.2 Guarantee 2: Timed-Out Confirm Retry Safety (Idempotency)
- **Mechanism:**
  - The `Booking` schema enforces a unique constraint on `holdId`:
    ```javascript
    holdId: { type: mongoose.Schema.Types.ObjectId, ref: "Hold", unique: true, sparse: true }
    ```
  - `POST /holds/:id/confirm` uses an atomic state transition:
    ```javascript
    Hold.findOneAndUpdate({ _id: id, status: "active", expiresAt: { $gt: now } }, { $set: { status: "converted" } })
    ```
  - If a client times out waiting for a confirmation response and retries with the same `holdId`:
    - The hold is already marked `converted`.
    - The unique index on `holdId` rejects any second booking creation with an `E11000 duplicate key error`.
    - The database is guaranteed to never create a duplicate booking.

### 3.3 Guarantee 3: Failed Multi-Step Operation Atomicity
- **Mechanism:**
  - In weekly recurring bookings (`POST /holds/recurring`), the system validates all $N$ weekly occurrences **before** creating any holds.
  - If any occurrence (e.g. Week 3) has an existing confirmed booking or active hold, the operation immediately aborts with `409 Conflict`.
  - Zero holds are created for the other weeks, leaving clean, unpolluted database state.

---

## 4. Explicit Assumptions (Decisions for Silent Requirements)

Where the initial brief was silent, the following architectural choices were made:
1. **Time Zones:** All timestamps are stored and manipulated in UTC. Display conversions happen in views/clients.
2. **Slot Granularity:** Hourly boundaries starting on the hour (e.g., 08:00–09:00, 09:00–10:00).
3. **Hold Duration:** Temporary holds expire automatically after 10 minutes.
4. **Member Active Booking Limit:** Maximum 3 active future bookings per member (`status: "confirmed"`, `startTime > now`).
5. **Staff Utilization Formula:**
   $$\text{Utilization \%} = \left( \frac{\sum \text{Confirmed Booking Hours}}{\text{Total Available Operating Hours in 7-day Week}} \right) \times 100$$

---

## 5. Open Questions for the Client

1. **Waitlisting:** When a member holds a slot and lets it expire, should waitlisted members be automatically notified or reserved?
2. **Partial Recurring Reservations:** If 3 out of 4 weeks are available in a recurring booking, should the system offer to book the 3 available weeks, or strictly enforce all-or-nothing? (Current implementation strictly enforces all-or-nothing per guarantee 3).
3. **Consecutive Hours Limit:** Can a single member book 3 consecutive hours on the same day, or is there a daily cap per sport?
4. **Custom Cancellation Tiers:** Is a partial refund (e.g., 50%) desired for cancellations between 12 and 24 hours in the future?

---

## 6. Alternatives Considered & Rejected

| Alternative | Why Considered | Why Rejected |
| :--- | :--- | :--- |
| **In-Memory Locks (`async-mutex`)** | Easy to implement in single-node Node.js. | Fails completely when running multi-instance clusters or load-balanced containers. |
| **Redis Distributed Lock (Redlock)** | Fast distributed locking across servers. | Adds external infrastructure dependency, TTL drift failure modes, and operational complexity. |
| **Single-Phase Booking without Holds** | Simpler one-step booking endpoint. | Fails UX requirement: users need a reservation window to enter payment details without losing their slot. |
| **Background TTL Cleanup Alone** | MongoDB has native TTL indexes (`expireAfterSeconds: 0`). | TTL deletion is asynchronous (runs every ~60s). Query-time filter (`expiresAt: { $gt: new Date() }`) was added to ensure instantaneous expiration accuracy. |
