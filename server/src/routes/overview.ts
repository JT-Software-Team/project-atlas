import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import type { SessionUser } from '../auth/types.js';
import type { DB } from '../db/index.js';
import { ah, HttpError } from '../http.js';
import { safeJsonObject } from '../services/permissions.js';
import { accessibleProjects, mediaUrl, toCard, type ProjectWithAccess } from '../services/projects.js';

const DAY = 24 * 3600_000;

interface AuditRow {
  id: number; at: string; user_id: number | null; user_name: string | null; action: string; entity_type: string | null;
  entity_id: number | null; project_id: number | null; summary: string; ip: string | null;
}

/** Audit entries a user may see: everything for Super Admins, project events of visible projects otherwise. */
async function visibleActivity(db: DB, user: SessionUser, projects: ProjectWithAccess[], limit: number, projectId?: number) {
  if (user.role === 'super_admin') {
    const rows = projectId
      ? await db.prepare('SELECT * FROM audit_log WHERE project_id = ? ORDER BY id DESC LIMIT ?').all(projectId, limit)
      : await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
    return rows as unknown as AuditRow[];
  }
  const access = new Map(projects.map((p) => [p.row.id, p.access]));
  const ids = projectId ? [projectId].filter((id) => access.has(id)) : [...access.keys()];
  if (!ids.length) return [] as AuditRow[];
  const rows = await db.prepare(
    `SELECT * FROM audit_log WHERE project_id IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC LIMIT ?`,
  ).all(...ids, limit * 4) as unknown as AuditRow[];
  return rows.filter((a) => {
    const manage = access.get(a.project_id!)?.manage;
    if (a.action.startsWith('access.')) return manage;
    if (a.action === 'dashboard.opened' || a.action === 'dashboard.verified') return manage || a.user_id === user.id;
    return true;
  }).slice(0, limit);
}

const toActivity = (a: AuditRow) => ({
  id: a.id, at: a.at, userName: a.user_name, action: a.action, summary: a.summary,
  entityType: a.entity_type, entityId: a.entity_id, projectId: a.project_id,
});

export function overviewRoutes(db: DB) {
  const r = Router();
  r.use(requireAuth);

  r.get('/overview', ah(async (req, res) => {
    const projects = await accessibleProjects(db, req.user!);
    const count = (status: string) => projects.filter((p) => p.row.status === status).length;
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    res.json({
      stats: {
        totalProjects: projects.length,
        totalClients: new Set(projects.map((p) => p.row.client_id).filter(Boolean)).size,
        activeProjects: count('active'),
        completedProjects: count('completed'),
        underMaintenance: count('under_maintenance'),
        recentlyUpdated: projects.filter((p) => p.row.updated_at >= since).length,
        dashboards: projects.reduce((n, p) => n + p.row.dashboard_count, 0),
        demoProjects: projects.filter((p) => p.row.is_demo).length,
      },
      recentProjects: projects.slice(0, 6).map(toCard),
      featured: projects.filter((p) => p.row.featured).slice(0, 6).map(toCard),
      recentlyAccessed: projects.filter((p) => p.row.last_accessed_at)
        .sort((a, b) => b.row.last_accessed_at!.localeCompare(a.row.last_accessed_at!)).slice(0, 5).map(toCard),
      activity: (await visibleActivity(db, req.user!, projects, 12)).map(toActivity),
    });
  }));

  r.get('/notifications', ah(async (req, res) => {
    const projects = await accessibleProjects(db, req.user!);
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10);
    const items: { id: string; tone: 'warning' | 'info' | 'error'; title: string; detail: string; projectSlug?: string }[] = [];
    for (const { row, access } of projects) {
      if (access.technical && row.next_maintenance_date && row.next_maintenance_date <= soon) {
        const overdue = row.next_maintenance_date < today;
        items.push({
          id: `maint-${row.id}`, tone: overdue ? 'error' : 'warning',
          title: overdue ? 'Maintenance overdue' : 'Maintenance due soon',
          detail: `${row.name} · ${row.next_maintenance_date}`, projectSlug: row.slug,
        });
      }
      if (access.manage && row.review_date && row.review_date <= soon) {
        items.push({ id: `review-${row.id}`, tone: 'info', title: 'Project review due', detail: `${row.name} · ${row.review_date}`, projectSlug: row.slug });
      }
      if (access.manage && row.approval_status === 'pending_review') {
        items.push({ id: `approval-${row.id}`, tone: 'info', title: 'Awaiting approval', detail: row.name, projectSlug: row.slug });
      }
    }
    res.json({ notifications: items });
  }));

  r.get('/activity', ah(async (req, res) => {
    const q = z.object({
      projectId: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      action: z.string().max(40).optional(),
    }).parse(req.query);
    const projects = await accessibleProjects(db, req.user!, { includeArchived: true });
    if (req.user!.role !== 'super_admin' && !q.projectId && req.user!.role !== 'project_admin') {
      throw new HttpError(403, 'You do not have permission to view the activity log.');
    }
    let rows = await visibleActivity(db, req.user!, projects, q.action ? q.limit * 5 : q.limit, q.projectId);
    if (q.action) rows = rows.filter((a) => a.action.startsWith(q.action!)).slice(0, q.limit);
    res.json({
      activity: rows.map((a) => ({ ...toActivity(a), ip: req.user!.role === 'super_admin' ? a.ip : undefined })),
    });
  }));

  /** Documents and reference links across every project the user can see. */
  r.get('/resources', ah(async (req, res) => {
    const projects = await accessibleProjects(db, req.user!);
    const resources: { projectId: number; projectSlug: string; projectName: string; clientName: string | null; kind: string; title: string; url: string; size?: number }[] = [];
    for (const { row, access } of projects) {
      if (row.document_media_id) {
        const m = await db.prepare('SELECT stored_name, original_name, size FROM media WHERE id = ?').get(row.document_media_id) as { stored_name: string; original_name: string; size: number } | undefined;
        if (m) resources.push({ projectId: row.id, projectSlug: row.slug, projectName: row.name, clientName: row.client_name, kind: 'document', title: m.original_name, url: mediaUrl(row.document_media_id, false, m.stored_name)!, size: m.size });
      }
      const docUrl = access.technical ? safeJsonObject(row.technical).documentationUrl : undefined;
      if (docUrl && /^https:\/\//i.test(docUrl)) {
        resources.push({ projectId: row.id, projectSlug: row.slug, projectName: row.name, clientName: row.client_name, kind: 'link', title: 'Technical documentation', url: docUrl });
      }
    }
    res.json({ resources });
  }));

  return r;
}
