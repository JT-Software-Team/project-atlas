import request from 'supertest';
import { createApp } from '../app.js';
import { hashPassword } from '../auth/passwords.js';
import { nowIso, openDatabase, type DB } from '../db/index.js';
import { MemoryMailer } from '../services/mailer.js';
import { insertDemoProjects } from '../scripts/demoData.js';

export const PASSWORD = 'Correct-Horse-42';

export async function setup() {
  const db = openDatabase(':memory:');
  insertDemoProjects(db);
  const mailer = new MemoryMailer();
  const app = createApp({ db, mailer });
  const hash = await hashPassword(PASSWORD);
  const mk = (email: string, name: string, role: string) => Number(db.prepare(
    'INSERT INTO users (email, name, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(email, name, role, hash, nowIso(), nowIso()).lastInsertRowid);
  const ids = {
    admin: mk('admin@test.local', 'Ada Admin', 'super_admin'),
    pa: mk('pa@test.local', 'Paul ProjectAdmin', 'project_admin'),
    viewer: mk('viewer@test.local', 'Vera Viewer', 'viewer'),
  };
  return { db, app, mailer, ids };
}

/** A logged-in supertest agent that sends the CSRF header on every request. */
export async function login(app: ReturnType<typeof createApp>, email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set('x-atlas-request', '1').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const wrap = (m: 'get' | 'post' | 'put' | 'delete') => (url: string) => agent[m](url).set('x-atlas-request', '1');
  return { agent, get: wrap('get'), post: wrap('post'), put: wrap('put'), del: wrap('delete') };
}

export function projectId(db: DB, slug: string) {
  return (db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug) as { id: number }).id;
}
