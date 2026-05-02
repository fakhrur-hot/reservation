# Database Migrations

This directory contains all 28 SQL migrations for the Stage 1 Table Booking Core system. All migrations are idempotent and safe to re-run on any environment.

## Migration Files (001–028)

### Core Tables (001–005)

- **001_core_tables.sql** — Creates foundational tables:
  - `branches`, `sections`, `tables`, `customers`, `staff`, `reservations`, `business_hours`, `business_hours_overrides`, `audit_log`

- **002_business_hours_tables.sql** — Business hours management tables

- **003_reservation_sequences_table.sql** — Reservation reference number sequence tracking

- **004_deposit_transactions_table.sql** — Deposit payment and refund tracking

- **005_audit_log_table.sql** — Audit trail for compliance

### Dormant Stage 2/3 Tables (006–007)

- **006_dormant_stage2_tables.sql** — Stage 2 placeholder tables (menu pre-order)

- **007_dormant_stage3_tables.sql** — Stage 3 placeholder tables (e-Invoice and payments)

### Seed Data (008) — NO-OP

- **008_seed_default_data.sql** — **NO-OP** (replaced with `SELECT 1;`)
  - Reason: Data seeding moved to TypeScript seed layer (`src/seeds/`)
  - Seed data is now applied via `SeedRunner` after migrations complete

### Multi-Vendor Support (009–013)

- **009_multi_vendor_tables.sql** — Multi-vendor support tables with `IF NOT EXISTS` syntax

- **010_vendor_commission_tables.sql** — **NO-OP** (replaced with `SELECT 1;`)
  - Reason: Superseded by migration 025 (commission schema v2)

- **011_add_missing_data_fields.sql** — Additional data fields for reservations

- **012_vendor_account_tables.sql** — Vendor account management with `IF NOT EXISTS` syntax

- **013_commission_transactions_table.sql** — **NO-OP** (replaced with `SELECT 1;`)
  - Reason: Superseded by migration 025 (commission schema v2)

### Optional Services (014–024)

- **014_stage1_optional_services_tables.sql** — Optional services (decorations, cakes)

- **015_seed_default_data.sql** — **NO-OP** (replaced with `SELECT 1;`)
  - Reason: Data seeding moved to TypeScript seed layer

- **016_business_hours_unique_constraint.sql** — Business hours unique constraint with `IF NOT EXISTS` syntax

- **017_walk_ins_table.sql** — Walk-in guest tracking

- **018_notification_settings.sql** — Notification preferences per branch

- **019_branch_printer_config.sql** — Thermal printer configuration

- **020_reservation_occasion_fields.sql** — Occasion type and notes for reservations

- **021_decoration_package_price.sql** — Decoration package pricing

- **022_deposit_transactions_decoration_amount.sql** — Decoration amount in deposit transactions

- **023_staff_created_by.sql** — Staff creation audit trail

- **024_cake_menu_items.sql** — Cake menu items

### Commission Schema v2 (025–027)

- **025_commission_schema_v2.sql** — Commission schema version 2 (replaces 010, 013)

- **026_seed_commission_defaults.sql** — Commission default values

- **027_commission_refund_failure_reason.sql** — Commission refund failure tracking

### Application Configuration (028)

- **028_app_config.sql** — Application configuration key-value store
  - Used by `SeedRunner` for seed tracking
  - Used by `SetupGuardMiddleware` for setup completion flag
  - Stores SMTP configuration and setup progress

## Running Migrations

### Automatic Migration on Startup

Migrations run automatically during application startup:

```bash
npm run dev
```

The `MigrationRunner` will:
1. Create the `migrations` tracking table if it doesn't exist
2. Read all migration files from `src/migrations/` in numeric order
3. Apply only migrations not yet recorded in the tracking table
4. Verify the schema after all migrations complete
5. Proceed to seed layer execution

### Manual Migration

To run migrations manually:

```bash
npm run migrate
```

Or programmatically:

```typescript
import { MigrationRunner } from './src/migrations/runner';
import { createDatabasePool } from '../config/database';

const pool = createDatabasePool();
const runner = new MigrationRunner(pool);
const stats = await runner.migrate();
console.log(`Applied ${stats.appliedCount} migrations`);
```

## No-Op Migrations

Four migrations are intentional no-ops (containing only `SELECT 1;`):

| Migration | Reason |
|-----------|--------|
| **008** | Data seeding moved from SQL to TypeScript seed layer |
| **010** | Superseded by migration 025 (commission schema v2) |
| **013** | Superseded by migration 025 (commission schema v2) |
| **015** | Data seeding moved from SQL to TypeScript seed layer |

These no-op migrations are still recorded in the `migrations` table to maintain a complete audit trail. They are safe to re-run and will not affect the database state.

## Seed Layer

After all migrations complete, the `SeedRunner` executes in three layers:

1. **System Seed** — Inserts roles, operating modes, currencies (runs once)
2. **Default Seed** — Inserts placeholder branch and admin account (runs once)
3. **Dummy Seed** — Generates fake data for development/testing (only in dev/test mode)

Each layer is tracked in the `app_config` table with keys:
- `system_seed_applied`
- `default_seed_applied`
- `dummy_seed_applied`

See `src/seeds/README.md` for details on the seed layer.
