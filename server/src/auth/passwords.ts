import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions,
) => Promise<Buffer>;

const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

/** Hash a password with scrypt and a random salt. Format: scrypt$N$r$p$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, PARAMS.keylen, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: MAXMEM });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // Spend comparable time so missing accounts are not distinguishable by timing.
    await hashPassword(password);
    return false;
  }
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const N = Number(n), R = Number(r), P = Number(p);
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N, r: R, p: P, maxmem: 128 * N * R * 2,
  });
  return crypto.timingSafeEqual(actual, expected);
}

export function passwordProblems(password: string, minLength: number): string | null {
  if (password.length < minLength) return `Password must be at least ${minLength} characters.`;
  if (password.length > 200) return 'Password is too long.';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) return 'Use at least three of: lowercase, uppercase, numbers, symbols.';
  return null;
}

export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
