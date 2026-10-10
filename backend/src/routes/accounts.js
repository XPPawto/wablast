// Pengelolaan banyak nomor WhatsApp Business (tabel `settings`).
import { Router } from 'express';
import { query } from '../config/db.js';
import { ah, HttpError } from '../lib/http.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { fetchPhoneHealth } from '../lib/whatsapp.js';

const router = Router();

// Kolom aman — access_token_enc TIDAK PERNAH dikirim ke browser
const PUBLIC_COLS = `id, label, phone_number_id, waba_id, display_phone_number, verified_name,
  quality_rating, messaging_limit_tier, health_synced_at, is_active, created_at`;

/** Validasi token ke Meta sekaligus ambil quality rating & tier. */
async function pullHealth(phoneNumberId, token) {
  const h = await fetchPhoneHealth(phoneNumberId, token);
  return {
    display_phone_number: h.display_phone_number || null,
    verified_name: h.verified_name || null,
    quality_rating: h.quality_rating || 'UNKNOWN',
    messaging_limit_tier: h.messaging_limit_tier || null,
  };
}

router.get('/', ah(async (req, res) => {
  const { rows } = await query(`SELECT ${PUBLIC_COLS} FROM settings ORDER BY created_at`);
  res.json(rows);
}));

router.post('/', ah(async (req, res) => {
  const { label, phone_number_id, waba_id, access_token } = req.body || {};
  if (!label || !phone_number_id || !waba_id || !access_token) {
    throw new HttpError(400, 'Label, Phone Number ID, WABA ID, dan Access Token wajib diisi.');
  }
  const health = await pullHealth(phone_number_id.trim(), access_token.trim()); // gagal di sini = kredensial salah
  const { rows } = await query(
    `INSERT INTO settings (label, phone_number_id, waba_id, access_token_enc, display_phone_number,
                           verified_name, quality_rating, messaging_limit_tier, health_synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) RETURNING ${PUBLIC_COLS}`,
    [label.trim(), phone_number_id.trim(), waba_id.trim(), encrypt(access_token.trim()),
     health.display_phone_number, health.verified_name, health.quality_rating, health.messaging_limit_tier]);
  res.status(201).json(rows[0]);
}));

router.put('/:id', ah(async (req, res) => {
  const { label, waba_id, access_token, is_active } = req.body || {};
  const { rows: [acc] } = await query(`SELECT * FROM settings WHERE id = $1`, [req.params.id]);
  if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');

  let tokenEnc = acc.access_token_enc;
  if (access_token) {                      // token hanya diganti bila diisi
    await pullHealth(acc.phone_number_id, access_token.trim());
    tokenEnc = encrypt(access_token.trim());
  }
  const { rows } = await query(
    `UPDATE settings SET label = COALESCE($2,label), waba_id = COALESCE($3,waba_id),
            access_token_enc = $4, is_active = COALESCE($5,is_active)
      WHERE id = $1 RETURNING ${PUBLIC_COLS}`,
    [req.params.id, label, waba_id, tokenEnc, is_active]);
  res.json(rows[0]);
}));

router.delete('/:id', ah(async (req, res) => {
  const { rows: [used] } = await query(`SELECT count(*) AS n FROM campaigns WHERE account_id = $1`, [req.params.id]);
  if (used.n > 0) throw new HttpError(409, 'Nomor ini masih punya kampanye. Nonaktifkan saja, jangan dihapus.');
  await query(`DELETE FROM settings WHERE id = $1`, [req.params.id]);
  res.status(204).end();
}));

/** Segarkan Quality Rating & Tier langsung dari Meta. */
router.post('/:id/refresh', ah(async (req, res) => {
  const { rows: [acc] } = await query(`SELECT * FROM settings WHERE id = $1`, [req.params.id]);
  if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');
  const h = await pullHealth(acc.phone_number_id, decrypt(acc.access_token_enc));
  const { rows } = await query(
    `UPDATE settings SET display_phone_number=$2, verified_name=$3, quality_rating=$4,
            messaging_limit_tier=$5, health_synced_at=now() WHERE id=$1 RETURNING ${PUBLIC_COLS}`,
    [acc.id, h.display_phone_number, h.verified_name, h.quality_rating, h.messaging_limit_tier]);
  res.json(rows[0]);
}));

export default router;
