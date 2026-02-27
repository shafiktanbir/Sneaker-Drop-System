import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { reserve } from '../services/reservationService.js';
import { getAvailableStock } from '../services/dropService.js';
import { prisma } from '../lib/prisma.js';
import { getIo } from '../socket/index.js';

const router = Router();

const reserveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'RATE_LIMIT', message: 'Too many requests. Please try again later.' },
});

router.post('/', reserveLimiter, async (req, res) => {
  try {
    const { dropId, username } = req.body;
    if (!dropId || !username) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'dropId and username are required',
      });
    }
    const result = await reserve(parseInt(dropId, 10), username);
    if (!result.success) {
      const status =
        result.error === 'OUT_OF_STOCK' || result.error === 'DROP_NOT_FOUND' ? 404 : 400;
      if (result.error === 'CONCURRENT_UPDATE') return res.status(409).json(result);
      return res.status(status).json(result);
    }

    const availableStock = await getAvailableStock(result.reservation.dropId);
    const io = getIo();
    if (io) io.emit('stockUpdated', { dropId: result.reservation.dropId, availableStock });

    res.status(201).json(result);
  } catch (err) {
    console.error('POST /reservations error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to reserve' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(req.params.id, 10) },
      select: { id: true, dropId: true, status: true, expiresAt: true, userId: true },
    });
    if (!reservation) return res.status(404).json({ error: 'NOT_FOUND' });
    if (reservation.status !== 'active' || new Date() > reservation.expiresAt) {
      return res.status(410).json({ error: 'EXPIRED', message: 'Reservation has expired' });
    }
    res.json(reservation);
  } catch (err) {
    console.error('GET /reservations/:id error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
