import { z } from 'zod';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Short administrator handles such as `atlas@admin`: no dot required after the @. */
const HANDLE = /^[a-z0-9][a-z0-9._-]{0,63}@[a-z0-9][a-z0-9-]{0,62}$/i;

/** Accounts sign in with an email address or, for provisioned administrators, a `name@realm` handle. */
export const isLoginId = (value: string) => value.length <= 254 && (EMAIL.test(value) || HANDLE.test(value));

export const loginId = z.string().trim().toLowerCase().max(254)
  .refine(isLoginId, 'Enter a valid email address or user ID.');
