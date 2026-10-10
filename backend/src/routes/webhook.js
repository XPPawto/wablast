// =====================================================================
//  Webhook Meta WhatsApp Cloud API
//   GET  /webhook → verifikasi saat mendaftarkan URL di Meta App Dashboard
//   POST /webhook → event: status pesan (sent/delivered/read/failed) & pesan masuk
//  Route ini PUBLIK (dipanggil Meta), diamankan dengan validasi signature HMAC.
// =====================================================================
import { Router } from 'express';
import crypto from 'node:crypto';
import { query } from '../config/db.js';
import { env } from '../config/env.js';

const router = Router();

// ---- 1. Verifikasi (handshake) ----
router.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === env.webhookVerifyToken) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// ---- 2. Validasi signature X-Hub-Signature-256 (pakai raw body) ----
function validSignature(req) {
  if (!env.metaAppSecret) return true;                  // dilewati bila App Secret belum diisi (tidak disarankan di produksi)
  const sig = req.get('x-hub-signature-256') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', env.metaAppSecret).update(req.rawBody || '').digest('hex');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ---- 3. Penerima event ----
router.post('/', (req, res) => {
  if (!validSignature(req)) return res.sendStatus(401);
  res.sendStatus(200);   // Balas cepat! Meta akan mengirim ulang bila tidak mendapat 200 dalam beberapa detik.

  processPayload(req.body).catch((err) => console.error('[webhook] gagal memproses:', err));
});

async function processPayload(body) {
  if (body?.object !== 'whatsapp_business_account') return;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const v = change.value;
      const { rows: [acc] } = await query(`SELECT id FROM settings WHERE phone_number_id = $1`, [v.metadata?.phone_number_id]);
      if (!acc) continue;                                  // event untuk nomor yang tidak kita kelola
      for (const s of v.statuses || []) await handleStatus(acc.id, s);
      for (const m of v.messages || []) await handleIncoming(acc.id, m, v.contacts?.find((c) => c.wa_id === m.from));
    }
  }
}

// ---- Status pengiriman: sent → delivered → read, atau failed ----
async function handleStatus(accountId, s) {
  const ts = new Date(Number(s.timestamp) * 1000);
  const err = s.errors?.[0];

  if (s.status === 'failed') {
    const msg = err?.error_data?.details || err?.message || err?.title || 'Gagal terkirim';
    await query(
      `UPDATE broadcast_logs SET status = 'failed', error_code = $2, error_message = $3
        WHERE wamid = $1 AND wa_status_rank(status) < 3`, [s.id, err?.code ?? null, msg]);
    await query(`UPDATE messages SET status = 'failed', error_message = $2 WHERE wamid = $1`, [s.id, msg]);
    return;
  }
  if (!['sent', 'delivered', 'read'].includes(s.status)) return;

  // Hanya naik peringkat; COALESCE mengisi timestamp yang terlewat bila event datang tidak berurutan
  await query(
    `UPDATE broadcast_logs SET
        status = $2,
        sent_at      = COALESCE(sent_at, $3),
        delivered_at = CASE WHEN $2 IN ('delivered','read') THEN COALESCE(delivered_at, $3) ELSE delivered_at END,
        read_at      = CASE WHEN $2 = 'read' THEN $3 ELSE read_at END
      WHERE wamid = $1 AND wa_status_rank($2) > wa_status_rank(status)`, [s.id, s.status, ts]);
  await query(`UPDATE messages SET status = $2 WHERE wamid = $1 AND wa_status_rank($2) > wa_status_rank(status)`, [s.id, s.status]);
}

// ---- Pesan masuk dari pelanggan ----
const OPT_OUT_WORDS = ['stop', 'berhenti', 'unsubscribe', 'batal langganan'];

function extractText(m) {
  switch (m.type) {
    case 'text': return m.text?.body;
    case 'button': return m.button?.text;
    case 'interactive': return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title;
    case 'image': case 'video': case 'document': case 'audio':
      return `[${m.type}]${m[m.type]?.caption ? ' ' + m[m.type].caption : ''}`;
    default: return `[${m.type}]`;
  }
}

async function handleIncoming(accountId, m, profile) {
  const body = extractText(m) || '';
  // Upsert kontak: buat bila baru (source=inbound), selalu perbarui jam pesan terakhir (window 24 jam)
  const { rows: [contact] } = await query(
    `INSERT INTO contacts (name, phone, source, last_inbound_at) VALUES ($1,$2,'inbound', now())
     ON CONFLICT (phone) DO UPDATE SET last_inbound_at = now(),
       name = COALESCE(contacts.name, EXCLUDED.name)
     RETURNING id`, [profile?.profile?.name || null, m.from]);

  await query(
    `INSERT INTO messages (account_id, contact_id, phone, direction, wamid, type, body, status, created_at)
     VALUES ($1,$2,$3,'in',$4,$5,$6,'received', to_timestamp($7)) ON CONFLICT (wamid) DO NOTHING`,
    [accountId, contact.id, m.from, m.id, m.type, body, Number(m.timestamp)]);

  // Kepatuhan: pelanggan membalas "STOP" → keluarkan dari audiens blast berikutnya
  if (OPT_OUT_WORDS.includes(body.trim().toLowerCase())) {
    await query(`UPDATE contacts SET opt_in = false WHERE id = $1`, [contact.id]);
  }
}

export default router;
