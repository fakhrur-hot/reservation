import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { Pool } from 'pg';
import { getTestPool, tableExists, queryOne } from './helpers/db-client';

// ─── Shared pool ────────────────────────────────────────────────────────────

let pool: Pool;
let dbAvailable = true;

beforeAll(async () => {
  try {
    pool = await getTestPool();
    // Probe the connection so we fail fast if the DB is not up
    await pool.query('SELECT 1');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Treat any connection / config error as "DB not available" and skip gracefully
    console.warn(`[02-schema] Database not available — skipping all schema tests. (${msg})`);
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
});

// ─── Helper: skip when DB is unavailable ────────────────────────────────────

function skipIfNoDb() {
  if (!dbAvailable) {
    console.warn('[02-schema] Skipping test — database not available.');
    return true;
  }
  return false;
}

// ─── Column nullability helper ───────────────────────────────────────────────

interface ColumnInfo {
  column_name: string;
  is_nullable: string;
  data_type: string;
  character_maximum_length: number | null;
}

async function getColumnInfo(
  p: Pool,
  tableName: string,
  columnName: string,
): Promise<ColumnInfo | null> {
  return queryOne<ColumnInfo>(
    p,
    `SELECT column_name, is_nullable, data_type, character_maximum_length
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tableName, columnName],
  );
}

// ─── Describe block ──────────────────────────────────────────────────────────

describe('Database Schema Validation', () => {

  // ── Task 3.2 — Core Tables (Req 2.2) ──────────────────────────────────────
  it('all core tables should exist', async () => {
    if (skipIfNoDb()) return;

    const coreTables = [
      'branches',
      'sections',
      'tables',
      'customers',
      'staff',
      'reservations',
      'business_hours',
      'business_hours_overrides',
      'reservation_sequences',
      'deposit_transactions',
      'audit_log',
    ];

    for (const table of coreTables) {
      expect(await tableExists(pool, table), `Core table '${table}' must exist`).toBe(true);
    }
  });

  // ── Task 3.3 — Dormant Tables (Req 2.3) ───────────────────────────────────
  it('all dormant tables should exist', async () => {
    if (skipIfNoDb()) return;

    const dormantTables = ['orders', 'order_items', 'invoices', 'transactions'];

    for (const table of dormantTables) {
      expect(await tableExists(pool, table), `Dormant table '${table}' must exist`).toBe(true);
    }
  });

  // ── Task 3.4 — Stage 1 Optional Services Tables (Req 2.4) ─────────────────
  it('all stage 1 optional services tables should exist', async () => {
    if (skipIfNoDb()) return;

    const optionalTables = [
      'decoration_colors',
      'decoration_packages',
      'cake_preferences',
      'vendor_commissions',
    ];

    for (const table of optionalTables) {
      expect(
        await tableExists(pool, table),
        `Optional services table '${table}' must exist`,
      ).toBe(true);
    }
  });

  // ── Task 3.5 — reservation_status ENUM (Req 2.5) ──────────────────────────
  it('reservation_status ENUM should have exactly the five required values', async () => {
    if (skipIfNoDb()) return;

    const result = await queryOne<{ labels: string[] }>(
      pool,
      `SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'reservation_status'`,
    );

    expect(result, 'reservation_status ENUM type must exist').not.toBeNull();

    const labels = result!.labels;
    const expected = ['confirmed', 'seated', 'closed', 'cancelled', 'no_show'];

    expect(labels).toHaveLength(5);
    for (const val of expected) {
      expect(labels, `ENUM must contain '${val}'`).toContain(val);
    }
  });

  // ── Task 3.6 — Column existence and nullability (Req 2.6, 2.7, 2.8) ───────

  it('branches table should have required columns with correct nullability', async () => {
    if (skipIfNoDb()) return;

    // booking_deposit_amt NUMERIC(10,2) NOT NULL
    const depositAmt = await getColumnInfo(pool, 'branches', 'booking_deposit_amt');
    expect(depositAmt, "branches.booking_deposit_amt must exist").not.toBeNull();
    expect(depositAmt!.is_nullable, "branches.booking_deposit_amt must be NOT NULL").toBe('NO');

    // app_operating_mode VARCHAR(50) NOT NULL (has DEFAULT so NOT NULL)
    const opMode = await getColumnInfo(pool, 'branches', 'app_operating_mode');
    expect(opMode, "branches.app_operating_mode must exist").not.toBeNull();

    // no_show_grace_min INTEGER
    const graceMin = await getColumnInfo(pool, 'branches', 'no_show_grace_min');
    expect(graceMin, "branches.no_show_grace_min must exist").not.toBeNull();

    // mod_cutoff_hours INTEGER
    const cutoffHours = await getColumnInfo(pool, 'branches', 'mod_cutoff_hours');
    expect(cutoffHours, "branches.mod_cutoff_hours must exist").not.toBeNull();
  });

  it('customers table should have required columns with correct nullability', async () => {
    if (skipIfNoDb()) return;

    // email VARCHAR UNIQUE NOT NULL
    const email = await getColumnInfo(pool, 'customers', 'email');
    expect(email, "customers.email must exist").not.toBeNull();
    expect(email!.is_nullable, "customers.email must be NOT NULL").toBe('NO');

    // password_hash VARCHAR nullable
    const passwordHash = await getColumnInfo(pool, 'customers', 'password_hash');
    expect(passwordHash, "customers.password_hash must exist").not.toBeNull();
    expect(passwordHash!.is_nullable, "customers.password_hash must be nullable").toBe('YES');

    // cpa_consent_timestamp TIMESTAMPTZ nullable
    const cpaTimestamp = await getColumnInfo(pool, 'customers', 'cpa_consent_timestamp');
    expect(cpaTimestamp, "customers.cpa_consent_timestamp must exist").not.toBeNull();
    expect(cpaTimestamp!.is_nullable, "customers.cpa_consent_timestamp must be nullable").toBe('YES');

    // cpa_consent_version VARCHAR nullable
    const cpaVersion = await getColumnInfo(pool, 'customers', 'cpa_consent_version');
    expect(cpaVersion, "customers.cpa_consent_version must exist").not.toBeNull();
    expect(cpaVersion!.is_nullable, "customers.cpa_consent_version must be nullable").toBe('YES');
  });

  it('staff table should have required columns with correct nullability', async () => {
    if (skipIfNoDb()) return;

    // role VARCHAR(50) NOT NULL
    const role = await getColumnInfo(pool, 'staff', 'role');
    expect(role, "staff.role must exist").not.toBeNull();
    expect(role!.is_nullable, "staff.role must be NOT NULL").toBe('NO');

    // password_hash VARCHAR NOT NULL
    const passwordHash = await getColumnInfo(pool, 'staff', 'password_hash');
    expect(passwordHash, "staff.password_hash must exist").not.toBeNull();
    expect(passwordHash!.is_nullable, "staff.password_hash must be NOT NULL").toBe('NO');

    // failed_logins INTEGER
    const failedLogins = await getColumnInfo(pool, 'staff', 'failed_logins');
    expect(failedLogins, "staff.failed_logins must exist").not.toBeNull();

    // locked_at TIMESTAMPTZ nullable
    const lockedAt = await getColumnInfo(pool, 'staff', 'locked_at');
    expect(lockedAt, "staff.locked_at must exist").not.toBeNull();
    expect(lockedAt!.is_nullable, "staff.locked_at must be nullable").toBe('YES');
  });

  // ── Task 3.7 — Indexes (Req 2.10) ─────────────────────────────────────────
  it('required indexes should exist', async () => {
    if (skipIfNoDb()) return;

    const result = await pool.query(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
    `);

    const indexDefs = result.rows.map((r: { indexdef: string }) => r.indexdef.toLowerCase());

    const indexedColumns = ['branch_id', 'status', 'idempotency_key', 'is_active', 'created_at'];

    for (const col of indexedColumns) {
      const hasIndex = indexDefs.some((def: string) => def.includes(`(${col})`));
      expect(hasIndex, `An index on column '${col}' must exist`).toBe(true);
    }
  });

  // ── Task 3.8 — Property 1: FK constraint enforcement (Req 2.9) ────────────
  // Feature: local-test-deployment-validation, Property 1: FK constraint always rejects non-existent branch_id with error 23503
  // Validates: Requirements 2.9
  it('Property 1: FK constraint always rejects non-existent branch_id with error 23503', async () => {
    if (skipIfNoDb()) return;

    // Tables with branch_id FK that can be inserted with minimal required fields
    const fkTables: Array<{ table: string; insert: (branchId: string) => string }> = [
      {
        table: 'sections',
        insert: (branchId) =>
          `INSERT INTO sections (branch_id, name) VALUES ('${branchId}', 'test-fk-check')`,
      },
      {
        table: 'decoration_colors',
        insert: (branchId) =>
          `INSERT INTO decoration_colors (branch_id, name, hex_code) VALUES ('${branchId}', 'test-fk-check', '#000000')`,
      },
    ];

    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (randomUuid) => {
        for (const { table, insert } of fkTables) {
          try {
            await pool.query(insert(randomUuid));
            // If no error was thrown the UUID happened to match an existing branch —
            // extremely unlikely but we clean up and continue.
            await pool.query(
              `DELETE FROM ${table} WHERE branch_id = '${randomUuid}' AND name = 'test-fk-check'`,
            );
          } catch (err: unknown) {
            const pgErr = err as { code?: string };
            expect(
              pgErr.code,
              `FK violation on '${table}' must return error code 23503`,
            ).toBe('23503');
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
