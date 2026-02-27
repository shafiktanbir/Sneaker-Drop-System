# Limited Edition Sneaker Drop — Technical Documentation

Complete documentation of the codebase, dependencies, and credentials required to run the application.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Dependencies](#dependencies)
5. [Credentials & Environment Variables](#credentials--environment-variables)
6. [Database Schema](#database-schema)
7. [Codebase Walkthrough](#codebase-walkthrough)
8. [API Reference](#api-reference)
9. [WebSocket Events](#websocket-events)
10. [Running the Application](#running-the-application)
11. [Deployment](#deployment)

---

## Overview

This is a real-time inventory system for limited-edition sneaker drops. It supports:

- **Real-time stock updates** across all connected clients via WebSockets
- **Atomic reservations** that prevent overselling under concurrent load
- **60-second reservation window** with automatic stock recovery on expiry
- **Purchase flow** restricted to users with active reservations
- **Activity feed** showing the top 3 recent purchasers per drop

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (React + Vite)                           │
│  Dashboard  │  DropCard  │  useSocket  │  api client  │  ToastContext       │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                    HTTP (REST)  │  WebSocket (Socket.io)
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│                         SERVER (Express + Node.js)                           │
│  API Routes  │  reservationService  │  dropService  │  expiryService        │
│  Socket.io   │  Rate Limiting       │  CORS         │  Express              │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 │  Prisma ORM
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│                         PostgreSQL (Neon)                                    │
│  Users  │  Drops  │  Reservations  │  Purchases                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
inventory system/
├── client/                          # React frontend
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js            # API client (fetch wrapper)
│   │   ├── components/
│   │   │   ├── ActivityFeed.jsx     # Top 3 purchasers per drop
│   │   │   ├── DropCard.jsx         # Product card with reserve/purchase
│   │   │   └── StockDisplay.jsx     # Live stock count + connection status
│   │   ├── context/
│   │   │   └── ToastContext.jsx     # Toast notifications
│   │   ├── hooks/
│   │   │   └── useSocket.js         # Socket.io client hook
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
├── server/                          # Express backend
│   ├── src/
│   │   ├── lib/
│   │   │   └── prisma.js            # Prisma client singleton
│   │   ├── services/
│   │   │   ├── reservationService.js  # Atomic reserve & purchase
│   │   │   ├── dropService.js         # Drops CRUD, stock, top purchasers
│   │   │   └── expiryService.js       # 60s expiry worker
│   │   ├── routes/
│   │   │   ├── drops.js
│   │   │   ├── reservations.js
│   │   │   └── purchases.js
│   │   ├── socket/
│   │   │   └── index.js             # Socket.io instance getter/setter
│   │   └── index.js                 # Express + Socket.io entry point
│   ├── prisma/
│   │   ├── schema.prisma            # Prisma schema
│   │   └── migrations/              # Prisma migrations
│   └── package.json
│
├── docs/
│   └── DOCUMENTATION.md             # This file
├── .env.example
├── .gitignore
├── PITFALLS_AND_FIXES.md
├── README.md
└── package.json                     # Root scripts
```

---

## Dependencies

### Server (`server/package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| **express** | ^4.18.2 | Web framework for REST API |
| **cors** | ^2.8.5 | Cross-Origin Resource Sharing |
| **@prisma/client** | ^5.22.0 | Prisma ORM client |
| **socket.io** | ^4.7.2 | WebSocket server for real-time updates |
| **express-rate-limit** | ^7.1.5 | Rate limiting (reserve/purchase) |
| **dotenv** | ^16.3.1 | Load `.env` variables |

**Dev:**

| Package | Version | Purpose |
|---------|---------|---------|
| **prisma** | ^5.22.0 | Prisma CLI, schema, migrations |

### Client (`client/package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| **react** | ^18.2.0 | UI library |
| **react-dom** | ^18.2.0 | React DOM renderer |
| **socket.io-client** | ^4.7.2 | WebSocket client |

**Dev:**

| Package | Version | Purpose |
|---------|---------|---------|
| **vite** | ^5.0.10 | Build tool & dev server |
| **@vitejs/plugin-react** | ^4.2.1 | React support for Vite |
| **tailwindcss** | ^3.4.0 | CSS utility framework |
| **postcss** | ^8.4.32 | CSS processing |
| **autoprefixer** | ^10.4.16 | Vendor prefixes for CSS |

### Node.js Version

- Recommended: **Node.js 18+** (for `--watch` flag in dev script)

---

## Credentials & Environment Variables

### Required: `.env` File

Create a `.env` file in the **project root** (`inventory system/.env`). Never commit this file.

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| **DATABASE_URL** | Yes | PostgreSQL pooled connection (for app) | `postgresql://user:pass@ep-xxx-pooler.region.neon.tech/db?sslmode=require` |
| **DIRECT_URL** | No* | PostgreSQL direct connection (for migrations) | `postgresql://user:pass@ep-xxx.region.neon.tech/db?sslmode=require` |
| **PORT** | No | Server port (default: 3001) | `3001` |
| **CORS_ORIGIN** | No | Allowed origin(s) for API/Socket (default: `http://localhost:5173`) | `http://localhost:5173` or `https://app.example.com` |
| **VITE_API_URL** | No* | Backend API base URL (client) | `http://localhost:3001` |
| **VITE_SOCKET_URL** | No* | Socket.io server URL (client) | `http://localhost:3001` |

\* `DIRECT_URL` defaults to `DATABASE_URL` if not set. For Neon, set both: pooled for app, direct for migrations.

### DATABASE_URL and DIRECT_URL (Prisma + Neon)

**Neon (recommended):**

1. Create a project at [neon.tech](https://neon.tech)
2. Get **both** connection strings from the Connect dialog:
   - **DATABASE_URL** (pooled): host contains `-pooler` — used for app queries
   - **DIRECT_URL** (direct): host without `-pooler` — used for `prisma migrate`
3. Prisma uses pooled for runtime and direct for migrations/introspection.

**Local PostgreSQL:**

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/sneaker_drop
DIRECT_URL=postgresql://postgres:password@localhost:5432/sneaker_drop
```

(Use the same URL for both when not using Neon.)

### Connection Troubleshooting

**ETIMEDOUT when connecting to Neon:**
- Your network may block outbound port 5432. Try a different network (e.g. mobile hotspot).
- Use the **direct** (non-pooler) connection string from Neon dashboard.
- Run `node server/scripts/test-connection.js` to diagnose.

**Direct vs Pooled URL:** Prisma uses DATABASE_URL (pooled) for app and DIRECT_URL (direct) for migrations. Get both from Neon dashboard.

### Credentials Checklist

- [ ] PostgreSQL database created (Neon or local)
- [ ] `DATABASE_URL` (and `DIRECT_URL` for Neon) set in `.env`
- [ ] `.env` listed in `.gitignore` (already configured)
- [ ] For production: `CORS_ORIGIN` set to frontend URL
- [ ] For production: `VITE_API_URL` and `VITE_SOCKET_URL` set before client build

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| **Users** | Purchaser identity (username) |
| **Drops** | Merch drop metadata (name, price, total stock, time window) |
| **Reservations** | Temporary 60-second holds |
| **Purchases** | Completed sales |

### Columns

**Users**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| username | VARCHAR(50) | Unique, alphanumeric |
| createdAt, updatedAt | TIMESTAMP | Auto-managed |

**Drops**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| name | VARCHAR(255) | Product name |
| price | DECIMAL(10,2) | Unit price |
| totalStock | INTEGER | Initial stock |
| startsAt | TIMESTAMP | Optional: when drop becomes active |
| endsAt | TIMESTAMP | Optional: when drop ends |
| createdAt, updatedAt | TIMESTAMP | Auto-managed |

**Reservations**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| dropId | INTEGER | FK → Drops |
| userId | INTEGER | FK → Users |
| status | ENUM | `active`, `completed`, `expired` |
| expiresAt | TIMESTAMP | Reservation deadline |
| createdAt, updatedAt | TIMESTAMP | Auto-managed |

**Purchases**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| dropId | INTEGER | FK → Drops |
| userId | INTEGER | FK → Users |
| reservationId | INTEGER | FK → Reservations |
| amountPaid | DECIMAL(10,2) | Price at purchase time |
| createdAt, updatedAt | TIMESTAMP | Auto-managed |

### Available Stock

Stock is not stored; it is computed as:

```
availableStock = totalStock - COUNT(active reservations) - COUNT(purchases)
```

---

## Codebase Walkthrough

### Server

#### Entry Point (`server/src/index.js`)

- Loads `.env` from project root
- Creates Express app and HTTP server
- Attaches Socket.io with CORS
- Registers API routes: `/api/drops`, `/api/reservations`, `/api/purchases`
- Starts expiry worker (every 5 seconds)
- Connects to PostgreSQL via Prisma (`prisma.$connect()`)

#### Reservation Service (`server/src/services/reservationService.js`)

- **`reserve(dropId, username)`**  
  - Validates username (3–50 alphanumeric chars)  
  - Uses `prisma.$transaction` with `$queryRaw` and `SELECT FOR UPDATE` on the Drop row  
  - Computes available stock from reservations and purchases  
  - If available &lt; 1, returns `OUT_OF_STOCK`  
  - If user already has an active reservation, extends `expiresAt`  
  - Otherwise creates a new reservation, commits, and returns it  

- **`purchase(reservationId, username)`**  
  - Validates username  
  - Locks the reservation row  
  - Ensures reservation is active, not expired, and belongs to the user  
  - Creates a Purchase, marks reservation as `completed`  
  - Handles deadlock/timeout as `CONCURRENT_UPDATE`  

#### Drop Service (`server/src/services/dropService.js`)

- **`createDrop({ name, price, totalStock, startsAt?, endsAt? })`** — Creates a new drop
- **`getAvailableStock(dropId)`** — Computes available stock for a drop
- **`getDropsWithStock(username?)`** — Lists active drops with stock, top 3 purchasers, and optional `userReservation` when username is provided

#### Expiry Service (`server/src/services/expiryService.js`)

- **`expireReservations()`** — Finds `active` reservations with `expiresAt < NOW()`, sets `status = 'expired'`
- **`startExpiryWorker(getIo, getStockForDrop)`** — Runs every 5 seconds, expires reservations, and emits `stockUpdated` for affected drops

### Client

#### App (`client/src/App.jsx`)

- Fetches drops with optional `?username=` for user reservations
- Stores username in `localStorage`
- Subscribes to Socket events for stock and purchase updates
- Renders `DropCard` for each drop

#### DropCard (`client/src/components/DropCard.jsx`)

- Renders name, price, stock, Reserve/Purchase actions
- Reserve: calls API, shows loading, then "Complete Purchase" with countdown
- Purchase: only enabled with active reservation
- Countdown uses `userReservation.expiresAt`
- Calls `onReserved` / `onPurchased` to refresh data

#### useSocket (`client/src/hooks/useSocket.js`)

- Connects to Socket.io (URL from `VITE_SOCKET_URL` or current origin)
- Listens for `stockUpdated` and `purchaseCompleted`
- Uses refs for callbacks to avoid reconnect on parent re-renders

#### API Client (`client/src/api/client.js`)

- Base URL from `VITE_API_URL` (empty in dev when using proxy)
- `getDrops(username?)`, `reserve(dropId, username)`, `purchase(reservationId, username)`, `getReservation(id)`

---

## API Reference

| Method | Path | Body/Query | Description |
|--------|------|------------|-------------|
| GET | `/api/drops` | `?username=` (optional) | List active drops with stock and top 3 purchasers |
| POST | `/api/drops` | `{ name, price, totalStock, startsAt?, endsAt? }` | Create a new drop |
| POST | `/api/reservations` | `{ dropId, username }` | Reserve an item |
| POST | `/api/purchases` | `{ reservationId, username }` | Complete purchase |
| GET | `/api/reservations/:id` | — | Validate reservation status |
| GET | `/api/health` | — | Health check |

### Example: Create Drop

```bash
curl -X POST http://localhost:3001/api/drops \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Air Jordan 1 Retro High",
    "price": 199.99,
    "totalStock": 100,
    "startsAt": "2025-02-26T12:00:00Z",
    "endsAt": null
  }'
```

---

## WebSocket Events

| Event | Direction | Payload | When |
|-------|-----------|---------|------|
| `stockUpdated` | Server → Client | `{ dropId, availableStock }` | After reserve, purchase, or expiry |
| `purchaseCompleted` | Server → Client | `{ dropId, username, topPurchasers }` | After successful purchase |

---

## Running the Application

### Prerequisites

- Node.js 18+
- PostgreSQL (Neon or local)
- `.env` configured (see [Credentials](#credentials--environment-variables))

### Steps

1. **Install dependencies**

   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

2. **Run migrations**

   ```bash
   cd server
   npm run migrate
   # Or for development: npm run migrate:dev
   ```

3. **Create a drop (optional)**

   ```bash
   curl -X POST http://localhost:3001/api/drops \
     -H "Content-Type: application/json" \
     -d '{"name":"Air Jordan 1","price":199.99,"totalStock":100}'
   ```

4. **Start server**

   ```bash
   cd server && npm run dev
   ```

5. **Start client** (separate terminal)

   ```bash
   cd client && npm run dev
   ```

6. Open **http://localhost:5173**, enter a username, and use Reserve → Complete Purchase.

### Root Scripts

From project root:

```bash
npm run server   # Start backend
npm run client   # Start frontend
npm run migrate  # Run migrations
```

---

## Deployment

- **Frontend**: Vercel or similar (static build)
- **Backend**: Railway, Render, or Fly.io (WebSockets supported)
- **Database**: Neon PostgreSQL

**Important:** Vercel serverless does not support WebSockets. Run the backend on a platform that keeps long-lived connections (Railway, Render, Fly.io).

### Production env vars

**Backend (Railway/Render/etc.):**

- `DATABASE_URL` — Neon direct connection string
- `CORS_ORIGIN` — Frontend URL (e.g. `https://your-app.vercel.app`)
- `PORT` — Usually provided by host

**Frontend build (Vercel):**

- `VITE_API_URL` — Backend API URL (e.g. `https://api.example.com`)
- `VITE_SOCKET_URL` — Backend URL for Socket.io (same as API)

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design, data flows, concurrency, diagrams
- [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — User journey and step-by-step flow
- [README.md](../README.md) — Quick start and architecture summary
- [PITFALLS_AND_FIXES.md](../PITFALLS_AND_FIXES.md) — Common pitfalls and mitigations
