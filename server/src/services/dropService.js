import { prisma } from '../lib/prisma.js';

export async function createDrop({ name, price, totalStock, startsAt, endsAt }) {
  const now = new Date();
  const drop = await prisma.drop.create({
    data: {
      name,
      price: parseFloat(price),
      totalStock: parseInt(totalStock, 10),
      startsAt: startsAt ? new Date(startsAt) : now,
      endsAt: endsAt ? new Date(endsAt) : null,
    },
  });
  return drop;
}

export async function getAvailableStock(dropId) {
  const drop = await prisma.drop.findUnique({
    where: { id: dropId },
  });
  if (!drop) return null;

  const [reservedCount, purchasedCount] = await Promise.all([
    prisma.reservation.count({ where: { dropId, status: 'active' } }),
    prisma.purchase.count({ where: { dropId } }),
  ]);
  return Math.max(0, drop.totalStock - reservedCount - purchasedCount);
}

export async function getDropsWithStock(username = null) {
  const drops = await prisma.drop.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const result = [];
  const trimmedUsername = username?.trim() || null;

  for (const drop of drops) {
    if (drop.startsAt && drop.startsAt > now) continue;
    if (drop.endsAt && drop.endsAt < now) continue;

    const [reservedCount, purchasedCount, topPurchases, userReservation] = await Promise.all([
      prisma.reservation.count({ where: { dropId: drop.id, status: 'active' } }),
      prisma.purchase.count({ where: { dropId: drop.id } }),
      prisma.purchase.findMany({
        where: { dropId: drop.id },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      trimmedUsername
        ? prisma.reservation.findFirst({
            where: {
              dropId: drop.id,
              status: 'active',
              expiresAt: { gt: now },
              user: { username: trimmedUsername },
            },
          })
        : Promise.resolve(null),
    ]);

    const availableStock = Math.max(0, drop.totalStock - reservedCount - purchasedCount);
    const topPurchasers = topPurchases.map((p) => ({
      username: p.user?.username || 'Unknown',
      purchasedAt: p.createdAt,
    }));

    result.push({
      ...drop,
      availableStock,
      topPurchasers,
      userReservation: userReservation
        ? { id: userReservation.id, expiresAt: userReservation.expiresAt }
        : null,
    });
  }

  return result;
}
