# How the Limited Edition Sneaker Drop Works

A step-by-step guide to understanding the system from user actions through to database updates.

---

## Overview

Users browse merch drops, **reserve** an item (which holds 1 unit for 60 seconds), then **complete purchase** before the timer expires. Stock updates in real time across all open tabs via WebSockets.

---

## User Journey

### 1. Open the Dashboard

- User opens http://localhost:5173
- Frontend fetches `GET /api/drops?username=alice` (username optional)
- API returns active drops with:
  - Name, price, available stock
  - Top 3 recent purchasers
  - User's active reservation (if any) with `expiresAt`

### 2. Enter Username

- User types a username (3–50 alphanumeric chars)
- Stored in `localStorage` for the session
- Required before Reserve or Purchase

### 3. Reserve an Item

1. User clicks **Reserve**
2. Frontend calls `POST /api/reservations` with `{ dropId, username }`
3. Backend:
   - Locks the Drop row (`SELECT FOR UPDATE`)
   - Checks available stock = totalStock − active reservations − purchases
   - If available ≥ 1: creates a Reservation (status=`active`, expiresAt = now + 60s)
   - If available = 0: returns `OUT_OF_STOCK`
4. Backend broadcasts `stockUpdated` to all connected clients
5. Frontend:
   - Shows success toast
   - Switches to "Complete Purchase" and countdown ("60s left")
   - Refreshes drops (to get `userReservation`)

### 4. Complete Purchase (within 60 seconds)

1. User clicks **Complete Purchase**
2. Frontend calls `POST /api/purchases` with `{ reservationId, username }`
3. Backend:
   - Locks the Reservation row
   - Checks: active, not expired, belongs to user
   - Creates a Purchase, sets reservation status to `completed`
4. Backend broadcasts `stockUpdated` and `purchaseCompleted`
5. Frontend:
   - Shows success toast
   - Refreshes drops
   - Activity feed updates with new purchaser

### 5. If User Does Not Purchase in Time

1. 60 seconds pass
2. Expiry worker (runs every 5 seconds) finds the reservation
3. Sets reservation status to `expired`
4. Broadcasts `stockUpdated` to all clients
5. Stock increases by 1 for that drop
6. User's countdown hits 0; "Complete Purchase" is disabled
7. Frontend refetches drops to clear the reservation state

---

## Real-Time Behavior

### When Does Stock Update?

| Action | Who Triggers | Event | All Clients See |
|--------|--------------|-------|-----------------|
| User A reserves | Reservations route | `stockUpdated` | Stock −1 |
| User B purchases | Purchases route | `stockUpdated` + `purchaseCompleted` | Stock −1, activity feed update |
| Reservation expires | Expiry worker | `stockUpdated` | Stock +1 |

### Live Indicator

- A green "Live" badge appears when Socket.io is connected
- If disconnected, stock may be stale until reconnection or manual refresh

---

## API Flow Summary

```
GET  /api/drops?username=     → List drops with stock and user reservation
POST /api/drops               → Create drop (admin/curl)
POST /api/reservations        → Reserve item
GET  /api/reservations/:id    → Check reservation status
POST /api/purchases           → Complete purchase
```

---

## Database Flow

### Reserve

```
1. INSERT Reservation (dropId, userId, status='active', expiresAt=now+60s)
2. No change to Drops or Purchases
3. availableStock = totalStock - active reservations - purchases
```

### Purchase

```
1. INSERT Purchase (dropId, userId, reservationId, amountPaid)
2. UPDATE Reservation SET status='completed'
3. availableStock decreases by 1 permanently
```

### Expiry

```
1. UPDATE Reservation SET status='expired' WHERE expiresAt < now
2. availableStock increases by 1 (expired reservation no longer counted)
```

---

## Concurrency Example

**Scenario:** Last item in stock; 3 users click Reserve at the same time.

1. User A's request acquires the lock on the Drop row
2. User B and C wait
3. User A: available = 1, creates reservation, commits
4. User B acquires lock: available = 0, returns `OUT_OF_STOCK`
5. User C acquires lock: available = 0, returns `OUT_OF_STOCK`

Only User A succeeds. B and C see a toast: "This item is sold out."

---

## File Roles (Quick Reference)

| File | Role |
|------|------|
| `client/src/App.jsx` | Fetches drops, wires Socket handlers, renders DropCards |
| `client/src/components/DropCard.jsx` | Reserve/Purchase buttons, countdown, API calls |
| `client/src/hooks/useSocket.js` | Socket.io connection, `stockUpdated` / `purchaseCompleted` handlers |
| `client/src/api/client.js` | HTTP API wrapper |
| `server/src/services/reservationService.js` | `reserve()`, `purchase()` with `SELECT FOR UPDATE` |
| `server/src/services/dropService.js` | `createDrop`, `getDropsWithStock`, `getAvailableStock` |
| `server/src/services/expiryService.js` | Marks expired reservations, broadcasts updates |
| `server/src/routes/*.js` | Route handlers, call services, emit WebSocket events |

---

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design, diagrams, concurrency details
- [DOCUMENTATION.md](DOCUMENTATION.md) — Full API reference, setup, deployment
