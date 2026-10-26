import type { Request, Response } from 'express';
import { config } from '../config.js';
import { nowIso, type DB } from '../db/index.js';
import { randomToken, sha256 } from './passwords.js';
import type { Role, SessionUser } from './types.js';

export function createSession(db: DB, req: Request, res: Response, userId: number, remember: boolean) {
  const token = randomToken();
  const ttlMs = remember
    ? config.session.rememberDays * 24 * 3600_000
    : config.session.ttlHours * 3600_000;
  const now = nowIso();
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, remember, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(sha256(token), userId, now, new Date(Date.now() + ttlMs).toISOString(), now, remember ? 1 : 0,
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

/** Resolve the session cookie to an active user, or null. Expired sessions are removed. */
export function loadSession(db: DB, token: string | undefined): { user: SessionUser; tokenHash: string } | null {
  if (!token || token.length > 200) return null;
  const tokenHash = sha256(token);
  const row = db.prepare(
    `SELECT s.expires_at, s.last_seen_at, u.id, u.email, u.name, u.role, u.client_id, u.is_active
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  ).get(tokenHash) as
    | { expires_at: string; last_seen_at: string; id: number; email: string; name: string; role: Role; client_id: number | null; is_active: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= nowIso() || !row.is_active) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  // Touch at most once a minute to limit writes.
  if (Date.now() - Date.parse(row.last_seen_at) > 60_000) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(nowIso(), tokenHash);
  }
  return {
    tokenHash,
    user: { id: row.id, email: row.email, name: row.name, role: row.role, clientId: row.client_id },
  };
}

export function revokeUserSessions(db: DB, userId: number, exceptTokenHash?: string) {
  if (exceptTokenHash) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, exceptTokenHash);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}
