import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { config } from '../config.js';
import { nowIso, type DB } from '../db/index.js';
import { ah, HttpError, parseId } from '../http.js';
import { storeUpload, uploadsDir } from '../services/media.js';
import { projectAccessById } from '../services/permissions.js';

export function mediaRoutes(db: DB) {
  const r = Router();
  r.use(requireAuth);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.max(config.uploads.maxImageBytes, config.uploads.maxDocumentBytes), files: 1, fields: 5 },
  });

  r.post('/', requireRole('super_admin', 'project_admin'), upload.single('file'), ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a file to upload.');
    const { kind } = z.object({ kind: z.enum(['image', 'document']) }).parse(req.body);
    const stored = await storeUpload(req.file.buffer, kind);
    const originalName = path.basename(req.file.originalname || 'upload').replace(/[^\w.\- ()]/g, '_').slice(0, 160);
    const result = db.prepare(
      `INSERT INTO media (kind, stored_name, thumb_name, original_name, mime, size, width, height, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(stored.kind, stored.storedName, stored.thumbName, originalName, stored.mime, stored.size, stored.width, stored.height, req.user!.id, nowIso());
    const id = Number(result.lastInsertRowid);
    res.status(201).json({
      media: {
        id, kind: stored.kind, name: originalName, size: stored.size, width: stored.width, height: stored.height,
        url: `/api/media/${id}`, thumbUrl: stored.thumbName ? `/api/media/${id}?size=thumb` : null,
      },
    });
  }));

  r.get('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const m = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as
      { stored_name: string; thumb_name: string | null; mime: string; original_name: string; kind: string;
        project_id: number | null; client_id: number | null; uploaded_by: number | null } | undefined;
    const user = req.user!;
    let allowed = false;
    if (m) {
      if (m.project_id) allowed = projectAccessById(db, user, m.project_id).view;
      else if (m.client_id) allowed = true; // client logos/covers are shown to all signed-in users
      else allowed = m.uploaded_by === user.id || user.role === 'super_admin'; // not yet attached
    }
    if (!m || !allowed) throw new HttpError(404, 'File not found.');
    const name = req.query.size === 'thumb' && m.thumb_name ? m.thumb_name : m.stored_name;
    const file = path.join(uploadsDir(), path.basename(name));
    if (!fs.existsSync(file)) throw new HttpError(404, 'File not found.');
    res.set({
      'Content-Type': m.mime,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `inline; filename="${encodeURIComponent(m.original_name)}"`,
    });
    fs.createReadStream(file).pipe(res);
  });

  return r;
}
