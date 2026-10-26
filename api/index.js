import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createApp } from '../server/dist/app.js';
import { config } from '../server/dist/config.js';
import { openDatabase } from '../server/dist/db/index.js';
import { OutboxMailer } from '../server/dist/services/mailer.js';
import { ensureReferenceData } from '../server/dist/scripts/referenceData.js';
import { insertDemoProjects } from '../server/dist/scripts/demoData.js';
import { provisionSuperAdmin } from '../server/dist/auth/provision.js';

let appInstance = null;

async function getApp() {
  if (appInstance) return appInstance;

  const dbPath = path.join(os.tmpdir(), 'atlas.db');
  const isNew = !fs.existsSync(dbPath);
  const db = openDatabase(dbPath);
  ensureReferenceData(db);
  if (isNew) insertDemoProjects(db);

  // Initial Super Admin from environment variables, with safe demo fallback for evaluation.
  const adminLoginId = process.env.ATLAS_ADMIN_EMAIL || process.env.ATLAS_ADMIN_LOGIN_ID || 'admin@atlas.local';
  const adminPassword = process.env.ATLAS_ADMIN_PASSWORD || 'AtlasAdmin!2026';
  const adminName = process.env.ATLAS_ADMIN_NAME || 'Admin User';
  try {
    await provisionSuperAdmin(db, {
      loginId: adminLoginId,
      name: adminName,
      password: adminPassword,
    }, config.auth.minPasswordLength);
  } catch (err) {
    console.error(`Super Admin provisioning skipped: ${err.message}`);
  }

  appInstance = createApp({ db, mailer: new OutboxMailer() });
  return appInstance;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
