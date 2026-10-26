import type { SessionUser } from '../auth/types.js';
import type { DB } from '../db/index.js';
import { accessFor, loadGrants, safeJsonArray, safeJsonObject, type ProjectAccess } from './permissions.js';

export interface ProjectRow {
  id: number; slug: string; name: string; short_description: string | null; description: string | null;
  category_id: number | null; project_type: string | null; status: string; start_date: string | null;
  completion_date: string | null; tags: string; featured: number; is_demo: number;
  client_id: number | null; site_name: string | null; city: string | null; state: string | null; country: string | null;
  location_approved: number; cover_media_id: number | null; plant_media_id: number | null;
  equipment_media_id: number | null; document_media_id: number | null; technical: string;
  owner_user_id: number | null; responsible_team: string | null; authorized_roles: string; client_access: number;
  visibility: string; public_approved_by: number | null; public_approved_at: string | null; internal_notes: string | null;
  approval_status: string; contact_approved: number; maintenance_notes: string | null;
  last_maintenance_date: string | null; next_maintenance_date: string | null; support_contact: string | null;
  review_date: string | null; decommission_date: string | null; archived_at: string | null;
  created_at: string; updated_at: string; updated_by: number | null;
  // joined
  category_name: string | null; category_slug: string | null;
  client_name: string | null; client_slug: string | null; client_placeholder: number | null; client_logo: number | null;
  client_industry: string | null; client_website: string | null;
  dashboard_count: number; primary_dashboard_id: number | null; primary_dashboard_open_in: string | null;
  is_favorite: number; last_accessed_at: string | null; updated_by_name: string | null;
}

const BASE_SELECT = `
  SELECT p.*,
    c.name AS category_name, c.slug AS category_slug,
    cl.name AS client_name, cl.slug AS client_slug, cl.is_placeholder AS client_placeholder,
    cl.logo_media_id AS client_logo, cl.industry AS client_industry, cl.website AS client_website,
    (SELECT COUNT(*) FROM dashboards d WHERE d.project_id = p.id) AS dashboard_count,
    (SELECT d.id FROM dashboards d WHERE d.project_id = p.id ORDER BY d.is_primary DESC, d.sort_order LIMIT 1) AS primary_dashboard_id,
    (SELECT d.open_in FROM dashboards d WHERE d.project_id = p.id ORDER BY d.is_primary DESC, d.sort_order LIMIT 1) AS primary_dashboard_open_in,
    EXISTS (SELECT 1 FROM favorites f WHERE f.project_id = p.id AND f.user_id = :uid) AS is_favorite,
    (SELECT ra.accessed_at FROM recent_access ra WHERE ra.project_id = p.id AND ra.user_id = :uid) AS last_accessed_at,
    u.name AS updated_by_name
  FROM projects p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN clients cl ON cl.id = p.client_id
  LEFT JOIN users u ON u.id = p.updated_by`;

export interface ProjectWithAccess {
  row: ProjectRow;
  access: ProjectAccess;
}

/** All projects the user may view, with their computed access. Permission filtering happens here, server-side. */
export function accessibleProjects(db: DB, user: SessionUser, opts: { includeArchived?: boolean } = {}): ProjectWithAccess[] {
  const rows = db.prepare(`${BASE_SELECT} ORDER BY p.updated_at DESC`).all({ uid: user.id }) as unknown as ProjectRow[];
  const grants = loadGrants(db, user.id);
  const out: ProjectWithAccess[] = [];
  for (const row of rows) {
    const access = accessFor(user, row, grants);
    if (!access.view) continue;
    if (row.archived_at && !opts.includeArchived) continue;
    out.push({ row, access });
  }
  return out;
}

export function findProject(db: DB, user: SessionUser, idOrSlug: string | number): ProjectWithAccess | null {
  const byId = typeof idOrSlug === 'number' || /^\d+$/.test(String(idOrSlug));
  const row = db.prepare(`${BASE_SELECT} WHERE ${byId ? 'p.id' : 'p.slug'} = :key`)
    .get({ uid: user.id, key: byId ? Number(idOrSlug) : String(idOrSlug) }) as unknown as ProjectRow | undefined;
  if (!row) return null;
  const access = accessFor(user, row, loadGrants(db, user.id));
  return access.view ? { row, access } : null;
}

export const mediaUrl = (id: number | null | undefined, thumb = false) =>
  id ? `/api/media/${id}${thumb ? '?size=thumb' : ''}` : null;

function location(row: ProjectRow, access: ProjectAccess) {
  if (!row.location_approved && !access.technical) return null;
  const parts = { siteName: row.site_name, city: row.city, state: row.state, country: row.country };
  return Object.values(parts).some(Boolean) ? parts : null;
}

/** Compact representation used for cards and lists. */
export function toCard({ row, access }: ProjectWithAccess) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    category: row.category_id ? { id: row.category_id, name: row.category_name, slug: row.category_slug } : null,
    projectType: row.project_type,
    status: row.status,
    featured: !!row.featured,
    isDemo: !!row.is_demo,
    tags: safeJsonArray(row.tags),
    client: row.client_id
      ? { id: row.client_id, name: row.client_name, slug: row.client_slug, isPlaceholder: !!row.client_placeholder, logoUrl: mediaUrl(row.client_logo, true) }
      : null,
    location: location(row, access),
    coverUrl: mediaUrl(row.cover_media_id, true),
    dashboardCount: row.dashboard_count,
    primaryDashboard: row.primary_dashboard_id
      ? { id: row.primary_dashboard_id, openIn: row.primary_dashboard_open_in, launchUrl: `/api/dashboards/${row.primary_dashboard_id}/open` }
      : null,
    isFavorite: !!row.is_favorite,
    lastAccessedAt: row.last_accessed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: !!row.archived_at,
    visibility: access.manage ? row.visibility : undefined,
    access: { technical: access.technical, manage: access.manage },
  };
}

interface DashboardRow {
  id: number; name: string; url: string; type: string; description: string | null; is_primary: number;
  open_in: string; thumbnail_media_id: number | null; provider: string | null; requires_separate_login: number;
  last_verified_at: string | null; check_result: string | null; check_detail: string | null; sort_order: number;
  verified_by_name: string | null;
}

export function projectDashboards(db: DB, projectId: number, includeUrl: boolean) {
  const rows = db.prepare(
    `SELECT d.*, u.name AS verified_by_name FROM dashboards d LEFT JOIN users u ON u.id = d.last_verified_by
     WHERE d.project_id = ? ORDER BY d.sort_order, d.id`,
  ).all(projectId) as unknown as DashboardRow[];
  return rows.map((d) => {
    let host: string | null = null;
    try { host = new URL(d.url).host; } catch { /* stored URLs are validated; tolerate legacy rows */ }
    return {
      id: d.id,
      name: d.name,
      type: d.type,
      description: d.description,
      isPrimary: !!d.is_primary,
      openIn: d.open_in,
      provider: d.provider,
      host,
      url: includeUrl ? d.url : undefined,
      launchUrl: `/api/dashboards/${d.id}/open`,
      requiresSeparateLogin: !!d.requires_separate_login,
      thumbnailUrl: mediaUrl(d.thumbnail_media_id, true),
      thumbnailMediaId: includeUrl ? d.thumbnail_media_id : undefined,
      lastVerifiedAt: d.last_verified_at,
      lastVerifiedBy: d.verified_by_name,
      checkResult: d.check_result,
      checkDetail: d.check_detail,
    };
  });
}

function mediaInfo(db: DB, id: number | null) {
  if (!id) return null;
  const m = db.prepare('SELECT id, kind, original_name, size, width, height FROM media WHERE id = ?').get(id) as
    { id: number; kind: string; original_name: string; size: number; width: number | null; height: number | null } | undefined;
  if (!m) return null;
  return {
    id: m.id, kind: m.kind, name: m.original_name, size: m.size, width: m.width, height: m.height,
    url: mediaUrl(m.id), thumbUrl: m.kind === 'image' ? mediaUrl(m.id, true) : null,
  };
}

/** Full representation for the details page and the edit form, filtered by access level. */
export function toDetail(db: DB, pa: ProjectWithAccess) {
  const { row, access } = pa;
  const gallery = (db.prepare(
    'SELECT media_id, caption FROM project_gallery WHERE project_id = ? ORDER BY sort_order',
  ).all(row.id) as { media_id: number; caption: string | null }[])
    .map((g) => ({ ...mediaInfo(db, g.media_id)!, caption: g.caption }))
    .filter((g) => g.id);

  const owner = row.owner_user_id
    ? (db.prepare('SELECT id, name FROM users WHERE id = ?').get(row.owner_user_id) as { id: number; name: string } | undefined)
    : undefined;
  const showContact = access.technical || !!row.contact_approved;

  return {
    ...toCard(pa),
    coverUrl: mediaUrl(row.cover_media_id),
    description: row.description,
    startDate: row.start_date,
    completionDate: row.completion_date,
    updatedByName: row.updated_by_name,
    client: row.client_id
      ? {
        id: row.client_id, name: row.client_name, slug: row.client_slug, isPlaceholder: !!row.client_placeholder,
        logoUrl: mediaUrl(row.client_logo), industry: row.client_industry, website: row.client_website,
      }
      : null,
    dashboards: projectDashboards(db, row.id, access.manage),
    media: {
      cover: mediaInfo(db, row.cover_media_id),
      plant: mediaInfo(db, row.plant_media_id),
      equipment: mediaInfo(db, row.equipment_media_id),
      document: mediaInfo(db, row.document_media_id),
      gallery,
    },
    technical: access.technical ? safeJsonObject(row.technical) : null,
    maintenance: access.technical
      ? {
        notes: row.maintenance_notes, lastDate: row.last_maintenance_date, nextDate: row.next_maintenance_date,
        reviewDate: row.review_date, decommissionDate: row.decommission_date,
      }
      : null,
    contact: showContact
      ? { owner: owner ? { id: owner.id, name: owner.name } : null, responsibleTeam: row.responsible_team, supportContact: row.support_contact }
      : null,
    admin: access.manage
      ? {
        siteName: row.site_name, city: row.city, state: row.state, country: row.country,
        locationApproved: !!row.location_approved, ownerUserId: row.owner_user_id,
        authorizedRoles: safeJsonArray(row.authorized_roles), clientAccess: !!row.client_access,
        visibility: row.visibility, publicApprovedAt: row.public_approved_at, internalNotes: row.internal_notes,
        approvalStatus: row.approval_status, contactApproved: !!row.contact_approved,
        coverMediaId: row.cover_media_id, plantMediaId: row.plant_media_id,
        equipmentMediaId: row.equipment_media_id, documentMediaId: row.document_media_id,
      }
      : null,
  };
}

/** Text used for search. Technical fields are only searchable by users who can see them. */
export function searchText({ row, access }: ProjectWithAccess): string {
  const parts = [
    row.name, row.short_description, row.description, row.category_name, row.client_name, row.project_type,
    ...safeJsonArray(row.tags),
  ];
  if (row.location_approved || access.technical) parts.push(row.site_name, row.city, row.state, row.country);
  if (access.technical) parts.push(...Object.values(safeJsonObject(row.technical)));
  return parts.filter(Boolean).join(' \u0001 ').toLowerCase();
}
