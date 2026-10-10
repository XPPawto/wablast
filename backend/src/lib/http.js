// Utilitas kecil untuk route Express: error terstruktur & wrapper async.
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Bungkus handler async agar error otomatis diteruskan ke errorHandler. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parsing angka paging dengan batas aman. */
export function paging(req, defLimit = 25, maxLimit = 100) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || defLimit));
  return { page, limit, offset: (page - 1) * limit };
}
