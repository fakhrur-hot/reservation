-- =============================================================================
-- 003_extend_schema.sql — Idempotent additions for existing databases
-- Adds all columns and tables missing from 001_initial_schema.sql
-- Safe to run multiple times; uses IF NOT EXISTS everywhere.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fix customers.email uniqueness: branch-scoped instead of global
-- (same email can belong to different branches as separate customer records)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_email_key' AND conrelid = 'customers'::regclass
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_email_key;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_branch_email_key' AND conrelid = 'customers'::regclass
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT customers_branch_email_key UNIQUE (branch_id, email);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- branches — setup wizard, contact, holiday config
-- ---------------------------------------------------------------------------
ALTER TABLE branches ADD COLUMN IF NOT EXISTS setup_complete      BOOLEAN      DEFAULT false;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS email               VARCHAR(255) DEFAULT '';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS website_url         VARCHAR(255) DEFAULT NULL;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS holiday_country_code VARCHAR(2)  DEFAULT 'MY';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS holiday_region_code  VARCHAR(50);

-- ---------------------------------------------------------------------------
-- customers — authentication & lockout
-- ---------------------------------------------------------------------------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash  VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS failed_logins  INTEGER     DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS locked_at      TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- staff — security tracking
-- ---------------------------------------------------------------------------
ALTER TABLE staff ADD COLUMN IF NOT EXISTS failed_logins   INTEGER     DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS locked_at       TIMESTAMPTZ;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS last_login_at   TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- reservations — decoration, occasion, promo, cake, session fields
-- ---------------------------------------------------------------------------
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS special_requests        TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS seated_at               TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS seated_by               UUID;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS has_decoration          BOOLEAN       DEFAULT false;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS decoration_amount       NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS occasion_type           VARCHAR(50);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS decoration_color        VARCHAR(100);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cake_choice             VARCHAR(100);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS decoration_notes        TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cake_menu_id            UUID;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cake_custom_notes       TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS promo_code              VARCHAR(50);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS promo_code_discount     NUMERIC(10,2);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS table_lock_id           VARCHAR(100);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS session_duration_minutes INTEGER;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS end_time                TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS is_vip                  BOOLEAN       DEFAULT false;

-- ---------------------------------------------------------------------------
-- walk_ins — operational status, staff link, notes
-- ---------------------------------------------------------------------------
ALTER TABLE walk_ins ADD COLUMN IF NOT EXISTS staff_id    UUID;
ALTER TABLE walk_ins ADD COLUMN IF NOT EXISTS status      VARCHAR(50) DEFAULT 'open';
ALTER TABLE walk_ins ADD COLUMN IF NOT EXISTS notes       TEXT;
ALTER TABLE walk_ins ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(20);

-- ---------------------------------------------------------------------------
-- menu_sections — discriminator for section kind (food, cakes, etc.)
-- ---------------------------------------------------------------------------
ALTER TABLE menu_sections ADD COLUMN IF NOT EXISTS section_type VARCHAR(50) DEFAULT 'food';

-- ---------------------------------------------------------------------------
-- reservation_sequences — atomic counter for reference number generation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservation_sequences (
  branch_id  UUID    NOT NULL,
  year       INTEGER NOT NULL,
  last_seq   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, year),
  CONSTRAINT fk_reservation_sequences_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- deposit_transactions — deposit / refund ledger per reservation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit_transactions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           UUID          NOT NULL,
  reservation_id      UUID          NOT NULL,
  amount              NUMERIC(10,2) NOT NULL,
  decoration_amount   NUMERIC(10,2) DEFAULT 0.00,
  method              VARCHAR(50),
  idempotency_key     VARCHAR(255)  NOT NULL UNIQUE,
  status              VARCHAR(50)   NOT NULL DEFAULT 'pending',
  is_refund           BOOLEAN       DEFAULT false,
  refund_initiated_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_deposit_tx_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_deposit_tx_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- business_hours_overrides — per-date closed / special hours
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_hours_overrides (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID        NOT NULL,
  override_date DATE        NOT NULL,
  is_open       BOOLEAN     DEFAULT false,
  open_time     TIME,
  close_time    TIME,
  reason        VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_biz_hours_overrides_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT uq_branch_override_date UNIQUE (branch_id, override_date)
);

-- ---------------------------------------------------------------------------
-- audit_log — immutable record of every sensitive action
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID         NOT NULL,
  actor_id    UUID,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id   UUID,
  old_state   JSONB,
  new_state   JSONB,
  ip_address  INET,
  timestamp   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_log_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- promo_codes — promotional codes with type-specific config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_codes (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                UUID          NOT NULL,
  code                     VARCHAR(50)   NOT NULL,
  type                     VARCHAR(50)   NOT NULL DEFAULT 'discount',
  description              TEXT,
  is_active                BOOLEAN       DEFAULT true,
  -- Priority / lead-time override
  override_lead_time       BOOLEAN       DEFAULT false,
  min_lead_time_minutes    INTEGER,
  -- Turnover / time-window
  valid_from_time          TIME,
  valid_to_time            TIME,
  valid_days_of_week       VARCHAR(20),
  -- VIP
  session_duration_minutes INTEGER,
  -- Group
  min_party_size           INTEGER,
  -- Discount
  discount_type            VARCHAR(20),
  discount_value           NUMERIC(10,2),
  -- Affiliate
  affiliate_id             VARCHAR(100),
  -- Usage limits
  max_uses                 INTEGER,
  used_count               INTEGER       DEFAULT 0,
  valid_from               TIMESTAMPTZ,
  valid_until              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_promo_codes_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT uq_branch_promo_code UNIQUE (branch_id, code)
);

-- ---------------------------------------------------------------------------
-- waitlist — overflow guest queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waitlist (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID         NOT NULL,
  guest_name   VARCHAR(255) NOT NULL,
  guest_email  VARCHAR(255),
  guest_phone  VARCHAR(20),
  party_size   INTEGER      NOT NULL,
  status       VARCHAR(50)  NOT NULL DEFAULT 'waiting',
  notes        TEXT,
  notified_at  TIMESTAMPTZ,
  seated_at    TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_waitlist_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- commission_transactions — per-reservation per-category charge record
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_transactions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        UUID          NOT NULL,
  reservation_id   UUID          NOT NULL,
  category         VARCHAR(50)   NOT NULL,
  amount_charged   NUMERIC(10,2) NOT NULL,
  commission_type  VARCHAR(20)   NOT NULL DEFAULT 'percentage',
  commission_value NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  idempotency_key  VARCHAR(255)  NOT NULL UNIQUE,
  status           VARCHAR(50)   NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_commission_tx_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_commission_tx_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- commission_refunds — refund records when a reservation is cancelled
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commission_refunds (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           UUID          NOT NULL,
  reservation_id      UUID          NOT NULL,
  category            VARCHAR(50)   NOT NULL,
  original_commission NUMERIC(10,2) NOT NULL,
  refund_amount       NUMERIC(10,2) NOT NULL,
  refund_percentage   NUMERIC(5,2)  NOT NULL DEFAULT 100.00,
  status              VARCHAR(50)   NOT NULL DEFAULT 'processed',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_commission_refunds_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_commission_refunds_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- payment_sessions — payment gateway session tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_sessions (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      UUID          NOT NULL,
  reservation_id UUID,
  amount         NUMERIC(10,2) NOT NULL,
  currency       VARCHAR(3)    DEFAULT 'MYR',
  gateway        VARCHAR(50),
  status         VARCHAR(50)   NOT NULL DEFAULT 'pending',
  gateway_ref    VARCHAR(255),
  callback_data  JSONB,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_sessions_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- table_status_overrides — manual out-of-service / maintenance flags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS table_status_overrides (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID        NOT NULL,
  table_id   UUID        NOT NULL,
  status     VARCHAR(50) NOT NULL,
  reason     TEXT,
  set_by     UUID,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_table_overrides_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_table_overrides_table
    FOREIGN KEY (table_id)  REFERENCES tables(id)  ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- vendors — third-party service providers (decoration, cake, photography)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           UUID          NOT NULL,
  name                VARCHAR(255)  NOT NULL,
  service_type        VARCHAR(100)  NOT NULL,
  merchant_account_id VARCHAR(255),
  contact_email       VARCHAR(255),
  contact_phone       VARCHAR(20),
  is_active           BOOLEAN       DEFAULT true,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendors_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- vendor_services — individual services offered by a vendor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_services (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID          NOT NULL,
  vendor_id  UUID          NOT NULL,
  name       VARCHAR(255)  NOT NULL,
  price      NUMERIC(10,2) NOT NULL,
  is_active  BOOLEAN       DEFAULT true,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_services_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendor_services_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)  ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- reservation_addons — vendor services attached to a reservation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservation_addons (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      UUID          NOT NULL,
  reservation_id UUID          NOT NULL,
  vendor_id      UUID          NOT NULL,
  service_id     UUID,
  amount         NUMERIC(10,2) NOT NULL,
  status         VARCHAR(50)   DEFAULT 'pending',
  notes          TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_addons_branch
    FOREIGN KEY (branch_id)      REFERENCES branches(id)      ON DELETE CASCADE,
  CONSTRAINT fk_addons_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(id)  ON DELETE CASCADE,
  CONSTRAINT fk_addons_vendor
    FOREIGN KEY (vendor_id)      REFERENCES vendors(id)       ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- vendor_settlements — batch settlement records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_settlements (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID          NOT NULL,
  vendor_id  UUID          NOT NULL,
  amount     NUMERIC(10,2) NOT NULL,
  status     VARCHAR(50)   DEFAULT 'pending',
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_settlements_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendor_settlements_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)  ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- vendor_refunds — refunds issued to vendors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_refunds (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID          NOT NULL,
  settlement_id UUID,
  amount        NUMERIC(10,2) NOT NULL,
  reason        TEXT,
  status        VARCHAR(50)   DEFAULT 'pending',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_refunds_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- vendor_payments — payments sent to vendors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_payments (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID          NOT NULL,
  vendor_id  UUID          NOT NULL,
  amount     NUMERIC(10,2) NOT NULL,
  method     VARCHAR(50),
  status     VARCHAR(50)   DEFAULT 'pending',
  reference  VARCHAR(255),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_payments_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendor_payments_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)  ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- invoices — Malaysia e-invoice (LHDN MyInvois) records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         UUID          NOT NULL,
  reservation_id    UUID,
  tin               VARCHAR(50),
  msic              VARCHAR(10),
  lhdn_reference    VARCHAR(100),
  submission_status VARCHAR(50)   DEFAULT 'draft',
  total_amount      NUMERIC(10,2),
  invoice_data      JSONB,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoices_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- transactions — payment gateway transaction log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID          NOT NULL,
  reservation_id  UUID,
  gateway         VARCHAR(50)   NOT NULL,
  method          VARCHAR(50)   NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  currency        VARCHAR(3)    DEFAULT 'MYR',
  idempotency_key VARCHAR(255)  NOT NULL UNIQUE,
  status          VARCHAR(50)   NOT NULL DEFAULT 'pending',
  gateway_ref     VARCHAR(255),
  callback_data   JSONB,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transactions_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- otp_codes — one-time passwords for customer identity verification
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID         NOT NULL,
  email      VARCHAR(255) NOT NULL,
  code       VARCHAR(10)  NOT NULL,
  purpose    VARCHAR(50)  DEFAULT 'login',
  used       BOOLEAN      DEFAULT false,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_otp_codes_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Performance indexes (all idempotent)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reservations_branch_status ON reservations(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_branch_time   ON reservations(branch_id, reservation_time);
CREATE INDEX IF NOT EXISTS idx_walk_ins_branch_status     ON walk_ins(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_deposit_tx_reservation     ON deposit_transactions(reservation_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_branch_ts        ON audit_log(branch_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_promo_codes_branch_code    ON promo_codes(branch_id, code);
CREATE INDEX IF NOT EXISTS idx_commission_tx_reservation  ON commission_transactions(reservation_id);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_expires    ON otp_codes(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_biz_hours_overrides_date   ON business_hours_overrides(branch_id, override_date);
