-- =============================================================================
-- 001_initial_schema.sql — Canonical Alpha Full Stage Schema
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- CORE TABLES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                    UUID,
  name                        VARCHAR(255)  NOT NULL,
  code                        VARCHAR(50)   NOT NULL UNIQUE,
  address                     TEXT          NOT NULL DEFAULT '',
  phone                       VARCHAR(20)   NOT NULL DEFAULT '',
  email                       VARCHAR(255)  DEFAULT '',
  booking_deposit_amt         NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  app_operating_mode          VARCHAR(50)   DEFAULT 'FULL',
  no_show_grace_min           INTEGER       DEFAULT 15,
  mod_cutoff_hours            INTEGER       DEFAULT 2,
  timezone                    VARCHAR(50)   DEFAULT 'Asia/Kuala_Lumpur',
  currency                    VARCHAR(3)    DEFAULT 'MYR',
  tax_rate                    NUMERIC(5,4)  DEFAULT 0.06,
  notification_settings       JSONB         DEFAULT NULL,
  notification_alert_settings JSONB         DEFAULT NULL,
  printer_type                VARCHAR(50)   DEFAULT 'lan',
  decoration_package_price    NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  cake_deposit_amt            NUMERIC(10,2) DEFAULT 0.00,
  cake_deposit_type           VARCHAR(20)   DEFAULT 'fixed',
  setup_complete              BOOLEAN       DEFAULT false,
  website_url                 VARCHAR(255)  DEFAULT NULL,
  holiday_country_code        VARCHAR(2)    DEFAULT 'MY',
  holiday_region_code         VARCHAR(50),
  is_active                   BOOLEAN       DEFAULT true,
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sections (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID         NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order  INTEGER      DEFAULT 0,
  is_active   BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sections_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tables (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                UUID         NOT NULL,
  section_id               UUID         NOT NULL,
  name                     VARCHAR(100) NOT NULL,
  capacity                 INTEGER      NOT NULL,
  is_active                BOOLEAN      DEFAULT true,
  can_be_decorated         BOOLEAN      DEFAULT true,
  table_type               VARCHAR(20)  DEFAULT 'standard',
  has_window_view          BOOLEAN      DEFAULT false,
  is_wheelchair_accessible BOOLEAN      DEFAULT false,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tables_branch  FOREIGN KEY (branch_id)  REFERENCES branches(id)  ON DELETE CASCADE,
  CONSTRAINT fk_tables_section FOREIGN KEY (section_id) REFERENCES sections(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID         NOT NULL,
  email         VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  phone         VARCHAR(20),
  password_hash VARCHAR(255),
  failed_logins INTEGER      DEFAULT 0,
  locked_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_customers_branch    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT customers_branch_email_key UNIQUE (branch_id, email)
);

CREATE TABLE IF NOT EXISTS staff (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID         NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(50)  NOT NULL,
  is_active     BOOLEAN      DEFAULT true,
  failed_logins INTEGER      DEFAULT 0,
  locked_at     TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  login_count   INTEGER      NOT NULL DEFAULT 0,
  employee_id   VARCHAR(50),
  brand_id      UUID,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservations (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                UUID          NOT NULL,
  customer_id              UUID          NOT NULL,
  table_id                 UUID          NOT NULL,
  reference_number         VARCHAR(50)   NOT NULL UNIQUE,
  reservation_time         TIMESTAMPTZ   NOT NULL,
  end_time                 TIMESTAMPTZ,
  party_size               INTEGER       NOT NULL,
  status                   VARCHAR(50)   NOT NULL DEFAULT 'confirmed',
  deposit_paid             NUMERIC(10,2) DEFAULT 0.00,
  tc_acknowledged_at       TIMESTAMPTZ,
  special_requests         TEXT,
  seated_at                TIMESTAMPTZ,
  seated_by                UUID,
  -- Decoration / occasion
  has_decoration           BOOLEAN       DEFAULT false,
  decoration_amount        NUMERIC(10,2) DEFAULT 0.00,
  occasion_type            VARCHAR(50),
  decoration_color         VARCHAR(100),
  decoration_notes         TEXT,
  -- Cake
  cake_choice              VARCHAR(100),
  cake_menu_id             UUID,
  cake_custom_notes        TEXT,
  -- Promo & session
  promo_code               VARCHAR(50),
  promo_code_discount      NUMERIC(10,2),
  table_lock_id            VARCHAR(100),
  session_duration_minutes INTEGER,
  is_vip                   BOOLEAN       DEFAULT false,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservations_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id)   ON DELETE CASCADE,
  CONSTRAINT fk_reservations_customer FOREIGN KEY (customer_id) REFERENCES customers(id)  ON DELETE CASCADE,
  CONSTRAINT fk_reservations_table    FOREIGN KEY (table_id)    REFERENCES tables(id)     ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_hours (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID        NOT NULL,
  day_of_week INTEGER     NOT NULL,
  open_time   TIME        NOT NULL,
  close_time  TIME        NOT NULL,
  is_open     BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_business_hours_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT uq_branch_day UNIQUE (branch_id, day_of_week)
);

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

CREATE TABLE IF NOT EXISTS walk_ins (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID         NOT NULL,
  table_id    UUID         NOT NULL,
  staff_id    UUID,
  guest_name  VARCHAR(255) NOT NULL,
  guest_phone VARCHAR(20),
  party_size  INTEGER      NOT NULL,
  status      VARCHAR(50)  DEFAULT 'open',
  notes       TEXT,
  seated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_walk_ins_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_walk_ins_table  FOREIGN KEY (table_id)  REFERENCES tables(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_config (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

-- ---------------------------------------------------------------------------
-- REFERENCE NUMBER GENERATION
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
-- DEPOSITS & PAYMENTS
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
-- AUDIT
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
-- OPTIONAL SERVICES & DECORATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decoration_colors (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID         NOT NULL,
  color_name VARCHAR(50)  NOT NULL,
  color_code VARCHAR(7)   NOT NULL,
  is_active  BOOLEAN      DEFAULT true,
  sort_order INTEGER      DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_decoration_colors_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decoration_packages (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID          NOT NULL,
  package_name VARCHAR(100)  NOT NULL,
  price        NUMERIC(10,2) NOT NULL,
  is_active    BOOLEAN       DEFAULT true,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_decoration_packages_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cake_preferences (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID         NOT NULL,
  cake_name  VARCHAR(100) NOT NULL,
  is_active  BOOLEAN      DEFAULT true,
  sort_order INTEGER      DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cake_preferences_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- MENU
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_sections (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID         NOT NULL,
  name         VARCHAR(100) NOT NULL,
  section_type VARCHAR(50)  DEFAULT 'food',
  is_active    BOOLEAN      DEFAULT true,
  sort_order   INTEGER      DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_menu_sections_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID          NOT NULL,
  section_id  UUID          NOT NULL,
  name        VARCHAR(255)  NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  special_tag VARCHAR(50),
  is_available BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_menu_items_branch  FOREIGN KEY (branch_id)  REFERENCES branches(id)  ON DELETE CASCADE,
  CONSTRAINT fk_menu_items_section FOREIGN KEY (section_id) REFERENCES menu_sections(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID        NOT NULL,
  table_id   UUID        NOT NULL,
  status     VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_table  FOREIGN KEY (table_id)  REFERENCES tables(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_items (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID         NOT NULL,
  order_id   UUID         NOT NULL,
  item_name  VARCHAR(255) NOT NULL,
  quantity   INTEGER      NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_items_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_order  FOREIGN KEY (order_id)  REFERENCES orders(id)  ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- PROMO CODES & WAITLIST
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_codes (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                UUID          NOT NULL,
  code                     VARCHAR(50)   NOT NULL,
  type                     VARCHAR(50)   NOT NULL DEFAULT 'discount',
  description              TEXT,
  is_active                BOOLEAN       DEFAULT true,
  override_lead_time       BOOLEAN       DEFAULT false,
  min_lead_time_minutes    INTEGER,
  valid_from_time          TIME,
  valid_to_time            TIME,
  valid_days_of_week       VARCHAR(20),
  session_duration_minutes INTEGER,
  min_party_size           INTEGER,
  discount_type            VARCHAR(20),
  discount_value           NUMERIC(10,2),
  affiliate_id             VARCHAR(100),
  max_uses                 INTEGER,
  used_count               INTEGER       DEFAULT 0,
  valid_from               TIMESTAMPTZ,
  valid_until              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_promo_codes_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT uq_branch_promo_code UNIQUE (branch_id, code)
);

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
-- OTP
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
-- COMMISSIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_commissions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        UUID          NOT NULL,
  category         VARCHAR(50)   NOT NULL,
  commission_type  VARCHAR(20)   NOT NULL DEFAULT 'percentage',
  commission_value NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  is_enabled       BOOLEAN       DEFAULT false,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_commissions_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

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
-- VENDORS
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
  CONSTRAINT fk_vendors_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vendor_services (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID          NOT NULL,
  vendor_id  UUID          NOT NULL,
  name       VARCHAR(255)  NOT NULL,
  price      NUMERIC(10,2) NOT NULL,
  is_active  BOOLEAN       DEFAULT true,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_services_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendor_services_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id)  ON DELETE CASCADE
);

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
  CONSTRAINT fk_addons_branch       FOREIGN KEY (branch_id)      REFERENCES branches(id)     ON DELETE CASCADE,
  CONSTRAINT fk_addons_reservation  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  CONSTRAINT fk_addons_vendor       FOREIGN KEY (vendor_id)      REFERENCES vendors(id)      ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vendor_settlements (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID          NOT NULL,
  vendor_id  UUID          NOT NULL,
  amount     NUMERIC(10,2) NOT NULL,
  status     VARCHAR(50)   DEFAULT 'pending',
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_settlements_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendor_settlements_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vendor_refunds (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID          NOT NULL,
  settlement_id UUID,
  amount        NUMERIC(10,2) NOT NULL,
  reason        TEXT,
  status        VARCHAR(50)   DEFAULT 'pending',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_refunds_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vendor_payments (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  UUID          NOT NULL,
  vendor_id  UUID          NOT NULL,
  amount     NUMERIC(10,2) NOT NULL,
  method     VARCHAR(50),
  status     VARCHAR(50)   DEFAULT 'pending',
  reference  VARCHAR(255),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendor_payments_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendor_payments_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id)  ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- TABLE STATUS & INVOICES
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
  CONSTRAINT fk_table_overrides_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_table_overrides_table  FOREIGN KEY (table_id)  REFERENCES tables(id)  ON DELETE CASCADE
);

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
  CONSTRAINT fk_invoices_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- SYSTEM TABLES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(50) NOT NULL UNIQUE,
  is_active  BOOLEAN     DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operating_modes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(50) NOT NULL UNIQUE,
  is_active  BOOLEAN     DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS currencies (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(3)   NOT NULL UNIQUE,
  name       VARCHAR(100) NOT NULL,
  symbol     VARCHAR(10),
  is_active  BOOLEAN      DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_branches_code                ON branches(code);
CREATE INDEX IF NOT EXISTS idx_sections_branch_id           ON sections(branch_id);
CREATE INDEX IF NOT EXISTS idx_tables_branch_id             ON tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_reservations_ref             ON reservations(reference_number);
CREATE INDEX IF NOT EXISTS idx_reservations_branch_status   ON reservations(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_branch_time     ON reservations(branch_id, reservation_time);
CREATE INDEX IF NOT EXISTS idx_walk_ins_branch_status       ON walk_ins(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_deposit_tx_reservation       ON deposit_transactions(reservation_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_branch_ts          ON audit_log(branch_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_promo_codes_branch_code      ON promo_codes(branch_id, code);
CREATE INDEX IF NOT EXISTS idx_commission_tx_reservation    ON commission_transactions(reservation_id);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_expires      ON otp_codes(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_biz_hours_overrides_date     ON business_hours_overrides(branch_id, override_date);
