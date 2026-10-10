// Manajemen kontak: CRUD, filter tag, bulk tag, dan import dengan upsert.
import { Router } from 'express';
import { query, tx } from '../config/db.js';
import { ah, HttpError, paging } from '../lib/http.js';
import { normalizePhone, normalizeTags } from '../lib/phone.js';

const router = Router();

router.get('/', ah(async (req, res) => {
  const { page, limit, offset } = paging(req, 25);
  const { q, tag } = req.query;
  const where = [];
  const params = [];
  if (q)   { params.push(`%${q}%`); where.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`); }
  if (tag) { params.push(tag);       where.push(`$${params.length} = ANY(tags)`); }
  if (req.query.opt_in) { params.push(req.query.opt_in === 'true'); where.push(`opt_in = $${params.length}`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows: [{ total }] } = await query(`SELECT count(*) AS total FROM contacts ${w}`, params);
  const { rows } = await query(
    `SELECT * FROM contacts ${w} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({ data: rows, total, page, limit });
}));

/** Daftar tag beserta jumlah kontak — dipakai wizard kampanye. */
router.get('/tags', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT tag, count(*) AS count FROM contacts, unnest(tags) AS tag
      WHERE opt_in = true GROUP BY tag ORDER BY count DESC, tag`);
  res.json(rows);
}));

/** Daftar key custom variable yang pernah dipakai (untuk dropdown mapping). */
router.get('/variable-keys', ah(async (req, res) => {
  const { rows } = await query(`SELECT DISTINCT jsonb_object_keys(variables) AS key FROM contacts ORDER BY 1`);
  res.json(rows.map((r) => r.key));
}));

router.post('/', ah(async (req, res) => {
  const { name, phone, email, tags, variables } = req.body || {};
  const p = normalizePhone(phone);
  if (!p) throw new HttpError(400, 'Nomor telepon tidak valid.');
  const { rows } = await query(
    `INSERT INTO contacts (name, phone, email, tags, variables) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name || null, p, email || null, normalizeTags(tags), variables || {}]);
  res.status(201).json(rows[0]);
}));

router.put('/:id', ah(async (req, res) => {
  const { name, phone, email, tags, variables, opt_in } = req.body || {};
  const p = phone ? normalizePhone(phone) : null;
  if (phone && !p) throw new HttpError(400, 'Nomor telepon tidak valid.');
  const { rows } = await query(
    `UPDATE contacts SET name = COALESCE($2,name), phone = COALESCE($3,phone), email = COALESCE($4,email),
            tags = COALESCE($5,tags), variables = COALESCE($6,variables), opt_in = COALESCE($7,opt_in)
      WHERE id = $1 RETURNING *`,
    [req.params.id, name, p, email, tags ? normalizeTags(tags) : null, variables, opt_in]);
  if (!rows[0]) throw new HttpError(404, 'Kontak tidak ditemukan.');
  res.json(rows[0]);
}));

router.delete('/:id', ah(async (req, res) => {
  await query(`DELETE FROM contacts WHERE id = $1`, [req.params.id]);
  res.status(204).end();
}));

/** Tambah / hapus tag untuk banyak kontak sekaligus. body: { ids, add:[], remove:[] } */
router.post('/bulk-tag', ah(async (req, res) => {
  const { ids = [], add = [], remove = [] } = req.body || {};
  const a = normalizeTags(add), r = normalizeTags(remove);
  await query(
    `UPDATE contacts SET tags = (SELECT COALESCE(array_agg(DISTINCT t), '{}')
                                  FROM unnest(tags || $2::text[]) t WHERE NOT (t = ANY($3::text[])))
      WHERE id = ANY($1::uuid[])`, [ids, a, r]);
  res.json({ updated: ids.length });
}));

/**
 * Import kontak. Pemetaan kolom dilakukan di frontend; server menerima baris
 * yang sudah rapi: { rows:[{name,phone,email,tags:[],variables:{}}], auto_tags:[] }.
 * Nomor yang sudah ada di-UPSERT: tag digabung, variabel digabung, nama tidak ditimpa dengan kosong.
 */
router.post('/import', ah(async (req, res) => {
  const { rows: input = [], auto_tags = [] } = req.body || {};
  if (!Array.isArray(input) || input.length === 0) throw new HttpError(400, 'Tidak ada baris untuk diimpor.');
  if (input.length > 2000) throw new HttpError(413, 'Maksimal 2000 baris per request.');

  const autoTags = normalizeTags(auto_tags);
  const result = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  await tx(async (db) => {
    for (const [i, r] of input.entries()) {
      const phone = normalizePhone(r.phone);
      if (!phone) { result.skipped++; result.errors.push({ row: r._row ?? i + 1, reason: `Nomor tidak valid: "${r.phone ?? ''}"` }); continue; }
      const tags = normalizeTags([...(r.tags || []), ...autoTags]);
      const { rows: [x] } = await db.query(
        `INSERT INTO contacts (name, phone, email, tags, variables, source)
         VALUES ($1,$2,$3,$4,$5,'import')
         ON CONFLICT (phone) DO UPDATE SET
           name = COALESCE(NULLIF(EXCLUDED.name,''), contacts.name),
           email = COALESCE(NULLIF(EXCLUDED.email,''), contacts.email),
           tags = (SELECT array_agg(DISTINCT t) FROM unnest(contacts.tags || EXCLUDED.tags) t),
           variables = contacts.variables || EXCLUDED.variables
         RETURNING (xmax = 0) AS inserted`,
        [r.name || null, phone, r.email || null, tags, r.variables || {}]);
      x.inserted ? result.inserted++ : result.updated++;
    }
  });
  res.json(result);
}));

export default router;
