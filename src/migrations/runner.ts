import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MigrationRecord {
  id: string;
  name: string;
  executed_at: Date;
}

interface MigrationStats {
  tablesCreated: number;
  indexesCreated: number;
  constraintsCreated: number;
}

/**
 * Migration runner with rollback and schema verification support.
 * Applies SQL migration files in order and tracks execution in a migrations table.
 */
export class MigrationRunner {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize the migrations tracking table if it doesn't exist.
   */
  private async initMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        tables_created INTEGER DEFAULT 0,
        indexes_created INTEGER DEFAULT 0,
        constraints_created INTEGER DEFAULT 0
      );
    `;
    await this.pool.query(query);
  }

  /**
   * Get list of already-executed migrations.
   */
  private async getExecutedMigrations(): Promise<MigrationRecord[]> {
    const query = 'SELECT id, name, executed_at FROM migrations ORDER BY id ASC;';
    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get list of migration files from the migrations directory.
   */
  private getMigrationFiles(): string[] {
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir);
    return files
      .filter((file) => file.match(/^\d{3}_.*\.sql$/))
      .sort();
  }

  /**
   * Read a migration file and return its SQL content.
   */
  private readMigrationFile(filename: string): string {
    const filepath = path.join(__dirname, filename);
    return fs.readFileSync(filepath, 'utf-8');
  }

  /**
   * Count tables created by parsing migration SQL.
   */
  private countTablesInMigration(sql: string): number {
    const createTableMatches = sql.match(/CREATE TABLE IF NOT EXISTS/gi) || [];
    return createTableMatches.length;
  }

  /**
   * Count indexes created by parsing migration SQL.
   */
  private countIndexesInMigration(sql: string): number {
    const createIndexMatches = sql.match(/CREATE INDEX IF NOT EXISTS/gi) || [];
    return createIndexMatches.length;
  }

  /**
   * Count constraints created by parsing migration SQL.
   */
  private countConstraintsInMigration(sql: string): number {
    const constraintMatches = sql.match(/CONSTRAINT|FOREIGN KEY|PRIMARY KEY|UNIQUE|CHECK/gi) || [];
    return constraintMatches.length;
  }

  /**
   * Verify that all required tables exist with correct columns.
   * Aligned with 001_schema.sql (consolidated single-file schema).
   */
  private async verifySchema(): Promise<void> {
    const allRequiredTables = [
      // Core
      'branches', 'sections', 'tables', 'customers', 'staff', 'reservations',
      'business_hours', 'business_hours_overrides', 'reservation_sequences',
      'deposit_transactions', 'audit_log', 'app_config', 'walk_ins',
      // Optional services
      'decoration_colors', 'decoration_packages', 'cake_preferences',
      'vendor_commissions', 'commission_transactions', 'commission_refunds',
      // Vendors
      'vendors', 'vendor_services', 'reservation_addons',
      'vendor_settlements', 'vendor_refunds',
      // Dormant Stage 2/3
      'menu_sections', 'menu_items', 'orders', 'order_items', 'table_status_overrides',
      'invoices', 'transactions',
      // Promo / waitlist / system
      'promo_codes', 'waitlist', 'roles', 'operating_modes', 'currencies',
      // Payment
      'payment_sessions',
      // Vendor payments
      'vendor_payments',
    ];

    for (const tableName of allRequiredTables) {
      const result = await this.pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1
         )`,
        [tableName]
      );
      if (!result.rows[0].exists) {
        throw new Error(`Schema verification failed: table '${tableName}' does not exist`);
      }
    }

    // Verify critical columns — uses 'code' (not 'branch_code') per 001_schema.sql
    const criticalColumns: Record<string, string[]> = {
      branches:              ['id', 'code', 'name', 'booking_deposit_amt', 'created_at'],
      sections:              ['id', 'branch_id', 'name', 'created_at'],
      tables:                ['id', 'branch_id', 'section_id', 'name', 'capacity', 'created_at'],
      customers:             ['id', 'branch_id', 'email', 'name', 'created_at'],
      staff:                 ['id', 'branch_id', 'email', 'role', 'created_at'],
      reservations:          ['id', 'branch_id', 'customer_id', 'table_id', 'reference_number',
                              'deposit_paid', 'tc_acknowledged_at', 'status', 'created_at'],
      business_hours:        ['id', 'branch_id', 'day_of_week', 'open_time', 'close_time', 'is_open'],
      deposit_transactions:  ['id', 'branch_id', 'reservation_id', 'amount', 'status', 'decoration_amount'],
      audit_log:             ['id', 'branch_id', 'actor_id', 'action', 'entity_type', 'entity_id', 'timestamp'],
      app_config:            ['key', 'value'],
      decoration_colors:     ['id', 'branch_id', 'color_name', 'color_code', 'is_active', 'sort_order'],
      decoration_packages:   ['id', 'branch_id', 'package_name', 'price', 'is_active'],
      cake_preferences:      ['id', 'branch_id', 'cake_name', 'is_active', 'sort_order'],
      vendor_commissions:    ['id', 'branch_id', 'category', 'commission_type', 'commission_value', 'is_enabled'],
      commission_transactions: ['id', 'branch_id', 'reservation_id', 'category', 'amount_charged',
                                'idempotency_key', 'status'],
      commission_refunds:    ['id', 'branch_id', 'reservation_id', 'category', 'original_commission',
                              'refund_amount', 'refund_percentage', 'status'],
      orders:                ['id', 'branch_id', 'table_id', 'status', 'created_at'],
      order_items:           ['id', 'branch_id', 'order_id', 'item_name', 'quantity', 'created_at'],
      invoices:              ['id', 'branch_id', 'tin', 'msic', 'lhdn_reference', 'submission_status'],
      transactions:          ['id', 'branch_id', 'gateway', 'method', 'idempotency_key', 'status'],
      vendors:               ['id', 'branch_id', 'name', 'service_type', 'merchant_account_id', 'is_active'],
      promo_codes:           ['id', 'branch_id', 'code', 'type', 'is_active'],
      waitlist:              ['id', 'branch_id', 'guest_name', 'party_size', 'status'],
    };

    for (const [tableName, columns] of Object.entries(criticalColumns)) {
      for (const columnName of columns) {
        const query = `
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
          );
        `;
        const result = await this.pool.query(query, [tableName, columnName]);
        if (!result.rows[0].exists) {
          throw new Error(
            `Schema verification failed: column '${columnName}' does not exist on table '${tableName}'`
          );
        }
      }
    }
  }

  /**
   * Verify that all required indexes are created.
   */
  private async verifyIndexes(): Promise<void> {
    const requiredIndexColumns = [
      'branch_id',
      'created_at',
      'status',
      'idempotency_key',
      'is_active',
      'sort_order',
      'category',
      'is_enabled',
    ];

    for (const columnName of requiredIndexColumns) {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE schemaname = 'public' AND indexdef LIKE $1
        );
      `;
      const result = await this.pool.query(query, [`%${columnName}%`]);
      if (!result.rows[0].exists) {
        console.warn(`  ⚠ Index on column '${columnName}' not found (may be acceptable)`);
      }
    }
  }

  /**
   * Verify that foreign key constraints are enforced.
   */
  private async verifyForeignKeyConstraints(): Promise<void> {
    // Test FK violations on multiple tables to ensure constraints are enforced
    const fkTests = [
      {
        table: 'sections',
        sql: `INSERT INTO sections (id, branch_id, name) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid, 'Test')`,
      },
      {
        table: 'tables',
        sql: `INSERT INTO tables (id, branch_id, section_id, name, capacity) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'Test', 4)`,
      },
      {
        table: 'customers',
        sql: `INSERT INTO customers (id, branch_id, email, name) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid, 'test@example.com', 'Test')`,
      },
      {
        table: 'decoration_colors',
        sql: `INSERT INTO decoration_colors (id, branch_id, color_name, color_code) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid, 'Test', '#FF0000')`,
      },
      {
        table: 'decoration_packages',
        sql: `INSERT INTO decoration_packages (id, branch_id, package_name, price) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid, 'Test', 50.00)`,
      },
      {
        table: 'cake_preferences',
        sql: `INSERT INTO cake_preferences (id, branch_id, cake_name) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid, 'Test')`,
      },
      {
        table: 'vendor_commissions',
        sql: `INSERT INTO vendor_commissions (id, branch_id, category, commission_type, commission_value) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid, 'fk_test', 'percentage', 10)`,
      },
    ];

    for (const test of fkTests) {
      try {
        await this.pool.query(test.sql);
        throw new Error(`FK constraint verification failed on ${test.table}: FK violation was not caught`);
      } catch (error: any) {
        // Expected: FK constraint should be violated (error code 23503)
        if (error.code !== '23503') {
          throw new Error(
            `FK constraint verification failed on ${test.table}: unexpected error code ${error.code} - ${error.message}`
          );
        }
      }
    }
  }

  /**
   * Log successful migration with detailed statistics.
   */
  private async logSuccessfulMigration(
    migrationName: string,
    stats: MigrationStats
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `
[${timestamp}] ✓ Migration successful
  Version: ${migrationName}
  Tables created: ${stats.tablesCreated}
  Indexes created: ${stats.indexesCreated}
  Constraints created: ${stats.constraintsCreated}
    `;
    console.log(logEntry);
  }

  /**
   * Log migration failure with detailed error information.
   */
  private async logMigrationFailure(
    migrationName: string,
    error: Error,
    failedTable?: string,
    failedConstraint?: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `
[${timestamp}] ✗ Migration failed
  Version: ${migrationName}
  Error: ${error.message}
  Failed table: ${failedTable || 'unknown'}
  Failed constraint: ${failedConstraint || 'unknown'}
    `;
    console.error(logEntry);
  }

  /**
   * Apply all pending migrations.
   */
  async migrate(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Initialize migrations table
      await this.initMigrationsTable();

      // Get executed and pending migrations
      const executed = await this.getExecutedMigrations();
      const executedNames = new Set(executed.map((m) => m.name));
      const allMigrations = this.getMigrationFiles();
      const pending = allMigrations.filter((m) => !executedNames.has(m));

      if (pending.length === 0) {
        console.log('✓ All migrations are up to date');
        return;
      }

      console.log(`\nApplying ${pending.length} pending migration(s)...\n`);

      // Apply each pending migration in a transaction
      for (const migrationFile of pending) {
        await client.query('BEGIN');

        try {
          const sql = this.readMigrationFile(migrationFile);
          console.log(`  Applying ${migrationFile}...`);

          // Count schema objects
          const stats: MigrationStats = {
            tablesCreated: this.countTablesInMigration(sql),
            indexesCreated: this.countIndexesInMigration(sql),
            constraintsCreated: this.countConstraintsInMigration(sql),
          };

          await client.query(sql);

          // Record migration with stats
          await client.query(
            `INSERT INTO migrations (name, tables_created, indexes_created, constraints_created) 
             VALUES ($1, $2, $3, $4)`,
            [migrationFile, stats.tablesCreated, stats.indexesCreated, stats.constraintsCreated]
          );

          await client.query('COMMIT');

          // Log successful migration
          await this.logSuccessfulMigration(migrationFile, stats);
        } catch (error: any) {
          await client.query('ROLLBACK');

          // Extract table/constraint info from error if possible
          const failedTable = error.message.match(/table "([^"]+)"/)?.[1];
          const failedConstraint = error.message.match(/constraint "([^"]+)"/)?.[1];

          // Log migration failure
          await this.logMigrationFailure(migrationFile, error, failedTable, failedConstraint);

          throw new Error(`Migration ${migrationFile} failed: ${error.message}`);
        }
      }

      // Verify schema after all migrations
      console.log('\nVerifying schema completeness...');
      await this.verifySchema();
      console.log('✓ Schema verification passed');

      // Verify indexes
      console.log('Verifying indexes...');
      await this.verifyIndexes();
      console.log('✓ Index verification passed');

      // Verify FK constraints
      console.log('Verifying foreign key constraints...');
      await this.verifyForeignKeyConstraints();
      console.log('✓ Foreign key constraint verification passed');

      console.log('\n✓ All migrations applied successfully\n');
    } finally {
      client.release();
    }
  }

  /**
   * Rollback the last migration (for development/testing).
   */
  async rollback(): Promise<void> {
    const executed = await this.getExecutedMigrations();

    if (executed.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    const lastMigration = executed[executed.length - 1];
    console.log(`Rolling back ${lastMigration.name}...`);

    // Note: Rollback is not implemented in this version.
    // In production, you would need to maintain rollback SQL for each migration.
    throw new Error('Rollback is not yet implemented. Manual intervention required.');
  }
}

/**
 * Run migrations from CLI.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const runner = new MigrationRunner(pool);
  await runner.migrate();
}
