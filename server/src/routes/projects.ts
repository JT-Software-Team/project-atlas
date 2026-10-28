import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { ROLES, type SessionUser } from '../auth/types.js';
import { nowIso, transaction, type DB } from '../db/index.js';
import { ah, HttpError, parseId } from '../http.js';
import { audit } from '../services/audit.js';
import {
  ACCESS_LEVELS, APPROVAL_STATUSES, DASHBOARD_TYPES, EDITABLE_STATUSES, VISIBILITIES,
} from '../services/catalog.js';
import { deleteUnreferencedMedia } from '../services/media.js';
import { projectAccessById } from '../services/permissions.js';
import { accessibleProjects, findProject, searchText, toCard, toDetail, type ProjectWithAccess } from '../services/projects.js';
import { slugify, uniqueSlug } from '../services/slug.js';
import { checkDashboardReachability, dashboardUrlProblem } from '../services/urlSafety.js';
import { optDate, optId, optText } from './validators.js';

const dashboardInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, 'Dashboard name is required.').max(120),
  url: z.string().trim().min(1, 'Dashboard URL is required.').max(2048)
    .superRefine((v, ctx) => { const p = dashboardUrlProblem(v); if (p) ctx.addIssue({ code: 'custom', message: p }); }),
  type: z.enum(DASHBOARD_TYPES).default('custom'),
  description: optText(500),
  isPrimary: z.boolean().default(false),
  openIn: z.enum(['new_tab', 'same_tab']).default('new_tab'),
  thumbnailMediaId: optId,
  provider: optText(120),
  requiresSeparateLogin: z.boolean().default(true),
});

const projectInput = z.object({
  name: z.string().trim().min(2, 'Project name is required.').max(160),
  slug: z.string().trim().max(80).nullish(),
  shortDescription: optText(280),
  description: optText(10_000),
  categoryId: optId,
  projectType: optText(120),
  status: z.enum(EDITABLE_STATUSES).default('planning'),
  startDate: optDate,
  completionDate: optDate,
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  featured: z.boolean().default(false),
  isDemo: z.boolean().optional(),

  clientId: optId,
  siteName: optText(160),
  city: optText(120),
  state: optText(120),
  country: optText(120),
  locationApproved: z.boolean().default(false),

  coverMediaId: optId,
  plantMediaId: optId,
  equipmentMediaId: optId,
  documentMediaId: optId,
  gallery: z.array(z.object({ mediaId: z.number().int().positive(), caption: optText(200) })).max(40).default([]),

  technical: z.record(z.string().trim().min(1).max(60), z.string().max(4000)).default({}),

  ownerUserId: optId,
  responsibleTeam: optText(160),
  authorizedRoles: z.array(z.enum(ROLES)).default([]),
  clientAccess: z.boolean().default(false),
  visibility: z.enum(VISIBILITIES).default('restricted'),
  confirmPublic: z.boolean().optional(),
  internalNotes: optText(5000),
  approvalStatus: z.enum(APPROVAL_STATUSES).default('draft'),
  contactApproved: z.boolean().default(false),

  maintenanceNotes: optText(5000),
  lastMaintenanceDate: optDate,
  nextMaintenanceDate: optDate,
  supportContact: optText(300),
  reviewDate: optDate,
  decommissionDate: optDate,

  dashboards: z.array(dashboardInput).max(30).default([]),
});
type ProjectInput = z.infer<typeof projectInput>;

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning', active: 'Active', completed: 'Completed', on_hold: 'On Hold',
  under_maintenance: 'Under Maintenance', archived: 'Archived',
};

export function projectRoutes(db: DB) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', ah(async (req, res) => {
    const q = z.object({
      q: z.string().max(200).optional(),
      client: z.coerce.number().int().optional(),
      category: z.string().max(80).optional(),
      status: z.string().max(40).optional(),
      location: z.string().max(120).optional(),
      favorites: z.enum(['1', 'true']).optional(),
      recent: z.enum(['1', 'true']).optional(),
      featured: z.enum(['1', 'true']).optional(),
      archived: z.enum(['include', 'only']).optional(),
      sort: z.enum(['updated', 'name_asc', 'name_desc', 'client', 'newest', 'accessed']).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
    }).parse(req.query);

    const all = await accessibleProjects(db, req.user!, { includeArchived: !!q.archived });
    let items = all;
    if (q.archived === 'only') items = items.filter((p) => p.row.archived_at);
    const terms = (q.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) items = items.filter((p) => { const t = searchText(p); return terms.every((term) => t.includes(term)); });
    if (q.client) items = items.filter((p) => p.row.client_id === q.client);
    if (q.category) items = items.filter((p) => p.row.category_slug === q.category);
    if (q.status) items = items.filter((p) => p.row.status === q.status);
    if (q.location) {
      const loc = q.location.toLowerCase();
      items = items.filter((p) => {
        const card = toCard(p);
        return card.location && [card.location.city, card.location.state, card.location.country, card.location.siteName]
          .some((v) => v?.toLowerCase() === loc);
      });
    }
    if (q.favorites) items = items.filter((p) => p.row.is_favorite);
    if (q.recent) items = items.filter((p) => p.row.last_accessed_at);
    if (q.featured) items = items.filter((p) => p.row.featured);

    const sort = q.sort ?? (q.recent ? 'accessed' : 'updated');
    const by = (fn: (p: ProjectWithAccess) => string, dir = 1) => (a: ProjectWithAccess, b: ProjectWithAccess) =>
      dir * fn(a).localeCompare(fn(b), undefined, { sensitivity: 'base' });
    const sorters: Record<string, (a: ProjectWithAccess, b: ProjectWithAccess) => number> = {
      updated: by((p) => p.row.updated_at, -1),
      name_asc: by((p) => p.row.name),
      name_desc: by((p) => p.row.name, -1),
      client: (a, b) => by((p) => p.row.client_name ?? '￿')(a, b) || by((p) => p.row.name)(a, b),
      newest: by((p) => p.row.created_at, -1),
      accessed: by((p) => p.row.last_accessed_at ?? '', -1),
    };
    items = [...items].sort(sorters[sort]);
    if (q.limit) items = items.slice(0, q.limit);

    // Facets come from what this user can see, so filters never reveal hidden projects.
    const cards = all.map(toCard);
    const uniq = <T,>(arr: T[], key: (t: T) => string) => [...new Map(arr.map((t) => [key(t), t])).values()];
    res.json({
      projects: items.map(toCard),
      total: items.length,
      facets: {
        clients: uniq(cards.filter((c) => c.client).map((c) => c.client!), (c) => String(c.id))
          .map((c) => ({ id: c.id, name: c.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
        categories: uniq(cards.filter((c) => c.category).map((c) => c.category!), (c) => String(c.id))
          .map((c) => ({ slug: c.slug, name: c.name })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
        statuses: [...new Set(cards.map((c) => c.status))],
        locations: [...new Set(cards.flatMap((c) => (c.location ? [c.location.city, c.location.state, c.location.country] : []))
          .filter((v): v is string => !!v))].sort(),
      },
    });
  }));

  r.get('/:key', ah(async (req, res) => {
    const found = await findProject(db, req.user!, req.params.key);
    if (!found) throw new HttpError(404, 'This project does not exist or you do not have access to it.');
    res.json({ project: await toDetail(db, found) });
  }));

  r.post('/:id/viewed', ah(async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await projectAccessById(db, req.user!, id)).view) throw new HttpError(404, 'Project not found.');
    await db.prepare(`INSERT INTO recent_access (user_id, project_id, accessed_at) VALUES (?, ?, ?)
                ON CONFLICT(user_id, project_id) DO UPDATE SET accessed_at = excluded.accessed_at`).run(req.user!.id, id, nowIso());
    res.json({ ok: true });
  }));

  r.put('/:id/favorite', ah(async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await projectAccessById(db, req.user!, id)).view) throw new HttpError(404, 'Project not found.');
    const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);
    if (favorite) {
      await db.prepare('INSERT OR IGNORE INTO favorites (user_id, project_id, created_at) VALUES (?, ?, ?)').run(req.user!.id, id, nowIso());
    } else {
      await db.prepare('DELETE FROM favorites WHERE user_id = ? AND project_id = ?').run(req.user!.id, id);
    }
    res.json({ ok: true, favorite });
  }));

  r.post('/', requireRole('super_admin'), ah(async (req, res) => {
    const input = projectInput.parse(req.body);
    const id = await transaction(db, async () => saveProject(db, req, input, null));
    res.status(201).json({ project: await toDetail(db, (await findProject(db, req.user!, id))!) });
  }));

  r.put('/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    await requireManage(db, req.user!, id);
    const input = projectInput.parse(req.body);
    await transaction(db, async () => saveProject(db, req, input, id));
    res.json({ project: await toDetail(db, (await findProject(db, req.user!, id))!) });
  }));

  r.post('/:id/archive', ah(async (req, res) => {
    const id = parseId(req.params.id);
    await requireManage(db, req.user!, id);
    const p = await db.prepare('SELECT name, status, archived_at FROM projects WHERE id = ?').get(id) as { name: string; status: string; archived_at: string | null };
    if (p.archived_at) throw new HttpError(409, 'Project is already archived.');
    await db.prepare(`UPDATE projects SET status_before_archive = status, status = 'archived', archived_at = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(nowIso(), nowIso(), req.user!.id, id);
    await audit(db, req, { action: 'project.archived', summary: `Archived project “${p.name}”`, entityType: 'project', entityId: id, projectId: id });
    res.json({ ok: true });
  }));

  r.post('/:id/restore', ah(async (req, res) => {
    const id = parseId(req.params.id);
    await requireManage(db, req.user!, id);
    const p = await db.prepare('SELECT name, archived_at, status_before_archive FROM projects WHERE id = ?').get(id) as { name: string; archived_at: string | null; status_before_archive: string | null };
    if (!p.archived_at) throw new HttpError(409, 'Project is not archived.');
    await db.prepare(`UPDATE projects SET status = ?, archived_at = NULL, status_before_archive = NULL, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(p.status_before_archive ?? 'on_hold', nowIso(), req.user!.id, id);
    await audit(db, req, { action: 'project.restored', summary: `Restored project “${p.name}”`, entityType: 'project', entityId: id, projectId: id });
    res.json({ ok: true });
  }));

  r.delete('/:id', requireRole('super_admin'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const p = await db.prepare('SELECT name, slug, archived_at FROM projects WHERE id = ?').get(id) as { name: string; slug: string; archived_at: string | null } | undefined;
    if (!p) throw new HttpError(404, 'Project not found.');
    const { confirm } = z.object({ confirm: z.string() }).parse(req.body ?? {});
    if (!p.archived_at) throw new HttpError(409, 'Archive the project before deleting it permanently.');
    if (confirm !== p.slug) throw new HttpError(400, 'Type the project ID exactly to confirm deletion.');
    await transaction(db, async () => {
      // Gallery and dashboards cascade; the project's own images and documents are removed with it.
      const owned = await db.prepare('SELECT id FROM media WHERE project_id = ?').all(id) as { id: number }[];
      await db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      await deleteUnreferencedMedia(db, owned.map((m) => m.id));
    });
    await audit(db, req, { action: 'project.deleted', summary: `Permanently deleted project “${p.name}”`, entityType: 'project', entityId: id });
    res.json({ ok: true });
  }));

  r.get('/:id/access', ah(async (req, res) => {
    const id = parseId(req.params.id);
    await requireManage(db, req.user!, id);
    res.json({ grants: await listGrants(db, id) });
  }));

  r.put('/:id/access', ah(async (req, res) => {
    const id = parseId(req.params.id);
    await requireManage(db, req.user!, id);
    const { grants } = z.object({
      grants: z.array(z.object({ userId: z.number().int().positive(), level: z.enum(ACCESS_LEVELS) })).max(1000),
    }).parse(req.body);
    await applyProjectGrants(db, req, id, grants);
    res.json({ grants: await listGrants(db, id) });
  }));

  return r;
}

export function dashboardRoutes(db: DB) {
  const r = Router();
  r.use(requireAuth);

  const load = async (id: number) => await db.prepare('SELECT id, project_id, name, url FROM dashboards WHERE id = ?').get(id) as
    { id: number; project_id: number; name: string; url: string } | undefined;

  // Launch through the server so access is re-checked and the open is recorded.
  r.get('/:id/open', ah(async (req, res) => {
    const d = await load(parseId(req.params.id));
    if (!d) {
      throw new HttpError(404, 'This dashboard does not exist or you do not have access to it.');
    }
    const access = await projectAccessById(db, req.user!, d.project_id);
    if (!access.view) {
      throw new HttpError(404, 'This dashboard does not exist or you do not have access to it.');
    }
    if (!access.dashboard) {
      throw new HttpError(403, 'Your account role (Viewer) does not have permission to access dashboards. Dashboard access is restricted to Admin and Super Admin accounts.');
    }
    if (dashboardUrlProblem(d.url)) throw new HttpError(422, 'This dashboard link is not valid. Ask an administrator to update it.');
    await db.prepare(`INSERT INTO recent_access (user_id, project_id, accessed_at) VALUES (?, ?, ?)
                ON CONFLICT(user_id, project_id) DO UPDATE SET accessed_at = excluded.accessed_at`).run(req.user!.id, d.project_id, nowIso());
    await audit(db, req, { action: 'dashboard.opened', summary: `Opened dashboard “${d.name}”`, entityType: 'dashboard', entityId: d.id, projectId: d.project_id });
    res.set('Referrer-Policy', 'no-referrer').redirect(302, d.url);
  }));

  r.post('/:id/verify', ah(async (req, res) => {
    const d = await load(parseId(req.params.id));
    if (!d) throw new HttpError(404, 'Dashboard not found.');
    await requireManage(db, req.user!, d.project_id);
    const check = await checkDashboardReachability(d.url);
    await db.prepare('UPDATE dashboards SET last_verified_at = ?, last_verified_by = ?, check_result = ?, check_detail = ? WHERE id = ?')
      .run(nowIso(), req.user!.id, check.result, check.detail, d.id);
    await audit(db, req, { action: 'dashboard.verified', summary: `Checked link for “${d.name}”: ${check.detail}`, entityType: 'dashboard', entityId: d.id, projectId: d.project_id });
    res.json({ check, verifiedAt: nowIso() });
  }));

  return r;
}

async function requireManage(db: DB, user: SessionUser, projectId: number) {
  const access = await projectAccessById(db, user, projectId);
  if (!access.view) throw new HttpError(404, 'Project not found.');
  if (!access.manage) throw new HttpError(403, 'You do not have permission to manage this project.');
}

export async function listGrants(db: DB, projectId: number) {
  return (await db.prepare(
    `SELECT pa.user_id, pa.level, pa.granted_at, u.name, u.email, u.role, u.is_active
       FROM project_access pa JOIN users u ON u.id = pa.user_id WHERE pa.project_id = ? ORDER BY u.name`,
  ).all(projectId) as { user_id: number; level: string; granted_at: string; name: string; email: string; role: string; is_active: number }[])
    .map((g) => ({ userId: g.user_id, level: g.level, grantedAt: g.granted_at, name: g.name, email: g.email, role: g.role, active: !!g.is_active }));
}

/** Replace the full grant list of a project, auditing each change. */
export async function applyProjectGrants(db: DB, req: Request, projectId: number, grants: { userId: number; level: string }[]) {
  const user = req.user!;
  const project = await db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as { name: string };
  const current = new Map((await listGrants(db, projectId)).map((g) => [g.userId, g.level]));
  const next = new Map(grants.map((g) => [g.userId, g.level]));
  const userInfo = db.prepare('SELECT id, name, role FROM users WHERE id = ?');

  await transaction(db, async () => {
    for (const [userId, level] of next) {
      const target = await userInfo.get(userId) as { id: number; name: string; role: string } | undefined;
      if (!target) throw new HttpError(400, 'One of the selected users no longer exists.');
      if (current.get(userId) === level) continue;
      if ((level === 'manage' || current.get(userId) === 'manage') && user.role !== 'super_admin') {
        throw new HttpError(403, 'Only a Super Admin can grant or remove project management rights.');
      }
      if (level === 'manage' && target.role !== 'project_admin') {
        throw new HttpError(400, `${target.name} must have the Project Admin role to manage a project.`);
      }
      await db.prepare(`INSERT INTO project_access (project_id, user_id, level, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(project_id, user_id) DO UPDATE SET level = excluded.level, granted_by = excluded.granted_by, granted_at = excluded.granted_at`)
        .run(projectId, userId, level, user.id, nowIso());
      await audit(db, req, { action: 'access.granted', summary: `Granted ${level} access on “${project.name}” to ${target.name}`, entityType: 'user', entityId: userId, projectId });
    }
    for (const [userId, level] of current) {
      if (next.has(userId)) continue;
      if (level === 'manage' && user.role !== 'super_admin') {
        throw new HttpError(403, 'Only a Super Admin can grant or remove project management rights.');
      }
      const target = await userInfo.get(userId) as { name: string } | undefined;
      await db.prepare('DELETE FROM project_access WHERE project_id = ? AND user_id = ?').run(projectId, userId);
      await audit(db, req, { action: 'access.revoked', summary: `Revoked access on “${project.name}” from ${target?.name ?? 'a user'}`, entityType: 'user', entityId: userId, projectId });
    }
  });
}

/** Attach uploaded media to a project after checking ownership. */
async function claimMedia(db: DB, user: SessionUser, ids: (number | null)[], projectId: number, kind: 'image' | 'document') {
  for (const id of ids) {
    if (!id) continue;
    const m = await db.prepare('SELECT kind, project_id, uploaded_by FROM media WHERE id = ?').get(id) as
      { kind: string; project_id: number | null; uploaded_by: number | null } | undefined;
    if (!m) throw new HttpError(400, 'An attached file no longer exists. Please upload it again.');
    if (m.kind !== kind) throw new HttpError(400, `Expected ${kind === 'image' ? 'an image' : 'a PDF document'}.`);
    if (m.project_id && m.project_id !== projectId) throw new HttpError(400, 'A selected file belongs to another project.');
    if (!m.project_id && m.uploaded_by !== user.id && user.role !== 'super_admin') throw new HttpError(403, 'You can only attach files you uploaded.');
    await db.prepare('UPDATE media SET project_id = ? WHERE id = ?').run(projectId, id);
  }
}

async function saveProject(db: DB, req: Request, input: ProjectInput, existingId: number | null): Promise<number> {
  const user = req.user!;
  const now = nowIso();
  const existing = existingId
    ? (await db.prepare('SELECT * FROM projects WHERE id = ?').get(existingId) as Record<string, unknown>)
    : null;
  if (existing?.archived_at) throw new HttpError(409, 'Restore this project before editing it.');

  if (input.categoryId && !await db.prepare('SELECT 1 FROM categories WHERE id = ?').get(input.categoryId)) {
    throw new HttpError(400, 'Please choose a valid category.', { field: 'categoryId' });
  }
  if (input.clientId && !await db.prepare('SELECT 1 FROM clients WHERE id = ?').get(input.clientId)) {
    throw new HttpError(400, 'Please choose a valid client.', { field: 'clientId' });
  }
  if (input.completionDate && input.startDate && input.completionDate < input.startDate) {
    throw new HttpError(400, 'Completion date cannot be before the start date.', { field: 'completionDate' });
  }

  // Super-admin-only fields: owner, demo flag and public visibility.
  const isSuper = user.role === 'super_admin';
  const ownerUserId = isSuper ? input.ownerUserId : ((existing?.owner_user_id as number | null) ?? null);
  if (ownerUserId && isSuper) {
    const owner = await db.prepare('SELECT role, is_active FROM users WHERE id = ?').get(ownerUserId) as { role: string; is_active: number } | undefined;
    if (!owner) throw new HttpError(400, 'Choose a valid project owner.', { field: 'ownerUserId' });
  }
  const isDemo = isSuper && input.isDemo !== undefined ? input.isDemo : !!existing?.is_demo;

  let publicApprovedBy = (existing?.public_approved_by as number | null) ?? null;
  let publicApprovedAt = (existing?.public_approved_at as string | null) ?? null;
  const wasPublic = existing?.visibility === 'public_overview';
  if (input.visibility === 'public_overview' && !wasPublic) {
    if (!isSuper) throw new HttpError(403, 'Only a Super Admin can make a project publicly visible.', { field: 'visibility' });
    if (!input.confirmPublic) {
      throw new HttpError(400, 'Confirm that the client has authorised a public overview of this project.', { field: 'confirmPublic' });
    }
    publicApprovedBy = user.id;
    publicApprovedAt = now;
  } else if (input.visibility !== 'public_overview') {
    publicApprovedBy = null;
    publicApprovedAt = null;
  }

  const slug = await uniqueSlug(db, 'projects', slugify(input.slug || input.name), existingId ?? undefined);

  const values = {
    slug, name: input.name, short_description: input.shortDescription, description: input.description,
    category_id: input.categoryId, project_type: input.projectType, status: input.status,
    start_date: input.startDate, completion_date: input.completionDate, tags: JSON.stringify([...new Set(input.tags)]),
    featured: input.featured ? 1 : 0, is_demo: isDemo ? 1 : 0,
    client_id: input.clientId, site_name: input.siteName, city: input.city, state: input.state, country: input.country,
    location_approved: input.locationApproved ? 1 : 0,
    cover_media_id: input.coverMediaId, plant_media_id: input.plantMediaId,
    equipment_media_id: input.equipmentMediaId, document_media_id: input.documentMediaId,
    technical: JSON.stringify(Object.fromEntries(Object.entries(input.technical).filter(([, v]) => v.trim()))),
    owner_user_id: ownerUserId, responsible_team: input.responsibleTeam,
    authorized_roles: JSON.stringify(input.authorizedRoles), client_access: input.clientAccess ? 1 : 0,
    visibility: input.visibility, public_approved_by: publicApprovedBy, public_approved_at: publicApprovedAt,
    internal_notes: input.internalNotes, approval_status: input.approvalStatus, contact_approved: input.contactApproved ? 1 : 0,
    maintenance_notes: input.maintenanceNotes, last_maintenance_date: input.lastMaintenanceDate,
    next_maintenance_date: input.nextMaintenanceDate, support_contact: input.supportContact,
    review_date: input.reviewDate, decommission_date: input.decommissionDate,
    updated_at: now, updated_by: user.id,
  };

  // Files attached before this save; any the project no longer uses are deleted afterwards.
  const previouslyAttached = existingId
    ? (await db.prepare('SELECT id FROM media WHERE project_id = ?').all(existingId) as { id: number }[]).map((m) => m.id)
    : [];

  let id: number;
  if (existingId) {
    const sets = Object.keys(values).map((k) => `${k} = :${k}`).join(', ');
    await db.prepare(`UPDATE projects SET ${sets} WHERE id = :id`).run({ ...values, id: existingId });
    id = existingId;
  } else {
    const cols = Object.keys(values);
    const result = await db.prepare(
      `INSERT INTO projects (${cols.join(', ')}, created_at) VALUES (${cols.map((c) => `:${c}`).join(', ')}, :created_at)`,
    ).run({ ...values, created_at: now });
    id = Number(result.lastInsertRowid);
  }

  await claimMedia(db, user, [input.coverMediaId, input.plantMediaId, input.equipmentMediaId,
    ...input.gallery.map((g) => g.mediaId), ...input.dashboards.map((d) => d.thumbnailMediaId)], id, 'image');
  await claimMedia(db, user, [input.documentMediaId], id, 'document');

  await db.prepare('DELETE FROM project_gallery WHERE project_id = ?').run(id);
  const insertGallery = db.prepare('INSERT OR IGNORE INTO project_gallery (project_id, media_id, caption, sort_order) VALUES (?, ?, ?, ?)');
  for (const [i, g] of input.gallery.entries()) await insertGallery.run(id, g.mediaId, g.caption, i);

  await saveDashboards(db, req, id, input.name, input.dashboards);
  await deleteUnreferencedMedia(db, previouslyAttached);

  if (!existing) {
    await audit(db, req, { action: 'project.created', summary: `Added project “${input.name}”`, entityType: 'project', entityId: id, projectId: id });
  } else {
    await audit(db, req, { action: 'project.updated', summary: `Updated project “${input.name}”`, entityType: 'project', entityId: id, projectId: id });
    if (existing.status !== input.status) {
      await audit(db, req, {
        action: 'project.status_changed',
        summary: `Status of “${input.name}” changed from ${STATUS_LABEL[String(existing.status)]} to ${STATUS_LABEL[input.status]}`,
        entityType: 'project', entityId: id, projectId: id,
      });
    }
    if (existing.visibility !== input.visibility) {
      await audit(db, req, { action: 'project.visibility_changed', summary: `Visibility of “${input.name}” set to ${input.visibility.replace('_', ' ')}`, entityType: 'project', entityId: id, projectId: id });
    }
  }
  return id;
}

async function saveDashboards(db: DB, req: Request, projectId: number, projectName: string, dashboards: ProjectInput['dashboards']) {
  const now = nowIso();
  const existing = new Map(
    (await db.prepare('SELECT id, name, url FROM dashboards WHERE project_id = ?').all(projectId) as { id: number; name: string; url: string }[])
      .map((d) => [d.id, d]),
  );
  const primaryIndex = Math.max(0, dashboards.findIndex((d) => d.isPrimary));
  const keep = new Set<number>();

  for (const [i, d] of dashboards.entries()) {
    const values = {
      name: d.name, url: d.url.trim(), type: d.type, description: d.description, is_primary: i === primaryIndex ? 1 : 0,
      open_in: d.openIn, thumbnail_media_id: d.thumbnailMediaId, provider: d.provider,
      requires_separate_login: d.requiresSeparateLogin ? 1 : 0, sort_order: i, updated_at: now,
    };
    const prev = d.id ? existing.get(d.id) : undefined;
    if (d.id && !prev) throw new HttpError(400, 'A dashboard in this form belongs to another project.');
    if (prev) {
      keep.add(prev.id);
      const urlChanged = prev.url !== values.url;
      await db.prepare(
        `UPDATE dashboards SET name = :name, url = :url, type = :type, description = :description, is_primary = :is_primary,
           open_in = :open_in, thumbnail_media_id = :thumbnail_media_id, provider = :provider,
           requires_separate_login = :requires_separate_login, sort_order = :sort_order, updated_at = :updated_at
           ${urlChanged ? ', last_verified_at = NULL, check_result = NULL, check_detail = NULL' : ''}
         WHERE id = :id`,
      ).run({ ...values, id: prev.id });
      if (urlChanged) {
        await audit(db, req, { action: 'dashboard.url_changed', summary: `Changed the link of dashboard “${d.name}” on “${projectName}”`, entityType: 'dashboard', entityId: prev.id, projectId });
      }
    } else {
      const result = await db.prepare(
        `INSERT INTO dashboards (project_id, name, url, type, description, is_primary, open_in, thumbnail_media_id, provider,
           requires_separate_login, sort_order, created_at, updated_at)
         VALUES (:project_id, :name, :url, :type, :description, :is_primary, :open_in, :thumbnail_media_id, :provider,
           :requires_separate_login, :sort_order, :created_at, :updated_at)`,
      ).run({ ...values, project_id: projectId, created_at: now });
      keep.add(Number(result.lastInsertRowid));
      await audit(db, req, { action: 'dashboard.added', summary: `Added dashboard “${d.name}” to “${projectName}”`, entityType: 'dashboard', entityId: Number(result.lastInsertRowid), projectId });
    }
  }

  for (const [id, d] of existing) {
    if (keep.has(id)) continue;
    await db.prepare('DELETE FROM dashboards WHERE id = ?').run(id);
    await audit(db, req, { action: 'dashboard.removed', summary: `Removed dashboard “${d.name}” from “${projectName}”`, entityType: 'dashboard', entityId: id, projectId });
  }
}
