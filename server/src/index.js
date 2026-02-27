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

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const io = new Server(httpServer, {
  cors: { origin: corsOrigin.split(',').map((o) => o.trim()), credentials: true },
  transports: ['websocket', 'polling'],
});
setIo(io);

app.use(cors({ origin: corsOrigin.split(',').map((o) => o.trim()) }));
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
    });
  } catch (err) {
    console.error('[Server] Startup failed:', err);
    process.exit(1);
  }
}

main();
