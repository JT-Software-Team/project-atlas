import { nowIso, transaction, type DB } from '../db/index.js';
import { slugify } from '../services/slug.js';
import { ensureReferenceData } from './referenceData.js';

const DEMO_NOTE = 'Demo record. Replace this text with the approved project summary through Project Management.';

/**
 * The three initial example projects from the brief. Every record is flagged
 * is_demo so the UI labels it, and nothing here invents client details,
 * dashboard links, contact data or production metrics.
 */
export function insertDemoProjects(db: DB): number {
  ensureReferenceData(db);
  const category = (name: string) => (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id;
  const now = nowIso();

  const client = (name: string, placeholder: boolean) => {
    const existing = db.prepare('SELECT id FROM clients WHERE lower(name) = lower(?)').get(name) as { id: number } | undefined;
    if (existing) return existing.id;
    return Number(db.prepare(
      'INSERT INTO clients (name, slug, is_placeholder, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(name, slugify(name), placeholder ? 1 : 0, now, now).lastInsertRowid);
  };

  const projects = [
    { client: client('JSW', false), name: 'Gunny Ball Project', category: 'Industrial Automation', status: 'active', tags: ['demo', 'automation'] },
    { client: client('Vedanta', false), name: 'Anode Chipping Project', category: 'Industrial Automation', status: 'active', tags: ['demo', 'automation'] },
    { client: client('Client To Be Added', true), name: 'Aluminium Skimming Project', category: 'Aluminium Processing', status: 'planning', tags: ['demo', 'aluminium'] },
  ];

  let inserted = 0;
  transaction(db, () => {
    for (const p of projects) {
      const slug = slugify(p.name);
      if (db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(slug)) continue;
      db.prepare(
        `INSERT INTO projects (slug, name, short_description, description, category_id, status, tags, is_demo, client_id,
           visibility, authorized_roles, approval_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'restricted', '["project_admin","viewer"]', 'draft', ?, ?)`,
      ).run(slug, p.name, DEMO_NOTE,
        'This is sample content created to demonstrate Project Atlas. The status shown is a sample value, the dashboard link is still to be supplied, and images are placeholders.',
        category(p.category), p.status, JSON.stringify(p.tags), p.client, now, now);
      inserted++;
    }
  });
  return inserted;
}
