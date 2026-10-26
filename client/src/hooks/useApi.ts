import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/** Fetch a GET endpoint; pass null to skip. Re-fetches when the URL changes. */
export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!url) { setLoading(false); return; }
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    api.get<T>(url)
      .then((d) => { if (id === latest.current) setData(d); })
      .catch((e: ApiError) => { if (id === latest.current) setError(e); })
      .finally(() => { if (id === latest.current) setLoading(false); });
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload, setData };
}
