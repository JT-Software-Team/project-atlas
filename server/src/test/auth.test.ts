import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { login, PASSWORD, setup } from './helpers.js';

describe('authentication', () => {
  it('rejects unauthenticated API access', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('signs in with an httpOnly session cookie and signs out', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/auth/login').set('x-atlas-request', '1')
      .send({ email: 'ADMIN@test.local', password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/atlas_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const s = await login(app, 'admin@test.local');
    expect((await s.get('/api/auth/me')).body.user.role).toBe('super_admin');
    await s.post('/api/auth/logout');
    expect((await s.get('/api/auth/me')).status).toBe(401);
  });

  it('gives the same message for unknown email and wrong password', async () => {
    const { app } = await setup();
    const a = await request(app).post('/api/auth/login').set('x-atlas-request', '1').send({ email: 'nobody@test.local', password: 'x' });
    const b = await request(app).post('/api/auth/login').set('x-atlas-request', '1').send({ email: 'admin@test.local', password: 'wrong' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  it('locks the account after repeated failures', async () => {
    const { app } = await setup();
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').set('x-atlas-request', '1').send({ email: 'viewer@test.local', password: 'wrong' });
    }
    const res = await request(app).post('/api/auth/login').set('x-atlas-request', '1').send({ email: 'viewer@test.local', password: PASSWORD });
    expect(res.status).toBe(423);
  });

  it('requires the CSRF header on state-changing requests', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('blocks disabled accounts and ends their sessions', async () => {
    const { app, ids } = await setup();
    const viewer = await login(app, 'viewer@test.local');
    const admin = await login(app, 'admin@test.local');
    const upd = await admin.put(`/api/users/${ids.viewer}`).send({ name: 'Vera Viewer', role: 'viewer', clientId: null, active: false });
    expect(upd.status).toBe(200);
    expect((await viewer.get('/api/auth/me')).status).toBe(401);
    const res = await request(app).post('/api/auth/login').set('x-atlas-request', '1').send({ email: 'viewer@test.local', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('resets a password with a single-use emailed token', async () => {
    const { app, mailer } = await setup();
    const forgot = await request(app).post('/api/auth/forgot').set('x-atlas-request', '1').send({ email: 'viewer@test.local' });
    expect(forgot.status).toBe(200);
    const token = mailer.sent[0].text.match(/#token=([\w-]+)/)![1];
    const weak = await request(app).post('/api/auth/reset').set('x-atlas-request', '1').send({ token, password: 'short' });
    expect(weak.status).toBe(400);
    const ok = await request(app).post('/api/auth/reset').set('x-atlas-request', '1').send({ token, password: 'Brand-New-Pass-9' });
    expect(ok.status).toBe(200);
    const reuse = await request(app).post('/api/auth/reset').set('x-atlas-request', '1').send({ token, password: 'Another-Pass-99' });
    expect(reuse.status).toBe(400);
    await login(app, 'viewer@test.local', 'Brand-New-Pass-9');
  });

  it('does not reveal whether an email exists on forgot-password', async () => {
    const { app, mailer } = await setup();
    const res = await request(app).post('/api/auth/forgot').set('x-atlas-request', '1').send({ email: 'ghost@test.local' });
    expect(res.status).toBe(200);
    expect(mailer.sent).toHaveLength(0);
  });
});
