import { z } from 'zod';

const usernameSchema = z
  .string()
  .min(3, 'Username must be 3-50 characters')
  .max(50)
  .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric (letters, numbers, underscore only)');

export const createPurchaseSchema = z.object({
  reservationId: z.union([z.number().int().positive(), z.string()]).transform((v) => (typeof v === 'string' ? parseInt(v, 10) : v)).pipe(z.number().int().positive('reservationId must be a positive integer')),
  username: usernameSchema,
});
