// Template Message Manager: sinkronisasi dari Meta, buat template baru, hapus.
import { Router } from 'express';
import { query } from '../config/db.js';
import { ah, HttpError } from '../lib/http.js';
import { decrypt } from '../lib/crypto.js';
import { fetchTemplates, createTemplate, deleteTemplate, uploadSampleMedia } from '../lib/whatsapp.js';
import { parseMetaComponents, buildMetaComponents } from '../lib/templateParser.js';

const router = Router();

async function getAccount(id) {
  const { rows: [acc] } = await query(`SELECT * FROM settings WHERE id = $1`, [id]);
  if (!acc) throw new HttpError(404, 'Akun WhatsApp tidak ditemukan.');
  return { ...acc, token: decrypt(acc.access_token_enc) };
}

const UPSERT = `
  INSERT INTO templates (account_id, meta_template_id, name, language, category, status, header_type,
                         header_text, body, footer, buttons, components, rejected_reason, synced_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
  ON CONFLICT (account_id, name, language) DO UPDATE SET
    meta_template_id = EXCLUDED.meta_template_id, category = EXCLUDED.category, status = EXCLUDED.status,
    header_type = EXCLUDED.header_type, header_text = EXCLUDED.header_text, body = EXCLUDED.body,
    footer = EXCLUDED.footer, buttons = EXCLUDED.buttons, components = EXCLUDED.components,
    rejected_reason = EXCLUDED.rejected_reason, synced_at = now()
  RETURNING *`;

const upsertArgs = (accountId, t) => {
  const p = parseMetaComponents(t.components);
  return [accountId, t.id, t.name, t.language, t.category, t.status, p.header_type, p.header_text,
          p.body, p.footer, JSON.stringify(p.buttons), JSON.stringify(t.components), t.rejected_reason || null];
};

router.get('/', ah(async (req, res) => {
  const { account_id, status, category } = req.query;
  if (!account_id) throw new HttpError(400, 'account_id wajib diisi.');
  const { rows } = await query(
    `SELECT * FROM templates WHERE account_id = $1
        AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR category = $3)
      ORDER BY (status = 'APPROVED') DESC, updated_at DESC`,
    [account_id, status || null, category || null]);
  res.json(rows);
}));

/** Tarik semua template dari Meta → simpan/perbarui di DB (status Approved/Rejected ikut ter-update). */
router.post('/sync', ah(async (req, res) => {
  const acc = await getAccount(req.body?.account_id);
  const remote = await fetchTemplates(acc.waba_id, acc.token);
  for (const t of remote) await query(UPSERT, upsertArgs(acc.id, t));
  // Template yang sudah tidak ada di Meta dibersihkan, kecuali yang dipakai kampanye
  const names = remote.map((t) => `${t.name}|${t.language}`);
  await query(
    `DELETE FROM templates WHERE account_id = $1 AND (name || '|' || language) <> ALL($2::text[])
        AND id NOT IN (SELECT template_id FROM campaigns)`, [acc.id, names]);
  res.json({ synced: remote.length });
}));

/** Buat template baru → kirim ke Meta untuk review → simpan dengan status PENDING. */
router.post('/', ah(async (req, res) => {
  const { account_id, name, language = 'id', category, header = { type: 'NONE' }, body } = req.body || {};
  if (!/^[a-z0-9_]{1,512}$/.test(name || '')) throw new HttpError(400, 'Nama template hanya boleh huruf kecil, angka, dan underscore.');
  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) throw new HttpError(400, 'Kategori tidak valid.');
  if (!body?.trim()) throw new HttpError(400, 'Isi pesan (body) wajib diisi.');

  const acc = await getAccount(account_id);
  let handle = null;
  if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(header.type)) {
    if (!header.sample_url) throw new HttpError(400, 'URL contoh media wajib diisi untuk header gambar/PDF/video.');
    handle = await uploadSampleMedia(header.sample_url, acc.token);
  }

  const components = buildMetaComponents(req.body, handle);
  const meta = await createTemplate(acc.waba_id, acc.token, { name, language, category, components });

  const { rows } = await query(UPSERT, upsertArgs(acc.id, {
    id: meta.id, name, language, category, status: meta.status || 'PENDING', components,
  }));
  res.status(201).json(rows[0]);
}));

router.delete('/:id', ah(async (req, res) => {
  const { rows: [t] } = await query(`SELECT * FROM templates WHERE id = $1`, [req.params.id]);
  if (!t) throw new HttpError(404, 'Template tidak ditemukan.');
  const { rows: [used] } = await query(`SELECT count(*) AS n FROM campaigns WHERE template_id = $1`, [t.id]);
  if (used.n > 0) throw new HttpError(409, 'Template dipakai oleh kampanye dan tidak bisa dihapus.');
  const acc = await getAccount(t.account_id);
  await deleteTemplate(acc.waba_id, acc.token, t.name);
  await query(`DELETE FROM templates WHERE id = $1`, [t.id]);
  res.status(204).end();
}));

export default router;
