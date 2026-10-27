/**
 * Export the whole portal (records and uploaded files) from the configured database to a standalone
 * SQLite file in data/backups. Works on the free plan: it only reads through the normal API.
 *
 *   npm run backup                      → data/backups/atlas-<timestamp>.db
 *
 * Restore into a new, empty hosted database with:
 *   npm run migrate-to-hosted -- --source data/backups/atlas-<timestamp>.db --apply
 * The file also opens in any SQLite tool (e.g. DB Browser for SQLite) for inspection or other migrations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, databaseTarget } from '../config.js';
import { openDatabase } from '../db/index.js';
import { copyDatabase, DATA_TABLES } from './copyData.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join(config.dataDir, 'backups');
const file = path.join(dir, `atlas-${stamp}.db`);
fs.mkdirSync(dir, { recursive: true });

const source = await openDatabase(databaseTarget(), { readOnlySource: true });
const target = await openDatabase(file);
try {
  const report = await copyDatabase(source, target);
  console.info(`Backup of the ${config.database.url ? 'hosted' : 'local'} database written to ${file}`);
  for (const t of DATA_TABLES) console.info(`  ${t.padEnd(16)} ${report.rows[t]}`);
  if (report.missingFiles.length) console.warn(`  WARNING: ${report.missingFiles.length} referenced file(s) are missing in the source.`);
} catch (err) {
  console.error(`Backup failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  source.close();
  target.close();
}
