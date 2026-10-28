import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireSuperAdmin } from '../auth/middleware.js';
import { hashPassword, passwordProblems } from '../auth/passwords.js';
import { revokeUserSessions } from '../auth/sessions.js';
import { loginId } from '../auth/loginId.js';
import { nowIso, transaction, type DB } from '../db/index.js';
import { HttpError, ah, parseId } from '../http.js';
import { audit } from '../services/audit.js';
import { ACCESS_LEVELS } from '../services/catalog.js';
import type { Mailer } from '../services/mailer.js';
import { config } from '../config.js';
import { issuePasswordToken, passwordLink } from './auth.js';
import { optId } from './validators.js';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  project_admin: 'Project Admin',
  viewer: 'Viewer',
};

const ALLOWED_USER_ROLES = ['viewer', 'admin', 'super_admin'] as const;

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: string;
  client_id: number | null;
  client_name: string | null;
  is_active: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  has_password: number;
  grant_count: number;
  session_count: number;
}

export function userRoutes(db: DB, mailer: Mailer) {
  const r = Router();
  r.use(requireAuth);
  r.use(requireSuperAdmin);

  /** Directory for owner pickers and access grants. */
  r.get('/options', ah(async (_req, res) => {
    const rows = await db.prepare('SELECT id, name, email, role FROM users WHERE is_active = 1 ORDER BY name').all();
    res.json({ users: rows });
  }));

  const select = `
    SELECT u.id, u.email, u.name, u.role, u.client_id, cl.name AS client_name, u.is_active, u.locked_until,
      u.last_login_at, u.created_at, (u.password_hash IS NOT NULL) AS has_password,
      (SELECT COUNT(*) FROM project_access pa WHERE pa.user_id = u.id) AS grant_count,
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > :now) AS session_count
    FROM users u LEFT JOIN clients cl ON cl.id = u.client_id`;

  const serialize = (u: UserRow) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    clientId: u.client_id,
    clientName: u.client_name,
    active: !!u.is_active,
    locked: !!u.locked_until && u.locked_until > nowIso(),
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
    invitePending: !u.has_password,
    projectGrants: u.grant_count,
    activeSessions: u.session_count,
  });

  const getUser = async (id: number) =>
    (await db.prepare(`${select} WHERE u.id = :id`).get({ id, now: nowIso() })) as unknown as UserRow | undefined;

  const activeSuperAdmins = async (exceptId: number) =>
    (await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND is_active = 1 AND id <> ?`).get(exceptId) as { n: number }).n;

  r.get('/', ah(async (_req, res) => {
    const rows = (await db.prepare(`${select} ORDER BY u.is_active DESC, u.name COLLATE NOCASE`).all({ now: nowIso() })) as unknown as UserRow[];
    res.json({ users: rows.map(serialize) });
  }));

  r.post('/', ah(async (req, res) => {
    const rawUserId = req.body.userId ?? req.body.email;
    const rawName = (req.body.name && String(req.body.name).trim()) ? req.body.name : rawUserId;

    const body = z.object({
      userId: loginId,
      name: z.string().trim().min(1, 'Name is required.').max(120),
      password: z.string().min(1, 'Initial password is required.'),
      confirmPassword: z.string().min(1, 'Please confirm the initial password.'),
      role: z.enum(ALLOWED_USER_ROLES),
      clientId: optId,
      active: z.boolean().default(true),
    }).refine((data) => data.password === data.confirmPassword, {
      message: 'Initial password and confirmation password do not match.',
      path: ['confirmPassword'],
    }).parse({
      ...req.body,
      userId: rawUserId,
      name: rawName,
    });

    const problem = passwordProblems(body.password, config.auth.minPasswordLength);
    if (problem) {
      throw new HttpError(400, problem, { field: 'password' });
    }

    if (await db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.userId)) {
      throw new HttpError(409, 'A user with this User ID or email already exists.', { field: 'userId' });
    }

    const hash = await hashPassword(body.password);
    const now = nowIso();
    const result = await db.prepare(
      `INSERT INTO users (email, name, role, password_hash, client_id, is_active, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(body.userId, body.name, body.role, hash, body.clientId, body.active ? 1 : 0, now, now);

    const id = Number(result.lastInsertRowid);
    await audit(db, req, {
      action: 'user.created',
      summary: `Created user ${body.name} (${body.userId}) as ${ROLE_LABEL[body.role] ?? body.role}`,
      entityType: 'user',
      entityId: id,
    });

    res.status(201).json({ user: serialize((await getUser(id))!), ok: true });
  }));

  r.put('/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const prev = await getUser(id);
    if (!prev) throw new HttpError(404, 'User not found.');

    const body = z.object({
      name: z.string().trim().min(1).max(120),
      role: z.enum(['viewer', 'admin', 'super_admin', 'project_admin']),
      clientId: optId,
      active: z.boolean(),
      unlock: z.boolean().optional(),
    }).parse(req.body);

    if (!body.active && id === req.user!.id) {
      throw new HttpError(400, 'You cannot deactivate your own account.');
    }
    const demotingSuper = prev.role === 'super_admin' && (body.role !== 'super_admin' || !body.active);
    if (demotingSuper && id === req.user!.id) {
      throw new HttpError(400, 'You cannot remove your own Super Admin access.');
    }
    if (demotingSuper && prev.is_active && (await activeSuperAdmins(id)) === 0) {
      throw new HttpError(400, 'At least one active Super Admin is required.');
    }

    await transaction(db, async () => {
      await db.prepare(
        `UPDATE users SET name = ?, role = ?, client_id = ?, is_active = ?, updated_at = ?
         ${body.unlock ? ', locked_until = NULL, failed_attempts = 0' : ''} WHERE id = ?`
      ).run(body.name, body.role, body.clientId, body.active ? 1 : 0, nowIso(), id);

      if (body.role !== 'project_admin') {
        await db.prepare(`UPDATE project_access SET level = 'technical' WHERE user_id = ? AND level = 'manage'`).run(id);
      }
      if (!body.active || prev.role !== body.role) {
        await revokeUserSessions(db, id);
      }
    });

    if (prev.role !== body.role) {
      await audit(db, req, {
        action: 'user.role_changed',
        summary: `Changed ${body.name}'s role from ${ROLE_LABEL[prev.role] ?? prev.role} to ${ROLE_LABEL[body.role] ?? body.role}`,
        entityType: 'user',
        entityId: id,
      });
    }
    if (!!prev.is_active !== body.active) {
      await audit(db, req, {
        action: body.active ? 'user.enabled' : 'user.disabled',
        summary: `${body.active ? 'Re-enabled' : 'Disabled'} account of ${body.name}`,
        entityType: 'user',
        entityId: id,
      });
    }
    if (body.unlock) {
      await audit(db, req, { action: 'user.unlocked', summary: `Unlocked account of ${body.name}`, entityType: 'user', entityId: id });
    }
    if (prev.name !== body.name || prev.client_id !== body.clientId) {
      await audit(db, req, { action: 'user.updated', summary: `Updated profile of ${body.name}`, entityType: 'user', entityId: id });
    }

    res.json({ user: serialize((await getUser(id))!) });
  }));

  r.post('/:id/password', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const u = await getUser(id);
    if (!u) throw new HttpError(404, 'User not found.');

    const body = z.object({
      password: z.string().min(1, 'Password is required.'),
      confirmPassword: z.string().min(1, 'Please confirm the password.'),
    }).refine((data) => data.password === data.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    }).parse(req.body);

    const problem = passwordProblems(body.password, config.auth.minPasswordLength);
    if (problem) {
      throw new HttpError(400, problem, { field: 'password' });
    }

    const hash = await hashPassword(body.password);
    await transaction(db, async () => {
      await db.prepare(
        'UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, must_change_password = 0, updated_at = ? WHERE id = ?'
      ).run(hash, nowIso(), id);
      await revokeUserSessions(db, id, id === req.user!.id ? req.sessionTokenHash : undefined);
    });

    await audit(db, req, {
      action: 'user.password_reset',
      summary: `Reset password for ${u.name} (${u.email})`,
      entityType: 'user',
      entityId: id,
    });

    res.json({ ok: true });
  }));

  r.post('/:id/reset-link', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const u = await getUser(id);
    if (!u) throw new HttpError(404, 'User not found.');
    if (!u.is_active) throw new HttpError(400, 'Enable this account before issuing a reset link.');
    const purpose = u.has_password ? 'reset' : 'invite';
    const link = passwordLink(await issuePasswordToken(db, id, purpose));
    await mailer.send({
      to: u.email,
      subject: purpose === 'invite' ? 'Your Project Atlas invitation' : 'Reset your Project Atlas password',
      text: `Hello ${u.name},\n\nAn administrator issued you a link to set your Project Atlas password:\n\n${link}\n\n— Janyutech`,
    });
    await audit(db, req, {
      action: 'user.reset_link_issued',
      summary: `Issued a password ${purpose === 'invite' ? 'setup' : 'reset'} link for ${u.name}`,
      entityType: 'user',
      entityId: id,
    });
    res.json({ link, purpose });
  }));

  r.post('/:id/revoke-sessions', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const u = await getUser(id);
    if (!u) throw new HttpError(404, 'User not found.');
    if (u.role === 'super_admin') {
      throw new HttpError(403, 'Signing out all sessions from User Management is disabled for Super Admin accounts.');
    }
    await revokeUserSessions(db, id, id === req.user!.id ? req.sessionTokenHash : undefined);
    await audit(db, req, { action: 'user.sessions_revoked', summary: `Signed out all sessions of ${u.name}`, entityType: 'user', entityId: id });
    res.json({ ok: true });
  }));

  r.delete('/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const u = await getUser(id);
    if (!u) throw new HttpError(404, 'User not found.');
    if (u.role === 'super_admin') {
      throw new HttpError(403, 'Super Admin accounts cannot be deleted.');
    }
    if (id === req.user!.id) {
      throw new HttpError(400, 'You cannot delete your own account.');
    }
    await transaction(db, async () => {
      await revokeUserSessions(db, id);
      await db.prepare('DELETE FROM project_access WHERE user_id = ?').run(id);
      await db.prepare('DELETE FROM password_tokens WHERE user_id = ?').run(id);
      await db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(id);
      await db.prepare('DELETE FROM favorites WHERE user_id = ?').run(id);
      await db.prepare('DELETE FROM recent_access WHERE user_id = ?').run(id);
      await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      await db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    await audit(db, req, { action: 'user.deleted', summary: `Deleted user ${u.name} (${u.email})`, entityType: 'user', entityId: id });
    res.json({ ok: true });
  }));

  r.get('/:id/access', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const rows = await db.prepare(
      `SELECT pa.project_id, pa.level, p.name FROM project_access pa JOIN projects p ON p.id = pa.project_id WHERE pa.user_id = ? ORDER BY p.name`,
    ).all(id) as { project_id: number; level: string; name: string }[];
    res.json({ grants: rows.map((g) => ({ projectId: g.project_id, level: g.level, projectName: g.name })) });
  }));

  r.put('/:id/access', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const u = await getUser(id);
    if (!u) throw new HttpError(404, 'User not found.');
    const { grants } = z.object({
      grants: z.array(z.object({ projectId: z.number().int().positive(), level: z.enum(ACCESS_LEVELS) })).max(2000),
    }).parse(req.body);
    if (grants.some((g) => g.level === 'manage') && u.role !== 'project_admin') {
      throw new HttpError(400, 'Only Project Admins can be given management rights on a project.');
    }
    const current = new Map((await db.prepare('SELECT project_id, level FROM project_access WHERE user_id = ?').all(id) as { project_id: number; level: string }[])
      .map((g) => [g.project_id, g.level]));
    const next = new Map(grants.map((g) => [g.projectId, g.level]));
    const projectName = db.prepare('SELECT name FROM projects WHERE id = ?');

    await transaction(db, async () => {
      for (const [projectId, level] of next) {
        const p = await projectName.get(projectId) as { name: string } | undefined;
        if (!p) throw new HttpError(400, 'One of the selected projects no longer exists.');
        if (current.get(projectId) === level) continue;
        await db.prepare(`INSERT INTO project_access (project_id, user_id, level, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(project_id, user_id) DO UPDATE SET level = excluded.level, granted_by = excluded.granted_by, granted_at = excluded.granted_at`)
          .run(projectId, id, level, req.user!.id, nowIso());
        await audit(db, req, { action: 'access.granted', summary: `Granted ${level} access on “${p.name}” to ${u.name}`, entityType: 'user', entityId: id, projectId });
      }
      for (const projectId of current.keys()) {
        if (next.has(projectId)) continue;
        const p = await projectName.get(projectId) as { name: string } | undefined;
        await db.prepare('DELETE FROM project_access WHERE project_id = ? AND user_id = ?').run(projectId, id);
        await audit(db, req, { action: 'access.revoked', summary: `Revoked access on “${p?.name ?? 'a project'}” from ${u.name}`, entityType: 'user', entityId: id, projectId });
      }
    });
    res.json({ ok: true });
  }));

  return r;
}
