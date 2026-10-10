# Blast Desk — WhatsApp Broadcast & Campaign Dashboard

Dashboard blast WhatsApp berbasis **WhatsApp Cloud API resmi Meta** (Graph API v20.0).
Stack: React (Vite) + Tailwind + Lucide · Node.js (Express) · PostgreSQL / Supabase.

## Struktur

```
database/schema.sql            Skema lengkap: settings, contacts, templates, campaigns, broadcast_logs, messages
backend/src/
  server.js                    Entry Express, mount route, start blast engine
  config/                      env (validasi), db (pg pool + transaksi)
  lib/whatsapp.js              SEMUA panggilan ke Graph API (axios.post …/{phone_number_id}/messages)
  lib/messageBuilder.js        Mapping variabel template ↔ data kontak → payload components
  lib/templateParser.js        Konversi komponen template Meta ↔ kolom DB
  lib/crypto.js, phone.js      Enkripsi token AES-256-GCM, normalisasi nomor & tag
  queue/campaignEngine.js      Antrian + rate limiter (jantung blast)
  routes/                      auth, accounts, dashboard, contacts, templates, campaigns, inbox, webhook
frontend/src/
  pages/                       Dashboard, Settings, Contacts, Templates, Campaigns, CampaignWizard, CampaignDetail, Inbox
  components/                  Layout, ui, TemplateSelector, TemplatePreview, TemplateForm, ImportContactsModal
```

## Menjalankan

```bash
# 1. Database
psql "$DATABASE_URL" -f database/schema.sql

# 2. Backend
cd backend && cp .env.example .env     # isi semua nilainya
npm install && npm run dev             # http://localhost:4000

# 3. Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Login memakai `ADMIN_USERNAME` / `ADMIN_PASSWORD` dari `.env`.

## Setup di sisi Meta

1. **System User token**: Business Settings → System Users → buat token permanen dengan izin
   `whatsapp_business_messaging` + `whatsapp_business_management`.
2. **Phone Number ID & WABA ID**: Meta for Developers → WhatsApp → API Setup. Masukkan di menu *Pengaturan*.
3. **Webhook**: salin *Callback URL* dan *Verify token* dari halaman Pengaturan ke Meta → WhatsApp → Configuration,
   lalu subscribe field **messages**. Isi `META_APP_SECRET` agar signature webhook divalidasi.
   Webhook harus HTTPS publik (saat dev: ngrok / cloudflared).
4. (Opsional) `META_APP_ID` — dibutuhkan hanya untuk membuat template ber-header gambar/PDF dari dashboard.

## Cara kerja blast engine

| Tahap | Perilaku |
|---|---|
| Buat kampanye | Satu transaksi: insert kampanye + `INSERT…SELECT` penerima ke `broadcast_logs` (status `queued`). Hanya kontak **opt-in**. |
| Eksekusi | Satu *runner* per kampanye. Tiap iterasi mengambil 1 pesan (`FOR UPDATE SKIP LOCKED`), kirim, lalu tidur `delay_ms` + jitter 0–30%. |
| Rate limit Meta (429 / 130429 / 131056 / 80007) | Pesan kembali ke antrian, cooldown eksponensial 5 → 120 detik. |
| Token ditolak (190 dll.) | Kampanye otomatis **dijeda** dengan alasan; lanjutkan setelah token diperbarui. |
| Error sementara (jaringan / 5xx) | Retry hingga `MAX_ATTEMPTS` dengan backoff. |
| 25 gagal berturut-turut | Auto-pause, melindungi Quality Rating nomor. |
| Server restart | Pesan `sending` dikembalikan ke `queued`; kampanye `running` otomatis dilanjutkan. |
| Terjadwal | Dipromosikan menjadi `running` oleh scheduler (tick 1 detik). |

Status `delivered`/`read` datang dari webhook dan hanya boleh **naik** peringkat (`wa_status_rank`), jadi event yang terlambat tidak menimpa status.

## Endpoint utama

| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/auth/login` | Login → JWT |
| GET/POST/PUT/DELETE | `/api/accounts` · POST `/:id/refresh` | Multi-nomor, uji koneksi, tarik Quality Rating & Tier |
| GET | `/api/dashboard/summary` · `/daily` | Statistik, tier usage 24 jam, grafik harian |
| GET/POST/PUT/DELETE | `/api/contacts` · `/tags` · `/variable-keys` · POST `/bulk-tag` · POST `/import` | Audiens |
| GET · POST `/sync` · POST · DELETE | `/api/templates` | Sinkron / buat / hapus template di Meta |
| GET/POST | `/api/campaigns` · POST `/audience-count` | Daftar & buat kampanye |
| POST | `/api/campaigns/:id/pause · resume · cancel · retry-failed` | Kontrol |
| GET | `/api/campaigns/:id` · `/:id/logs` | Progres & log |
| GET/POST | `/webhook` | Verifikasi & penerima event Meta (publik) |
| GET/POST | `/api/inbox/conversations · messages · send` | Live chat (window 24 jam) |

## Catatan produksi

- **HTTPS** wajib (reverse proxy Nginx/Caddy, atau Railway/Render/Fly). Set `CORS_ORIGIN` ke domain frontend.
- **Kepatuhan**: kirim marketing hanya ke kontak yang memberi persetujuan. Balasan "STOP" otomatis menonaktifkan `opt_in`.
- **Tier usage** di dashboard adalah *perkiraan* (penerima unik 24 jam terakhir dari log kita); angka resmi hanya diketahui Meta.
- **Satu instance backend** menjalankan engine. Untuk skala besar / multi-instance, ganti `campaignEngine.js` dengan worker BullMQ + Redis;
  kontrak tabel `broadcast_logs` tetap sama (klaim memakai `SKIP LOCKED`, sudah aman bila ada >1 proses).
- **Realtime** memakai polling (2–15 detik). Bisa di-upgrade ke SSE/WebSocket tanpa mengubah API.
- **Supabase**: pakai connection string *pooler*, set `DATABASE_SSL=true`. Akses selalu lewat backend (service role); aktifkan RLS bila klien lain akan membaca langsung.
- **Belum didukung**: variabel dinamis pada tombol URL, template carousel/flow, kirim media bebas di Inbox, dan pembersihan otomatis log lama.
