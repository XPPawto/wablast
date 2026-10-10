// Campaign Launcher: buat kampanye, kontrol (pause/resume/cancel/retry), progres & log.
import { Router } from 'express';
import { query, tx } from '../config/db.js';
import { ah, HttpError, paging } from '../lib/http.js';
import { normalizeTags } from '../lib/phone.js';
import { extractVariables } from '../lib/templateParser.js';

const router = Router();

// Fragmen SQL: hitung statistik per kampanye (kumulatif: 'read' juga terhitung 'delivered' & 'sent')
const STATS = `
  count(l.id) FILTER (WHERE l.status IN ('sent','delivered','read')) AS sent,
  count(l.id) FILTER (WHERE l.status IN ('delivered','read'))        AS delivered,
  count(l.id) FILTER (WHERE l.status = 'read')                       AS read,
  count(l.id) FILTER (WHERE l.status = 'failed')                     AS failed,
  count(l.id) FILTER (WHERE l.status IN ('queued','sending'))        AS pending`;

// Syarat audiens: hanya kontak opt-in; tag kosong = semua; match any (&&) / all (@>)
const AUDIENCE_WHERE = `opt_in = true AND (
  cardinality($1::text[]) = 0 OR ($2 = 'any' AND tags && $1::text[]) OR ($2 = 'all' AND tags @> $1::text[]))`;

router.get('/', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, t.name AS template_name, s.label AS account_label, ${STATS}
       FROM campaigns c
       JOIN templates t ON t.id = c.template_id
       JOIN settings s ON s.id = c.account_id
       LEFT JOIN broadcast_logs l ON l.campaign_id = c.id
      WHERE ($1::uuid IS NULL OR c.account_id = $1)
      GROUP BY c.id, t.name, s.label ORDER BY c.created_at DESC LIMIT 100`, [req.query.account_id || null]);
  res.json(rows);
}));

/** Pratinjau jumlah penerima di wizard (langkah 2). */
router.post('/audience-count', ah(async (req, res) => {
  const { tags = [], tag_match = 'any' } = req.body || {};
  const { rows: [r] } = await query(`SELECT count(*) AS count FROM contacts WHERE ${AUDIENCE_WHERE}`, [normalizeTags(tags), tag_match]);
  res.json(r);
}));

router.get('/:id', ah(async (req, res) => {
  const { rows: [c] } = await query(
    `SELECT c.*, t.name AS template_name, t.body AS template_body, s.label AS account_label, ${STATS}
       FROM campaigns c JOIN templates t ON t.id = c.template_id JOIN settings s ON s.id = c.account_id
       LEFT JOIN broadcast_logs l ON l.campaign_id = c.id
      WHERE c.id = $1 GROUP BY c.id, t.body, t.name, s.label`, [req.params.id]);
  if (!c) throw new HttpError(404, 'Kampanye tidak ditemukan.');
  res.json(c);
}));

/** Buat kampanye + isi antrian (broadcast_logs) dalam satu transaksi. */
router.post('/', ah(async (req, res) => {
  const { name, account_id, template_id, target_tags = [], tag_match = 'any', variable_mapping = {},
          header_media_url, delay_ms = 700, send_mode = 'now', scheduled_at } = req.body || {};

  if (!name?.trim()) throw new HttpError(400, 'Nama kampanye wajib diisi.');
  const { rows: [tpl] } = await query(`SELECT * FROM templates WHERE id = $1 AND account_id = $2`, [template_id, account_id]);
  if (!tpl) throw new HttpError(400, 'Template tidak ditemukan untuk nomor ini.');
  if (tpl.status !== 'APPROVED') throw new HttpError(400, `Template berstatus ${tpl.status}. Hanya template APPROVED yang bisa dipakai.`);
  if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(tpl.header_type) && !header_media_url) {
    throw new HttpError(400, 'Template ini butuh URL media untuk header.');
  }
  // Pastikan semua variabel {{n}} sudah dipetakan
  const missing = extractVariables(tpl.body).filter((n) => !variable_mapping.body?.[n]);
  if (missing.length) throw new HttpError(400, `Variabel belum dipetakan: ${missing.map((n) => `{{${n}}}`).join(', ')}`);

  let status = 'running', when = null;
  if (send_mode === 'schedule') {
    when = new Date(scheduled_at);
    if (isNaN(when) || when.getTime() < Date.now() + 30_000) throw new HttpError(400, 'Waktu jadwal harus minimal 1 menit dari sekarang.');
    status = 'scheduled';
  }

  const tags = normalizeTags(target_tags);
  const campaign = await tx(async (db) => {
    const { rows: [c] } = await db.query(
      `INSERT INTO campaigns (name, account_id, template_id, status, target_tags, tag_match, variable_mapping,
                              header_media_url, delay_ms, scheduled_at, started_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $4 = 'running' THEN now() END) RETURNING *`,
      [name.trim(), account_id, template_id, status, tags, tag_match, variable_mapping,
       header_media_url || null, delay_ms, when]);

    // Isi antrian langsung dari query audiens (satu INSERT…SELECT, cepat untuk puluhan ribu kontak)
    const { rowCount } = await db.query(
      `INSERT INTO broadcast_logs (campaign_id, contact_id, phone)
       SELECT $3, id, phone FROM contacts WHERE ${AUDIENCE_WHERE}`, [tags, tag_match, c.id]);
    if (rowCount === 0) throw new HttpError(400, 'Tidak ada kontak yang cocok dengan audiens ini.');

    await db.query(`UPDATE campaigns SET total_recipients = $2 WHERE id = $1`, [c.id, rowCount]);
    return { ...c, total_recipients: rowCount };
  });
  res.status(201).json(campaign);
}));

// ---- Kontrol kampanye. Engine membaca status tiap iterasi, jadi efeknya langsung ----
const transition = (from, to, extra = '') => ah(async (req, res) => {
  const { rows: [c] } = await query(
    `UPDATE campaigns SET status = $3 ${extra} WHERE id = $1 AND status = ANY($2::text[]) RETURNING *`,
    [req.params.id, from, to]);
  if (!c) throw new HttpError(409, `Kampanye tidak bisa diubah ke "${to}" dari status saat ini.`);
  res.json(c);
});

router.post('/:id/pause',  transition(['running', 'scheduled'], 'paused'));
router.post('/:id/resume', transition(['paused'], 'running', `, last_error = NULL, started_at = COALESCE(started_at, now())`));

router.post('/:id/cancel', ah(async (req, res) => {
  await tx(async (db) => {
    const { rowCount } = await db.query(
      `UPDATE campaigns SET status = 'cancelled', completed_at = now()
        WHERE id = $1 AND status IN ('scheduled','running','paused')`, [req.params.id]);
    if (!rowCount) throw new HttpError(409, 'Kampanye sudah selesai atau dibatalkan.');
    await db.query(`UPDATE broadcast_logs SET status = 'cancelled' WHERE campaign_id = $1 AND status IN ('queued','sending')`, [req.params.id]);
  });
  res.json({ ok: true });
}));

/** Kirim ulang HANYA yang gagal. Opsi: abaikan error permanen (mis. nomor tidak punya WhatsApp). */
router.post('/:id/retry-failed', ah(async (req, res) => {
  const skipPermanent = req.body?.skip_permanent !== false;
  const result = await tx(async (db) => {
    const { rows: [c] } = await db.query(`SELECT status FROM campaigns WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!c) throw new HttpError(404, 'Kampanye tidak ditemukan.');
    if (c.status === 'cancelled') throw new HttpError(409, 'Kampanye sudah dibatalkan.');
    const r = await db.query(
      `UPDATE broadcast_logs SET status = 'queued', attempts = 0, next_attempt_at = NULL,
              error_code = NULL, error_message = NULL
        WHERE campaign_id = $1 AND status = 'failed'
          AND ($2::boolean = false OR error_code IS NULL OR error_code NOT IN (131026, 131021))`, // 131026 = bukan pengguna WA
      [req.params.id, skipPermanent]);
    if (r.rowCount > 0) {
      await db.query(`UPDATE campaigns SET status = 'running', completed_at = NULL, last_error = NULL WHERE id = $1`, [req.params.id]);
    }
    return { requeued: r.rowCount };
  });
  res.json(result);
}));

router.get('/:id/logs', ah(async (req, res) => {
  const { page, limit, offset } = paging(req, 20);
  const status = req.query.status || null;
  const { rows: [{ total }] } = await query(
    `SELECT count(*) AS total FROM broadcast_logs WHERE campaign_id = $1
        AND ($2::text IS NULL OR status = ANY(string_to_array($2, ',')))`, [req.params.id, status]);
  const { rows } = await query(
    `SELECT l.id, l.phone, l.status, l.error_code, l.error_message, l.attempts, l.sent_at, l.delivered_at, l.read_at, c.name
       FROM broadcast_logs l LEFT JOIN contacts c ON c.id = l.contact_id
      WHERE l.campaign_id = $1 AND ($2::text IS NULL OR l.status = ANY(string_to_array($2, ',')))
      ORDER BY l.id LIMIT ${limit} OFFSET ${offset}`, [req.params.id, status]);
  res.json({ data: rows, total, page, limit });
}));

export default router;
