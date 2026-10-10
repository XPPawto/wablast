// =====================================================================
//  BLAST ENGINE — antrian + rate limiter, tanpa Redis.
//
//  Cara kerja:
//   1. Saat kampanye dibuat, setiap penerima menjadi baris `broadcast_logs`
//      berstatus 'queued' → tabel ini adalah antriannya (tahan restart).
//   2. `tick()` berjalan tiap detik: mempromosikan kampanye terjadwal yang
//      sudah waktunya, lalu menyalakan satu "runner" per kampanye 'running'.
//   3. Runner mengambil SATU pesan per iterasi (FOR UPDATE SKIP LOCKED),
//      mengirim ke Meta, lalu tidur `delay_ms` (+ jitter) → pengiriman
//      berantai dengan jeda, bukan Promise.all yang menghajar API sekaligus.
//   4. Perlindungan:
//        - Rate limit Meta  → pesan dikembalikan ke antrian + cooldown eksponensial
//        - Token invalid    → kampanye otomatis di-PAUSE (jangan menembak buta)
//        - Error sementara  → retry s.d. MAX_ATTEMPTS dengan backoff
//        - Gagal beruntun   → auto-pause (melindungi Quality Rating nomor)
//
//  Skala besar? Ganti file ini dengan worker BullMQ/Redis; kontrak
//  tabelnya (broadcast_logs) tetap sama.
// =====================================================================
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { decrypt } from '../lib/crypto.js';
import { sendTemplateMessage, WhatsAppError } from '../lib/whatsapp.js';
import { buildComponents, renderBody } from '../lib/messageBuilder.js';

const MAX_CONSECUTIVE_FAILURES = 25;   // auto-pause bila 25 pesan berturut-turut gagal
const COOLDOWN_BASE_MS = 5000;         // cooldown awal saat kena rate limit
const COOLDOWN_MAX_MS = 120000;

const runners = new Set();             // id kampanye yang sedang punya runner aktif
let ticking = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms + Math.floor(Math.random() * ms * 0.3); // +0–30% agar tidak "mekanis"

// ---------------------------------------------------------------------
export async function startEngine() {
  // Pesan yang tertinggal 'sending' (server mati di tengah kirim) → kembali ke antrian
  await query(`UPDATE broadcast_logs SET status = 'queued' WHERE status = 'sending'`);
  setInterval(tick, 1000);
  console.log('[engine] blast engine aktif');
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    // Kampanye terjadwal yang waktunya sudah tiba → mulai jalan
    await query(`UPDATE campaigns SET status = 'running', started_at = COALESCE(started_at, now())
                 WHERE status = 'scheduled' AND scheduled_at <= now()`);
    const { rows } = await query(`SELECT id FROM campaigns WHERE status = 'running'`);
    for (const { id } of rows) {
      if (runners.has(id)) continue;
      runners.add(id);
      runCampaign(id)
        .catch((err) => console.error(`[engine] campaign ${id} crash:`, err))
        .finally(() => runners.delete(id));
    }
  } catch (err) {
    console.error('[engine] tick error:', err.message);
  } finally {
    ticking = false;
  }
}

// ---------------------------------------------------------------------
//  Satu runner = satu kampanye. Loop sampai selesai / di-pause / dibatalkan.
// ---------------------------------------------------------------------
async function runCampaign(campaignId) {
  const ctx = await loadContext(campaignId);
  if (!ctx) return;

  let rateLimitHits = 0;       // untuk cooldown eksponensial
  let consecutiveFailures = 0;

  while (true) {
    // Cek status terbaru tiap iterasi → pause/cancel dari dashboard langsung berlaku
    const { rows: [c] } = await query(`SELECT status, delay_ms FROM campaigns WHERE id = $1`, [campaignId]);
    if (!c || c.status !== 'running') return;

    const log = await claimNext(campaignId);

    if (!log) {
      // Antrian kosong. Masih ada yang menunggu retry? Kalau tidak → selesai.
      const { rows: [r] } = await query(
        `SELECT count(*) FILTER (WHERE status IN ('queued','sending')) AS pending
           FROM broadcast_logs WHERE campaign_id = $1`, [campaignId]);
      if (r.pending === 0) {
        await query(`UPDATE campaigns SET status = 'completed', completed_at = now()
                     WHERE id = $1 AND status = 'running'`, [campaignId]);
        return;
      }
      await sleep(1000);
      continue;
    }

    const result = await deliver(ctx, log);

    if (result === 'sent') { rateLimitHits = 0; consecutiveFailures = 0; }
    else if (result === 'failed') {
      if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await pauseCampaign(campaignId, `Dihentikan otomatis: ${MAX_CONSECUTIVE_FAILURES} pesan berturut-turut gagal. Periksa token, template, atau kualitas nomor.`);
        return;
      }
    } else if (result === 'rate_limited') {
      rateLimitHits++;
      const cooldown = Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** (rateLimitHits - 1));
      console.warn(`[engine] ${campaignId} kena rate limit, cooldown ${cooldown}ms`);
      await sleep(cooldown);
      continue;
    } else if (result === 'halt') return;

    await sleep(jitter(c.delay_ms));  // ← jeda antar pesan (rate limiting)
  }
}

/** Muat kampanye + template + akun (token didekripsi sekali di awal). */
async function loadContext(campaignId) {
  const { rows: [campaign] } = await query(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
  if (!campaign) return null;
  const { rows: [template] } = await query(`SELECT * FROM templates WHERE id = $1`, [campaign.template_id]);
  const { rows: [account] } = await query(`SELECT * FROM settings WHERE id = $1`, [campaign.account_id]);
  if (!template || !account) {
    await pauseCampaign(campaignId, 'Template atau akun WhatsApp tidak ditemukan.');
    return null;
  }
  return { campaign, template, account, token: decrypt(account.access_token_enc) };
}

/** Ambil & kunci 1 pesan antrian. SKIP LOCKED mencegah dobel-kirim bila ada >1 proses. */
async function claimNext(campaignId) {
  const { rows } = await query(
    `UPDATE broadcast_logs SET status = 'sending', attempts = attempts + 1
      WHERE id = (
        SELECT id FROM broadcast_logs
         WHERE campaign_id = $1 AND status = 'queued'
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING *`, [campaignId]);
  return rows[0] || null;
}

// ---------------------------------------------------------------------
//  Kirim satu pesan. Return: 'sent' | 'failed' | 'rate_limited' | 'retry' | 'halt'
// ---------------------------------------------------------------------
async function deliver({ campaign, template, account, token }, log) {
  try {
    const { rows: [contact] } = await query(
      `SELECT name, phone, email, variables FROM contacts WHERE id = $1`, [log.contact_id]);
    if (!contact) return markFailed(log.id, null, 'Kontak sudah dihapus.');

    const { components, params } = buildComponents(template, campaign, contact);
    const res = await sendTemplateMessage({
      phoneNumberId: account.phone_number_id, token, to: log.phone,
      templateName: template.name, language: template.language, components,
    });
    const wamid = res.messages?.[0]?.id;

    await query(
      `UPDATE broadcast_logs SET status = 'sent', wamid = $2, params = $3, sent_at = now(),
              error_code = NULL, error_message = NULL WHERE id = $1`,
      [log.id, wamid, JSON.stringify(params)]);

    // Catat juga di riwayat chat agar muncul di Inbox
    await query(
      `INSERT INTO messages (account_id, contact_id, phone, direction, wamid, type, body, status)
       VALUES ($1,$2,$3,'out',$4,'template',$5,'sent') ON CONFLICT (wamid) DO NOTHING`,
      [account.id, log.contact_id, log.phone, wamid, renderBody(template, params)]);
    return 'sent';
  } catch (err) {
    if (!(err instanceof WhatsAppError)) {
      console.error('[engine] error tak terduga:', err);
      return markFailed(log.id, null, `Internal error: ${err.message}`);
    }
    // Token/izin bermasalah → berhenti total, pesan dikembalikan ke antrian
    if (err.isAuth) {
      await requeue(log.id, 0, true);
      await pauseCampaign(campaign.id, `Token ditolak Meta (kode ${err.code}): ${err.message}. Perbarui token di Settings lalu lanjutkan kampanye.`);
      return 'halt';
    }
    // Rate limit → kembalikan ke antrian, engine akan cooldown
    if (err.isRateLimit) { await requeue(log.id, COOLDOWN_BASE_MS, true); return 'rate_limited'; }
    // Gangguan sementara → retry dengan backoff selama belum melewati MAX_ATTEMPTS
    if (err.isTransient && log.attempts < env.maxAttempts) {
      await requeue(log.id, 5000 * log.attempts);
      return 'retry';
    }
    return markFailed(log.id, err.code, err.message);
  }
}

async function markFailed(logId, code, message) {
  await query(`UPDATE broadcast_logs SET status = 'failed', error_code = $2, error_message = $3 WHERE id = $1`,
    [logId, code, String(message).slice(0, 500)]);
  return 'failed';
}

/** Kembalikan ke antrian. refund=true → percobaan ini tidak dihitung (bukan salah penerima). */
async function requeue(logId, delayMs, refund = false) {
  await query(
    `UPDATE broadcast_logs SET status = 'queued',
            attempts = attempts - $3::int,
            next_attempt_at = now() + ($2 || ' milliseconds')::interval WHERE id = $1`,
    [logId, String(delayMs), refund ? 1 : 0]);
}

async function pauseCampaign(id, reason) {
  await query(`UPDATE campaigns SET status = 'paused', last_error = $2 WHERE id = $1 AND status = 'running'`, [id, reason]);
}
