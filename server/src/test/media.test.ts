import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { login, projectId, setup } from './helpers.js';

describe('uploads', () => {
  it('accepts real images, re-encodes them, and enforces project permissions', async () => {
    const { app, db } = await setup();
    const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#8B5CF6' } }).png().toBuffer();
    const admin = await login(app, 'admin@test.local');
    const up = await admin.post('/api/media').field('kind', 'image').attach('file', png, 'cover.png');
    expect(up.status).toBe(201);
    expect(up.body.media.width).toBe(64);

    const id = projectId(db, 'gunny-ball-project');
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

  it('rejects files that are not what they claim to be', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');
    const fake = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await admin.post('/api/media').field('kind', 'image').attach('file', fake, 'logo.png')).status).toBe(400);
    expect((await admin.post('/api/media').field('kind', 'document').attach('file', fake, 'doc.pdf')).status).toBe(400);
  });
});
