import type { DB } from '../db/index.js';
import type { SessionUser } from '../auth/types.js';

export interface ProjectAccess {
  /** Can see the project, its dashboards, images and documents. */
  view: boolean;
  /** Can also see technical and maintenance details. */
  technical: boolean;
  /** Can edit the project, its dashboards, media and viewer access. */
  manage: boolean;
  /** Can click and open/launch dashboards. */
  dashboard: boolean;
}

export const NO_ACCESS: ProjectAccess = { view: false, technical: false, manage: false, dashboard: false };
const FULL: ProjectAccess = { view: true, technical: true, manage: true, dashboard: true };

export interface AccessFields {
  id: number;
  visibility: string;
  authorized_roles: string;
  client_access: number;
  client_id: number | null;
  owner_user_id: number | null;
  archived_at: string | null;
}

export type GrantMap = Map<number, 'view' | 'technical' | 'manage'>;

export async function loadGrants(db: DB, userId: number): Promise<GrantMap> {
  const rows = await db.prepare('SELECT project_id, level FROM project_access WHERE user_id = ?').all(userId) as
    { project_id: number; level: 'view' | 'technical' | 'manage' }[];
  return new Map(rows.map((r) => [r.project_id, r.level]));
}

/**
 * Single source of truth for project-level authorization.
 *
 * - Super Admin: everything.
 * - Project Admin: manages projects they own or hold a "manage" grant on.
 * - Anyone: explicit grants ("view" / "technical").
 * - Restricted / Public Overview projects may also be opened by every user of an
 *   authorized role, or by users belonging to the project's client when client access is on.
 *   Private projects require an explicit grant.
 * - Archived projects are visible only to those who can manage them.
 */
export function accessFor(user: SessionUser, project: AccessFields, grants: GrantMap): ProjectAccess {
  if (user.role === 'super_admin') return FULL;
  const grant = grants.get(project.id);
  const canManage = user.role === 'project_admin' && (grant === 'manage' || project.owner_user_id === user.id);
  if (canManage) return FULL;
  if (project.archived_at) return NO_ACCESS;

  const canLaunchDashboard = user.role !== 'viewer';

  if (grant === 'technical' || grant === 'manage') {
    return { view: true, technical: true, manage: false, dashboard: canLaunchDashboard };
  }
  if (grant === 'view') {
    return { view: true, technical: false, manage: false, dashboard: canLaunchDashboard };
  }
  if (project.visibility !== 'private') {
    const roles = safeJsonArray(project.authorized_roles);
    if (roles.includes(user.role)) {
      return { view: true, technical: false, manage: false, dashboard: canLaunchDashboard };
    }
    if (user.role === 'admin' && roles.includes('viewer')) {
      return { view: true, technical: false, manage: false, dashboard: true };
    }
    if (project.client_access && user.clientId && user.clientId === project.client_id) {
      return { view: true, technical: false, manage: false, dashboard: canLaunchDashboard };
    }
  }
  return NO_ACCESS;
}

export async function projectAccessById(db: DB, user: SessionUser, projectId: number): Promise<ProjectAccess> {
  const row = await db.prepare(
    'SELECT id, visibility, authorized_roles, client_access, client_id, owner_user_id, archived_at FROM projects WHERE id = ?',
  ).get(projectId) as AccessFields | undefined;
  if (!row) return NO_ACCESS;
  return accessFor(user, row, await loadGrants(db, user.id));
}

export function safeJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function safeJsonObject(value: unknown): Record<string, string> {
  try {
    const parsed = JSON.parse(String(value ?? '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
