import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ambil data lalu ulangi tiap `interval` ms (real-time sederhana via polling).
 * Polling berhenti saat tab tidak terlihat; `interval = 0/null` mematikannya.
 */
export function usePolling(fetcher, deps = [], interval = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const load = useCallback(async () => {
    try { setData(await fetchRef.current()); setError(null); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
    if (!interval) return;
    const t = setInterval(() => { if (!document.hidden) load(); }, interval);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, interval]);

  return { data, error, loading, reload: load };
}
