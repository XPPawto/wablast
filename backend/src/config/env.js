// Memuat & memvalidasi environment variable sekali di awal supaya gagal cepat (fail fast).
import 'dotenv/config';

const required = [
  'DATABASE_URL', 'ENCRYPTION_KEY', 'JWT_SECRET',
  'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'WEBHOOK_VERIFY_TOKEN',
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[env] Variabel wajib belum diisi: ${missing.join(', ')}`);
  process.exit(1);
}
if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)) {
  console.error('[env] ENCRYPTION_KEY harus 64 karakter hex (32 byte).');
  process.exit(1);
}

export const env = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  encryptionKey: Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
  jwtSecret: process.env.JWT_SECRET,
  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
  graphVersion: process.env.GRAPH_VERSION || 'v20.0',
  graphBaseUrl: process.env.GRAPH_BASE_URL || 'https://graph.facebook.com',
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN,
  metaAppSecret: process.env.META_APP_SECRET || '',
  metaAppId: process.env.META_APP_ID || '',
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '62',
  maxAttempts: Number(process.env.MAX_ATTEMPTS || 3),
};
