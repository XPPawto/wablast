export const fmtNum = (n) => new Intl.NumberFormat('id-ID').format(n ?? 0);
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const fmtDateTime = (d) =>
  d ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '—';
export const fmtTime = (d) => (d ? new Intl.DateTimeFormat('id-ID', { timeStyle: 'short' }).format(new Date(d)) : '');

/** "2026-10-03" -> "3 Okt" untuk sumbu grafik */
export const fmtDay = (s) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(s));

/** Nomor variabel unik dari teks template: "Hai {{1}} {{2}}" -> [1, 2] */
export const extractVars = (text = '') =>
  [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

export const TIER_LABEL = { TIER_50: '50', TIER_250: '250', TIER_1K: '1.000', TIER_2K: '2.000', TIER_10K: '10.000', TIER_100K: '100.000', TIER_UNLIMITED: 'Tanpa batas' };
