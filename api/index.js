import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createApp } from '../server/dist/app.js';
import { openDatabase, nowIso } from '../server/dist/db/index.js';
import { OutboxMailer } from '../server/dist/services/mailer.js';
import { ensureReferenceData } from '../server/dist/scripts/referenceData.js';
import { insertDemoProjects } from '../server/dist/scripts/demoData.js';
import { hashPassword } from '../server/dist/auth/passwords.js';

let appInstance = null;

async function getApp() {
  if (appInstance) return appInstance;

  const dbPath = path.join(os.tmpdir(), 'atlas.db');
  const isNew = !fs.existsSync(dbPath);
  const db = openDatabase(dbPath);
  ensureReferenceData(db);

  if (isNew) {
    insertDemoProjects(db);
    const hash = await hashPassword('AtlasAdmin!2026');
    db.prepare('INSERT OR IGNORE INTO users (email, name, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('admin@atlas.local', 'Admin User', 'super_admin', hash, nowIso(), nowIso());
  }

  appInstance = createApp({ db, mailer: new OutboxMailer() });
  return appInstance;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
