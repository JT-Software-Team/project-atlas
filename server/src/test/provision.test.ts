import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { provisionSuperAdmin } from '../auth/provision.js';
import { login, setup } from './helpers.js';

const INITIAL = 'Initial-Pass-77';
const admin = { loginId: 'atlas@admin', name: 'Atlas Super Admin', password: INITIAL };

describe('initial Super Admin provisioning', () => {
  it('creates a Super Admin that signs in with a user ID rather than an email', async () => {
    const { app, db } = await setup();
    expect(await provisionSuperAdmin(db, admin, 10)).toBe('created');
    const s = await login(app, 'ATLAS@admin', INITIAL);
    const me = (await s.get('/api/auth/me')).body.user;
    expect(me).toMatchObject({ email: 'atlas@admin', role: 'super_admin', mustChangePassword: true });
    const row = await db.prepare('SELECT password_hash FROM users WHERE email = ?').get('atlas@admin') as { password_hash: string };
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain(INITIAL);
  });

  it('rejects a wrong password for the user ID', async () => {
    const { app, db } = await setup();
    await provisionSuperAdmin(db, admin, 10);
    const res = await request(app).post('/api/auth/login').set('x-atlas-request', '1').send({ email: 'atlas@admin', password: 'Wrong-Pass-11' });
    expect(res.status).toBe(401);
  });

  it('blocks everything except the password change until a new password is chosen', async () => {
    const { app, db } = await setup();
    await provisionSuperAdmin(db, admin, 10);
    const s = await login(app, 'atlas@admin', INITIAL);
    expect((await s.get('/api/projects')).status).toBe(403);
    expect((await s.get('/api/users')).status).toBe(403);

    const same = await s.post('/api/auth/change-password').send({ currentPassword: INITIAL, newPassword: INITIAL });
    expect(same.status).toBe(400);
    const ok = await s.post('/api/auth/change-password').send({ currentPassword: INITIAL, newPassword: 'Fresh-Secret-2027' });
    expect(ok.status).toBe(200);

    expect((await s.get('/api/auth/me')).body.user.mustChangePassword).toBe(false);
    expect((await s.get('/api/users')).status).toBe(200);
    await s.post('/api/auth/logout');
    expect((await s.get('/api/auth/me')).status).toBe(401);
    await login(app, 'atlas@admin', 'Fresh-Secret-2027');
  });

  it('never overwrites an existing account unless a reset is requested', async () => {
    const { app, db } = await setup();
    await provisionSuperAdmin(db, admin, 10);
    expect(await provisionSuperAdmin(db, { ...admin, password: 'Other-Pass-555' }, 10)).toBe('exists');
    await login(app, 'atlas@admin', INITIAL);
    expect(await provisionSuperAdmin(db, { ...admin, password: 'Other-Pass-555', reset: true }, 10)).toBe('updated');
    await login(app, 'atlas@admin', 'Other-Pass-555');
  });

  it('refuses weak initial passwords and malformed IDs', async () => {
    const { db } = await setup();
    await expect(provisionSuperAdmin(db, { ...admin, password: 'short' }, 10)).rejects.toThrow();
    await expect(provisionSuperAdmin(db, { ...admin, loginId: 'not an id' }, 10)).rejects.toThrow();
  });
});
