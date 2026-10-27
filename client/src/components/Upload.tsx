import { useRef, useState } from 'react';
import { FileText, ImagePlus, RefreshCw, Trash2, Upload as UploadIcon } from 'lucide-react';
import { api, ApiError, type Media } from '../lib/api';
import { formatBytes } from '../lib/format';
import { Spinner } from './ui';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_DOC = 20 * 1024 * 1024;
/** Hosting rejects request bodies above ~4.5 MB, so larger photos are downscaled in the browser first. */
const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024;
/** The server stores images at up to 2000px, so this leaves headroom without losing detail. */
const DOWNSCALE_MAX_SIDE = 2400;

/** Re-encode a large still image to fit under the upload limit; animated GIFs and small files pass through. */
async function shrinkForUpload(file: File): Promise<File> {
  if (file.size <= DIRECT_UPLOAD_LIMIT || file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // let the server report the problem
  }
  const scale = Math.min(1, DOWNSCALE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= DIRECT_UPLOAD_LIMIT) {
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
  }
  return file;
}

export interface UploadValue { id: number; url: string; thumbUrl?: string | null; name?: string; size?: number }

export function validateFile(file: File, kind: 'image' | 'document'): string | null {
  if (kind === 'image') {
    if (!IMAGE_TYPES.includes(file.type)) return 'Use a JPG, PNG, WebP, GIF or AVIF image. SVG files are not accepted for security reasons.';
    if (file.size > MAX_IMAGE) return `Images must be under ${formatBytes(MAX_IMAGE)}.`;
  } else {
    if (file.type !== 'application/pdf') return 'Only PDF documents are accepted.';
    if (file.size > MAX_DOC) return `Documents must be under ${formatBytes(MAX_DOC)}.`;
  }
  return null;
}

/** Upload with client-side checks (the server re-validates content), instant preview, replace and remove. */
export function MediaUpload({ label, kind = 'image', value, onChange, hint, contain, aspect = '16 / 9' }: {
  label: string; kind?: 'image' | 'document'; value: UploadValue | null; onChange: (v: UploadValue | null) => void;
  hint?: string; contain?: boolean; aspect?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [drag, setDrag] = useState(false);
  const [localPreview, setLocalPreview] = useState<string>();

  const handle = async (file?: File) => {
    if (!file) return;
    const problem = validateFile(file, kind);
    if (problem) { setError(problem); return; }
    setError(undefined);
    setBusy(true);
    const preview = kind === 'image' ? URL.createObjectURL(file) : undefined;
    setLocalPreview(preview);
    try {
      const { media } = await api.upload(kind === 'image' ? await shrinkForUpload(file) : file, kind);
      onChange(toValue(media));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
      if (preview) URL.revokeObjectURL(preview);
      setLocalPreview(undefined);
      if (input.current) input.current.value = '';
    }
  };

  const shown = localPreview ?? value?.thumbUrl ?? value?.url;
  return (
    <div className="upload">
      <span className="field-label">{label}</span>
      <div
        className={`upload-box ${drag ? 'drag' : ''} ${contain ? 'contain' : ''}`}
        style={kind === 'image' ? { aspectRatio: aspect } : undefined}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files[0]); }}
      >
        {busy && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(11,11,24,0.6)', zIndex: 1 }}><Spinner /></div>}
        {kind === 'image' && shown ? <img src={shown} alt={`${label} preview`} />
          : kind === 'document' && value ? (
            <div className="upload-file"><FileText size={22} color="var(--accent-strong)" /><div><strong style={{ fontSize: '0.86rem' }}>{value.name ?? 'Document'}</strong>{value.size ? <div className="subtle">{formatBytes(value.size)}</div> : null}</div></div>
          ) : (
            <button type="button" className="upload-empty" style={{ background: 'none', border: 0, cursor: 'pointer', width: '100%', height: '100%' }} onClick={() => input.current?.click()}>
              {kind === 'image' ? <ImagePlus size={24} aria-hidden="true" /> : <UploadIcon size={24} aria-hidden="true" />}
              <span>Drop {kind === 'image' ? 'an image' : 'a PDF'} here or click to browse</span>
              <span>{kind === 'image' ? 'JPG, PNG, WebP (up to 8 MB)' : 'PDF (up to 20 MB)'}</span>
            </button>
          )}
      </div>
      <input ref={input} type="file" hidden accept={kind === 'image' ? IMAGE_TYPES.join(',') : 'application/pdf'} onChange={(e) => void handle(e.target.files?.[0])} aria-label={`Upload ${label}`} />
      {value && (
        <div className="upload-actions">
          <button type="button" className="btn btn-sm" onClick={() => input.current?.click()} disabled={busy}><RefreshCw size={14} />Replace</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(null)} disabled={busy}><Trash2 size={14} />Remove</button>
        </div>
      )}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}

export const toValue = (m: Media): UploadValue => ({ id: m.id, url: m.url, thumbUrl: m.thumbUrl, name: m.name, size: m.size });
