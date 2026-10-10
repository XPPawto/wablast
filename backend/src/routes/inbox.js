// Inbox / Live Chat sederhana. Balasan teks bebas hanya boleh dalam window 24 jam
// sejak pesan terakhir dari pelanggan (aturan WhatsApp).
import { Router } from 'express';
import { query } from '../config/db.js';
import { ah, HttpError } from '../lib/http.js';
import { decrypt } from '../lib/crypto.js';
import { sendTextMessage } from '../lib/whatsapp.js';

const router = Router();
const WINDOW_MS = 24 * 60 * 60 * 1000;

router.get('/conversations', ah(async (req, res) => {
  if (!req.query.account_id) throw new HttpError(400, 'account_id wajib diisi.');
  const { rows } = await query(
    `SELECT * FROM (
       SELECT DISTINCT ON (m.phone) m.phone, m.body AS last_message, m.direction, m.created_at AS last_at,
              c.name, c.last_inbound_at
         FROM messages m LEFT JOIN contacts c ON c.phone = m.phone
        WHERE m.account_id = $1 ORDER BY m.phone, m.created_at DESC) t
      ORDER BY last_at DESC LIMIT 100`, [req.query.account_id]);
  res.json(rows.map((r) => ({ ...r, window_open: !!r.last_inbound_at && Date.now() - new Date(r.last_inbound_at) < WINDOW_MS })));
}));

router.get('/messages', ah(async (req, res) => {
  const { account_id, phone } = req.query;
  const { rows } = await query(
    `SELECT * FROM (SELECT id, direction, type, body, status, error_message, created_at FROM messages
        WHERE account_id = $1 AND phone = $2 ORDER BY created_at DESC LIMIT 200) t ORDER BY created_at`, [account_id, phone]);
  const { rows: [c] } = await query(`SELECT name, last_inbound_at FROM contacts WHERE phone = $1`, [phone]);
  const last = c?.last_inbound_at ? new Date(c.last_inbound_at) : null;
  res.json({
    messages: rows, name: c?.name || null,
    window_open: !!last && Date.now() - last < WINDOW_MS,
    window_expires_at: last ? new Date(last.getTime() + WINDOW_MS) : null,
  });
}));

router.post('/send', ah(async (req, res) => {
  const { account_id, phone, text } = req.body || {};
  if (!text?.trim()) throw new HttpError(400, 'Pesan tidak boleh kosong.');
  const { rows: [c] } = await query(`SELECT id, last_inbound_at FROM contacts WHERE phone = $1`, [phone]);
  if (!c?.last_inbound_at || Date.now() - new Date(c.last_inbound_at) > WINDOW_MS) {
    throw new HttpError(409, 'Window 24 jam sudah tertutup. Kirim template message untuk memulai percakapan lagi.', 'WINDOW_CLOSED');
  }
  const { rows: [acc] } = await query(`SELECT * FROM settings WHERE id = $1`, [account_id]);
  if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');

  const r = await sendTextMessage({ phoneNumberId: acc.phone_number_id, token: decrypt(acc.access_token_enc), to: phone, text });
  const { rows: [msg] } = await query(
    `INSERT INTO messages (account_id, contact_id, phone, direction, wamid, type, body, status)
     VALUES ($1,$2,$3,'out',$4,'text',$5,'sent') RETURNING *`, [acc.id, c.id, phone, r.messages?.[0]?.id, text.trim()]);
  res.status(201).json(msg);
}));

export default router;
