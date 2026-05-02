# Database Schema Reference

This document provides a complete reference of the database schema created by all 28 migrations. The schema is organized by logical grouping and includes all tables, columns, constraints, and indexes.

## Table of Contents

1. [Core Tables](#core-tables)
2. [Business Operations](#business-operations)
3. [Multi-Vendor Support](#multi-vendor-support)
4. [Optional Services](#optional-services)
5. [Configuration & Tracking](#configuration--tracking)
6. [Indexes Summary](#indexes-summary)

---

## Core Tables

### branches

Represents a restaurant branch or location.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `brand_id` | UUID | YES | NULL | |
| `name` | VARCHAR(255) | NO | | |
| `code` | VARCHAR(50) | NO | | UNIQUE |
| `address` | TEXT | NO | | |
| `phone` | VARCHAR(20) | NO | | |
| `booking_deposit_amt` | NUMERIC(10,2) | NO | 50.00 | |
| `app_operating_mode` | VARCHAR(50) | YES | 'TABLE_ONLY' | |
| `no_show_grace_min` | INTEGER | YES | 15 | |
| `mod_cutoff_hours` | INTEGER | YES | 2 | |
| `timezone` | VARCHAR(50) | YES | 'Asia/Kuala_Lumpur' | |
| `currency` | VARCHAR(3) | YES | 'MYR' | |
| `tax_rate` | NUMERIC(5,2) | YES | 0.00 | |
| `notification_settings` | JSONB | YES | NULL | Email notification preferences |
| `notification_alert_settings` | JSONB | YES | NULL | Real-time WebSocket alert settings |
| `is_active` | BOOLEAN | YES | true | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_branches_brand_id` on `brand_id`
- `idx_branches_created_at` on `created_at`
- `idx_branches_notification_alert_settings` on `notification_alert_settings` (GIN)

---

### sections

Represents dining sections within a branch (e.g., Indoor, Outdoor, Private Room).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `name` | VARCHAR(100) | NO | | |
| `description` | TEXT | YES | NULL | |
| `sort_order` | INTEGER | YES | 0 | |
| `is_active` | BOOLEAN | YES | true | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_sections_branch_id` on `branch_id`
- `idx_sections_created_at` on `created_at`

---

### tables

Represents individual dining tables.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `section_id` | UUID | NO | | FK → sections(id) ON DELETE CASCADE |
| `name` | VARCHAR(100) | NO | | |
| `capacity` | INTEGER | NO | | |
| `is_active` | BOOLEAN | YES | true | |
| `table_type` | VARCHAR(50) | YES | NULL | |
| `has_window_view` | BOOLEAN | YES | false | |
| `is_wheelchair_accessible` | BOOLEAN | YES | false | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_tables_branch_id` on `branch_id`
- `idx_tables_section_id` on `section_id`
- `idx_tables_created_at` on `created_at`

---

### customers

Represents customer/guest records.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `email` | VARCHAR(255) | NO | | UNIQUE |
| `password_hash` | VARCHAR(255) | YES | NULL | |
| `name` | VARCHAR(255) | NO | | |
| `phone` | VARCHAR(20) | YES | NULL | |
| `cpa_consent_timestamp` | TIMESTAMPTZ | YES | NULL | |
| `cpa_consent_version` | VARCHAR(50) | YES | NULL | |
| `failed_logins` | INTEGER | YES | 0 | |
| `locked_at` | TIMESTAMPTZ | YES | NULL | |
| `preferred_language` | VARCHAR(10) | YES | 'en' | |
| `dietary_restrictions` | TEXT | YES | NULL | |
| `allergies` | TEXT | YES | NULL | |
| `communication_preference` | VARCHAR(50) | YES | 'email' | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_customers_branch_id` on `branch_id`
- `idx_customers_email` on `email`
- `idx_customers_created_at` on `created_at`

---

### staff

Represents staff members (admin, manager, waiter).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `email` | VARCHAR(255) | NO | | UNIQUE |
| `password_hash` | VARCHAR(255) | NO | | |
| `name` | VARCHAR(255) | NO | | |
| `role` | VARCHAR(50) | NO | | |
| `failed_logins` | INTEGER | YES | 0 | |
| `locked_at` | TIMESTAMPTZ | YES | NULL | |
| `is_active` | BOOLEAN | YES | true | |
| `employee_id` | VARCHAR(50) | YES | NULL | |
| `last_login_at` | TIMESTAMPTZ | YES | NULL | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_staff_branch_id` on `branch_id`
- `idx_staff_email` on `email`
- `idx_staff_created_at` on `created_at`

---

### reservations

Represents customer reservations.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `customer_id` | UUID | NO | | FK → customers(id) ON DELETE CASCADE |
| `table_id` | UUID | NO | | FK → tables(id) ON DELETE CASCADE |
| `reference_number` | VARCHAR(50) | NO | | UNIQUE |
| `reservation_time` | TIMESTAMPTZ | NO | | |
| `party_size` | INTEGER | NO | | |
| `status` | reservation_status | NO | 'confirmed' | ENUM: confirmed, seated, closed, cancelled, no_show |
| `deposit_paid` | NUMERIC(10,2) | YES | 0 | |
| `tc_acknowledged_at` | TIMESTAMPTZ | YES | NULL | |
| `seated_at` | TIMESTAMPTZ | YES | NULL | |
| `seated_by` | UUID | YES | NULL | FK → staff(id) ON DELETE SET NULL |
| `closed_at` | TIMESTAMPTZ | YES | NULL | |
| `is_vip` | BOOLEAN | YES | false | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_reservations_branch_id` on `branch_id`
- `idx_reservations_customer_id` on `customer_id`
- `idx_reservations_table_id` on `table_id`
- `idx_reservations_status` on `status`
- `idx_reservations_created_at` on `created_at`
- `idx_reservations_reservation_time` on `reservation_time`

---

## Business Operations

### business_hours

Represents regular operating hours for each day of the week.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `day_of_week` | INTEGER | NO | | CHECK (0-6) |
| `open_time` | TIME | NO | | |
| `close_time` | TIME | NO | | |
| `is_open` | BOOLEAN | YES | true | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_business_hours_branch_id` on `branch_id`
- `idx_business_hours_created_at` on `created_at`

---

### business_hours_overrides

Represents special operating hours for specific dates (holidays, special events).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `override_date` | DATE | NO | | |
| `is_open` | BOOLEAN | NO | | |
| `open_time` | TIME | YES | NULL | |
| `close_time` | TIME | YES | NULL | |
| `reason` | VARCHAR(255) | YES | NULL | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_business_hours_overrides_branch_id` on `branch_id`
- `idx_business_hours_overrides_override_date` on `override_date`
- `idx_business_hours_overrides_created_at` on `created_at`

---

### walk_ins

Represents walk-in guests (not pre-booked).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `table_id` | UUID | NO | | FK → tables(id) ON DELETE CASCADE |
| `guest_name` | VARCHAR(255) | NO | | |
| `party_size` | INTEGER | NO | | |
| `phone` | VARCHAR(20) | YES | NULL | |
| `seated_at` | TIMESTAMPTZ | NO | | |
| `closed_at` | TIMESTAMPTZ | YES | NULL | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_walk_ins_branch_id` on `branch_id`
- `idx_walk_ins_table_id` on `table_id`
- `idx_walk_ins_created_at` on `created_at`

---

### deposit_transactions

Represents deposit payment transactions.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `reservation_id` | UUID | NO | | FK → reservations(id) ON DELETE CASCADE |
| `amount` | NUMERIC(10,2) | NO | | |
| `idempotency_key` | VARCHAR(255) | YES | NULL | UNIQUE |
| `status` | VARCHAR(50) | NO | | |
| `is_refund` | BOOLEAN | YES | false | |
| `refund_amount` | NUMERIC(10,2) | YES | NULL | |
| `refund_reason` | VARCHAR(255) | YES | NULL | |
| `gateway` | VARCHAR(50) | YES | NULL | |
| `method` | VARCHAR(50) | YES | NULL | |
| `transaction_ref` | VARCHAR(255) | YES | NULL | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_deposit_transactions_branch_id` on `branch_id`
- `idx_deposit_transactions_reservation_id` on `reservation_id`
- `idx_deposit_transactions_idempotency_key` on `idempotency_key`
- `idx_deposit_transactions_status` on `status`
- `idx_deposit_transactions_created_at` on `created_at`

---

### audit_log

Represents audit trail of all system actions.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `actor_id` | UUID | YES | NULL | FK → staff(id) ON DELETE SET NULL |
| `action` | VARCHAR(50) | NO | | |
| `entity_type` | VARCHAR(50) | NO | | |
| `entity_id` | UUID | NO | | |
| `old_value` | JSONB | YES | NULL | |
| `new_value` | JSONB | YES | NULL | |
| `ip_address` | VARCHAR(45) | YES | NULL | |
| `request_id` | VARCHAR(255) | YES | NULL | |
| `status_code` | INTEGER | YES | NULL | |
| `timestamp` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_audit_log_branch_id` on `branch_id`
- `idx_audit_log_actor_id` on `actor_id`
- `idx_audit_log_entity_type` on `entity_type`
- `idx_audit_log_entity_id` on `entity_id`
- `idx_audit_log_timestamp` on `timestamp`
- `idx_audit_log_action` on `action`

---

## Multi-Vendor Support

### vendors

Represents vendor partners (e.g., cake suppliers, decoration providers).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `brand_id` | UUID | NO | | FK → brands(id) ON DELETE CASCADE |
| `name` | VARCHAR(255) | NO | | |
| `email` | VARCHAR(255) | NO | | UNIQUE |
| `phone` | VARCHAR(20) | YES | NULL | |
| `is_active` | BOOLEAN | YES | true | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

---

### vendor_accounts

Represents vendor account details and commission settings.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `vendor_id` | UUID | NO | | FK → vendors(id) ON DELETE CASCADE |
| `account_holder_name` | VARCHAR(255) | NO | | |
| `bank_name` | VARCHAR(255) | NO | | |
| `account_number` | VARCHAR(50) | NO | | |
| `commission_rate` | NUMERIC(5,2) | NO | | |
| `is_active` | BOOLEAN | YES | true | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

---

## Optional Services

### decoration_packages

Represents decoration/celebration packages available for reservations.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `name` | VARCHAR(255) | NO | | |
| `description` | TEXT | YES | NULL | |
| `price` | NUMERIC(10,2) | NO | | |
| `is_active` | BOOLEAN | YES | true | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

---

### cake_menu_items

Represents cake menu items available for order.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `name` | VARCHAR(255) | NO | | |
| `description` | TEXT | YES | NULL | |
| `price` | NUMERIC(10,2) | NO | | |
| `is_available` | BOOLEAN | YES | true | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

---

## Configuration & Tracking

### app_config

Key-value configuration store for application-level settings.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `key` | VARCHAR(100) | NO | | PRIMARY KEY |
| `value` | TEXT | NO | | |

**Common Keys:**
- `system_seed_applied` - Marks when system seed has been applied
- `default_seed_applied` - Marks when default seed has been applied
- `dummy_seed_applied` - Marks when dummy seed has been applied (dev/test only)
- `setup_completed` - Set to 'true' when initial setup wizard is complete
- `setup_progress` - JSON blob storing current setup step and partial data
- `smtp_*` - SMTP configuration keys (host, port, user, password, from_name, from_email, tls)

---

### reservation_sequences

Tracks reservation reference number sequences per branch per year.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `brand_id` | UUID | YES | NULL | |
| `year` | INTEGER | NO | | |
| `last_seq` | INTEGER | NO | 0 | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

**Constraints:**
- UNIQUE (branch_id, year)

---

### notification_settings

Stores notification preferences per branch.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `email_enabled` | BOOLEAN | YES | true | |
| `sms_enabled` | BOOLEAN | YES | false | |
| `reminder_hours_before` | INTEGER | YES | 24 | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

---

### branch_printer_config

Stores thermal printer configuration per branch.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | PRIMARY KEY |
| `branch_id` | UUID | NO | | FK → branches(id) ON DELETE CASCADE |
| `printer_ip` | VARCHAR(45) | YES | NULL | |
| `printer_port` | INTEGER | YES | 9100 | |
| `paper_width_mm` | INTEGER | YES | 80 | |
| `is_active` | BOOLEAN | YES | true | |
| `created_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMPTZ | NO | CURRENT_TIMESTAMP | |

---

## Indexes Summary

### Performance Indexes

The schema includes 50+ indexes optimized for common query patterns:

- **Branch queries:** `idx_branches_brand_id`, `idx_branches_created_at`
- **Section queries:** `idx_sections_branch_id`, `idx_sections_created_at`
- **Table queries:** `idx_tables_branch_id`, `idx_tables_section_id`, `idx_tables_created_at`
- **Customer queries:** `idx_customers_branch_id`, `idx_customers_email`, `idx_customers_created_at`
- **Staff queries:** `idx_staff_branch_id`, `idx_staff_email`, `idx_staff_created_at`
- **Reservation queries:** `idx_reservations_branch_id`, `idx_reservations_customer_id`, `idx_reservations_table_id`, `idx_reservations_status`, `idx_reservations_created_at`, `idx_reservations_reservation_time`
- **Business hours queries:** `idx_business_hours_branch_id`, `idx_business_hours_created_at`
- **Audit queries:** `idx_audit_log_branch_id`, `idx_audit_log_actor_id`, `idx_audit_log_entity_type`, `idx_audit_log_entity_id`, `idx_audit_log_timestamp`, `idx_audit_log_action`

---

## Data Types

### Custom Types

- **reservation_status** - ENUM: `confirmed`, `seated`, `closed`, `cancelled`, `no_show`

### Standard Types

- **UUID** - Universally unique identifier (gen_random_uuid())
- **TIMESTAMPTZ** - Timestamp with timezone (CURRENT_TIMESTAMP)
- **NUMERIC(10,2)** - Decimal numbers with 2 decimal places (currency)
- **JSONB** - JSON binary format (audit log values)

---

## Constraints

### Foreign Keys

All foreign keys use `ON DELETE CASCADE` to maintain referential integrity:
- sections → branches
- tables → branches, sections
- customers → branches
- staff → branches
- reservations → branches, customers, tables, staff
- business_hours → branches
- business_hours_overrides → branches
- walk_ins → branches, tables
- deposit_transactions → branches, reservations
- audit_log → branches, staff

### Unique Constraints

- branches.code
- customers.email
- staff.email
- reservations.reference_number
- deposit_transactions.idempotency_key
- reservation_sequences (branch_id, year)

---

## Migration History

All 28 migrations are applied in numeric order:

1. **001** - Core tables (branches, sections, tables, customers, staff, reservations, business_hours, audit_log)
2. **002** - Business hours tables
3. **003** - Reservation sequences
4. **004** - Deposit transactions
5. **005** - Audit log
6. **006-007** - Dormant stage 2/3 tables
7. **008** - No-op (seed data moved to seed layer)
8. **009** - Multi-vendor tables
9. **010** - No-op (superseded by 025)
10. **011** - Additional data fields
11. **012** - Vendor account tables
12. **013** - No-op (superseded by 025)
13. **014** - Optional services (decorations, cakes)
14. **015** - No-op (seed data moved to seed layer)
15. **016** - Business hours unique constraint
16. **017** - Walk-ins table
17. **018** - Notification settings
18. **019** - Branch printer config
19. **020** - Reservation occasion fields
20. **021** - Decoration package pricing
21. **022** - Deposit decoration amount
22. **023** - Staff creation audit
23. **024** - Cake menu items
24. **025** - Commission schema v2
25. **026** - Commission defaults
26. **027** - Commission refund failure reason
27. **028** - App config table

---

## Notes

- All tables use UUID primary keys for distributed system compatibility
- All tables include `created_at` and `updated_at` timestamps
- Multi-branch support via `branch_id` foreign key on all operational tables
- Brand-level support via `brand_id` for future multi-brand features
- Comprehensive audit logging via `audit_log` table
- Idempotent migrations ensure safe re-runs on any environment
