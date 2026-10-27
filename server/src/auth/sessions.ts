import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { nowIso, type DB } from '../db/index.js';
import { randomToken, sha256 } from './passwords.js';
import type { Role, SessionUser } from './types.js';

export async function createSession(db: DB, req: Request, res: Response, userId: number, remember: boolean) {
  const ttlMs = remember
    ? config.session.rememberDays * 24 * 3600_000
    : config.session.ttlHours * 3600_000;
  const now = nowIso();
  const expiresAtMs = Date.now() + ttlMs;
  const rawToken = randomToken();
  const payload = `${userId}.${expiresAtMs}.${remember ? 1 : 0}.${rawToken}`;
  const token = `${payload}.${sign(payload)}`;
  const tokenHash = sha256(token);

  await db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, remember, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(tokenHash, userId, now, new Date(expiresAtMs).toISOString(), now, remember ? 1 : 0,
    req.ip ?? null, (req.get('user-agent') ?? '').slice(0, 300));
  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/',
    // Without "remember me" the cookie ends with the browser session; the server-side expiry still applies.
    ...(remember ? { maxAge: ttlMs } : {}),
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(config.session.cookieName, { path: '/', httpOnly: true, secure: config.secureCookies, sameSite: 'lax' });
}

const sign = (payload: string) => crypto.createHmac('sha256', config.session.secret).update(payload).digest('base64url');

/** True when the cookie carries a valid signature from this deployment's ATLAS_SESSION_SECRET. */
function hasValidSignature(token: string): boolean {
  const cut = token.lastIndexOf('.');
  if (cut <= 0) return false;
  const given = Buffer.from(token.slice(cut + 1));
  const expected = Buffer.from(sign(token.slice(0, cut)));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Resolve the session cookie to an active user, or null. A session is valid only if the cookie is signed
 * with the current secret AND a matching, unexpired row exists for an active user. There is no fallback:
 * forged, unknown, expired or orphaned sessions are rejected. Expired sessions are removed.
 */
export async function loadSession(db: DB, token: string | undefined): Promise<{ user: SessionUser; tokenHash: string } | null> {
  if (!token || token.length > 500 || !hasValidSignature(token)) return null;
  const tokenHash = sha256(token);
  const row = await db.prepare(
    `SELECT s.expires_at, s.last_seen_at, u.id, u.email, u.name, u.role, u.client_id, u.is_active, u.must_change_password
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  ).get(tokenHash) as
    | { expires_at: string; last_seen_at: string; id: number; email: string; name: string; role: Role; client_id: number | null; is_active: number; must_change_password: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= nowIso() || !row.is_active) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  // Touch at most once a minute to limit writes.
  if (Date.now() - Date.parse(row.last_seen_at) > 60_000) {
    await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(nowIso(), tokenHash);
  }
  return {
    tokenHash,
    user: {
      id: row.id, email: row.email, name: row.name, role: row.role, clientId: row.client_id,
      mustChangePassword: !!row.must_change_password,
    },
  };
}

export async function revokeUserSessions(db: DB, userId: number, exceptTokenHash?: string) {
  if (exceptTokenHash) {
    await db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, exceptTokenHash);
  } else {
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}
