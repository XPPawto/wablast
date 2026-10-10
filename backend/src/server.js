// Entry point Express API.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { startEngine } from './queue/campaignEngine.js';

import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import dashboardRoutes from './routes/dashboard.js';
import contactRoutes from './routes/contacts.js';
import templateRoutes from './routes/templates.js';
import campaignRoutes from './routes/campaigns.js';
import inboxRoutes from './routes/inbox.js';
import webhookRoutes from './routes/webhook.js';

const app = express();
app.set('trust proxy', 1);                       // di belakang Nginx / Railway / Render
app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
// Simpan raw body: dibutuhkan untuk memvalidasi signature webhook Meta
app.use(express.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ---- Publik ----
app.use('/webhook', webhookRoutes);
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), authRoutes);   // batasi brute-force login

// Info untuk halaman Settings (URL & token verifikasi webhook yang harus dimasukkan ke Meta)
app.get('/api/config', requireAuth, (req, res) => res.json({
  webhook_url: `${env.publicBaseUrl || `${req.protocol}://${req.get('host')}`}/webhook`,
  verify_token: env.webhookVerifyToken,
  graph_version: env.graphVersion,
}));

// ---- Terproteksi JWT ----
app.use('/api/accounts', requireAuth, accountRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/contacts', requireAuth, contactRoutes);
app.use('/api/templates', requireAuth, templateRoutes);
app.use('/api/campaigns', requireAuth, campaignRoutes);
app.use('/api/inbox', requireAuth, inboxRoutes);

app.use(errorHandler);

app.listen(env.port, async () => {
  console.log(`[api] berjalan di http://localhost:${env.port}`);
  await startEngine();
});
