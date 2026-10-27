import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { nowIso, transaction, type DB } from '../db/index.js';
import { ah, HttpError } from '../http.js';
import { hashPassword, passwordProblems, randomToken, sha256, verifyPassword } from '../auth/passwords.js';
import { RateLimiter } from '../auth/rateLimit.js';
import { clearSessionCookie, createSession, revokeUserSessions } from '../auth/sessions.js';
import { loginId } from '../auth/loginId.js';
import { requireAuth } from '../auth/middleware.js';
import { audit } from '../services/audit.js';
import type { Mailer } from '../services/mailer.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

/** Issue a single-use password token (reset or invite). Returns the raw token for the link. */
export async function issuePasswordToken(db: DB, userId: number, purpose: 'reset' | 'invite'): Promise<string> {
  const token = randomToken();
  const ttl = purpose === 'invite' ? config.auth.inviteTokenHours * 3600_000 : config.auth.resetTokenMinutes * 60_000;
  await db.prepare('UPDATE password_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(nowIso(), userId);
  await db.prepare('INSERT INTO password_tokens (token_hash, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(sha256(token), userId, purpose, nowIso(), new Date(Date.now() + ttl).toISOString());
  return token;
}

export const passwordLink = (token: string) => `${config.appUrl}/reset-password#token=${token}`;

export function authRoutes(db: DB, mailer: Mailer) {
  const r = Router();
  const loginByIp = new RateLimiter(20, 15 * 60_000);
  const forgotByIp = new RateLimiter(5, 15 * 60_000);
  const resetByIp = new RateLimiter(10, 15 * 60_000);

  r.post('/login', ah(async (req, res) => {
    const wait = loginByIp.hit(req.ip ?? 'unknown');
    if (wait) {
      res.set('Retry-After', String(wait));
      throw new HttpError(429, 'Too many sign-in attempts. Please wait a few minutes and try again.');
    }
    const body = z.object({
      email: loginId,
      password: z.string().min(1, 'Enter your password.').max(200),
      remember: z.boolean().optional(),
    }).parse(req.body);

    const user = await db.prepare(
      'SELECT id, name, password_hash, is_active, failed_attempts, locked_until FROM users WHERE email = ?',
    ).get(body.email) as
      | { id: number; name: string; password_hash: string | null; is_active: number; failed_attempts: number; locked_until: string | null }
      | undefined;

    // Lockout applies to every account, administrators included.
    if (user?.locked_until && user.locked_until > nowIso()) {
      await verifyPassword(body.password, null);
      throw new HttpError(423, 'This account is temporarily locked after repeated failed attempts. Try again later or reset your password.');
    }

    const ok = await verifyPassword(body.password, user?.password_hash ?? null);
    if (!user || !ok) {
      if (user) {
        const attempts = user.failed_attempts + 1;
        const lock = attempts >= config.auth.maxFailedAttempts
          ? new Date(Date.now() + config.auth.lockoutMinutes * 60_000).toISOString()
          : null;
        await db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
          .run(lock ? 0 : attempts, lock, user.id);
        await audit(db, req, { action: 'auth.login_failed', summary: lock ? 'Failed sign-in; account locked temporarily' : 'Failed sign-in', entityType: 'user', entityId: user.id }, { id: user.id, name: user.name });
      }
      throw new HttpError(401, 'The email/user ID or password is incorrect.');
    }
    if (!user.is_active) {
      throw new HttpError(403, 'Your access to Project Atlas has been disabled. Contact your Janyutech administrator.');
    }

    await db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
    await createSession(db, req, res, user.id, !!body.remember);
    await audit(db, req, { action: 'auth.login', summary: 'Signed in', entityType: 'user', entityId: user.id }, { id: user.id, name: user.name });
    res.json({ ok: true });
  }));

  r.post('/logout', ah(async (req, res) => {
    if (req.sessionTokenHash) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
    clearSessionCookie(res);
    res.json({ ok: true });
  }));

  r.get('/me', requireAuth, ah(async (req, res) => {
    const u = await db.prepare(
      `SELECT u.id, u.email, u.name, u.role, u.client_id, cl.name AS client_name, u.last_login_at, u.must_change_password
         FROM users u LEFT JOIN clients cl ON cl.id = u.client_id WHERE u.id = ?`,
    ).get(req.user!.id) as Record<string, unknown>;
    res.json({
      user: {
        id: u.id, email: u.email, name: u.name, role: u.role,
        clientId: u.client_id, clientName: u.client_name, lastLoginAt: u.last_login_at,
        mustChangePassword: !!u.must_change_password,
      },
    });
  }));

  r.post('/forgot', ah(async (req, res) => {
    const generic = { ok: true, message: 'If an active account exists for that email, a reset link has been sent.' };
    if (forgotByIp.hit(req.ip ?? 'unknown')) throw new HttpError(429, 'Too many requests. Please wait a few minutes.');
    const body = z.object({ email }).parse(req.body);
    const user = await db.prepare('SELECT id, name, email, is_active FROM users WHERE email = ?').get(body.email) as
      { id: number; name: string; email: string; is_active: number } | undefined;
    if (user?.is_active) {
      const token = await issuePasswordToken(db, user.id, 'reset');
      await mailer.send({
        to: user.email,
        subject: 'Reset your Project Atlas password',
        text: `Hello ${user.name},\n\nUse this link to choose a new password. It expires in ${config.auth.resetTokenMinutes} minutes and can be used once:\n\n${passwordLink(token)}\n\nIf you did not request this, you can ignore this email.\n\n— Janyutech Project Atlas`,
      });
      await audit(db, req, { action: 'auth.reset_requested', summary: 'Password reset requested', entityType: 'user', entityId: user.id }, { id: user.id, name: user.name });
    }
    res.json(generic);
  }));

  const tokenRow = async (token: string) => await db.prepare(
    `SELECT t.token_hash, t.user_id, t.purpose, t.expires_at, t.used_at, u.name, u.email, u.is_active
       FROM password_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`,
  ).get(sha256(token)) as
    | { token_hash: string; user_id: number; purpose: 'reset' | 'invite'; expires_at: string; used_at: string | null; name: string; email: string; is_active: number }
    | undefined;

  const validToken = async (token: string) => {
    const row = await tokenRow(token);
    if (!row || row.used_at || row.expires_at <= nowIso() || !row.is_active) return null;
    return row;
  };

  r.post('/reset/check', ah(async (req, res) => {
    if (resetByIp.hit(req.ip ?? 'unknown')) throw new HttpError(429, 'Too many requests. Please wait a few minutes.');
    const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
    const row = await validToken(token);
    if (!row) throw new HttpError(400, 'This link is invalid or has expired. Request a new one.');
    res.json({ purpose: row.purpose, name: row.name, email: row.email });
  }));

  r.post('/reset', ah(async (req, res) => {
    if (resetByIp.hit(req.ip ?? 'unknown')) throw new HttpError(429, 'Too many requests. Please wait a few minutes.');
    const body = z.object({ token: z.string().min(10).max(200), password: z.string().max(200) }).parse(req.body);
    const row = await validToken(body.token);
    if (!row) throw new HttpError(400, 'This link is invalid or has expired. Request a new one.');
    const problem = passwordProblems(body.password, config.auth.minPasswordLength);
    if (problem) throw new HttpError(400, problem, { field: 'password' });
    const hash = await hashPassword(body.password);
    await transaction(db, async () => {
      await db.prepare('UPDATE password_tokens SET used_at = ? WHERE token_hash = ?').run(nowIso(), row.token_hash);
      await db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
        .run(hash, nowIso(), row.user_id);
      await revokeUserSessions(db, row.user_id);
    });
    await audit(db, req, {
      action: row.purpose === 'invite' ? 'auth.invite_accepted' : 'auth.password_reset',
      summary: row.purpose === 'invite' ? 'Accepted invitation and set password' : 'Password reset completed',
      entityType: 'user', entityId: row.user_id,
    }, { id: row.user_id, name: row.name });
    res.json({ ok: true });
  }));

  r.post('/change-password', requireAuth, ah(async (req, res) => {
    const body = z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) }).parse(req.body);
    const user = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string | null };
    if (!(await verifyPassword(body.currentPassword, user.password_hash))) {
      throw new HttpError(400, 'Your current password is incorrect.', { field: 'currentPassword' });
    }
    const problem = body.newPassword === body.currentPassword
      ? 'Choose a password different from your current one.'
      : passwordProblems(body.newPassword, config.auth.minPasswordLength);
    if (problem) throw new HttpError(400, problem, { field: 'newPassword' });
    await db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?').run(await hashPassword(body.newPassword), nowIso(), req.user!.id);
    await revokeUserSessions(db, req.user!.id, req.sessionTokenHash);
    await audit(db, req, { action: 'auth.password_changed', summary: 'Changed password; other sessions signed out', entityType: 'user', entityId: req.user!.id });
    res.json({ ok: true });
  }));

  r.get('/sessions', requireAuth, ah(async (req, res) => {
    const rows = await db.prepare(
      'SELECT token_hash, created_at, last_seen_at, expires_at, remember, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC',
    ).all(req.user!.id) as { token_hash: string; created_at: string; last_seen_at: string; expires_at: string; remember: number; ip: string | null; user_agent: string | null }[];
    res.json({
      sessions: rows.map((s) => ({
        current: s.token_hash === req.sessionTokenHash, createdAt: s.created_at, lastSeenAt: s.last_seen_at,
        expiresAt: s.expires_at, remember: !!s.remember, ip: s.ip, userAgent: s.user_agent,
      })),
    });
  }));

  r.post('/sessions/revoke-others', requireAuth, ah(async (req, res) => {
    await revokeUserSessions(db, req.user!.id, req.sessionTokenHash);
    await audit(db, req, { action: 'auth.sessions_revoked', summary: 'Signed out all other sessions', entityType: 'user', entityId: req.user!.id });
    res.json({ ok: true });
  }));

  return r;
}
