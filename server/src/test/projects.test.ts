import { describe, expect, it } from 'vitest';
import { login, projectId, setup } from './helpers.js';

const validProject = {
  name: 'Coke Oven Monitoring',
  shortDescription: 'Test project',
  status: 'active',
  visibility: 'restricted',
  dashboards: [{ name: 'Live view', url: 'https://dashboards.example.com/live', type: 'live_monitoring', isPrimary: true }],
};

describe('projects and permissions', () => {
  it('lists the three demo projects for a super admin, flagged as demo', async () => {
    const { app } = await setup();
    const s = await login(app, 'admin@test.local');
    const res = await s.get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.projects.map((p: { name: string }) => p.name).sort()).toEqual(
      ['Aluminium Skimming Project', 'Anode Chipping Project', 'Gunny Ball Project'],
    );
    expect(res.body.projects.every((p: { isDemo: boolean }) => p.isDemo)).toBe(true);
  });

  it('restricts viewers to permitted projects and hides technical fields', async () => {
    const { app, db, ids } = await setup();
    const admin = await login(app, 'admin@test.local');
    const created = await admin.post('/api/projects').send({ ...validProject, visibility: 'private', technical: { equipmentName: 'Secret Press 9000' } });
    expect(created.status).toBe(201);
    const id = created.body.project.id;

    const viewer = await login(app, 'viewer@test.local');
    expect((await viewer.get(`/api/projects/${id}`)).status).toBe(404);
    expect((await viewer.get('/api/projects?q=secret')).body.total).toBe(0);

    await admin.put(`/api/projects/${id}/access`).send({ grants: [{ userId: ids.viewer, level: 'view' }] });
    const detail = await viewer.get(`/api/projects/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.project.technical).toBeNull();
    expect(detail.body.project.dashboards[0].url).toBeUndefined();
    expect(detail.body.project.dashboards[0].launchUrl).toBeUndefined();
    expect(detail.body.project.access.dashboard).toBe(false);
    expect(detail.body.project.admin).toBeNull();
    // Technical search terms do not match for users without technical access.
    expect((await viewer.get('/api/projects?q=secret')).body.total).toBe(0);

    await admin.put(`/api/projects/${id}/access`).send({ grants: [{ userId: ids.viewer, level: 'technical' }] });
    expect((await viewer.get(`/api/projects/${id}`)).body.project.technical.equipmentName).toBe('Secret Press 9000');
    expect((await viewer.get('/api/projects?q=secret')).body.total).toBe(1);
    expect(await db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'access.granted'`).get()).toEqual({ n: 2 });
  });

  it('prevents viewers from administrative operations', async () => {
    const { app, db } = await setup();
    const viewer = await login(app, 'viewer@test.local');
    expect((await viewer.post('/api/projects').send(validProject)).status).toBe(403);
    expect((await viewer.put(`/api/projects/${(await projectId(db, 'gunny-ball-project'))}`).send(validProject)).status).toBe(403);
    expect((await viewer.get('/api/users')).status).toBe(403);
    expect((await viewer.post('/api/categories').send({ name: 'Hack' })).status).toBe(403);
  });

  it('lets a project admin manage only assigned projects', async () => {
    const { app, db, ids } = await setup();
    const gunny = (await projectId(db, 'gunny-ball-project'));
    const anode = (await projectId(db, 'anode-chipping-project'));
    const admin = await login(app, 'admin@test.local');
    await admin.put(`/api/projects/${gunny}/access`).send({ grants: [{ userId: ids.pa, level: 'manage' }] });

    const pa = await login(app, 'pa@test.local');
    const edit = await pa.put(`/api/projects/${gunny}`).send({ ...validProject, name: 'Gunny Ball Project' });
    expect(edit.status).toBe(200);
    expect(edit.body.project.dashboards).toHaveLength(1);
    expect((await pa.put(`/api/projects/${anode}`).send(validProject)).status).toBe(403);
    // Project admins cannot grant management rights or make projects public.
    expect((await pa.put(`/api/projects/${gunny}/access`).send({ grants: [{ userId: ids.pa, level: 'manage' }, { userId: ids.viewer, level: 'manage' }] })).status).toBe(403);
    expect((await pa.put(`/api/projects/${gunny}`).send({ ...validProject, visibility: 'public_overview', confirmPublic: true })).status).toBe(403);
  });

  it('validates dashboard URLs', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');
    for (const url of ['http://insecure.example.com', 'javascript:alert(1)', 'https://user:pw@example.com', 'https://x.example.com/?token=abc', 'not a url']) {
      const res = await admin.post('/api/projects').send({ ...validProject, dashboards: [{ name: 'Bad', url }] });
      expect(res.status, url).toBe(400);
      expect(Object.keys(res.body.fields)[0]).toBe('dashboards.0.url');
    }
  });

  it('opens dashboards through an access-checked redirect and records it', async () => {
    const { app, db, ids } = await setup();
    const admin = await login(app, 'admin@test.local');
    const created = await admin.post('/api/projects').send(validProject);
    const dash = created.body.project.dashboards[0];
    const res = await admin.get(dash.launchUrl);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://dashboards.example.com/live');
    expect(await db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'dashboard.opened'`).get()).toEqual({ n: 1 });

    const viewer = await login(app, 'viewer@test.local');
    // Viewer without access to this restricted project gets 404
    expect((await viewer.get(dash.launchUrl)).status).toBe(404);

    // Grant viewer access to the project
    await admin.put(`/api/projects/${created.body.project.id}/access`).send({ grants: [{ userId: ids.viewer, level: 'view' }] });
    // Viewer can view the project, but launchUrl is undefined and attempting to open dashboard returns 403 Forbidden
    const viewerProject = await viewer.get(`/api/projects/${created.body.project.id}`);
    expect(viewerProject.status).toBe(200);
    expect(viewerProject.body.project.access.dashboard).toBe(false);
    expect(viewerProject.body.project.dashboards[0].launchUrl).toBeUndefined();
    expect((await viewer.get(dash.launchUrl)).status).toBe(403);

    // Admin role user CAN launch dashboard
    const adminRoleUser = await login(app, 'admin_role@test.local');
    await admin.put(`/api/projects/${created.body.project.id}/access`).send({ grants: [{ userId: ids.adminRole, level: 'view' }] });
    const adminRoleProject = await adminRoleUser.get(`/api/projects/${created.body.project.id}`);
    expect(adminRoleProject.body.project.access.dashboard).toBe(true);
    expect(adminRoleProject.body.project.dashboards[0].launchUrl).toBe(dash.launchUrl);
    const adminRoleLaunch = await adminRoleUser.get(dash.launchUrl);
    expect(adminRoleLaunch.status).toBe(302);
  });

  it('requires explicit confirmation before a project becomes public', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');
    const res = await admin.post('/api/projects').send({ ...validProject, visibility: 'public_overview' });
    expect(res.status).toBe(400);
    const ok = await admin.post('/api/projects').send({ ...validProject, visibility: 'public_overview', confirmPublic: true, approvalStatus: 'approved' });
    expect(ok.status).toBe(201);
    const pub = await (await import('supertest')).default(app).get('/api/public/projects');
    expect(pub.body.projects).toHaveLength(1);
    expect(pub.body.projects[0]).not.toHaveProperty('dashboards');
  });

  it('archives, restores and only deletes archived projects with confirmation', async () => {
    const { app, db } = await setup();
    const id = (await projectId(db, 'anode-chipping-project'));
    const admin = await login(app, 'admin@test.local');
    expect((await admin.del(`/api/projects/${id}`).send({ confirm: 'anode-chipping-project' })).status).toBe(409);
    expect((await admin.post(`/api/projects/${id}/archive`)).status).toBe(200);
    expect((await admin.get('/api/projects')).body.total).toBe(2);
    expect((await admin.post(`/api/projects/${id}/restore`)).status).toBe(200);
    expect((await admin.get(`/api/projects/${id}`)).body.project.status).toBe('active');
    await admin.post(`/api/projects/${id}/archive`);
    expect((await admin.del(`/api/projects/${id}`).send({ confirm: 'wrong' })).status).toBe(400);
    expect((await admin.del(`/api/projects/${id}`).send({ confirm: 'anode-chipping-project' })).status).toBe(200);
  });

  it('searches, filters and sorts within permitted projects', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');
    expect((await admin.get('/api/projects?q=vedanta')).body.projects[0].name).toBe('Anode Chipping Project');
    expect((await admin.get('/api/projects?category=aluminium-processing')).body.total).toBe(1);
    expect((await admin.get('/api/projects?status=planning')).body.total).toBe(1);
    const sorted = (await admin.get('/api/projects?sort=name_asc')).body.projects.map((p: { name: string }) => p.name);
    expect(sorted).toEqual(['Aluminium Skimming Project', 'Anode Chipping Project', 'Gunny Ball Project']);
  });

  it('computes overview stats from stored data only', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');
    const { stats } = (await admin.get('/api/overview')).body;
    expect(stats).toMatchObject({ totalProjects: 3, totalClients: 3, activeProjects: 2, completedProjects: 0, underMaintenance: 0, demoProjects: 3 });
  });

  it('prevents duplicate clients', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');
    const res = await admin.post('/api/clients').send({ name: '  jsw ' });
    expect(res.status).toBe(409);
  });
});
