import { nowIso, type DB } from '../db/index.js';
import { DEFAULT_CATEGORIES } from '../services/catalog.js';
import { slugify } from '../services/slug.js';

/** Insert the default categories on first start. Administrators manage them afterwards. */
export async function ensureReferenceData(db: DB) {
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number };
  if (n > 0) return;
  const insert = db.prepare('INSERT OR IGNORE INTO categories (name, slug, sort_order, created_at) VALUES (?, ?, ?, ?)');
  for (const [i, name] of DEFAULT_CATEGORIES.entries()) await insert.run(name, slugify(name), i, nowIso());
}
