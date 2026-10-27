/**
 * Copy local portal data (data/atlas.db and the legacy data/uploads folder) into the hosted database.
 *
 *   npm run migrate-to-hosted                       → dry run: checks and reports, writes nothing
 *   npm run migrate-to-hosted -- --apply            → backs up the local data, then copies it
 *   npm run migrate-to-hosted -- --apply --disable-user admin@atlas --disable-user admin@atlas.local
 *   npm run migrate-to-hosted -- --source data/backups/atlas-2026-10-27.db --apply   (restore a backup)
 *
 * The hosted database comes from ATLAS_DATABASE_URL / ATLAS_DATABASE_AUTH_TOKEN, normally kept in the
 * git-ignored .env.hosted file (never in .env, which local development uses). It must be empty.
 * The local files are only read; nothing local is changed or deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { openDatabase } from '../db/index.js';
import { copyDatabase, DATA_TABLES } from './copyData.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const valueOf = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
// npm runs workspace scripts inside server/; resolve --source from where the command was typed.
const sourceFile = path.resolve(process.env.INIT_CWD ?? process.cwd(), valueOf('--source')[0] ?? path.join(config.dataDir, 'atlas.db'));
const uploadsDir = path.join(config.dataDir, 'uploads');

if (!config.database.url) {
  console.error('Set ATLAS_DATABASE_URL and ATLAS_DATABASE_AUTH_TOKEN for the hosted database in .env.hosted first (see docs/OPERATIONS.md).');
  process.exit(1);
}
if (!fs.existsSync(sourceFile)) {
  console.error(`Source database not found: ${sourceFile}`);
  process.exit(1);
}

if (apply) {
  // A restorable copy of everything local, taken before anything else happens.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(config.dataDir, 'backups', `pre-migration-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(sourceFile + suffix)) fs.copyFileSync(sourceFile + suffix, path.join(backupDir, path.basename(sourceFile) + suffix));
  }
  if (fs.existsSync(uploadsDir)) fs.cpSync(uploadsDir, path.join(backupDir, 'uploads'), { recursive: true });
  console.info(`Local backup written to ${backupDir}`);
}

const source = await openDatabase(sourceFile, { readOnlySource: true });
const target = await openDatabase({ url: config.database.url, authToken: config.database.authToken });
try {
  const report = await copyDatabase(source, target, {
    legacyUploadsDir: uploadsDir,
    disableUsers: valueOf('--disable-user'),
    dryRun: !apply,
  });
  console.info(apply ? '\nCopied and verified:' : '\nDry run (nothing written). Would copy:');
  for (const t of DATA_TABLES) console.info(`  ${t.padEnd(16)} ${report.rows[t]}`);
  console.info(`  files from data/uploads: ${report.legacyFilesImported}`);
  if (report.disabledUsers.length) console.info(`  disabled accounts: ${report.disabledUsers.join(', ')}`);
  if (report.missingFiles.length) console.warn(`  WARNING: ${report.missingFiles.length} referenced file(s) not found: ${report.missingFiles.join(', ')}`);

  const admins = await source.prepare(`SELECT email FROM users WHERE role = 'super_admin' AND is_active = 1`).all() as { email: string }[];
  const kept = admins.map((a) => a.email).filter((e) => !report.disabledUsers.includes(e.toLowerCase()));
  console.info(`\nActive Super Admins after migration: ${kept.join(', ') || 'none'}.`);
  console.info('Disable any account whose password is shared, default or unknown with --disable-user <login>.');
  if (!apply) console.info('\nRe-run with --apply to perform the copy.');
} catch (err) {
  console.error(`\nMigration stopped, nothing was changed in the hosted database: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  source.close();
  target.close();
}
