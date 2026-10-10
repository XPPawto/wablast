import { HttpError } from '../lib/http.js';
import { WhatsAppError } from '../lib/whatsapp.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  // Error dari Meta diteruskan apa adanya supaya admin tahu penyebab sebenarnya
  if (err instanceof WhatsAppError) return res.status(502).json({ error: `Meta API: ${err.message}`, code: err.code });
  if (err.code === '23505') return res.status(409).json({ error: 'Data sudah ada (duplikat).' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
}
