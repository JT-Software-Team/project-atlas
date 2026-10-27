import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { config, validateProductionConfig } from '../config.js';
import { openDatabase, schemaVersion } from '../db/index.js';
import { migrations } from '../db/schema.js';
import { readMediaFile } from '../services/media.js';
import { copyDatabase } from '../scripts/copyData.js';
import { login, projectId, setup } from './helpers.js';

const png = (color: string) => sharp({ create: { width: 48, height: 32, channels: 3, background: color } }).png().toBuffer();
const sign = (payload: string) => crypto.createHmac('sha256', config.session.secret).update(payload).digest('base64url');

describe('production configuration', () => {
  const saved = process.env.ATLAS_SESSION_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.ATLAS_SESSION_SECRET;
    else process.env.ATLAS_SESSION_SECRET = saved;
  });

  it('refuses to start serverless without a hosted database or a strong session secret', () => {
    process.env.ATLAS_SESSION_SECRET = 'too-short-secret';
    let message = '';
    try { validateProductionConfig({ isServerless: true }); } catch (err) { message = (err as Error).message; }
    expect(message).toContain('ATLAS_DATABASE_URL');
    expect(message).toContain('ATLAS_SESSION_SECRET');
    expect(message).not.toContain('too-short-secret'); // names variables, never echoes values
  });

  it('accepts local development without production settings', () => {
    delete process.env.ATLAS_SESSION_SECRET;
    expect(() => validateProductionConfig({ isServerless: false })).not.toThrow();
  });
});

describe('sessions', () => {
  it('rejects forged cookies, including ones naming a user that does not exist', async () => {
    const { app } = await setup();
    const me = (cookie: string) => request(app).get('/api/auth/me').set('Cookie', `atlas_session=${cookie}`);
    const exp = Date.now() + 3600_000;
    // Signed with a guessed secret: rejected before any lookup.
    const guessed = `999.${exp}.1.abc`;
    expect((await me(`${guessed}.${crypto.createHmac('sha256', 'guess').update(guessed).digest('base64url')}`)).status).toBe(401);
    // Correctly signed but with no session row (the old "recovery" path granted a Super Admin here).
    const orphan = `999.${exp}.1.${crypto.randomBytes(16).toString('hex')}`;
    expect((await me(`${orphan}.${sign(orphan)}`)).status).toBe(401);
  });

  it('ends sessions of deleted users', async () => {
    const { app, db, ids } = await setup();
    const viewer = await login(app, 'viewer@test.local');
    expect((await viewer.get('/api/auth/me')).status).toBe(200);
    await db.prepare('DELETE FROM users WHERE id = ?').run(ids.viewer);
    expect((await viewer.get('/api/auth/me')).status).toBe(401);
  });

  it('locks every account after repeated failures, administrators included', async () => {
    const { app } = await setup();
    for (let i = 0; i < config.auth.maxFailedAttempts; i++) {
      await request(app).post('/api/auth/login').set('x-atlas-request', '1').send({ email: 'admin@test.local', password: 'wrong-password' });
    }
    const res = await request(app).post('/api/auth/login').set('x-atlas-request', '1').send({ email: 'admin@test.local', password: 'Correct-Horse-42' });
    expect(res.status).toBe(423);
  });
});

describe('upload storage', () => {
  it('only lets administrators upload', async () => {
    const { app } = await setup();
    const viewer = await login(app, 'viewer@test.local');
    expect((await viewer.post('/api/media').field('kind', 'image').attach('file', await png('#fff'), 'x.png')).status).toBe(403);
  });

  it('frees replaced images and the files of deleted projects', async () => {
    const { app, db } = await setup();
    const admin = await login(app, 'admin@test.local');
    const id = await projectId(db, 'anode-chipping-project');
    const first = (await admin.post('/api/media').field('kind', 'image').attach('file', await png('#f00'), 'a.png')).body.media;
    const second = (await admin.post('/api/media').field('kind', 'image').attach('file', await png('#00f'), 'b.png')).body.media;
    const save = (coverMediaId: number) => admin.put(`/api/projects/${id}`).send({ name: 'Anode Chipping Project', status: 'active', visibility: 'private', coverMediaId });

    expect((await save(first.id)).status).toBe(200);
    expect((await save(second.id)).status).toBe(200);
    expect(await db.prepare('SELECT 1 FROM media WHERE id = ?').get(first.id)).toBeUndefined(); // replaced → removed
    expect((await admin.get(second.url)).status).toBe(200);

    await admin.post(`/api/projects/${id}/archive`);
    expect((await admin.del(`/api/projects/${id}`).send({ confirm: 'anode-chipping-project' })).status).toBe(200);
    expect(await db.prepare('SELECT 1 FROM media WHERE id = ?').get(second.id)).toBeUndefined();
    expect((await db.prepare('SELECT COUNT(*) AS n FROM media_files').get())!.n).toBe(0);
  });

  it('refuses uploads beyond the storage limit and reports usage', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin@test.local');
    const limit = config.storage.limitBytes;
    config.storage.limitBytes = 10;
    try {
      const res = await admin.post('/api/media').field('kind', 'image').attach('file', await png('#0f0'), 'c.png');
      expect(res.status).toBe(507);
    } finally {
      config.storage.limitBytes = limit;
    }
    const usage = (await admin.get('/api/media/usage')).body;
    expect(usage.storage.limitBytes).toBe(limit);
    expect(usage.records.projects).toBe(3);
    const viewer = await login(app, 'viewer@test.local');
    expect((await viewer.get('/api/media/usage')).status).toBe(403);
  });
});

describe('schema versioning', () => {
  it('continues databases that recorded their version with PRAGMA user_version, without re-running migrations', async () => {
    const file = path.join(os.tmpdir(), `atlas-legacy-${process.pid}-${Date.now()}.db`);
    const legacy = new DatabaseSync(file);
    for (const sql of migrations) legacy.exec(sql);
    legacy.exec(`PRAGMA user_version = ${migrations.length}`);
    legacy.exec("INSERT INTO categories (name, slug, sort_order, created_at) VALUES ('Kept', 'kept', 0, 'now')");
    legacy.close();

    const db = await openDatabase(file); // would fail with "table already exists" if migrations re-ran
    expect(await schemaVersion(db)).toBe(migrations.length);
    expect(await db.prepare("SELECT name FROM categories WHERE slug = 'kept'").get()).toEqual({ name: 'Kept' });
    db.close();
    const again = await openDatabase(file);
    expect(await schemaVersion(again)).toBe(migrations.length);
    again.close();
  });
});

describe('copying data between databases (migration and backup)', () => {
  it('keeps IDs, relationships and images, imports legacy files, and refuses non-empty targets', async () => {
    const { app, db } = await setup();
    const admin = await login(app, 'admin@test.local');
    const up = (await admin.post('/api/media').field('kind', 'image').attach('file', await png('#0ff'), 'cover.png')).body.media;
    const pid = await projectId(db, 'gunny-ball-project');
    await admin.put(`/api/projects/${pid}`).send({ name: 'Gunny Ball Project', status: 'active', visibility: 'private', coverMediaId: up.id });

    // Simulate a pre-database upload: the file lives only in the legacy uploads directory.
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-legacy-'));
    const stored = await db.prepare('SELECT stored_name, thumb_name FROM media WHERE id = ?').get(up.id) as { stored_name: string; thumb_name: string };
    for (const name of [stored.stored_name, stored.thumb_name]) {
      fs.writeFileSync(path.join(legacyDir, name), (await readMediaFile(db, name))!);
    }
    await db.prepare('DELETE FROM media_files').run();

    const target = await openDatabase(':memory:');
    const dry = await copyDatabase(db, target, { legacyUploadsDir: legacyDir, dryRun: true });
    expect(dry.legacyFilesImported).toBe(2);
    expect((await target.prepare('SELECT COUNT(*) AS n FROM projects').get())!.n).toBe(0); // dry run wrote nothing

    const report = await copyDatabase(db, target, { legacyUploadsDir: legacyDir, disableUsers: ['viewer@test.local'] });
    expect(report.missingFiles).toEqual([]);
    expect(await target.prepare('SELECT cover_media_id FROM projects WHERE id = ?').get(pid)).toEqual({ cover_media_id: up.id });
    expect((await readMediaFile(target, stored.stored_name))!.length).toBeGreaterThan(0);
    expect(await target.prepare('SELECT is_active, password_hash FROM users WHERE email = ?').get('viewer@test.local'))
      .toEqual({ is_active: 0, password_hash: null });
    expect(await target.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 }); // credentials stay behind

    await expect(copyDatabase(db, target)).rejects.toThrow(/already contains data/);
  });
});
