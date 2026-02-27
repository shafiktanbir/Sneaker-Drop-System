import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { prisma } from '../lib/prisma.js';

const originalAdminKey = process.env.ADMIN_API_KEY;
beforeAll(async () => {
  delete process.env.ADMIN_API_KEY;
  await prisma.$connect();
});

afterAll(async () => {
  if (originalAdminKey !== undefined) process.env.ADMIN_API_KEY = originalAdminKey;
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up test data: delete drops (cascades to reservations, purchases)
  await prisma.drop.deleteMany({});
});

describe('API Integration Tests', () => {
  describe('POST /api/drops', () => {
    it('creates a drop with valid body and returns 201', async () => {
      const res = await request(app)
        .post('/api/drops')
        .send({ name: 'Test Drop', price: 99.99, totalStock: 10 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Test Drop',
        price: '99.99',
        totalStock: 10,
      });
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/drops')
        .send({ price: 99.99, totalStock: 10 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when price is invalid', async () => {
      const res = await request(app)
        .post('/api/drops')
        .send({ name: 'Test', price: -1, totalStock: 10 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/drops', () => {
    it('returns 200 with array of drops', async () => {
      const res = await request(app).get('/api/drops');

      expect(res.status).toBe(200);
      expect(res.body.drops).toBeDefined();
      expect(Array.isArray(res.body.drops)).toBe(true);
    });

    it('includes created drop in list', async () => {
      await request(app)
        .post('/api/drops')
        .send({ name: 'Listed Drop', price: 50, totalStock: 5 });

      const res = await request(app).get('/api/drops');
      expect(res.status).toBe(200);
      const drop = res.body.drops.find((d) => d.name === 'Listed Drop');
      expect(drop).toBeDefined();
      expect(drop.availableStock).toBe(5);
    });
  });

  describe('Reserve flow', () => {
    it('reserves 1-stock drop as user1, user2 gets OUT_OF_STOCK', async () => {
      const createRes = await request(app)
        .post('/api/drops')
        .send({ name: 'Last Pair', price: 99, totalStock: 1 });
      expect(createRes.status).toBe(201);
      const dropId = createRes.body.id;

      const res1 = await request(app)
        .post('/api/reservations')
        .send({ dropId, username: 'alice' });
      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      expect(res1.body.reservation).toBeDefined();

      const res2 = await request(app)
        .post('/api/reservations')
        .send({ dropId, username: 'bob' });
      expect(res2.status).toBe(404);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error).toBe('OUT_OF_STOCK');
    });

    it('returns 400 for invalid username', async () => {
      const createRes = await request(app)
        .post('/api/drops')
        .send({ name: 'Test', price: 1, totalStock: 1 });
      const dropId = createRes.body.id;

      const res = await request(app)
        .post('/api/reservations')
        .send({ dropId, username: 'ab' }); // Too short

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Purchase flow', () => {
    it('purchases after successful reserve', async () => {
      const createRes = await request(app)
        .post('/api/drops')
        .send({ name: 'Buy Me', price: 50, totalStock: 1 });
      const dropId = createRes.body.id;

      const reserveRes = await request(app)
        .post('/api/reservations')
        .send({ dropId, username: 'buyer' });
      expect(reserveRes.status).toBe(201);
      const reservationId = reserveRes.body.reservation.id;

      const purchaseRes = await request(app)
        .post('/api/purchases')
        .send({ reservationId, username: 'buyer' });

      expect(purchaseRes.status).toBe(201);
      expect(purchaseRes.body.success).toBe(true);
      expect(purchaseRes.body.purchase).toBeDefined();
      expect(purchaseRes.body.purchase.User?.username).toBe('buyer');
    });

    it('returns error when purchasing without reservation', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .send({ reservationId: 99999, username: 'nobody' });

      expect(res.status).toBe(410);
      expect(res.body.error).toBe('RESERVATION_NOT_FOUND');
    });
  });

  describe('GET /api/health', () => {
    it('returns 200 with ok: true', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
