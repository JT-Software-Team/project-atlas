import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { config } from '../config.js';
import type { DB } from '../db/index.js';
import { HttpError } from '../http.js';

const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);

/** Legacy location: uploads stored before file contents moved into the database are still read from here. */
export const uploadsDir = () => path.join(config.dataDir, 'uploads');

export interface StoredFile {
  kind: 'image' | 'document';
  storedName: string;
  thumbName: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  /** Contents to persist, keyed by stored name. */
  files: { name: string; data: Buffer }[];
}

/**
 * Validate an upload by its content (not its extension) and prepare it under a
 * random name. Images are re-encoded to WebP, which strips metadata and any
 * embedded payloads, and are resized for the web. SVG is intentionally rejected.
 * The caller persists `files` (see saveMediaFiles) together with the media row.
 */
export async function storeUpload(buffer: Buffer, kind: 'image' | 'document'): Promise<StoredFile> {
  const id = crypto.randomBytes(16).toString('hex');

  if (kind === 'document') {
    if (buffer.length > config.uploads.maxDocumentBytes) throw new HttpError(413, 'Document is too large.');
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(400, 'Only PDF documents are accepted.');
    const storedName = `${id}.pdf`;
    return {
      kind, storedName, thumbName: null, mime: 'application/pdf', size: buffer.length, width: null, height: null,
      files: [{ name: storedName, data: buffer }],
    };
  }

  if (buffer.length > config.uploads.maxImageBytes) throw new HttpError(413, 'Image is too large.');
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new HttpError(400, 'That file is not a supported image. Use JPG, PNG, WebP, GIF or AVIF.');
  }
  if (!meta.format || !IMAGE_FORMATS.has(meta.format)) {
    throw new HttpError(400, 'That file is not a supported image. Use JPG, PNG, WebP, GIF or AVIF.');
  }
  if ((meta.width ?? 0) * (meta.height ?? 0) > 60_000_000) throw new HttpError(400, 'Image dimensions are too large.');

  const storedName = `${id}.webp`;
  const thumbName = `${id}.thumb.webp`;
  const full = await sharp(buffer).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(buffer).rotate().resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 }).toBuffer();
  return {
    kind, storedName, thumbName, mime: 'image/webp', size: full.data.length,
    width: full.info.width, height: full.info.height,
    files: [{ name: storedName, data: full.data }, { name: thumbName, data: thumb }],
  };
}

export async function saveMediaFiles(db: DB, files: StoredFile['files']) {
  for (const f of files) await db.prepare('INSERT INTO media_files (name, data) VALUES (?, ?)').run(f.name, f.data);
}

/** File contents by stored name, from the database or (for older uploads) the uploads directory. */
export async function readMediaFile(db: DB, storedName: string): Promise<Buffer | null> {
  const name = path.basename(storedName);
  const row = await db.prepare('SELECT data FROM media_files WHERE name = ?').get(name) as { data: Buffer } | undefined;
  if (row) return row.data;
  const file = path.join(uploadsDir(), name);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

export function deleteStoredFiles(storedName: string, thumbName: string | null) {
  for (const name of [storedName, thumbName]) {
    if (!name) continue;
    fs.rmSync(path.join(uploadsDir(), path.basename(name)), { force: true });
  }
}

/** Bytes and count of file contents stored in the database (images, thumbnails, documents). */
export async function storageUsage(db: DB): Promise<{ bytes: number; files: number }> {
  // length() of a BLOB reads its size from the record header, not the contents.
  const row = await db.prepare('SELECT COALESCE(SUM(length(data)), 0) AS bytes, COUNT(*) AS files FROM media_files').get() as
    { bytes: number; files: number };
  return { bytes: Number(row.bytes), files: Number(row.files) };
}

/** Every column that can point at a media row. A media row referenced by none of them is unused. */
const MEDIA_REFERENCES = `
  EXISTS (SELECT 1 FROM projects p WHERE :id IN (p.cover_media_id, p.plant_media_id, p.equipment_media_id, p.document_media_id))
  OR EXISTS (SELECT 1 FROM project_gallery g WHERE g.media_id = :id)
  OR EXISTS (SELECT 1 FROM dashboards d WHERE d.thumbnail_media_id = :id)
  OR EXISTS (SELECT 1 FROM clients c WHERE :id IN (c.logo_media_id, c.cover_media_id))`;

/**
 * Delete the given media rows, and their stored contents, if nothing references them any more.
 * Called after a record stops using an image (replaced, removed, or its project deleted) so storage
 * does not fill up with unreachable files. Legacy files in the uploads directory are never touched.
 */
export async function deleteUnreferencedMedia(db: DB, ids: (number | null | undefined)[]): Promise<number> {
  let deleted = 0;
  for (const id of new Set(ids.filter((v): v is number => !!v))) {
    const m = await db.prepare(`SELECT stored_name, thumb_name, (${MEDIA_REFERENCES}) AS used FROM media WHERE id = :id`).get({ id }) as
      { stored_name: string; thumb_name: string | null; used: number } | undefined;
    if (!m || m.used) continue;
    await db.prepare('DELETE FROM media_files WHERE name IN (?, ?)').run(m.stored_name, m.thumb_name ?? m.stored_name);
    await db.prepare('DELETE FROM media WHERE id = ?').run(id);
    deleted++;
  }
  return deleted;
}

/** Uploads never attached to a record within a day were abandoned (e.g. a form closed without saving). */
export async function pruneAbandonedUploads(db: DB): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const rows = await db.prepare(
    'SELECT id FROM media WHERE project_id IS NULL AND client_id IS NULL AND created_at < ? LIMIT 50',
  ).all(cutoff) as { id: number }[];
  return deleteUnreferencedMedia(db, rows.map((r) => r.id));
}
