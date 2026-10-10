// Statistik dashboard: ringkasan, status kesehatan nomor, dan grafik harian.
import { Router } from 'express';
import { query } from '../config/db.js';
import { ah, HttpError } from '../lib/http.js';

const router = Router();

/** "TIER_10K" -> 10000, "TIER_250" -> 250, "TIER_UNLIMITED" -> null */
export function tierToLimit(tier) {
  const m = /^TIER_(\d+)(K)?$/.exec(tier || '');
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : null;
}

router.get('/summary', ah(async (req, res) => {
  const accountId = req.query.account_id || null;

  const { rows: [t] } = await query(
    `SELECT count(DISTINCT c.id)                                        AS campaigns,
            count(l.id) FILTER (WHERE l.status IN ('sent','delivered','read')) AS sent,
            count(l.id) FILTER (WHERE l.status IN ('delivered','read'))        AS delivered,
            count(l.id) FILTER (WHERE l.status = 'read')                       AS read,
            count(l.id) FILTER (WHERE l.status = 'failed')                     AS failed,
            count(l.id) FILTER (WHERE l.status IN ('queued','sending'))        AS queued
       FROM campaigns c LEFT JOIN broadcast_logs l ON l.campaign_id = c.id
      WHERE ($1::uuid IS NULL OR c.account_id = $1)`, [accountId]);

  let health = null;
  if (accountId) {
    const { rows: [acc] } = await query(`SELECT * FROM settings WHERE id = $1`, [accountId]);
    if (!acc) throw new HttpError(404, 'Akun tidak ditemukan.');
    // Pemakaian tier ≈ jumlah penerima unik yang dikirimi pesan template dalam 24 jam terakhir.
    // (Angka resmi hanya diketahui Meta; ini perkiraan yang cukup akurat untuk pemantauan.)
    const { rows: [u] } = await query(
      `SELECT count(DISTINCT l.phone) AS used FROM broadcast_logs l
         JOIN campaigns c ON c.id = l.campaign_id
        WHERE c.account_id = $1 AND l.sent_at > now() - interval '24 hours'`, [accountId]);
    const limit = tierToLimit(acc.messaging_limit_tier);
    health = {
      label: acc.label, display_phone_number: acc.display_phone_number, verified_name: acc.verified_name,
      quality_rating: acc.quality_rating, tier: acc.messaging_limit_tier,
      tier_limit: limit, used_24h: u.used, synced_at: acc.health_synced_at,
    };
  }
  res.json({ totals: t, health });
}));

router.get('/daily', ah(async (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 14));
  const { rows } = await query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            count(l.id) FILTER (WHERE l.status IN ('sent','delivered','read')) AS sent,
            count(l.id) FILTER (WHERE l.status IN ('delivered','read'))        AS delivered,
            count(l.id) FILTER (WHERE l.status = 'read')                       AS read,
            count(l.id) FILTER (WHERE l.status = 'failed')                     AS failed
       FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d
       LEFT JOIN (SELECT bl.* FROM broadcast_logs bl JOIN campaigns c ON c.id = bl.campaign_id
                   WHERE ($2::uuid IS NULL OR c.account_id = $2)) l
              ON COALESCE(l.sent_at, l.created_at)::date = d::date
      GROUP BY d ORDER BY d`, [days, req.query.account_id || null]);
  res.json(rows);
}));

export default router;
