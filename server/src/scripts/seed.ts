/**
 * Seed demo data.
 *   npm run seed                 → default categories + the three demo projects
 *   npm run seed -- --demo-users → also create demo accounts with random passwords (printed once)
 */
import crypto from 'node:crypto';
import { databaseTarget } from '../config.js';
import { nowIso, openDatabase } from '../db/index.js';
import { hashPassword } from '../auth/passwords.js';
import { insertDemoProjects } from './demoData.js';

const db = await openDatabase(databaseTarget());
const inserted = await insertDemoProjects(db);
console.info(`Demo projects inserted: ${inserted}`);

if (process.argv.includes('--demo-users')) {
  const demo = [
    { email: 'superadmin@demo.atlas.local', name: 'Demo Super Admin', role: 'super_admin' },
    { email: 'projectadmin@demo.atlas.local', name: 'Demo Project Admin', role: 'project_admin' },
    { email: 'viewer@demo.atlas.local', name: 'Demo Viewer', role: 'viewer' },
  ];
  console.info('\nDemo accounts (passwords are random and shown only now):');
  for (const u of demo) {
    if (await db.prepare('SELECT 1 FROM users WHERE email = ?').get(u.email)) {
      console.info(`  ${u.email} already exists — skipped`);
      continue;
    }
    const password = `Atlas-${crypto.randomBytes(9).toString('base64url')}`;
    await db.prepare('INSERT INTO users (email, name, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(u.email, u.name, u.role, await hashPassword(password), nowIso(), nowIso());
    console.info(`  ${u.role.padEnd(14)} ${u.email}  ${password}`);
  }
  // The demo project admin manages the first demo project.
  const pa = await db.prepare(`SELECT id FROM users WHERE email = 'projectadmin@demo.atlas.local'`).get() as { id: number } | undefined;
  const p = await db.prepare(`SELECT id FROM projects WHERE slug = 'gunny-ball-project'`).get() as { id: number } | undefined;
  if (pa && p) {
    await db.prepare(`INSERT OR IGNORE INTO project_access (project_id, user_id, level, granted_at) VALUES (?, ?, 'manage', ?)`).run(p.id, pa.id, nowIso());
  }
  console.info('\nDemo accounts are for evaluation only. Disable them before going live.');
}
