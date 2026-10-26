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

  // The initial Super Admin comes from server-side environment variables (Vercel project settings),
  // never from source. Existing accounts are left unchanged.
  const { ATLAS_ADMIN_EMAIL, ATLAS_ADMIN_PASSWORD, ATLAS_ADMIN_NAME } = process.env;
  if (ATLAS_ADMIN_EMAIL && ATLAS_ADMIN_PASSWORD) {
    try {
      await provisionSuperAdmin(db, {
        loginId: ATLAS_ADMIN_EMAIL,
        name: ATLAS_ADMIN_NAME || 'Atlas Super Admin',
        password: ATLAS_ADMIN_PASSWORD,
      }, config.auth.minPasswordLength);
    } catch (err) {
      console.error(`Super Admin provisioning skipped: ${err.message}`);
    }
  } else {
    console.warn('ATLAS_ADMIN_EMAIL / ATLAS_ADMIN_PASSWORD are not set; no Super Admin was provisioned.');
  }

  appInstance = createApp({ db, mailer: new OutboxMailer() });
  return appInstance;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
