import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { prisma } from './lib/prisma.js';
import { setIo } from './socket/index.js';
import app from './app.js';
import { logger } from './lib/logger.js';
import { startExpiryWorker } from './services/expiryService.js';
import { getAvailableStock } from './services/dropService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const corsOriginRaw = process.env.CORS_ORIGIN || 'http://localhost:5173';

const httpServer = createServer(app);

const corsOrigins = corsOriginRaw.split(',').map((o) => o.trim()).filter(Boolean);
function isOriginAllowed(origin) {
  if (!origin) return true;
  return corsOrigins.some((allowed) => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\./g, '\\.').replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return origin === allowed;
  });
}

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

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, '[Socket] Client connected');
  socket.on('disconnect', () => logger.info({ socketId: socket.id }, '[Socket] Client disconnected'));
});

const PORT = process.env.PORT || 3001;

async function main() {
  try {
    await prisma.$connect();
    logger.info('[DB] Connected to PostgreSQL');

    startExpiryWorker(() => io, getAvailableStock);
    logger.info('[Expiry] Worker started (runs every 5s)');

    httpServer.listen(PORT, () => {
      logger.info(`[Server] Running at http://localhost:${PORT}`);
      logger.info(`[CORS] Allowed origins: ${corsOriginRaw}`);
      if (process.env.NODE_ENV === 'production' && corsOriginRaw.includes('localhost')) {
        logger.warn('[CORS] WARNING: CORS_ORIGIN contains localhost. Set it to your production frontend URL (e.g. https://your-app.vercel.app) in Render.');
      }
    });
  } catch (err) {
    logger.error({ err }, '[Server] Startup failed');
    process.exit(1);
  }
}

main();
