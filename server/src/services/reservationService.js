import { prisma } from '../lib/prisma.js';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,50}$/;

function validateUsername(username) {
  if (!username || typeof username !== 'string') return false;
  return USERNAME_REGEX.test(username.trim());
}

async function getOrCreateUser(username) {
  const trimmed = username.trim();
  const user = await prisma.user.upsert({
    where: { username: trimmed },
    create: { username: trimmed },
    update: {},
  });
  return user;
}

function isDropActive(drop) {
  const now = new Date();
  if (drop.startsAt && drop.startsAt > now) return false;
  if (drop.endsAt && drop.endsAt < now) return false;
  return true;
}

/**
 * Atomic reservation. Prevents overselling even when 100 users click Reserve
 * for the last item at the same millisecond — only 1 succeeds.
 *
 * How it works:
 * 1. SELECT ... FOR UPDATE locks the Drop row; concurrent requests wait in queue.
 * 2. available = totalStock - active reservations - purchases (inside transaction).
 * 3. If available >= 1, create reservation with expiresAt = now + 60s.
 * 4. Transaction commits → lock released; next waiter sees updated counts.
 *
 * Reservation lasts 60 seconds; expiry worker marks them expired every 5s.
 */
export async function reserve(dropId, username) {
  if (!validateUsername(username)) {
    return { success: false, error: 'INVALID_USERNAME', message: 'Username must be 3-50 alphanumeric characters' };
  }

  const user = await getOrCreateUser(username);

  try {
    return await prisma.$transaction(async (tx) => {
      const [drop] = await tx.$queryRaw`SELECT * FROM "Drops" WHERE id = ${dropId} FOR UPDATE`;
      if (!drop) {
        return { success: false, error: 'DROP_NOT_FOUND' };
      }
      if (!isDropActive(drop)) {
        return { success: false, error: 'DROP_NOT_ACTIVE', message: 'This drop is not currently active' };
      }

      const existing = await tx.reservation.findFirst({
        where: { dropId, userId: user.id, status: 'active' },
      });
      if (existing) {
        const newExpiresAt = new Date(Date.now() + 60000);
        await tx.reservation.update({
          where: { id: existing.id },
          data: { expiresAt: newExpiresAt },
        });
        return {
          success: true,
          reservation: { ...existing, expiresAt: newExpiresAt },
          extended: true,
        };
      }

      const [reservedCount, purchasedCount] = await Promise.all([
        tx.reservation.count({ where: { dropId, status: 'active' } }),
        tx.purchase.count({ where: { dropId } }),
      ]);
      const available = Number(drop.totalStock) - reservedCount - purchasedCount;

      if (available < 1) {
        return { success: false, error: 'OUT_OF_STOCK', message: 'This item is sold out' };
      }

      const reservation = await tx.reservation.create({
        data: {
          dropId,
          userId: user.id,
          status: 'active',
          expiresAt: new Date(Date.now() + 60000),
        },
      });

      return { success: true, reservation };
    }, { timeout: 15000 });
  } catch (err) {
    if (err.code === 'P2034' || err.meta?.code === '40P01' || err.meta?.code === '55P03') {
      return { success: false, error: 'CONCURRENT_UPDATE', message: 'Another user just took this item. Please try again.' };
    }
    if (err.code === 'P2028' || err.code === 'P2024') {
      return { success: false, error: 'CONCURRENT_UPDATE', message: 'Server busy. Please try again.' };
    }
    throw err;
  }
}

/**
 * Purchase: only allowed for user's active reservation. Atomic.
 */
export async function purchase(reservationId, username) {
  if (!validateUsername(username)) {
    return { success: false, error: 'INVALID_USERNAME', message: 'Username must be 3-50 alphanumeric characters' };
  }

  const user = await getOrCreateUser(username);

  try {
    return await prisma.$transaction(async (tx) => {
      const [reservationRow] = await tx.$queryRaw`SELECT r.*, d."price" as "dropPrice" FROM "Reservations" r JOIN "Drops" d ON r."dropId" = d.id WHERE r.id = ${reservationId} FOR UPDATE`;
      if (!reservationRow) {
        return { success: false, error: 'RESERVATION_NOT_FOUND' };
      }
      if (reservationRow.userId !== user.id) {
        return { success: false, error: 'UNAUTHORIZED', message: 'This reservation belongs to another user' };
      }
      if (reservationRow.status !== 'active') {
        return { success: false, error: 'RESERVATION_EXPIRED', message: 'Your reservation has expired' };
      }
      if (new Date() > reservationRow.expiresAt) {
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'expired' },
        });
        return { success: false, error: 'RESERVATION_EXPIRED', message: 'Your reservation has expired' };
      }

      await tx.purchase.create({
        data: {
          dropId: reservationRow.dropId,
          userId: user.id,
          reservationId: reservationRow.id,
          amountPaid: reservationRow.dropPrice,
        },
      });
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'completed' },
      });

      const purchaseRecord = await tx.purchase.findFirst({
        where: { reservationId },
        include: { user: { select: { username: true } } },
      });

      return {
        success: true,
        purchase: {
          ...purchaseRecord,
          User: purchaseRecord.user,
        },
      };
    }, { timeout: 15000 });
  } catch (err) {
    if (err.code === 'P2034' || err.meta?.code === '40P01' || err.meta?.code === '55P03') {
      return { success: false, error: 'CONCURRENT_UPDATE', message: 'Another user just took this item. Please try again.' };
    }
    if (err.code === 'P2028' || err.code === 'P2024') {
      return { success: false, error: 'CONCURRENT_UPDATE', message: 'Server busy. Please try again.' };
    }
    throw err;
  }
}
