/**
 * Express app factory. Used by index.js and tests.
 * Exported for supertest integration tests.
 */
import express from 'express';
import cors from 'cors';
import dropsRouter from './routes/drops.js';
import reservationsRouter from './routes/reservations.js';
import purchasesRouter from './routes/purchases.js';
import { logger } from './lib/logger.js';

const corsOriginRaw = process.env.CORS_ORIGIN || 'http://localhost:5173';
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

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/drops', dropsRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/purchases', purchasesRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Global error handler - must be after all routes
app.use((err, req, res, next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
});

export default app;
