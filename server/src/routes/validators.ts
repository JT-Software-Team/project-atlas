import { z } from 'zod';

/** Optional trimmed text; empty strings become null. */
export const optText = (max = 500) =>
  z.string().trim().max(max, `Keep this under ${max} characters.`).nullish().transform((v) => (v ? v : null));

export const optDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), 'Use a valid date.');

export const optId = z.coerce.number().int().positive().nullish().transform((v) => v ?? null);
