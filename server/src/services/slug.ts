import type { DB } from '../db/index.js';

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/** Return `base`, or `base-2`, `base-3`… whichever is free in the given table. */
export function uniqueSlug(db: DB, table: 'projects' | 'clients' | 'categories', base: string, exceptId?: number): string {
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`);
  let candidate = base;
  for (let i = 2; ; i++) {
    const row = stmt.get(candidate) as { id: number } | undefined;
    if (!row || row.id === exceptId) return candidate;
    candidate = `${base}-${i}`;
  }
}
