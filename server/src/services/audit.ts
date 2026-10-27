import type { Request } from 'express';
import { nowIso, type DB } from '../db/index.js';

export interface AuditEntry {
  action: string;
  summary: string;
  entityType?: string;
  entityId?: number | null;
  projectId?: number | null;
}

/**
 * Record an audit event. Summaries must never contain passwords, tokens,
 * or dashboard content; callers pass human-readable descriptions only.
 */
export async function audit(db: DB, req: Request | null, entry: AuditEntry, actor?: { id: number; name: string } | null) {
  const who = actor ?? req?.user ?? null;
  await db.prepare(
    `INSERT INTO audit_log (at, user_id, user_name, action, entity_type, entity_id, project_id, summary, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(nowIso(), who?.id ?? null, who?.name ?? null, entry.action, entry.entityType ?? null,
    entry.entityId ?? null, entry.projectId ?? null, entry.summary.slice(0, 500), req?.ip ?? null);
}
