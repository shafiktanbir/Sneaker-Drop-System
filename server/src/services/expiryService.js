import { prisma } from '../lib/prisma.js';

const CHECK_INTERVAL_MS = 5000;

/**
 * Runs every 5 seconds. Finds expired active reservations, marks them expired,
 * and returns the list of affected dropIds for broadcasting.
 */
export async function expireReservations() {
  const now = new Date();
  const expired = await prisma.reservation.findMany({
    where: {
      status: 'active',
      expiresAt: { lt: now },
    },
  });

  const affectedDropIds = new Set();
  for (const r of expired) {
    await prisma.reservation.update({
      where: { id: r.id },
      data: { status: 'expired' },
    });
    affectedDropIds.add(r.dropId);
  }

  return Array.from(affectedDropIds);
}

export function startExpiryWorker(getIo, getStockForDrop) {
  const intervalId = setInterval(async () => {
    try {
      const dropIds = await expireReservations();
      const io = typeof getIo === 'function' ? getIo() : getIo;
      if (!io || dropIds.length === 0) return;

      for (const dropId of dropIds) {
        const availableStock = await getStockForDrop(dropId);
        io.emit('stockUpdated', { dropId, availableStock });
      }
    } catch (err) {
      console.error('[ExpiryWorker] Error:', err);
    }
  }, CHECK_INTERVAL_MS);

  return () => clearInterval(intervalId);
}
