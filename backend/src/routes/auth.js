import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { signToken } from '../middleware/auth.js';
import { HttpError } from '../lib/http.js';

const router = Router();

// Perbandingan waktu-konstan agar tidak rentan timing attack
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  // "|" (bukan "||") sengaja: kedua pembandingan selalu dievaluasi
  if (!safeEqual(username, env.adminUsername) | !safeEqual(password, env.adminPassword)) {
    throw new HttpError(401, 'Username atau password salah.');
  }
  res.json({ token: signToken(username), username });
});

export default router;
