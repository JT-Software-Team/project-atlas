/**
 * Create (or reset) a Super Admin account.
 * Interactive:      npm run create-admin
 * Non-interactive:  ATLAS_ADMIN_EMAIL=… ATLAS_ADMIN_NAME=… ATLAS_ADMIN_PASSWORD=… npm run create-admin
 */
import path from 'node:path';
import readline from 'node:readline/promises';
import { config } from '../config.js';
import { nowIso, openDatabase } from '../db/index.js';
import { hashPassword, passwordProblems } from '../auth/passwords.js';
import { ensureReferenceData } from './referenceData.js';

const db = openDatabase(path.join(config.dataDir, 'atlas.db'));
ensureReferenceData(db);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q: string, env?: string) => (env ? env : (await rl.question(q)).trim());

const email = (await ask('Admin email: ', process.env.ATLAS_ADMIN_EMAIL)).toLowerCase();
const name = await ask('Full name: ', process.env.ATLAS_ADMIN_NAME);
const password = await ask('Password (min 10 chars, 3 character types): ', process.env.ATLAS_ADMIN_PASSWORD);
rl.close();

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
  console.error('A valid email and name are required.');
  process.exit(1);
}
const problem = passwordProblems(password, config.auth.minPasswordLength);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const hash = await hashPassword(password);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
if (existing) {
  db.prepare(`UPDATE users SET name = ?, role = 'super_admin', password_hash = ?, is_active = 1, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`)
    .run(name, hash, nowIso(), existing.id);
  console.info(`Updated ${email} and made them a Super Admin.`);
} else {
  db.prepare(`INSERT INTO users (email, name, role, password_hash, created_at, updated_at) VALUES (?, ?, 'super_admin', ?, ?, ?)`)
    .run(email, name, hash, nowIso(), nowIso());
  console.info(`Created Super Admin ${email}.`);
}
