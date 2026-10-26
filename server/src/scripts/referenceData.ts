import { nowIso, type DB } from '../db/index.js';
import { DEFAULT_CATEGORIES } from '../services/catalog.js';
import { slugify } from '../services/slug.js';

/** Insert the default categories on first start. Administrators manage them afterwards. */
export function ensureReferenceData(db: DB) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number };
  if (n > 0) return;
  const insert = db.prepare('INSERT INTO categories (name, slug, sort_order, created_at) VALUES (?, ?, ?, ?)');
  DEFAULT_CATEGORIES.forEach((name, i) => insert.run(name, slugify(name), i, nowIso()));
}
