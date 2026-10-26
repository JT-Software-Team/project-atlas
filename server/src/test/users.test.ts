import { describe, expect, it } from 'vitest';
import { login, setup } from './helpers.js';

describe('user management and super admin protection', () => {
  it('prevents deleting a super admin account', async () => {
    const { app, ids } = await setup();
    const admin = await login(app, 'admin@test.local');

    const res = await admin.del(`/api/users/${ids.admin}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Super Admin accounts cannot be deleted/i);
  });

  it('allows super admin to delete a non-super-admin user', async () => {
    const { app, ids, db } = await setup();
    const admin = await login(app, 'admin@test.local');

    const res = await admin.del(`/api/users/${ids.viewer}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const exists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(ids.viewer);
    expect(exists).toBeUndefined();
  });

  it('rejects deletion of a user by non-super-admins', async () => {
    const { app, ids } = await setup();
    const pa = await login(app, 'pa@test.local');

    const res = await pa.del(`/api/users/${ids.viewer}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only a Super Admin can delete users/i);
  });

  it('disables signing out all sessions for super admin in user management', async () => {
    const { app, ids } = await setup();
    const admin = await login(app, 'admin@test.local');

    const res = await admin.post(`/api/users/${ids.admin}/revoke-sessions`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled for Super Admin accounts/i);
  });

  it('allows signing out all sessions for non-super-admin users', async () => {
    const { app, ids } = await setup();
    const admin = await login(app, 'admin@test.local');

    const res = await admin.post(`/api/users/${ids.viewer}/revoke-sessions`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('ensures only super admin can create other super admin accounts', async () => {
    const { app } = await setup();
    const pa = await login(app, 'pa@test.local');
    const admin = await login(app, 'admin@test.local');

    // Project Admin trying to create a Super Admin -> 403
    const paAttempt = await pa.post('/api/users').send({
      email: 'newsuper1@test.local',
      name: 'New Super 1',
      role: 'super_admin',
      sendEmail: false,
    });
    expect(paAttempt.status).toBe(403);
    expect(paAttempt.body.error).toMatch(/Only a Super Admin can create another Super Admin account/i);

    // Project Admin creating a viewer -> succeeds
    const paViewer = await pa.post('/api/users').send({
      email: 'newviewer@test.local',
      name: 'New Viewer',
      role: 'viewer',
      sendEmail: false,
    });
    expect(paViewer.status).toBe(201);
    expect(paViewer.body.user.role).toBe('viewer');

    // Super Admin creating another Super Admin -> succeeds
    const adminAttempt = await admin.post('/api/users').send({
      email: 'newsuper2@test.local',
      name: 'New Super 2',
      role: 'super_admin',
      sendEmail: false,
    });
    expect(adminAttempt.status).toBe(201);
    expect(adminAttempt.body.user.role).toBe('super_admin');
  });

  it('prevents non-super-admins from editing a super admin or elevating roles', async () => {
    const { app, ids } = await setup();
    const pa = await login(app, 'pa@test.local');

    // PA trying to modify a super admin
    const editSuper = await pa.put(`/api/users/${ids.admin}`).send({
      name: 'Hacked Admin',
      role: 'super_admin',
      clientId: null,
      active: true,
    });
    expect(editSuper.status).toBe(403);
    expect(editSuper.body.error).toMatch(/Only a Super Admin can modify a Super Admin account/i);

    // PA trying to elevate a viewer to super admin
    const elevateViewer = await pa.put(`/api/users/${ids.viewer}`).send({
      name: 'Vera Viewer',
      role: 'super_admin',
      clientId: null,
      active: true,
    });
    expect(elevateViewer.status).toBe(403);
    expect(elevateViewer.body.error).toMatch(/Only a Super Admin can assign the Super Admin role/i);
  });
});
