// Normalisasi nomor telepon ke format E.164 tanpa tanda '+' (format yang diminta Cloud API).
import { env } from '../config/env.js';

/**
 * "0812-3456-7890" -> "6281234567890"
 * "+62 812 3456 7890" -> "6281234567890"
 * "812345678" -> "62812345678"
 * Mengembalikan null bila tidak valid (panjang E.164: 8-15 digit).
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = env.defaultCountryCode + d.slice(1);
  else if (d.startsWith('8') && env.defaultCountryCode === '62') d = '62' + d;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** "#VIP " -> "vip"; "Customer Lama" -> "customer-lama" */
export function normalizeTag(t) {
  return String(t || '').trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

export const normalizeTags = (arr = []) => [...new Set(arr.map(normalizeTag).filter(Boolean))];
