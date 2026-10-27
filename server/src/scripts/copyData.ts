import fs from 'node:fs';
import path from 'node:path';
import type { DB, Row } from '../db/index.js';

/**
 * Tables holding portal content, in an order that keeps most references pointing backwards.
 * Sessions and password tokens are deliberately excluded: they are credentials for one environment.
 */
export const DATA_TABLES = [
  'categories', 'clients', 'users', 'media', 'media_files', 'projects', 'project_gallery', 'dashboards',
  'project_access', 'favorites', 'recent_access', 'audit_log',
] as const;

/** Tables that make a database "in use". A target with rows in any of them is never overwritten. */
const CONTENT_TABLES = ['users', 'clients', 'projects', 'media', 'media_files', 'audit_log'];

export interface CopyReport {
  rows: Record<string, number>;
  /** Files copied from the legacy uploads directory because the source database did not hold them. */
  legacyFilesImported: number;
  /** Stored names referenced by media rows but found neither in the source database nor on disk. */
  missingFiles: string[];
  disabledUsers: string[];
}

export interface CopyOptions {
  /** Directory of pre-database uploads (data/uploads) to import files from. */
  legacyUploadsDir?: string;
  /** Accounts (login IDs) to copy deactivated and without a password, e.g. ones with publicly known passwords. */
  disableUsers?: string[];
  /** Inspect and report only; nothing is written. */
  dryRun?: boolean;
}

const exists = async (db: DB, table: string) => !!(await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
/** Rows in `table`; 0 when an older source database does not have that table yet. */
const count = async (db: DB, table: string) => ((await exists(db, table))
  ? Number(((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()) as { n: number }).n)
  : 0);
const columns = async (db: DB, table: string) => ((await db.prepare(`PRAGMA table_info(${table})`).all()) as { name: string }[]).map((c) => c.name);

/** Throws unless the target holds no portal content (default categories alone are fine). */
export async function assertEmptyTarget(target: DB) {
  const used = [];
  for (const t of CONTENT_TABLES) if (await count(target, t)) used.push(t);
  if (used.length) {
    throw new Error(`The target database already contains data (${used.join(', ')}). Copy only into a new, empty database.`);
  }
}

/** Every file name the media rows refer to. */
async function referencedFiles(db: DB): Promise<string[]> {
  const rows = await db.prepare('SELECT stored_name, thumb_name FROM media').all() as { stored_name: string; thumb_name: string | null }[];
  return rows.flatMap((r) => [r.stored_name, r.thumb_name]).filter((n): n is string => !!n).map((n) => path.basename(n));
}

/**
 * Copy all portal content from `source` to an empty `target`, keeping every ID so relationships and
 * image references stay intact. Runs in one transaction on the target with foreign keys checked at commit:
 * any broken reference or count mismatch rolls the whole copy back. The source is only read.
 */
export async function copyDatabase(source: DB, target: DB, opts: CopyOptions = {}): Promise<CopyReport> {
  await assertEmptyTarget(target);
  const disable = new Set((opts.disableUsers ?? []).map((u) => u.trim().toLowerCase()));
  const report: CopyReport = { rows: {}, legacyFilesImported: 0, missingFiles: [], disabledUsers: [] };

  // Which referenced files exist, and where.
  const needed = await referencedFiles(source);
  const inSource = new Set(await exists(source, 'media_files')
    ? ((await source.prepare('SELECT name FROM media_files').all()) as { name: string }[]).map((r) => r.name)
    : []);
  const fromDisk = needed.filter((n) => !inSource.has(n) && opts.legacyUploadsDir && fs.existsSync(path.join(opts.legacyUploadsDir, n)));
  report.missingFiles = needed.filter((n) => !inSource.has(n) && !fromDisk.includes(n));
  const sourceUsers = (await source.prepare('SELECT email FROM users').all()) as { email: string }[];
  report.disabledUsers = sourceUsers.map((u) => u.email.toLowerCase()).filter((e) => disable.has(e));

  for (const t of DATA_TABLES) report.rows[t] = await count(source, t);
  if (opts.dryRun) {
    report.legacyFilesImported = fromDisk.length;
    return report;
  }

  await target.transaction(async () => {
    // References are checked when the transaction commits, so tables can be filled in any order.
    await target.exec('PRAGMA defer_foreign_keys = ON');
    await target.prepare('DELETE FROM categories').run(); // the target only holds the default list (checked above)

    for (const table of DATA_TABLES) {
      if (!report.rows[table]) continue; // nothing to copy (or the source predates this table)
      // Columns present in both schemas, so a newer or older schema on either side still copies cleanly.
      const targetCols = new Set(await columns(target, table));
      const cols = (await columns(source, table)).filter((c) => targetCols.has(c));
      const list = cols.map((c) => `"${c}"`).join(', ');
      const insert = target.prepare(`INSERT INTO ${table} (${list}) VALUES (${cols.map(() => '?').join(', ')})`);
      let last = 0;
      for (;;) {
        // Page by rowid so large tables (file contents) are never loaded all at once.
        const page = await source.prepare(`SELECT rowid AS "__rowid", ${list} FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT 200`).all(last) as Row[];
        if (!page.length) break;
        for (const row of page) {
          if (table === 'users' && disable.has(String(row.email).toLowerCase())) {
            row.is_active = 0;
            row.password_hash = null;
          }
          await insert.run(...cols.map((c) => row[c] as never));
        }
        last = Number(page[page.length - 1].__rowid);
      }
    }

    for (const name of fromDisk) {
      await target.prepare('INSERT INTO media_files (name, data) VALUES (?, ?)').run(name, fs.readFileSync(path.join(opts.legacyUploadsDir!, name)));
      report.legacyFilesImported++;
    }

    // Verify before committing.
    for (const t of DATA_TABLES) {
      const expected = report.rows[t] + (t === 'media_files' ? report.legacyFilesImported : 0);
      const actual = await count(target, t);
      if (actual !== expected) throw new Error(`Verification failed for ${t}: expected ${expected} rows, found ${actual}.`);
    }
    const broken = await target.prepare('PRAGMA foreign_key_check').all();
    if (broken.length) throw new Error(`Verification failed: ${broken.length} broken reference(s), e.g. ${JSON.stringify(broken[0])}.`);
  });
  return report;
}
