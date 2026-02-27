import { z } from 'zod';

const optionalDate = z
  .union([z.string(), z.date()])
  .optional()
  .transform((v) => (v ? new Date(v) : undefined));

export const createDropSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(255),
    price: z.union([z.number().positive(), z.string()]).transform((v) => (typeof v === 'string' ? parseFloat(v) : v)).pipe(z.number().positive('Price must be positive')),
    totalStock: z.union([z.number().int().nonnegative(), z.string()]).transform((v) => (typeof v === 'string' ? parseInt(v, 10) : v)).pipe(z.number().int().nonnegative('totalStock must be a non-negative integer')),
    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.startsAt < data.endsAt, {
    message: 'startsAt must be before endsAt',
    path: ['endsAt'],
  });
