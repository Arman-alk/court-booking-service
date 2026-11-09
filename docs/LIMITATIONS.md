# System Limitations Document

**Project:** Community Club Court Booking Service  
**Document:** LIMITATIONS.md (Deliverable)  

---

## 1. Overview

While the architecture employs atomic state transitions, compound conflict indexes, unique hold constraints, and two-step reservation lifecycles, any production system has physical operational boundaries.

This document analyzes the exact edge cases, operational conditions, and failure modes where the system can degrade or fail.

---

## 2. Failure Modes & Limitations

### 2.1 Clock Drift and NTP Desynchronization
- **The Issue:** The 24-hour cancellation refund policy and 10-minute hold expiration evaluate `new Date()` against stored UTC timestamps.
- **Failure Impact:** If host server clocks experience non-trivial drift ($> 1\text{ second}$) due to NTP failure or hypervisor skew, a member cancelling at 24 hours and 1 second might receive a 0% refund instead of a 100% refund, or a hold might be marked expired prematurely.
- **Mitigation:** Run `chrony` or Amazon Time Sync Service with strict sub-millisecond alerting on all application and database instances.

### 2.2 Standalone MongoDB vs. Replica Set Transactions
- **The Issue:** MongoDB multi-document transactions require a replica set (`rs.initiate()`). Standalone MongoDB development instances do not support ACID multi-document transactions.
- **Failure Impact:** On standalone instances, the code falls back to atomic single-document operations and sequential conflict checking. While compound index conflict checks protect individual slots, true multi-collection rollback on standalone instances is best-effort.
- **Mitigation:** Production deployments must always run as a MongoDB Replica Set with `w: "majority"` write concern.

### 2.3 MongoDB Background TTL Deletion Latency
- **The Issue:** MongoDB's TTL thread runs approximately once every 60 seconds to purge expired documents from disk.
- **Failure Impact:** If the application only relied on TTL deletion, a slot held by an expired hold could remain blocked for up to 60 seconds after expiration.
- **Mitigation (Already Implemented):** The application explicitly includes `expiresAt: { $gt: new Date() }` in all conflict and availability queries. Expired holds never block availability, regardless of when the background TTL thread runs.

### 2.4 External Payment Gateway Timeouts
- **The Issue:** During `POST /holds/:id/confirm`, if an external payment provider (e.g., Stripe, PayPal) hangs for 30 seconds before timing out.
- **Failure Impact:** If the database transaction remains open during external network I/O, database locks can cause lock contention.
- **Mitigation:** Abstract payment authorization to execute with idempotency keys prior to or with two-phase commit patterns.

### 2.5 Connection Pool Exhaustion under Extreme Concurrency
- **The Issue:** When a highly sought-after court slot opens, hundreds of users may hit `POST /holds` within the same second.
- **Failure Impact:** If incoming concurrency exceeds the Mongoose connection pool size (`maxPoolSize`), requests queue up and experience connection timeouts.
- **Mitigation:** Configure `maxPoolSize: 100`, deploy load balancing with multiple Node.js instances, and enable client-side exponential backoff.
