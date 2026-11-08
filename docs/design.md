# Court Booking System – Design Document

## 1. Project Overview

The Court Booking System is a web-based application that allows members to browse sports courts, check availability, reserve courts, confirm bookings and cancel reservations.

The system aims to prevent double-booking and provide reliable booking management across multiple venues.

## 2. Technology Stack

- Runtime: Node.js
- Backend: Express.js
- Frontend: EJS
- Database: MongoDB
- Package Manager: npm
- Testing: Jest and Supertest
- Version Control: Git and GitHub
- Containerization: Docker

## 3. System Architecture

The application follows a layered architecture:

1. Routes – Define API endpoints.
2. Controllers – Handle incoming requests and responses.
3. Services – Implement booking and business logic.
4. Models – Define MongoDB database schemas.
5. Middleware – Handle authentication, validation and errors.
6. Views – Render pages using EJS.

## 4. Main Database Collections

- Members
- Venues
- Courts
- Holds
- Bookings
- Pricing Rules

## 5. Core Business Rules

1. A court cannot have overlapping confirmed bookings.
2. A temporary hold must expire automatically.
3. A booking requires confirmation before becoming active.
4. Confirmation retries must not create duplicate bookings.
5. Members can have at most three active future bookings.
6. Cancellations made at least 24 hours before the booking receive a full refund.
7. Cancellations made less than 24 hours before the booking receive no refund.
8. Weekly recurring bookings must check availability for every occurrence.
9. Peak and off-peak hours have different prices.

## 6. API Design

- POST /holds
- POST /holds/:id/confirm
- POST /bookings/:id/cancel
- GET /courts/:id/availability

## 7. Concurrency and Data Consistency

MongoDB transactions and atomic database operations will be used to protect booking operations.

The booking service will validate availability inside the transaction and prevent overlapping active reservations.

Idempotency keys will be used for confirmation retries.

Expired holds will be checked explicitly, with TTL cleanup as a background mechanism.

## 8. Assumptions

- All booking times are stored in UTC.
- Booking durations are defined by the selected time slot.
- Each court belongs to one venue.
- Members must be authenticated before booking.
- A temporary hold has a limited expiration period.
- Payment processing is represented by a payment/refund abstraction.

## 9. Open Questions for the Client

1. How long should a temporary hold remain active?
2. Which payment gateway should be integrated?
3. Can members modify an existing booking?
4. How far in advance can members book?
5. What happens when one occurrence of a recurring booking becomes unavailable?
6. Can staff override a booking limit?

## 10. Alternatives Considered

- Relational databases: PostgreSQL offers strong exclusion constraints for preventing overlapping time ranges. MongoDB is retained for this implementation because it is the selected project database, but requires additional concurrency safeguards.
- Automatic hold cleanup alone: Rejected because TTL deletion is asynchronous.
- Direct booking without temporary holds: Rejected because the required workflow uses two-step reservation and confirmation.

## 11. Known Limitations

The implementation depends on correct transaction handling, database availability and reliable payment-provider integration. These risks will be documented in LIMITATIONS.md.