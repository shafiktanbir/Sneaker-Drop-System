
## url link:-
- demonstration url link:-   https://www.youtube.com/watch?v=Q2RRNLVUzio&feature=youtu.be 
- live site url frontend:- https://sneaker-drop-system.vercel.app/
- live site backend url :-  https://sneaker-drop-system.onrender.com/api/health

# Limited Edition Sneaker Drop - Inventory System
sneaker drop system

Real-time inventory system for high-demand merch drops with atomic reservations, 60-second expiry, and live stock updates via WebSockets.

**Documentation:**
- [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) — API reference, setup, credentials
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design, data flows, diagrams
- [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) — User journey and flow guide

## Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Prisma ORM)
- **Real-time**: Socket.io

## Quick Start

### 1. Database Setup

Create a PostgreSQL database (e.g. via [Neon](https://neon.tech)). Set **DATABASE_URL** (pooled for app) and **DIRECT_URL** (direct for migrations) in `.env`.

### 2. Environment

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Set `DATABASE_URL` and `DIRECT_URL` (see `.env.example`). For local Postgres, use the same URL for both.

### 3. Run Migrations

```bash
cd server
npm install
npm run migrate
```

If you have an existing database from Sequelize, either run `npx prisma migrate reset` (drops all data) or `npx prisma migrate resolve --applied 20250226080000_init` to mark the migration as applied.

### 4. Create a Drop (API)

```bash
curl -X POST http://localhost:3001/api/drops \
  -H "Content-Type: application/json" \
  -d '{"name":"Air Jordan 1","price":199.99,"totalStock":100}'
```

Optional: `startsAt` and `endsAt` (ISO 8601) control when the drop is active.

### 5. Start Server

```bash
cd server
npm run dev
```

### 6. Start Client

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173. Enter a username and reserve items.

---

## Architecture Choices

### 60-Second Expiration

An in-process `setInterval` runs every 5 seconds. It finds `Reservation` rows where `status = 'active'` and `expiresAt < NOW()`, marks them `expired`, then broadcasts `stockUpdated` via Socket.io. All connected clients update the displayed stock.

**Production alternative**: Run the same expiry logic in a cron job or queue worker; the DB + broadcast logic stays the same.

### Concurrency (Preventing Overselling)

PostgreSQL `SELECT FOR UPDATE` inside a Prisma transaction:

1. `reserve(dropId, username)` uses `prisma.$transaction` and `$queryRaw` to lock the `Drop` row with `FOR UPDATE`.
2. It counts active reservations and purchases for that drop.
3. `available = totalStock - reserved - purchased`. If `available < 1`, rollback and return `OUT_OF_STOCK`.
4. Otherwise, create the reservation and commit.

Only one transaction can hold the lock at a time, so concurrent requests are serialized. If 100 users click Reserve for the last item, only one succeeds.

**Neon**: Prisma uses DATABASE_URL (pooled) for app and DIRECT_URL (direct) for migrations.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/drops?username=xyz` | List active drops with stock and top 3 purchasers; optionally include current user's reservations |
| POST | `/api/drops` | Create drop: `{ name, price, totalStock, startsAt?, endsAt? }` |
| POST | `/api/reservations` | Reserve: `{ dropId, username }` |
| POST | `/api/purchases` | Purchase: `{ reservationId, username }` |
| GET | `/api/reservations/:id` | Validate reservation (for client refresh) |

---

## Deployment

📖 **Full step-by-step guide:** [DEPLOYMENT.md](DEPLOYMENT.md)

**Important**: Vercel serverless does not support WebSockets. Deploy frontend and backend separately:

- **Frontend**: Vercel (static SPA)
- **Backend**: Railway, Render, or Fly.io (supports Socket.io)
- **Database**: Neon PostgreSQL

### Frontend (Vercel)

1. Create a new Vercel project and connect your repo.
2. Set **Root Directory** to `client`.
3. Add environment variables for the production build:
   - `VITE_API_URL` – Your backend URL (e.g. `https://sneaker-drop-api.onrender.com`)
   - `VITE_SOCKET_URL` – Same as `VITE_API_URL` (API and WebSocket share the origin)
4. Deploy. Vercel will use `client/vercel.json` and run `npm run build`.

### Backend (Railway or Render)

**Railway**

1. Create a new project and add a service from your repo.
2. Set **Root Directory** to `server`.
3. Add environment variables in the dashboard:
   - `DATABASE_URL` – Neon pooled connection
   - `DIRECT_URL` – Neon direct connection (for migrations)
   - `CORS_ORIGIN` – Your Vercel frontend URL (e.g. `https://your-app.vercel.app`)
4. Run migrations once: `cd server && npm run migrate` (or via Railway CLI).
5. Deploy. The `Procfile` runs `node src/index.js`.

**Render**

1. Connect your repo; Render will detect `render.yaml` in the root.
2. Add environment variables in the Render dashboard:
   - `DATABASE_URL`, `DIRECT_URL`, `CORS_ORIGIN`
3. Deploy. The blueprint runs migrations on start and starts the server.

### Environment Variables Summary

| Variable | Where | Description |
|----------|-------|-------------|
| `DATABASE_URL` | Backend | Neon pooled connection |
| `DIRECT_URL` | Backend | Neon direct (migrations) |
| `CORS_ORIGIN` | Backend | Frontend URL (e.g. `https://your-app.vercel.app`) |
| `PORT` | Backend | Provided by host (Railway, Render) |
| `VITE_API_URL` | Frontend (Vercel) | Backend URL for API calls |
| `VITE_SOCKET_URL` | Frontend (Vercel) | Backend URL for Socket.io |

---

## Pitfalls & Fixes

See [PITFALLS_AND_FIXES.md](PITFALLS_AND_FIXES.md) for details on:

- Neon PgBouncer and `SELECT FOR UPDATE`
- Race between purchase and expiry worker
- Double reservation prevention
- Cross-origin Socket.io
- Input validation and rate limiting
# Sneaker-Drop-System
