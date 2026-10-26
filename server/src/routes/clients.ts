import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { nowIso, type DB } from '../db/index.js';
import { HttpError } from '../http.js';
import { audit } from '../services/audit.js';
import { accessibleProjects, mediaUrl, toCard } from '../services/projects.js';
import { slugify, uniqueSlug } from '../services/slug.js';
import { websiteUrlProblem } from '../services/urlSafety.js';
import { optId, optText } from './validators.js';

const clientInput = z.object({
  name: z.string().trim().min(1, 'Client name is required.').max(160),
  isPlaceholder: z.boolean().default(false),
  industry: optText(120),
  website: optText(300).superRefine((v, ctx) => {
    const p = v ? websiteUrlProblem(v) : null;
    if (p) ctx.addIssue({ code: 'custom', message: p });
  }),
  location: optText(200),
  city: optText(120),
  state: optText(120),
  country: optText(120),
  siteName: optText(160),
  internalRef: optText(80),
  logoMediaId: optId,
  coverMediaId: optId,
});

interface ClientRow {
  id: number; name: string; slug: string; is_placeholder: number; industry: string | null; website: string | null;
  location: string | null; city: string | null; state: string | null; country: string | null; site_name: string | null;
  internal_ref: string | null; logo_media_id: number | null; cover_media_id: number | null; created_at: string; updated_at: string;
}

export function clientRoutes(db: DB) {
  const r = Router();
  r.use(requireAuth);
  const isAdmin = (role: string) => role === 'super_admin' || role === 'project_admin';

  const serialize = (c: ClientRow, projectCount: number, admin: boolean) => ({
    id: c.id, name: c.name, slug: c.slug, isPlaceholder: !!c.is_placeholder, industry: c.industry, website: c.website,
    location: c.location, city: c.city, state: c.state, country: c.country, siteName: c.site_name,
    logoUrl: mediaUrl(c.logo_media_id, true), coverUrl: mediaUrl(c.cover_media_id, true),
    projectCount, updatedAt: c.updated_at,
    ...(admin ? { internalRef: c.internal_ref, logoMediaId: c.logo_media_id, coverMediaId: c.cover_media_id } : {}),
  });

  r.get('/', (req, res) => {
    const projects = accessibleProjects(db, req.user!);
    const counts = new Map<number, number>();
    for (const p of projects) if (p.row.client_id) counts.set(p.row.client_id, (counts.get(p.row.client_id) ?? 0) + 1);
    const admin = isAdmin(req.user!.role);
    const rows = db.prepare('SELECT * FROM clients ORDER BY is_placeholder, name COLLATE NOCASE').all() as unknown as ClientRow[];
    // Viewers only learn about clients whose projects they can see.
    const visible = rows.filter((c) => admin || counts.has(c.id));
    res.json({ clients: visible.map((c) => serialize(c, counts.get(c.id) ?? 0, admin)) });
  });

  r.get('/:key', (req, res) => {
    const byId = /^\d+$/.test(req.params.key);
    const c = db.prepare(`SELECT * FROM clients WHERE ${byId ? 'id' : 'slug'} = ?`).get(byId ? Number(req.params.key) : req.params.key) as ClientRow | undefined;
    const projects = c ? accessibleProjects(db, req.user!).filter((p) => p.row.client_id === c.id) : [];
    const admin = isAdmin(req.user!.role);
    if (!c || (!admin && projects.length === 0)) throw new HttpError(404, 'Client not found.');
    res.json({
      client: { ...serialize(c, projects.length, admin), logoUrl: mediaUrl(c.logo_media_id), coverUrl: mediaUrl(c.cover_media_id) },
      projects: projects.map(toCard),
    });
  });

  const claim = (ids: (number | null)[], clientId: number, userId: number, isSuper: boolean) => {
    for (const id of ids) {
      if (!id) continue;
      const m = db.prepare('SELECT kind, client_id, project_id, uploaded_by FROM media WHERE id = ?').get(id) as
        { kind: string; client_id: number | null; project_id: number | null; uploaded_by: number } | undefined;
      if (!m || m.kind !== 'image') throw new HttpError(400, 'Logo and cover must be uploaded images.');
      if (m.project_id || (m.client_id && m.client_id !== clientId)) throw new HttpError(400, 'That image belongs to another record.');
      if (!m.client_id && m.uploaded_by !== userId && !isSuper) throw new HttpError(403, 'You can only attach images you uploaded.');
      db.prepare('UPDATE media SET client_id = ? WHERE id = ?').run(clientId, id);
    }
  };

  const duplicateOf = (name: string, exceptId?: number) => db.prepare(
    'SELECT id, name FROM clients WHERE lower(trim(name)) = lower(trim(?)) AND id IS NOT ?',
  ).get(name, exceptId ?? null) as { id: number; name: string } | undefined;

  r.post('/', requireRole('super_admin', 'project_admin'), (req, res) => {
    const input = clientInput.parse(req.body);
    const dup = duplicateOf(input.name);
    if (dup) throw new HttpError(409, `A client named “${dup.name}” already exists.`, { existingId: dup.id, field: 'name' });
    const now = nowIso();
    const result = db.prepare(
      `INSERT INTO clients (name, slug, is_placeholder, industry, website, location, city, state, country, site_name, internal_ref,
         logo_media_id, cover_media_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.name, uniqueSlug(db, 'clients', slugify(input.name)), input.isPlaceholder ? 1 : 0, input.industry, input.website,
      input.location, input.city, input.state, input.country, input.siteName, input.internalRef,
      input.logoMediaId, input.coverMediaId, now, now);
    const id = Number(result.lastInsertRowid);
    claim([input.logoMediaId, input.coverMediaId], id, req.user!.id, req.user!.role === 'super_admin');
    audit(db, req, { action: 'client.created', summary: `Added client “${input.name}”`, entityType: 'client', entityId: id });
    res.status(201).json({ client: serialize(db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as unknown as ClientRow, 0, true) });
  });

  r.put('/:id', requireRole('super_admin', 'project_admin'), (req, res) => {
    const id = Number(req.params.id);
    const prev = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as ClientRow | undefined;
    if (!prev) throw new HttpError(404, 'Client not found.');
    const input = clientInput.parse(req.body);
    const dup = duplicateOf(input.name, id);
    if (dup) throw new HttpError(409, `A client named “${dup.name}” already exists.`, { existingId: dup.id, field: 'name' });
    claim([input.logoMediaId, input.coverMediaId], id, req.user!.id, req.user!.role === 'super_admin');
    db.prepare(
      `UPDATE clients SET name = ?, slug = ?, is_placeholder = ?, industry = ?, website = ?, location = ?, city = ?, state = ?,
         country = ?, site_name = ?, internal_ref = ?, logo_media_id = ?, cover_media_id = ?, updated_at = ? WHERE id = ?`,
    ).run(input.name, prev.name === input.name ? prev.slug : uniqueSlug(db, 'clients', slugify(input.name), id),
      input.isPlaceholder ? 1 : 0, input.industry, input.website, input.location, input.city, input.state, input.country,
      input.siteName, input.internalRef, input.logoMediaId, input.coverMediaId, nowIso(), id);
    audit(db, req, {
      action: 'client.updated',
      summary: prev.name === input.name ? `Updated client “${input.name}”` : `Renamed client “${prev.name}” to “${input.name}”`,
      entityType: 'client', entityId: id,
    });
    res.json({ client: serialize(db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as unknown as ClientRow, 0, true) });
  });

  r.delete('/:id', requireRole('super_admin'), (req, res) => {
    const id = Number(req.params.id);
    const c = db.prepare('SELECT name FROM clients WHERE id = ?').get(id) as { name: string } | undefined;
    if (!c) throw new HttpError(404, 'Client not found.');
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE client_id = ?').get(id) as { n: number };
    if (n > 0) throw new HttpError(409, `This client still has ${n} project(s). Reassign or delete them first.`);
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    audit(db, req, { action: 'client.deleted', summary: `Deleted client “${c.name}”`, entityType: 'client', entityId: id });
    res.json({ ok: true });
  });

  return r;
}
