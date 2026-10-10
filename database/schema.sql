-- =====================================================================
--  WhatsApp Broadcast & Blast Dashboard — PostgreSQL / Supabase schema
--  Jalankan sekali:  psql $DATABASE_URL -f database/schema.sql
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- untuk gen_random_uuid()

-- Trigger generik: otomatis isi updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- Ranking status pesan. Dipakai webhook agar status tidak "mundur"
-- (mis. event 'delivered' tiba terlambat setelah 'read').
CREATE OR REPLACE FUNCTION wa_status_rank(s text) RETURNS int AS $$
  SELECT CASE s WHEN 'queued' THEN 0 WHEN 'sending' THEN 1 WHEN 'sent' THEN 2
                WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 ELSE 0 END
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------
-- 1. settings — kredensial WhatsApp Cloud API (multi-account)
--    Satu baris = satu nomor WhatsApp Business. Token disimpan TERENKRIPSI
--    (AES-256-GCM) di kolom access_token_enc, tidak pernah dikirim ke frontend.
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label                 text NOT NULL,                       -- nama internal, mis. "CS Toko Utama"
  phone_number_id       text NOT NULL UNIQUE,
  waba_id               text NOT NULL,                       -- WhatsApp Business Account ID
  access_token_enc      text NOT NULL,                       -- System User Permanent Token (terenkripsi)
  display_phone_number  text,
  verified_name         text,
  quality_rating        text NOT NULL DEFAULT 'UNKNOWN'
                        CHECK (quality_rating IN ('GREEN','YELLOW','RED','NA','UNKNOWN')),
  messaging_limit_tier  text,                                -- TIER_250 | TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED
  health_synced_at      timestamptz,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 2. contacts — audiens. Tag memakai text[] + GIN index (filter cepat)
-- ---------------------------------------------------------------------
CREATE TABLE contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text,
  phone            text NOT NULL UNIQUE,                     -- format E.164 tanpa '+', mis. 6281234567890
  email            text,
  tags             text[] NOT NULL DEFAULT '{}',             -- disimpan tanpa '#', mis. {vip,leads}
  variables        jsonb  NOT NULL DEFAULT '{}'::jsonb,      -- custom variables, mis. {"kota":"Palembang"}
  opt_in           boolean NOT NULL DEFAULT true,            -- false = unsubscribed, tidak akan di-blast
  source           text NOT NULL DEFAULT 'manual',           -- manual | import | inbound
  last_inbound_at  timestamptz,                              -- untuk cek window 24 jam di Inbox
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_tags ON contacts USING GIN (tags);
CREATE INDEX idx_contacts_name ON contacts (lower(name));
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 3. templates — cache template dari Meta (di-sync + dibuat dari dashboard)
-- ---------------------------------------------------------------------
CREATE TABLE templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES settings(id) ON DELETE CASCADE,
  meta_template_id  text,
  name              text NOT NULL,
  language          text NOT NULL DEFAULT 'id',
  category          text NOT NULL CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  status            text NOT NULL DEFAULT 'PENDING',         -- APPROVED | PENDING | REJECTED | PAUSED | DISABLED
  header_type       text NOT NULL DEFAULT 'NONE'
                    CHECK (header_type IN ('NONE','TEXT','IMAGE','DOCUMENT','VIDEO')),
  header_text       text,
  body              text NOT NULL,
  footer            text,
  buttons           jsonb NOT NULL DEFAULT '[]'::jsonb,
  components        jsonb NOT NULL DEFAULT '[]'::jsonb,      -- payload mentah dari Meta
  rejected_reason   text,
  synced_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, name, language)
);
CREATE INDEX idx_templates_status ON templates (account_id, status);
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 4. campaigns — definisi blast
-- ---------------------------------------------------------------------
CREATE TABLE campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  account_id        uuid NOT NULL REFERENCES settings(id) ON DELETE RESTRICT,
  template_id       uuid NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','running','paused','completed','failed','cancelled')),
  target_tags       text[] NOT NULL DEFAULT '{}',            -- kosong = semua kontak opt-in
  tag_match         text NOT NULL DEFAULT 'any' CHECK (tag_match IN ('any','all')),
  -- Pemetaan variabel template -> data kontak. Contoh:
  -- {"body":{"1":{"type":"field","value":"name"},"2":{"type":"variable","value":"kota","fallback":"Anda"}},
  --  "header":{"1":{"type":"static","value":"Promo"}}}
  variable_mapping  jsonb NOT NULL DEFAULT '{}'::jsonb,
  header_media_url  text,                                    -- wajib bila template header IMAGE/DOCUMENT/VIDEO
  delay_ms          integer NOT NULL DEFAULT 700 CHECK (delay_ms BETWEEN 200 AND 10000),
  scheduled_at      timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  total_recipients  integer NOT NULL DEFAULT 0,
  last_error        text,                                    -- alasan auto-pause (token invalid, dll)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_status ON campaigns (status, scheduled_at);
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 5. broadcast_logs — satu baris per penerima per kampanye.
--    Sekaligus berfungsi sebagai ANTRIAN (status = 'queued'), sehingga
--    kampanye tetap lanjut walau server restart.
-- ---------------------------------------------------------------------
CREATE TABLE broadcast_logs (
  id               bigserial PRIMARY KEY,
  campaign_id      uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id       uuid REFERENCES contacts(id) ON DELETE SET NULL,
  phone            text NOT NULL,
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','sending','sent','delivered','read','failed','cancelled')),
  wamid            text,                                     -- message id dari Meta, dipakai webhook
  params           jsonb,                                    -- nilai variabel yang benar-benar dikirim
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz,                              -- untuk backoff retry
  error_code       integer,
  error_message    text,
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX idx_logs_queue    ON broadcast_logs (campaign_id, status, next_attempt_at);
CREATE INDEX idx_logs_wamid    ON broadcast_logs (wamid) WHERE wamid IS NOT NULL;
CREATE INDEX idx_logs_created  ON broadcast_logs (created_at);

-- ---------------------------------------------------------------------
-- 6. messages — riwayat chat untuk Inbox (masuk & keluar)
-- ---------------------------------------------------------------------
CREATE TABLE messages (
  id             bigserial PRIMARY KEY,
  account_id     uuid NOT NULL REFERENCES settings(id) ON DELETE CASCADE,
  contact_id     uuid REFERENCES contacts(id) ON DELETE SET NULL,
  phone          text NOT NULL,
  direction      text NOT NULL CHECK (direction IN ('in','out')),
  wamid          text UNIQUE,
  type           text NOT NULL DEFAULT 'text',
  body           text,
  status         text NOT NULL DEFAULT 'received',           -- received | sent | delivered | read | failed
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_thread ON messages (account_id, phone, created_at DESC);
