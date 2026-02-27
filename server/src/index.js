import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { prisma } from './lib/prisma.js';
import { setIo } from './socket/index.js';
import dropsRouter from './routes/drops.js';
import reservationsRouter from './routes/reservations.js';
import purchasesRouter from './routes/purchases.js';
import { startExpiryWorker } from './services/expiryService.js';
import { getAvailableStock } from './services/dropService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const httpServer = createServer(app);

// CORS: comma-separated origins; supports wildcard e.g. https://*.vercel.app for preview deployments
const corsOriginRaw = process.env.CORS_ORIGIN || 'http://localhost:5173';
const corsOrigins = corsOriginRaw.split(',').map((o) => o.trim()).filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true; // Same-origin or non-browser (curl, etc.)
  return corsOrigins.some((allowed) => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\./g, '\\.').replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return origin === allowed;
  });
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});
setIo(io);

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/drops', dropsRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/purchases', purchasesRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);
  socket.on('disconnect', () => console.log('[Socket] Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3001;

async function main() {
  try {
    await prisma.$connect();
    console.log('[DB] Connected to PostgreSQL');

    startExpiryWorker(() => io, getAvailableStock);
    console.log('[Expiry] Worker started (runs every 5s)');

    httpServer.listen(PORT, () => {
      console.log(`[Server] Running at http://localhost:${PORT}`);
      console.log(`[CORS] Allowed origins: ${corsOriginRaw}`);
      if (process.env.NODE_ENV === 'production' && corsOriginRaw.includes('localhost')) {
        console.warn('[CORS] WARNING: CORS_ORIGIN contains localhost. Set it to your production frontend URL (e.g. https://your-app.vercel.app) in Render.');
      }
    });
  } catch (err) {
    console.error('[Server] Startup failed:', err);
    process.exit(1);
  }
}

main();
