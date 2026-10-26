/**
 * Create the initial Super Admin account. The password must be changed at first sign-in.
 * Interactive:      npm run create-admin
 * Non-interactive:  ATLAS_ADMIN_EMAIL=… ATLAS_ADMIN_NAME=… ATLAS_ADMIN_PASSWORD=… npm run create-admin
 * ATLAS_ADMIN_EMAIL may be an email address or a user ID such as `atlas@admin`.
 * An existing account is never changed unless `-- --reset` is passed.
 */
import path from 'node:path';
import readline from 'node:readline/promises';
import { config } from '../config.js';
import { openDatabase } from '../db/index.js';
import { provisionSuperAdmin } from '../auth/provision.js';
import { ensureReferenceData } from './referenceData.js';

const db = openDatabase(path.join(config.dataDir, 'atlas.db'));
ensureReferenceData(db);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q: string, env?: string) => (env ? env : (await rl.question(q)).trim());

const loginId = (await ask('Admin email or user ID: ', process.env.ATLAS_ADMIN_EMAIL)).toLowerCase();
const name = await ask('Full name: ', process.env.ATLAS_ADMIN_NAME);
const password = await ask('Password (min 10 chars, 3 character types): ', process.env.ATLAS_ADMIN_PASSWORD);
rl.close();

try {
  const result = await provisionSuperAdmin(db, { loginId, name, password, reset: process.argv.includes('--reset') }, config.auth.minPasswordLength);
  if (result === 'exists') {
    console.info(`${loginId} already exists and was left unchanged. Re-run with \`-- --reset\` to replace its password and make it a Super Admin.`);
  } else {
    console.info(`${result === 'created' ? 'Created' : 'Reset'} Super Admin ${loginId}. The password must be changed at first sign-in.`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
