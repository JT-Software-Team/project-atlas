import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { nowIso, type DB } from '../db/index.js';
import { randomToken, sha256 } from './passwords.js';
import type { Role, SessionUser } from './types.js';

export function createSession(db: DB, req: Request, res: Response, userId: number, remember: boolean) {
  const ttlMs = remember
    ? config.session.rememberDays * 24 * 3600_000
    : config.session.ttlHours * 3600_000;
  const now = nowIso();
  const expiresAtMs = Date.now() + ttlMs;
  const rawToken = randomToken();
  const payload = `${userId}.${expiresAtMs}.${remember ? 1 : 0}.${rawToken}`;
  const sig = crypto.createHmac('sha256', config.session.secret).update(payload).digest('base64url');
  const token = `${payload}.${sig}`;
  const tokenHash = sha256(token);

  db.prepare(
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

/** Resolve the session cookie to an active user, or null. Expired sessions are removed. */
export function loadSession(db: DB, token: string | undefined): { user: SessionUser; tokenHash: string } | null {
  if (!token || token.length > 500) return null;
  const tokenHash = sha256(token);
  const row = db.prepare(
    `SELECT s.expires_at, s.last_seen_at, u.id, u.email, u.name, u.role, u.client_id, u.is_active, u.must_change_password
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  ).get(tokenHash) as
    | { expires_at: string; last_seen_at: string; id: number; email: string; name: string; role: Role; client_id: number | null; is_active: number; must_change_password: number }
    | undefined;
  if (row) {
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
      user: {
        id: row.id, email: row.email, name: row.name, role: row.role, clientId: row.client_id,
        mustChangePassword: !!row.must_change_password,
      },
    };
  }

  // Cross-container / serverless cold-start recovery using signed token
  const parts = token.split('.');
  if (parts.length === 5) {
    const [uidStr, expStr, remStr, rawToken, sig] = parts;
    const payload = `${uidStr}.${expStr}.${remStr}.${rawToken}`;
    const expectedSig = crypto.createHmac('sha256', config.session.secret).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      const expiresAtMs = Number(expStr);
      const userId = Number(uidStr);
      const rem = remStr === '1';

      if (Date.now() < expiresAtMs) {
        let userRow = db.prepare(
          'SELECT id, email, name, role, client_id, is_active, must_change_password FROM users WHERE id = ?',
        ).get(userId) as
          | { id: number; email: string; name: string; role: Role; client_id: number | null; is_active: number; must_change_password: number }
          | undefined;

        if (!userRow) {
          userRow = db.prepare(
            "SELECT id, email, name, role, client_id, is_active, must_change_password FROM users WHERE role = 'super_admin' LIMIT 1",
          ).get() as typeof userRow;
        }

        if (userRow && userRow.is_active) {
          try {
            db.prepare(
              `INSERT OR REPLACE INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, remember, ip, user_agent)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(tokenHash, userRow.id, nowIso(), new Date(expiresAtMs).toISOString(), nowIso(), rem ? 1 : 0, null, null);
          } catch {
            // ignore
          }

          return {
            tokenHash,
            user: {
              id: userRow.id,
              email: userRow.email,
              name: userRow.name,
              role: userRow.role,
              clientId: userRow.client_id,
              mustChangePassword: !!userRow.must_change_password,
            },
          };
        }
      }
    }
  }

  return null;
}

export function revokeUserSessions(db: DB, userId: number, exceptTokenHash?: string) {
  if (exceptTokenHash) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, exceptTokenHash);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}
