import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { hashPassword } from '../auth/passwords.js';
import { nowIso, openDatabase } from '../db/index.js';
import { insertDemoProjects } from '../scripts/demoData.js';
import { MemoryMailer } from '../services/mailer.js';
import { login, PASSWORD, projectId, setup } from './helpers.js';

describe('uploads', () => {
  it('accepts real images, re-encodes them, and enforces project permissions', async () => {
    const { app, db } = await setup();
    const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#8B5CF6' } }).png().toBuffer();
    const admin = await login(app, 'admin@test.local');
    const up = await admin.post('/api/media').field('kind', 'image').attach('file', png, 'cover.png');
    expect(up.status).toBe(201);
    expect(up.body.media.width).toBe(64);

    const id = (await projectId(db, 'gunny-ball-project'));
    const project = (await admin.get(`/api/projects/${id}`)).body.project;
    const save = await admin.put(`/api/projects/${id}`).send({
      name: project.name, status: 'active', visibility: 'private', coverMediaId: up.body.media.id,
    });
    expect(save.status).toBe(200);
    const img = await admin.get(up.body.media.url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/webp');

    const viewer = await login(app, 'viewer@test.local');
    expect((await viewer.get(up.body.media.url)).status).toBe(404);
  });

  it('serves the same upload from every server instance sharing the database', async () => {
    // Serverless hosts run several instances at once; each request may reach a different one.
    const dbFile = path.join(os.tmpdir(), `atlas-shared-${process.pid}-${Date.now()}.db`);
    const instanceA = createApp({ db: await openDatabase(dbFile), mailer: new MemoryMailer() });
    const sharedDb = await openDatabase(dbFile);
    const instanceB = createApp({ db: sharedDb, mailer: new MemoryMailer() });
    await insertDemoProjects(sharedDb);
    await sharedDb.prepare('INSERT INTO users (email, name, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('admin@test.local', 'Ada Admin', 'super_admin', await hashPassword(PASSWORD), nowIso(), nowIso());

    const onA = await login(instanceA, 'admin@test.local');
    const cookie = (await onA.agent.post('/api/auth/login').set('x-atlas-request', '1')
      .send({ email: 'admin@test.local', password: PASSWORD })).headers['set-cookie'];
    const onB = (method: 'get' | 'put', url: string) => request(instanceB)[method](url).set('Cookie', cookie).set('x-atlas-request', '1');

    const png = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#22D3EE' } }).png().toBuffer();
    const up = await onA.post('/api/media').field('kind', 'image').attach('file', png, 'cover.png');
    expect(up.status).toBe(201);
    const fromA = await onA.get(up.body.media.url);

    const preview = await onB('get', up.body.media.url).buffer(true);
    expect(preview.status).toBe(200);
    expect(Buffer.compare(preview.body, fromA.body)).toBe(0);

    const id = await projectId(sharedDb, 'gunny-ball-project');
    const save = await onB('put', `/api/projects/${id}`).send({ name: 'Gunny Ball Project', status: 'active', visibility: 'private', coverMediaId: up.body.media.id });
    expect(save.status).toBe(200);
    expect(save.body.project.admin.coverMediaId).toBe(up.body.media.id);

    // Versioned URLs name one exact file, so browsers may keep them; bare URLs are always revalidated.
    expect(up.body.media.url).toMatch(/\?v=[0-9a-f]{16}$/);
    expect(preview.headers['cache-control']).toBe('private, max-age=2592000, immutable');
    const bare = await onB('get', `/api/media/${up.body.media.id}`);
    expect(bare.headers['cache-control']).toBe('private, no-cache');
    expect((await onB('get', `/api/media/${up.body.media.id}`).set('If-None-Match', bare.headers.etag)).status).toBe(304);
  });

  it('rejects files that are not what they claim to be', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');
    const fake = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await admin.post('/api/media').field('kind', 'image').attach('file', fake, 'logo.png')).status).toBe(400);
    expect((await admin.post('/api/media').field('kind', 'document').attach('file', fake, 'doc.pdf')).status).toBe(400);
  });
});
