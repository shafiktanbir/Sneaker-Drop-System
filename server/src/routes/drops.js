import { Router } from 'express';
import { createDrop, getDropsWithStock } from '../services/dropService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const username = req.query.username?.trim() || null;
    const drops = await getDropsWithStock(username);
    res.json({ drops });
  } catch (err) {
    console.error('GET /drops error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch drops' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, price, totalStock, startsAt, endsAt } = req.body;
    if (!name || price == null || totalStock == null) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'name, price, and totalStock are required',
      });
    }
    const drop = await createDrop({ name, price, totalStock, startsAt, endsAt });
    res.status(201).json(drop);
  } catch (err) {
    console.error('POST /drops error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create drop' });
  }
});

export default router;
