import { Router } from 'express';
import { createDrop, getDropsWithStock } from '../services/dropService.js';
import { requireApiKey } from '../middleware/requireApiKey.js';
import { createDropSchema } from '../validators/drop.js';
import { formatZodError } from '../validators/index.js';
import { logger } from '../lib/logger.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const username = req.query.username?.trim() || null;
    const drops = await getDropsWithStock(username);
    res.json({ drops });
  } catch (err) {
    logger.error({ err }, 'GET /drops error');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch drops' });
  }
});

router.post('/', requireApiKey, async (req, res) => {
  try {
    const parsed = createDropSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: formatZodError(parsed.error),
      });
    }
    const drop = await createDrop(parsed.data);
    res.status(201).json(drop);
  } catch (err) {
    logger.error({ err }, 'POST /drops error');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create drop' });
  }
});

export default router;
