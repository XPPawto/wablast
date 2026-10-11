// Klien HTTP tipis: menyisipkan JWT, membuang param kosong, dan melempar Error berpesan jelas.
const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'wa_blast_token';

export const auth = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export async function api(path, { method = 'GET', body, params } = {}) {
  const qs = params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
    : '';
  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth.get() ? { Authorization: `Bearer ${auth.get()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth')) {
    auth.clear();
    window.location.href = '/login';
    return;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Body bukan JSON = respons berasal dari proxy/hosting (backend mati, timeout, dsb.), bukan dari API kita
    const gateway = [502, 503, 504].includes(res.status) && !data.error;
    throw Object.assign(new Error(data.error || (gateway
      ? `Server tidak merespons (${res.status}). Backend mungkin mati atau sedang restart — cek log backend.`
      : `Request gagal (${res.status})`)), { code: data.code });
  }
  return data;
}
