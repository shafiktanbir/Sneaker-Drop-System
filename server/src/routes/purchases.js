import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { purchase } from '../services/reservationService.js';
import { getAvailableStock, getDropsWithStock } from '../services/dropService.js';
import { getIo } from '../socket/index.js';

const router = Router();

const purchaseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'RATE_LIMIT', message: 'Too many requests. Please try again later.' },
});

router.post('/', purchaseLimiter, async (req, res) => {
  try {
    const { reservationId, username } = req.body;
    if (!reservationId || !username) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'reservationId and username are required',
      });
    }
    const result = await purchase(parseInt(reservationId, 10), username);
    if (!result.success) {
      if (result.error === 'RESERVATION_EXPIRED' || result.error === 'RESERVATION_NOT_FOUND')
        return res.status(410).json(result);
      if (result.error === 'UNAUTHORIZED') return res.status(403).json(result);
      if (result.error === 'CONCURRENT_UPDATE') return res.status(409).json(result);
      return res.status(400).json(result);
    }

    const dropId = result.purchase.dropId;
    const availableStock = await getAvailableStock(dropId);
    const drops = await getDropsWithStock();
    const dropData = drops.find((d) => d.id === dropId);
    const topPurchasers = dropData?.topPurchasers || [];

    const io = getIo();
    if (io) {
      io.emit('stockUpdated', { dropId, availableStock });
      io.emit('purchaseCompleted', {
        dropId,
        username: result.purchase.User?.username,
        topPurchasers,
      });
    }

    res.status(201).json(result);
  } catch (err) {
    console.error('POST /purchases error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to complete purchase' });
  }
});

export default router;
