import { Router } from 'express';
import type { DB } from '../db/index.js';

/**
 * Unauthenticated, non-confidential overview for the company website.
 * Only projects a Super Admin explicitly approved for public overview appear,
 * and only their approved summary fields. No dashboards, media, or technical data.
 */
export function publicRoutes(db: DB) {
  const r = Router();
  r.get('/projects', (_req, res) => {
    const rows = db.prepare(
      `SELECT p.slug, p.name, p.short_description, p.status, c.name AS category, cl.name AS client, cl.is_placeholder,
              CASE WHEN p.location_approved = 1 THEN p.city END AS city,
              CASE WHEN p.location_approved = 1 THEN p.country END AS country
         FROM projects p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN clients cl ON cl.id = p.client_id
        WHERE p.visibility = 'public_overview' AND p.public_approved_at IS NOT NULL
          AND p.approval_status = 'approved' AND p.archived_at IS NULL
        ORDER BY p.name`,
    ).all() as Record<string, unknown>[];
    res.set('Cache-Control', 'public, max-age=300').json({
      projects: rows.map((p) => ({
        slug: p.slug, name: p.name, summary: p.short_description, status: p.status, category: p.category,
        client: p.is_placeholder ? null : p.client, city: p.city, country: p.country,
      })),
    });
  });
  return r;
}
