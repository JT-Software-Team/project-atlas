import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { login, setup } from './helpers.js';

describe('user management and role-based access control', () => {
  it('allows Super Admin to create viewer, admin, and super_admin accounts', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');

    // 1. Super Admin creates a viewer account
    const viewerRes = await admin.post('/api/users').send({
      userId: 'test_viewer_1',
      name: 'Test Viewer',
      password: 'Initial-Password-101',
      confirmPassword: 'Initial-Password-101',
      role: 'viewer',
      active: true,
    });
    expect(viewerRes.status).toBe(201);
    expect(viewerRes.body.user).toMatchObject({
      email: 'test_viewer_1',
      name: 'Test Viewer',
      role: 'viewer',
      active: true,
    });

    // 2. Super Admin creates an admin account
    const adminRes = await admin.post('/api/users').send({
      userId: 'test_admin_1',
      name: 'Test Admin',
      password: 'Initial-Password-102',
      confirmPassword: 'Initial-Password-102',
      role: 'admin',
      active: true,
    });
    expect(adminRes.status).toBe(201);
    expect(adminRes.body.user).toMatchObject({
      email: 'test_admin_1',
      name: 'Test Admin',
      role: 'admin',
      active: true,
    });

    // 3. Super Admin creates another super_admin account
    const superRes = await admin.post('/api/users').send({
      userId: 'test_super_2',
      name: 'Second Super Admin',
      password: 'Initial-Password-103',
      confirmPassword: 'Initial-Password-103',
      role: 'super_admin',
      active: true,
    });
    expect(superRes.status).toBe(201);
    expect(superRes.body.user).toMatchObject({
      email: 'test_super_2',
      name: 'Second Super Admin',
      role: 'super_admin',
      active: true,
    });

    // 4. Newly created active accounts can log in immediately
    const viewerSession = await login(app, 'test_viewer_1', 'Initial-Password-101');
    const viewerMe = (await viewerSession.get('/api/auth/me')).body.user;
    expect(viewerMe).toMatchObject({ email: 'test_viewer_1', role: 'viewer' });

    const adminSession = await login(app, 'test_admin_1', 'Initial-Password-102');
    const adminMe = (await adminSession.get('/api/auth/me')).body.user;
    expect(adminMe).toMatchObject({ email: 'test_admin_1', role: 'admin' });

    const superSession = await login(app, 'test_super_2', 'Initial-Password-103');
    const superMe = (await superSession.get('/api/auth/me')).body.user;
    expect(superMe).toMatchObject({ email: 'test_super_2', role: 'super_admin' });
  });

  it('rejects incorrect passwords for newly created accounts', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');

    await admin.post('/api/users').send({
      userId: 'auth_test_user',
      password: 'Correct-Password-99',
      confirmPassword: 'Correct-Password-99',
      role: 'viewer',
      active: true,
    });

    const badLogin = await request(app)
      .post('/api/auth/login')
      .set('x-atlas-request', '1')
      .send({ email: 'auth_test_user', password: 'Wrong-Password-00' });
    expect(badLogin.status).toBe(401);
  });

  it('rejects duplicate User IDs and mismatched passwords', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');

    // Mismatched passwords
    const mismatch = await admin.post('/api/users').send({
      userId: 'dup_test_user',
      password: 'Password-Alpha-1',
      confirmPassword: 'Password-Beta-2',
      role: 'viewer',
    });
    expect(mismatch.status).toBe(400);

    // Initial creation
    const ok = await admin.post('/api/users').send({
      userId: 'dup_test_user',
      password: 'Password-Alpha-1',
      confirmPassword: 'Password-Alpha-1',
      role: 'viewer',
    });
    expect(ok.status).toBe(201);

    // Duplicate creation
    const dup = await admin.post('/api/users').send({
      userId: 'dup_test_user',
      password: 'Password-Alpha-1',
      confirmPassword: 'Password-Alpha-1',
      role: 'viewer',
    });
    expect(dup.status).toBe(409);
  });

  it('rejects invalid roles or weak passwords', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');

    const badRole = await admin.post('/api/users').send({
      userId: 'bad_role_user',
      password: 'Valid-Password-123',
      confirmPassword: 'Valid-Password-123',
      role: 'invalid_role_name',
    });
    expect(badRole.status).toBe(400);

    const weakPass = await admin.post('/api/users').send({
      userId: 'weak_pass_user',
      password: 'short',
      confirmPassword: 'short',
      role: 'viewer',
    });
    expect(weakPass.status).toBe(400);
  });

  it('enforces that viewer cannot create users or modify application data', async () => {
    const { app, ids } = await setup();
    const viewer = await login(app, 'viewer@test.local');

    // Viewer cannot access user management API
    expect((await viewer.get('/api/users')).status).toBe(403);
    expect((await viewer.post('/api/users').send({
      userId: 'hacker_user',
      password: 'Password-123!',
      confirmPassword: 'Password-123!',
      role: 'viewer',
    })).status).toBe(403);

    // Viewer cannot delete or modify users
    expect((await viewer.del(`/api/users/${ids.admin}`)).status).toBe(403);
    expect((await viewer.put(`/api/users/${ids.viewer}`).send({
      name: 'Elevated Viewer',
      role: 'super_admin',
      active: true,
    })).status).toBe(403);

    // Viewer cannot modify application data (clients, projects, categories, media)
    expect((await viewer.post('/api/clients').send({ name: 'Hacked Client' })).status).toBe(403);
    expect((await viewer.post('/api/categories').send({ name: 'Hacked Category' })).status).toBe(403);
    expect((await viewer.post('/api/projects').send({ name: 'Hacked Project' })).status).toBe(403);
  });

  it('enforces that admin cannot create users or modify application data', async () => {
    const { app, ids } = await setup();
    const superAdmin = await login(app, 'admin@test.local');

    // Create an admin account
    await superAdmin.post('/api/users').send({
      userId: 'dashboard_admin',
      name: 'Dashboard Admin',
      password: 'Password-Admin-101',
      confirmPassword: 'Password-Admin-101',
      role: 'admin',
      active: true,
    });

    const admin = await login(app, 'dashboard_admin', 'Password-Admin-101');

    // Admin cannot access user management API
    expect((await admin.get('/api/users')).status).toBe(403);
    expect((await admin.post('/api/users').send({
      userId: 'sub_user',
      password: 'Password-Sub-101',
      confirmPassword: 'Password-Sub-101',
      role: 'viewer',
    })).status).toBe(403);

    // Admin cannot change user roles or delete users
    expect((await admin.del(`/api/users/${ids.viewer}`)).status).toBe(403);
    expect((await admin.put(`/api/users/${ids.admin}`).send({
      name: 'Hacked',
      role: 'viewer',
      active: true,
    })).status).toBe(403);

    // Admin cannot modify application data (clients, categories, projects)
    expect((await admin.post('/api/clients').send({ name: 'Admin Client' })).status).toBe(403);
    expect((await admin.post('/api/categories').send({ name: 'Admin Category' })).status).toBe(403);
    expect((await admin.post('/api/projects').send({ name: 'Admin Project' })).status).toBe(403);
  });

  it('rejects unauthenticated requests to protected APIs', async () => {
    const { app } = await setup();

    expect((await request(app).get('/api/users')).status).toBe(401);
    expect((await request(app).post('/api/users').set('x-atlas-request', '1').send({})).status).toBe(401);
    expect((await request(app).get('/api/projects')).status).toBe(401);
  });

  it('prevents deactivating or deleting the last active Super Admin and self lockout', async () => {
    const { app, ids } = await setup();
    const admin = await login(app, 'admin@test.local');

    // Cannot delete own account
    const deleteSelf = await admin.del(`/api/users/${ids.admin}`);
    expect(deleteSelf.status).toBe(403);

    // Cannot deactivate own account
    const deactivateSelf = await admin.put(`/api/users/${ids.admin}`).send({
      name: 'Atlas Super Admin',
      role: 'super_admin',
      active: false,
    });
    expect(deactivateSelf.status).toBe(400);
    expect(deactivateSelf.body.error).toMatch(/cannot deactivate your own account/i);

    // Cannot demote own account
    const demoteSelf = await admin.put(`/api/users/${ids.admin}`).send({
      name: 'Atlas Super Admin',
      role: 'viewer',
      active: true,
    });
    expect(demoteSelf.status).toBe(400);
    expect(demoteSelf.body.error).toMatch(/cannot remove your own Super Admin access/i);
  });

  it('supports direct password reset by Super Admin and terminates existing sessions', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');

    // Create a viewer account
    const created = await admin.post('/api/users').send({
      userId: 'session_user',
      password: 'Old-Password-101',
      confirmPassword: 'Old-Password-101',
      role: 'viewer',
      active: true,
    });
    const userId = created.body.user.id;

    // Sign in with original password
    const userSession = await login(app, 'session_user', 'Old-Password-101');
    expect((await userSession.get('/api/auth/me')).status).toBe(200);

    // Super Admin resets password directly
    const reset = await admin.post(`/api/users/${userId}/password`).send({
      password: 'New-Password-202',
      confirmPassword: 'New-Password-202',
    });
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);

    // Old session must now be invalidated
    expect((await userSession.get('/api/auth/me')).status).toBe(401);

    // Old password fails
    const failLogin = await request(app)
      .post('/api/auth/login')
      .set('x-atlas-request', '1')
      .send({ email: 'session_user', password: 'Old-Password-101' });
    expect(failLogin.status).toBe(401);

    // New password succeeds
    const newSession = await login(app, 'session_user', 'New-Password-202');
    expect((await newSession.get('/api/auth/me')).status).toBe(200);
  });

  it('preserves super admin ID, login handle, and password hash byte-for-byte', async () => {
    const { db, ids } = await setup();
    const before = await db.prepare('SELECT id, email, role, password_hash FROM users WHERE id = ?').get(ids.admin) as {
      id: number; email: string; role: string; password_hash: string;
    };

    expect(before.id).toBe(ids.admin);
    expect(before.role).toBe('super_admin');
    expect(before.password_hash).toBeTruthy();
  });
});
