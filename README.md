# Community Club Court Booking Backend

A high-concurrency, enterprise-grade sports court booking engine for community clubs. Built with **Node.js, Express.js, MongoDB, Mongoose, Jest, Supertest, and EJS**. Designed to eliminate double-booking with mathematical precision under concurrent load.

---

## 🛠️ Technology Stack
- **Runtime:** Node.js (v18+ / v20+)
- **Backend Framework:** Express.js
- **Database:** MongoDB & Mongoose
- **Containerization:** Docker & Docker Compose
- **Continuous Integration:** GitHub Actions (`.github/workflows/ci.yml`)
- **Automated Testing:** Jest & Supertest (5 test suites, 36 tests, 100% pass rate)
- **Frontend / Views:** EJS with modern responsive CSS

---

## 🛡️ Core Guarantees & How They Are Proven

### 1. Guarantee 1: A court is never double-booked, however many requests arrive at once
- **Implementation:** Active hold and booking interval overlap queries with compound indexes (`{ court: 1, status: 1, startTime: 1, endTime: 1 }`). MongoDB multi-document transactions ensure ACID isolation.
- **Test:** [`tests/guarantees.test.js`](file:///d:/code/court%20booking%20system/court-booking-service/tests/guarantees.test.js) fires **10 simultaneous concurrent requests** for the exact same slot: exactly **1** acquires the reservation, and **9** are safely rejected with `409 Conflict`.

### 2. Guarantee 2: A client retrying a timed-out confirm never ends up with two bookings
- **Implementation:** The `Booking` collection enforces a unique sparse index on `holdId`. `POST /holds/:id/confirm` uses atomic state transitions (`Hold.findOneAndUpdate`).
- **Test:** [`tests/guarantees.test.js`](file:///d:/code/court%20booking%20system/court-booking-service/tests/guarantees.test.js) executes duplicate confirmation retries for the same hold. The database rejects duplicate creations, guaranteeing that only one booking ever exists.

### 3. Guarantee 3: A failed multi-step operation leaves no partial state
- **Implementation:** Weekly recurring bookings (`POST /holds/recurring`) validate availability across **every single weekly occurrence** before creating any holds.
- **Test:** [`tests/guarantees.test.js`](file:///d:/code/court%20booking%20system/court-booking-service/tests/guarantees.test.js) requests a 4-week reservation where Week 3 is already booked. The entire operation is rejected with `409 Conflict` and **0** partial holds are created in the database.

---

## 📋 Fixed Contract Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/holds` | Creates a temporary 10-minute hold on a court slot |
| `POST` | `/holds/:id/confirm` | Atomically transitions a valid hold into a confirmed booking |
| `POST` | `/bookings/:id/cancel` | Cancels a booking and applies the 24-hour refund policy |
| `GET` | `/courts/:id/availability?date=YYYY-MM-DD` | Returns operating hours, dynamic slot pricing, and real-time statuses |

---

## 🌟 Additional Features

- **Weekly Recurring Bookings:** `POST /holds/recurring` (2 to 12 weeks, validating all occurrences).
- **24-Hour Refund Policy:** 100% full refund if cancelled $\ge 24\text{ hours}$ before start; 0% refund if cancelled $< 24\text{ hours}$. Releasing slot immediately.
- **Member Active Booking Limit:** Members can hold at most 3 active future bookings simultaneously (`status: "confirmed"`, `startTime > now`).
- **Peak & Off-Peak Dynamic Pricing:** Venue-configured peak hours (e.g. 17:00–21:00) with dynamic hourly rate calculation.
- **Staff Court Utilization Analytics:** `GET /reports/utilization?courtId=XYZ&weekStart=YYYY-MM-DD` computes weekly court utilization percentage.
- **Web Frontend (EJS):** Responsive court catalog, real-time availability picker, and self-service member booking dashboard.

---

## 🚀 Running the Project

### Method A: Local Development
```bash
cd court-booking-service
npm install
npm run seed      # Populates demo venues, courts, pricing, and members
npm run dev       # Starts dev server on http://localhost:5000
```

### Method B: Docker Compose
From the repository root or inside `court-booking-service/`:
```bash
docker compose up --build
```
- Web Application: [http://localhost:5000/](http://localhost:5000/)
- MongoDB: `mongodb://localhost:27017`

### Running Automated Tests
```bash
cd court-booking-service
npm test
```
**Results:** 5 Test Suites, 36 Tests passing (100% pass rate).

---

## 📂 Deliverables Included

1. **[`docs/DESIGN.md`](file:///d:/code/court%20booking%20system/court-booking-service/docs/DESIGN.md):** Architectural decisions, mathematical guarantees, assumptions, open questions for the client, and alternatives rejected.
2. **[`docs/LIMITATIONS.md`](file:///d:/code/court%20booking%20system/court-booking-service/docs/LIMITATIONS.md):** Comprehensive analysis of how the system can still fail under distributed edge cases.
3. **[`docker-compose.yml`](file:///d:/code/court%20booking%20system/court-booking-service/docker-compose.yml):** Multi-container deployment configuration for Node.js + MongoDB.
4. **[`.github/workflows/ci.yml`](file:///d:/code/court%20booking%20system/court-booking-service/.github/workflows/ci.yml):** Continuous integration workflow with automated testing against MongoDB service containers.
5. **[`tests/guarantees.test.js`](file:///d:/code/court%20booking%20system/court-booking-service/tests/guarantees.test.js):** Verification of all three architectural guarantees.
