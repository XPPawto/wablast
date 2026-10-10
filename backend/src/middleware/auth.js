// Autentikasi dashboard sederhana: login admin → JWT (Bearer token).
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signToken = (username) => jwt.sign({ sub: username }, env.jwtSecret, { expiresIn: '12h' });

export function requireAuth(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer /i, '');
  try {
    req.user = jwt.verify(token, env.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Sesi berakhir, silakan login kembali.' });
  }
}
