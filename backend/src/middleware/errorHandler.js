import { HttpError } from '../lib/http.js';
import { WhatsAppError } from '../lib/whatsapp.js';

/** Petunjuk berbahasa Indonesia untuk kode error Meta yang paling sering muncul. */
const META_HINTS = {
  190:    'Access token tidak valid / kedaluwarsa. Perbarui token di menu Pengaturan.',
  10:     'Token tidak punya izin. Pastikan System User punya akses ke WABA dan izin whatsapp_business_messaging.',
  200:    'Token tidak punya izin untuk nomor/WABA ini. Tambahkan asset WABA ke System User.',
  131047: 'Window 24 jam sudah tertutup di sisi Meta. Kirim template message untuk memulai percakapan lagi.',
  131030: 'Nomor penerima belum ada di daftar penerima uji (nomor masih mode development).',
  131042: 'Ada masalah metode pembayaran di WABA. Periksa Payment settings di WhatsApp Manager.',
  131031: 'Akun WhatsApp Business dikunci / dibatasi oleh Meta.',
  133010: 'Nomor pengirim belum terdaftar di Cloud API. Jika sebelumnya dikelola provider (mis. WATI), selesaikan proses migrasinya.',
  130429: 'Terkena rate limit Meta. Coba lagi beberapa saat.',
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });

  // Error dari Meta diteruskan lengkap dengan kode & petunjuk.
  // PENTING: jangan pakai 5xx (502 dll.) — reverse proxy/CDN sering mengganti body respons 5xx dengan
  // halaman error mereka sendiri, sehingga pesan asli hilang. 424 = "dependensi eksternal gagal".
  // Jangan pakai 401 juga: frontend menganggap 401 sebagai sesi login habis.
  if (err instanceof WhatsAppError) {
    console.error(`[meta] kode=${err.code} http=${err.httpStatus} ${req.method} ${req.originalUrl} → ${err.message}`);
    const hint = META_HINTS[err.code];
    return res.status(424).json({
      error: `Meta API${err.code ? ` (#${err.code})` : ''}: ${err.message}${hint ? `\n→ ${hint}` : ''}`,
      code: err.code,
    });
  }
  if (err.code === '23505') return res.status(409).json({ error: 'Data sudah ada (duplikat).' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server. Cek log backend.' });
}
