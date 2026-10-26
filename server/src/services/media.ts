import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { config } from '../config.js';
import { HttpError } from '../http.js';

const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);

export const uploadsDir = () => path.join(config.dataDir, 'uploads');

export interface StoredFile {
  kind: 'image' | 'document';
  storedName: string;
  thumbName: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

/**
 * Validate an upload by its content (not its extension) and store it under a
 * random name. Images are re-encoded to WebP, which strips metadata and any
 * embedded payloads, and are resized for the web. SVG is intentionally rejected.
 */
export async function storeUpload(buffer: Buffer, kind: 'image' | 'document'): Promise<StoredFile> {
  fs.mkdirSync(uploadsDir(), { recursive: true });
  const id = crypto.randomBytes(16).toString('hex');

  if (kind === 'document') {
    if (buffer.length > config.uploads.maxDocumentBytes) throw new HttpError(413, 'Document is too large.');
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(400, 'Only PDF documents are accepted.');
    const storedName = `${id}.pdf`;
    fs.writeFileSync(path.join(uploadsDir(), storedName), buffer);
    return { kind, storedName, thumbName: null, mime: 'application/pdf', size: buffer.length, width: null, height: null };
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
  await sharp(buffer).rotate().resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 }).toFile(path.join(uploadsDir(), thumbName));
  fs.writeFileSync(path.join(uploadsDir(), storedName), full.data);
  return {
    kind, storedName, thumbName, mime: 'image/webp', size: full.data.length,
    width: full.info.width, height: full.info.height,
  };
}

export function deleteStoredFiles(storedName: string, thumbName: string | null) {
  for (const name of [storedName, thumbName]) {
    if (!name) continue;
    fs.rmSync(path.join(uploadsDir(), path.basename(name)), { force: true });
  }
}
