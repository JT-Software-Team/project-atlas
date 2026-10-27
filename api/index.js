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

  // Initial Super Admin from environment variables, with safe permanent fallback.
  const adminLoginId = process.env.ATLAS_ADMIN_EMAIL || process.env.ATLAS_ADMIN_LOGIN_ID || 'admin@atlas';
  const adminPassword = process.env.ATLAS_ADMIN_PASSWORD || 'AtlasAdmin@123';
  const adminName = process.env.ATLAS_ADMIN_NAME || 'Atlas Super Admin';
  try {
    await provisionSuperAdmin(db, {
      loginId: adminLoginId,
      name: adminName,
      password: adminPassword,
      reset: true,
      mustChangePassword: false,
    }, config.auth.minPasswordLength);

    // Also provision admin@atlas.local with the exact same password and no required change
    // so both admin handles work seamlessly and permanently.
    if (adminLoginId !== 'admin@atlas.local') {
      try {
        await provisionSuperAdmin(db, {
          loginId: 'admin@atlas.local',
          name: adminName,
          password: adminPassword,
          reset: true,
          mustChangePassword: false,
        }, config.auth.minPasswordLength);
      } catch {
        // ignore
      }
    }
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
