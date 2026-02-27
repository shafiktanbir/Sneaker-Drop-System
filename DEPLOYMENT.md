# Deployment Guide: Render (Backend) + Vercel (Frontend)

Step-by-step instructions to deploy the Sneaker Drop system.

---

## Prerequisites

1. **GitHub** – Push your code to a GitHub repository
2. **Neon** – Create a PostgreSQL database at [neon.tech](https://neon.tech)
3. **Render** – Sign up at [render.com](https://render.com)
4. **Vercel** – Sign up at [vercel.com](https://vercel.com)

---

## Part 1: Database (Neon)

1. Create a new project at Neon
2. Go to **Dashboard → Connection Details**
3. Copy both URLs:
   - **Pooled connection** → `DATABASE_URL` (host contains `-pooler`)
   - **Direct connection** → `DIRECT_URL` (host without `-pooler`)
4. Add `?sslmode=require` to both URLs if not present

---

## Part 2: Backend on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New → Web Service**
3. Connect your GitHub repo and select the repository
4. Configure:
   - **Name:** `sneaker-drop-api` (or any name)
   - **Region:** Choose closest to your users
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `npx prisma migrate deploy && node src/index.js`

5. **Environment Variables** (Add in Render dashboard):
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Your Neon **pooled** connection URL |
   | `DIRECT_URL` | Your Neon **direct** connection URL |
   | `CORS_ORIGIN` | Leave empty for now; add after Vercel deploy (e.g. `https://your-app.vercel.app`) |
   | `NODE_ENV` | `production` (optional; Render may set this) |

6. Click **Create Web Service**
7. Wait for deploy; note your backend URL (e.g. `https://sneaker-drop-api.onrender.com`)

---

## Part 3: Frontend on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New → Project**
3. Import your GitHub repository
4. Configure:
   - **Root Directory:** `client` (click Edit, set to `client`)
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

5. **Environment Variables** (Add before deploying):
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | Your Render backend URL (e.g. `https://sneaker-drop-api.onrender.com`) |
   | `VITE_SOCKET_URL` | Same as `VITE_API_URL` |

6. Click **Deploy**
7. Note your frontend URL (e.g. `https://sneaker-drop.vercel.app`)

---

## Part 4: Connect Backend to Frontend (CORS)

1. Go back to **Render → Your Service → Environment**
2. Set `CORS_ORIGIN` to your Vercel URL:
   ```
   https://sneaker-drop.vercel.app
   ```
3. If you have multiple origins (e.g. preview deployments), use comma-separated:
   ```
   https://sneaker-drop.vercel.app,https://sneaker-drop-*.vercel.app
   ```
4. Save; Render will auto-redeploy

---

## Part 5: Create Your First Drop

After both services are live:

```bash
curl -X POST https://YOUR-RENDER-URL.onrender.com/api/drops \
  -H "Content-Type: application/json" \
  -d '{"name":"Air Jordan 1","price":199.99,"totalStock":100}'
```

Or use Postman / Thunder Client with the same request.

---

## Troubleshooting

### CORS errors in browser
- Ensure `CORS_ORIGIN` in Render exactly matches your Vercel URL (including `https://`, no trailing slash)
- Redeploy the backend after changing env vars

### Socket.io not connecting
- `VITE_SOCKET_URL` must match your Render backend URL
- Render supports WebSockets; no extra config needed

### Database connection failed
- Use **pooled** URL for `DATABASE_URL` with Neon
- Use **direct** URL for `DIRECT_URL` (migrations require direct connection)
- Ensure both have `?sslmode=require` for Neon

### 502 Bad Gateway on Render
- Check Render logs for errors
- Ensure `npx prisma migrate deploy` succeeds (migrations run on each deploy)
- Verify `DATABASE_URL` and `DIRECT_URL` are correct

---

## Environment Variables Summary

| Variable | Where | Required |
|----------|-------|----------|
| `DATABASE_URL` | Render | Yes |
| `DIRECT_URL` | Render | Yes |
| `CORS_ORIGIN` | Render | Yes (your Vercel URL) |
| `VITE_API_URL` | Vercel | Yes |
| `VITE_SOCKET_URL` | Vercel | Yes |

**Important:** Never commit `.env` or credentials. Use the dashboard environment variables only.
