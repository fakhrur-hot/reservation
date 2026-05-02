/**
 * db-reset.ts
 *
 * Resets the database to a clean state:
 *   1. Drops all known tables (in dependency order)
 *   2. Drops all known types
 *   3. Re-runs all migrations via MigrationRunner
 *   4. Clears any stale setup data (orphaned branches/staff without setup_completed flag)
 *
 * Usage:
 *   npm run db:reset           → full wipe + re-migrate
 *   npm run db:recover         → clean stale partial-setup rows only (no drop)
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { MigrationRunner } from '../src/migrations/runner.js';

const RECOVER_ONLY = process.argv.includes('--recover-only');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function dropAll(pool: Pool): Promise<void> {
  console.log('⏳ Dropping all tables...');

  // Dynamically drop every table in the public schema with CASCADE.
  // This avoids a stale hardcoded list that left tables behind (losing FK
  // constraints when their parent tables were dropped with CASCADE).
  await pool.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);

  // Drop custom enum types
  await pool.query(`
    DROP TYPE IF EXISTS reservation_status CASCADE;
    DROP TYPE IF EXISTS operating_mode CASCADE;
  `);

  console.log('✓ All tables dropped');
}

/**
 * Removes orphaned rows left by a failed/partial setup attempt.
 * Safe to run on a live DB — only removes data when setup_completed is NOT set.
 */
async function cleanStaleSetup(pool: Pool): Promise<void> {
  console.log('🔍 Checking for stale partial-setup data...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if setup was ever fully completed
    const configResult = await client.query(
      "SELECT value FROM app_config WHERE key = 'setup_completed'"
    );
    const isComplete = configResult.rows.length > 0 && configResult.rows[0].value === 'true';

    if (isComplete) {
      console.log('✓ Setup is already complete — nothing to clean');
      await client.query('ROLLBACK');
      return;
    }

    // Delete orphaned setup data (branches without completed setup)
    // Cascade handles sections, tables, staff, business_hours etc.
    const branchResult = await client.query(
      `DELETE FROM branches
       WHERE code != '[BRANCH_CODE]'
       RETURNING id, name, code`
    );

    if (branchResult.rowCount && branchResult.rowCount > 0) {
      console.log(`  Removed ${branchResult.rowCount} orphaned branch(es):`);
      for (const row of branchResult.rows) {
        console.log(`    • ${row.name} (${row.code})`);
      }
    } else {
      console.log('  No orphaned branches found');
    }

    // Clear stale setup progress flag
    await client.query("DELETE FROM app_config WHERE key = 'setup_progress'");

    await client.query('COMMIT');
    console.log('✓ Stale setup data cleaned');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function runMigrations(pool: Pool): Promise<void> {
  console.log('⏳ Running migrations...');
  const runner = new MigrationRunner(pool);
  await runner.migrate();
  console.log('✓ Migrations complete');
}

async function main(): Promise<void> {
  try {
    await pool.query('SELECT 1'); // confirm connection
    console.log(`✓ Connected to database: ${process.env.DATABASE_URL?.replace(/:\/\/.*@/, '://<redacted>@')}`);

    if (RECOVER_ONLY) {
      // Soft recovery: only clean stale rows, keep the schema
      await cleanStaleSetup(pool);
      console.log('\n✅ Recovery complete. Run the setup wizard again to initialize.');
    } else {
      // Full reset: drop everything and re-migrate
      console.log('\n⚠️  Full database reset — all data will be lost.\n');
      await dropAll(pool);
      await runMigrations(pool);
      console.log('\n✅ Database reset complete. Start the app and run the setup wizard.');
    }
  } catch (err) {
    console.error('✗ db-reset failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
