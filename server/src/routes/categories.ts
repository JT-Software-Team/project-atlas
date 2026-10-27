import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { nowIso, transaction, type DB } from '../db/index.js';
import { ah, HttpError, parseId } from '../http.js';
import { audit } from '../services/audit.js';
import { accessibleProjects } from '../services/projects.js';
import { slugify, uniqueSlug } from '../services/slug.js';
import { optText } from './validators.js';

const input = z.object({ name: z.string().trim().min(2, 'Category name is required.').max(80), description: optText(300) });

export function categoryRoutes(db: DB) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', ah(async (req, res) => {
    const counts = new Map<number, number>();
    for (const p of await accessibleProjects(db, req.user!)) {
      if (p.row.category_id) counts.set(p.row.category_id, (counts.get(p.row.category_id) ?? 0) + 1);
    }
    const rows = await db.prepare('SELECT id, name, slug, description, sort_order FROM categories ORDER BY sort_order, name').all() as
      { id: number; name: string; slug: string; description: string | null; sort_order: number }[];
    res.json({ categories: rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, projectCount: counts.get(c.id) ?? 0 })) });
  }));

  r.post('/', requireRole('super_admin'), ah(async (req, res) => {
    const body = input.parse(req.body);
    if (await db.prepare('SELECT 1 FROM categories WHERE name = ?').get(body.name)) throw new HttpError(409, 'That category already exists.', { field: 'name' });
    const { m } = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get() as { m: number };
    const result = await db.prepare('INSERT INTO categories (name, slug, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(body.name, await uniqueSlug(db, 'categories', slugify(body.name)), body.description, m + 1, nowIso());
    await audit(db, req, { action: 'category.created', summary: `Added category “${body.name}”`, entityType: 'category', entityId: Number(result.lastInsertRowid) });
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  }));

  r.put('/order', requireRole('super_admin'), ah(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.number().int().positive()).max(500) }).parse(req.body);
    await transaction(db, async () => {
      for (const [i, id] of ids.entries()) await db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').run(i, id);
    });
    res.json({ ok: true });
  }));

  r.put('/:id', requireRole('super_admin'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const prev = await db.prepare('SELECT name FROM categories WHERE id = ?').get(id) as { name: string } | undefined;
    if (!prev) throw new HttpError(404, 'Category not found.');
    const body = input.parse(req.body);
    const dup = await db.prepare('SELECT id FROM categories WHERE name = ? AND id <> ?').get(body.name, id);
    if (dup) throw new HttpError(409, 'Another category already has that name.', { field: 'name' });
    await db.prepare('UPDATE categories SET name = ?, slug = ?, description = ? WHERE id = ?')
      .run(body.name, await uniqueSlug(db, 'categories', slugify(body.name), id), body.description, id);
    await audit(db, req, { action: 'category.updated', summary: prev.name === body.name ? `Updated category “${body.name}”` : `Renamed category “${prev.name}” to “${body.name}”`, entityType: 'category', entityId: id });
    res.json({ ok: true });
  }));

  r.delete('/:id', requireRole('super_admin'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const prev = await db.prepare('SELECT name FROM categories WHERE id = ?').get(id) as { name: string } | undefined;
    if (!prev) throw new HttpError(404, 'Category not found.');
    const { n } = await db.prepare('SELECT COUNT(*) AS n FROM projects WHERE category_id = ?').get(id) as { n: number };
    if (n > 0) throw new HttpError(409, `${n} project(s) use this category. Move them to another category first.`);
    await db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    await audit(db, req, { action: 'category.deleted', summary: `Deleted category “${prev.name}”`, entityType: 'category', entityId: id });
    res.json({ ok: true });
  }));

  return r;
}
