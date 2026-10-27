import { createApp } from '../server/dist/app.js';
import { config, databaseTarget, validateProductionConfig } from '../server/dist/config.js';
import { openDatabase } from '../server/dist/db/index.js';
import { OutboxMailer } from '../server/dist/services/mailer.js';
import { ensureReferenceData } from '../server/dist/scripts/referenceData.js';
import { insertDemoProjects } from '../server/dist/scripts/demoData.js';
import { provisionSuperAdmin } from '../server/dist/auth/provision.js';
import { verifyPassword } from '../server/dist/auth/passwords.js';

let appPromise = null;

/**
 * Bootstrap the Super Admin from ATLAS_ADMIN_EMAIL / ATLAS_ADMIN_PASSWORD (Vercel environment variables;
 * there is deliberately no default). An existing account is left alone, so a password changed in the
 * portal stays changed. Set ATLAS_ADMIN_RESET=true temporarily to restore access with the configured
 * password, then remove it again.
 */
async function bootstrapSuperAdmin(db) {
  const loginId = (process.env.ATLAS_ADMIN_EMAIL || process.env.ATLAS_ADMIN_LOGIN_ID || '').trim().toLowerCase();
  const password = process.env.ATLAS_ADMIN_PASSWORD || '';
  const name = process.env.ATLAS_ADMIN_NAME || 'Atlas Super Admin';
  if (!loginId || !password) {
    const { n } = await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND is_active = 1`).get();
    if (n === 0) console.warn('No active Super Admin exists. Set ATLAS_ADMIN_EMAIL and ATLAS_ADMIN_PASSWORD to create one.');
    return;
  }
  const reset = process.env.ATLAS_ADMIN_RESET === 'true';
  if (reset) {
    const row = await db.prepare('SELECT password_hash, role, is_active FROM users WHERE email = ?').get(loginId);
    const current = row && row.role === 'super_admin' && row.is_active && await verifyPassword(password, row.password_hash);
    if (current) return; // nothing to restore; avoids signing the admin out on every cold start
  }
  const result = await provisionSuperAdmin(db, { loginId, name, password, reset, mustChangePassword: false }, config.auth.minPasswordLength);
  if (result !== 'exists') console.info(`Super Admin ${result === 'created' ? 'created' : 'restored'} from environment variables.`);
}

async function createAppInstance() {
  // Refuse to run without a shared hosted database and a strong session secret.
  validateProductionConfig({ isServerless: true });

  const db = await openDatabase(databaseTarget());
  await ensureReferenceData(db);

  // Seed the demo projects only into a brand-new database, so deleted demo records stay deleted.
  const { n: projects } = await db.prepare('SELECT COUNT(*) AS n FROM projects').get();
  const { n: events } = await db.prepare('SELECT COUNT(*) AS n FROM audit_log').get();
  if (projects === 0 && events === 0) await insertDemoProjects(db);

  try {
    await bootstrapSuperAdmin(db);
  } catch (err) {
    console.error(`Super Admin provisioning skipped: ${err.message}`);
  }

  return createApp({ db, mailer: new OutboxMailer() });
}

export default async function handler(req, res) {
  try {
    if (!appPromise) {
      appPromise = createAppInstance().catch((err) => {
        appPromise = null; // retry on the next request instead of caching the failure
        throw err;
      });
    }
    const app = await appPromise;
    return app(req, res);
  } catch (err) {
    // Details (variable names only, never values) go to the function logs, not to visitors.
    console.error(`Fatal startup error: ${err.message}`);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({
      error: 'Project Atlas is not configured correctly. An administrator must check the deployment settings (see docs/DEPLOYMENT.md).',
    }));
  }
}
