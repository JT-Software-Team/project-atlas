/** Thin fetch wrapper for the Project Atlas API. Cookies carry the session; no tokens live in JS. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public details?: Record<string, unknown>) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Called when any request returns 401, so the app can return to the login page. */
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => { unauthorizedListeners.delete(fn); };
};

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Atlas-Request': '1', Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Unable to reach the Project Atlas server. Check your connection and try again.');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (!isJson) {
    if (res.status === 401 && !url.startsWith('/auth/')) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(res.status || 502, `Server returned an invalid response (${res.status}).`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) unauthorizedListeners.forEach((fn) => fn());
    const fields: Record<string, string> | undefined = data.fields
      ?? (data.details?.field ? { [data.details.field]: data.error } : undefined);
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status}).`, fields, data.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T>(url: string, body?: unknown) => request<T>('DELETE', url, body ?? {}),
  upload: (file: File, kind: 'image' | 'document') => {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    return request<{ media: Media }>('POST', '/media', fd);
  },
};

export interface Media {
  id: number;
  kind: 'image' | 'document';
  name: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  thumbUrl: string | null;
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};
