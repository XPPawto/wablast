// =====================================================================
//  Klien WhatsApp Cloud API (Meta Graph API).
//  Semua pemanggilan ke Meta melewati file ini supaya error handling,
//  versi API, dan header otorisasi seragam.
// =====================================================================
import axios from 'axios';
import { env } from '../config/env.js';

export const GRAPH_URL = `${env.graphBaseUrl}/${env.graphVersion}`; // contoh: .../v20.0

/** Error terstruktur dari Meta, lengkap dengan klasifikasi untuk engine antrian. */
export class WhatsAppError extends Error {
  constructor({ message, code, httpStatus, network }) {
    super(message);
    this.name = 'WhatsAppError';
    this.code = code ?? null;
    this.httpStatus = httpStatus ?? null;
    this.network = !!network;
  }
  /** Rate limit: throughput, pair-rate-limit, API call limit. Antrian harus melambat. */
  get isRateLimit() { return this.httpStatus === 429 || [80007, 130429, 131056, 4, 17, 32, 613].includes(this.code); }
  /** Token/izin bermasalah: hentikan kampanye, jangan lanjut menembak. */
  get isAuth() { return this.httpStatus === 401 || [190, 102, 10, 200, 131005].includes(this.code); }
  /** Gangguan sementara (jaringan / 5xx / "service unavailable"): layak dicoba ulang. */
  get isTransient() { return this.network || (this.httpStatus >= 500) || [1, 2, 131000, 131016].includes(this.code); }
}

function toWhatsAppError(err) {
  const e = err.response?.data?.error;
  return new WhatsAppError({
    message: e?.error_data?.details || e?.message || err.message,
    code: e?.code,
    httpStatus: err.response?.status,
    network: !err.response,
  });
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** Wrapper axios.post/get ke Graph API dengan normalisasi error. */
async function graphPost(path, data, token, config = {}) {
  try {
    const res = await axios.post(`${GRAPH_URL}${path}`, data, { timeout: 20000, headers: { ...auth(token), ...config.headers }, params: config.params });
    return res.data;
  } catch (err) { throw toWhatsAppError(err); }
}
async function graphGet(pathOrUrl, token, params) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GRAPH_URL}${pathOrUrl}`;
  try {
    const res = await axios.get(url, { timeout: 20000, headers: auth(token), params });
    return res.data;
  } catch (err) { throw toWhatsAppError(err); }
}

// ---------------------------------------------------------------------
//  Kirim pesan  →  POST https://graph.facebook.com/v20.0/{phone_number_id}/messages
// ---------------------------------------------------------------------

/** Kirim pesan TEMPLATE (dipakai blast). components berisi header/body parameters. */
export function sendTemplateMessage({ phoneNumberId, token, to, templateName, language, components }) {
  return graphPost(`/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: { name: templateName, language: { code: language }, ...(components?.length ? { components } : {}) },
  }, token);
}

/** Kirim pesan teks biasa (hanya valid di dalam window 24 jam sejak pesan terakhir pelanggan). */
export function sendTextMessage({ phoneNumberId, token, to, text }) {
  return graphPost(`/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: true, body: text },
  }, token);
}

// ---------------------------------------------------------------------
//  Kesehatan nomor: Quality Rating & Messaging Tier
// ---------------------------------------------------------------------
export function fetchPhoneHealth(phoneNumberId, token) {
  return graphGet(`/${phoneNumberId}`, token, {
    fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier',
  });
}

// ---------------------------------------------------------------------
//  Template management (level WABA)
// ---------------------------------------------------------------------
/** Ambil seluruh template (otomatis menelusuri pagination). */
export async function fetchTemplates(wabaId, token) {
  let page = await graphGet(`/${wabaId}/message_templates`, token, {
    fields: 'id,name,language,category,status,components,rejected_reason', limit: 100,
  });
  const all = [...page.data];
  while (page.paging?.next) {
    page = await graphGet(page.paging.next, token);
    all.push(...page.data);
  }
  return all;
}

export const createTemplate = (wabaId, token, payload) => graphPost(`/${wabaId}/message_templates`, payload, token);

export async function deleteTemplate(wabaId, token, name) {
  try {
    const res = await axios.delete(`${GRAPH_URL}/${wabaId}/message_templates`, { headers: auth(token), params: { name } });
    return res.data;
  } catch (err) { throw toWhatsAppError(err); }
}

/**
 * Meta mewajibkan CONTOH media (header_handle) untuk template ber-header gambar/PDF/video.
 * Handle didapat lewat Resumable Upload API: unduh file dari URL → upload ke Meta → dapat "h".
 */
export async function uploadSampleMedia(sampleUrl, token) {
  if (!env.metaAppId) throw new WhatsAppError({ message: 'META_APP_ID belum diisi di .env (diperlukan untuk upload sample media).' });
  try {
    const file = await axios.get(sampleUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const mime = (file.headers['content-type'] || 'application/octet-stream').split(';')[0];
    const session = await axios.post(`${GRAPH_URL}/${env.metaAppId}/uploads`, null, {
      headers: auth(token),
      params: { file_length: file.data.byteLength, file_type: mime, file_name: 'sample' },
    });
    const up = await axios.post(`${GRAPH_URL}/${session.data.id}`, file.data, {
      headers: { Authorization: `OAuth ${token}`, file_offset: 0, 'Content-Type': mime },
      maxBodyLength: Infinity,
    });
    return up.data.h;
  } catch (err) { throw toWhatsAppError(err); }
}
