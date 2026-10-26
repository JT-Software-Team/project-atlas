const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso?: string | null) => (iso ? dateFmt.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)) : '—');
export const formatDateTime = (iso?: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');

export function timeAgo(iso?: string | null): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}

export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const locationText = (loc?: { siteName?: string | null; city?: string | null; state?: string | null; country?: string | null } | null) =>
  loc ? [loc.city, loc.state, loc.country].filter(Boolean).join(', ') : '';
