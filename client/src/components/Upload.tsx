import { useRef, useState } from 'react';
import { FileText, ImagePlus, RefreshCw, Trash2, Upload as UploadIcon } from 'lucide-react';
import { api, ApiError, type Media } from '../lib/api';
import { formatBytes } from '../lib/format';
import { Spinner } from './ui';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_DOC = 20 * 1024 * 1024;

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
      const { media } = await api.upload(file, kind);
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
