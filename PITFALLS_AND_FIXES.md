# Pitfalls & Fixes - Sneaker Drop Inventory System

Expert review of potential pitfalls and how we mitigate them.

---

## 1. Neon PgBouncer + SELECT FOR UPDATE (Prisma)

**Pitfall:** Neon's pooled connection (PgBouncer in transaction mode) may not support `SELECT FOR UPDATE` in all cases. Prisma uses DATABASE_URL (pooled) for app queries.

**Fix:** Prisma is configured with both URLs: `DATABASE_URL` (pooled) for the app and `DIRECT_URL` (direct) for migrations. If you experience lock issues with the pooler, you can set `DATABASE_URL` to the direct connection string instead. For most cases, `SELECT FOR UPDATE` within a single `$transaction` block works with the pooler.

```env
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://user:pass@ep-xxx.region.neon.tech/neondb?sslmode=require
```

---

## 2. Race: Purchase vs Expiry Worker

**Pitfall:** User clicks "Complete Purchase" at 59.9s while the expiry worker runs at 60s. Both could try to modify the same reservation.

**Fix:** Purchase uses a transaction with `SELECT FOR UPDATE` on the reservation row. The expiry worker uses `UPDATE reservations SET status='expired' WHERE status='active' AND expiresAt < NOW() RETURNING *` — only rows that are still active get expired. If purchase commits first, status becomes 'completed' and the worker skips it. If worker runs first, purchase fails with "reservation expired."

---

## 3. Same User Double-Reservation

**Pitfall:** User rapidly clicks "Reserve" twice; two reservations could be created for the same drop.

**Fix:** Before creating a new reservation, check if the user already has an active reservation for this drop. If yes, return the existing reservation (or extend expiresAt) instead of creating a duplicate. Enforce at DB level: unique partial index `(dropId, userId) WHERE status = 'active'` if supported, or handle in application logic.

---

## 4. Prisma Row Locking (SELECT FOR UPDATE)

**Pitfall:** Prisma has no built-in lock parameter for queries.

**Fix:** Use `$queryRaw` inside `$transaction` to execute `SELECT ... FOR UPDATE`. The lock is held for the duration of the transaction.

---

## 5. availableStock Redundancy

**Pitfall:** Storing `availableStock` as a column risks it drifting out of sync with reservations and purchases.

**Fix:** Do NOT store availableStock. Compute it as `totalStock - activeReservations - purchases` on read. Drops table has only `totalStock`.

---

## 6. Cross-Origin Socket.io

**Pitfall:** Frontend (Vercel) and backend (Railway) on different origins; Socket.io connection fails.

**Fix:** Configure Socket.io server with `cors: { origin: ['https://your-app.vercel.app', 'http://localhost:5173'] }`. Use `transports: ['websocket', 'polling']` for fallback.

---

## 7. Client Loses Reservation on Refresh

**Pitfall:** User reserves, then refreshes; reservationId and countdown are lost.

**Fix:** Store `{ reservationId, dropId, expiresAt }` in localStorage. On load, if present, validate with API `GET /api/reservations/:id` and restore UI state. If expired, clear localStorage.

---

## 8. Username in GET /drops for "My Reservations"

**Pitfall:** Multi-tab or refresh: user can't tell which drop they've reserved.

**Fix:** Support `GET /api/drops?username=xyz`. For each drop, include `userReservation: { id, expiresAt } | null` when username matches an active reservation. Frontend uses this to show "Complete Purchase" and countdown.

---

## 9. Expiry Worker Startup Order

**Pitfall:** Worker runs before Socket.io is attached; broadcasts fail or crash.

**Fix:** Start the expiry worker only after the HTTP server is listening and Socket.io is attached. Pass the `io` instance to the worker so it can broadcast.

---

## 10. Input Validation & Security

**Pitfall:** Empty username, XSS, injection, oversized payloads.

**Fix:**
- Validate username: non-empty, 3–50 chars, alphanumeric + underscore.
- Prisma parameterizes queries (SQL injection mitigated).
- Add rate limiting on reserve/purchase (e.g. express-rate-limit).
- Sanitize any user-facing output to prevent XSS.

---

## 11. Timezone for startsAt/endsAt

**Pitfall:** Client sends local time; server interprets differently.

**Fix:** Store and compare in UTC. Accept ISO 8601 strings; convert to Date. Use `new Date()` on server for "now" (Node uses system timezone; ensure server is UTC or normalize).

---

## 12. Error Handling for Concurrency

**Pitfall:** Generic 500 on lock timeout or deadlock; user gets no useful feedback.

**Fix:** Catch Prisma/transaction timeout/deadlock errors; return 409 Conflict with `{ error: 'CONCURRENT_UPDATE', message: 'Another user just took this item. Please try again.' }`. Show toast on frontend.
