import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { config } from '../config.js';
import { nowIso, transaction, type DB } from '../db/index.js';
import { ah, HttpError, parseId } from '../http.js';
import { pruneAbandonedUploads, readMediaFile, saveMediaFiles, storageUsage, storeUpload } from '../services/media.js';
import { mediaUrl, mediaVersion } from '../services/projects.js';
import { projectAccessById } from '../services/permissions.js';

export function mediaRoutes(db: DB) {
  const r = Router();
  r.use(requireAuth);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.max(config.uploads.maxImageBytes, config.uploads.maxDocumentBytes), files: 1, fields: 5 },
  });

  r.post('/', requireRole('super_admin'), upload.single('file'), ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to upload.');
    const { kind } = z.object({ kind: z.enum(['image', 'document']) }).parse(req.body);
    const stored = await storeUpload(req.file.buffer, kind);
    await pruneAbandonedUploads(db);
    const incoming = stored.files.reduce((n, f) => n + f.data.length, 0);
    if ((await storageUsage(db)).bytes + incoming > config.storage.limitBytes) {
      throw new HttpError(507, 'File storage is full. Remove unused images or ask the administrator to increase the storage limit.');
    }
    const originalName = path.basename(req.file.originalname || 'upload').replace(/[^\w.\- ()]/g, '_').slice(0, 160);
    const id = await transaction(db, async () => {
      await saveMediaFiles(db, stored.files);
      const result = await db.prepare(
        `INSERT INTO media (kind, stored_name, thumb_name, original_name, mime, size, width, height, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(stored.kind, stored.storedName, stored.thumbName, originalName, stored.mime, stored.size, stored.width, stored.height, req.user!.id, nowIso());
      return result.lastInsertRowid;
    });
    res.status(201).json({
      media: {
        id, kind: stored.kind, name: originalName, size: stored.size, width: stored.width, height: stored.height,
        url: mediaUrl(id, false, stored.storedName), thumbUrl: stored.thumbName ? mediaUrl(id, true, stored.storedName) : null,
      },
    });
  }));

  /** Storage and record counts, for keeping an eye on the hosting plan's quotas. */
  r.get('/usage', requireRole('super_admin'), ah(async (_req, res) => {
    const count = async (table: string) => ((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()) as { n: number }).n;
    res.json({
      storage: { ...(await storageUsage(db)), limitBytes: config.storage.limitBytes },
      records: {
        projects: await count('projects'), clients: await count('clients'), users: await count('users'),
        media: await count('media'), dashboards: await count('dashboards'), auditEvents: await count('audit_log'),
      },
      database: config.database.url ? 'hosted' : 'local',
    });
  }));

  r.get('/:id', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const m = await db.prepare('SELECT * FROM media WHERE id = ?').get(id) as
      { stored_name: string; thumb_name: string | null; mime: string; original_name: string; kind: string;
        project_id: number | null; client_id: number | null; uploaded_by: number | null } | undefined;
    const user = req.user!;
    let allowed = false;
    if (m) {
      if (m.project_id) allowed = (await projectAccessById(db, user, m.project_id)).view;
      else if (m.client_id) allowed = true; // client logos/covers are shown to all signed-in users
      else allowed = m.uploaded_by === user.id || user.role === 'super_admin'; // not yet attached
    }
    if (!m || !allowed) throw new HttpError(404, 'File not found.');
    const name = req.query.size === 'thumb' && m.thumb_name ? m.thumb_name : m.stored_name;
    // Stored names are random and never reused. A URL carrying the matching version therefore always means
    // this exact file and may be cached by the browser; other URLs are revalidated so they are never stale.
    const etag = `"${path.basename(name)}"`;
    const versioned = req.query.v === mediaVersion(m.stored_name);
    res.set({
      'Cache-Control': versioned ? 'private, max-age=2592000, immutable' : 'private, no-cache',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.get('if-none-match') === etag) return void res.status(304).end();
    const data = await readMediaFile(db, name);
    if (!data) throw new HttpError(404, 'File not found.');
    res.set({
      'Content-Type': m.mime,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `inline; filename="${encodeURIComponent(m.original_name)}"`,
    });
    res.end(data);
  }));

  return r;
}
