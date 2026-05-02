import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { MigrationRunner } from './runner';

describe('Database Migrations', () => {
  let pool: Pool;

  beforeAll(() => {
    // Create a test database pool
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME_TEST || 'table_booking_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });
  });

  beforeEach(async () => {
    // Clean up database before each test by dropping all tables
    try {
      await pool.query(`
        DROP TABLE IF EXISTS migrations CASCADE;
        DROP TABLE IF EXISTS transactions CASCADE;
        DROP TABLE IF EXISTS invoices CASCADE;
        DROP TABLE IF EXISTS order_items CASCADE;
        DROP TABLE IF EXISTS orders CASCADE;
        DROP TABLE IF EXISTS audit_log CASCADE;
        DROP TABLE IF EXISTS deposit_transactions CASCADE;
        DROP TABLE IF EXISTS reservation_sequences CASCADE;
        DROP TABLE IF EXISTS business_hours_overrides CASCADE;
        DROP TABLE IF EXISTS business_hours CASCADE;
        DROP TABLE IF EXISTS reservations CASCADE;
        DROP TABLE IF EXISTS staff CASCADE;
        DROP TABLE IF EXISTS customers CASCADE;
        DROP TABLE IF EXISTS tables CASCADE;
        DROP TABLE IF EXISTS sections CASCADE;
        DROP TABLE IF EXISTS branches CASCADE;
      `);
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Migration Runner', () => {
    it('should apply all pending migrations successfully', async () => {
      const runner = new MigrationRunner(pool);
      await runner.migrate();

      // Verify migrations table was created
      const migrationsTableResult = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'migrations'
        )`
      );
      expect(migrationsTableResult.rows[0].exists).toBe(true);

      // Verify all migration records were inserted
      const migrationsResult = await pool.query('SELECT COUNT(*) as count FROM migrations');
      expect(migrationsResult.rows[0].count).toBeGreaterThan(0);
    });

    it('should not re-apply already executed migrations', async () => {
      const runner = new MigrationRunner(pool);
      
      // First run
      await runner.migrate();
      const firstRunResult = await pool.query('SELECT COUNT(*) as count FROM migrations');
      const firstCount = firstRunResult.rows[0].count;

      // Second run
      await runner.migrate();
      const secondRunResult = await pool.query('SELECT COUNT(*) as count FROM migrations');
      const secondCount = secondRunResult.rows[0].count;

      // Should be the same
      expect(firstCount).toBe(secondCount);
    });
  });

  describe('Schema Completeness', () => {
    beforeEach(async () => {
      // Run migrations before each test
      const runner = new MigrationRunner(pool);
      await runner.migrate();
    });

    it('should create all core tables', async () => {
      const requiredTables = [
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

      for (const tableName of requiredTables) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          )`,
          [tableName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should create all dormant stage 2/3 tables', async () => {
      const dormantTables = ['orders', 'order_items', 'invoices', 'transactions'];

      for (const tableName of dormantTables) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          )`,
          [tableName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should create all multi-vendor tables', async () => {
      const vendorTables = ['vendors', 'vendor_services', 'reservation_addons', 'vendor_settlements', 'vendor_refunds'];

      for (const tableName of vendorTables) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          )`,
          [tableName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have correct columns on branches table', async () => {
      const requiredColumns = [
        'id',
        'brand_id',
        'name',
        'code',
        'address',
        'phone',
        'app_operating_mode',
        'no_show_grace_min',
        'mod_cutoff_hours',
        'booking_deposit_amt',
        'created_at',
      ];

      for (const columnName of requiredColumns) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = $1
          )`,
          [columnName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have correct columns on reservations table', async () => {
      const requiredColumns = [
        'id',
        'branch_id',
        'brand_id',
        'customer_id',
        'table_id',
        'reference_number',
        'reservation_time',
        'party_size',
        'status',
        'deposit_paid',
        'tc_acknowledged_at',
        'seated_at',
        'seated_by',
        'created_at',
      ];

      for (const columnName of requiredColumns) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = $1
          )`,
          [columnName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have correct columns on invoices table (LHDN-ready)', async () => {
      const requiredColumns = ['id', 'branch_id', 'brand_id', 'tin', 'msic', 'lhdn_reference', 'submission_status', 'created_at'];

      for (const columnName of requiredColumns) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = $1
          )`,
          [columnName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have correct columns on transactions table (payment-ready)', async () => {
      const requiredColumns = ['id', 'branch_id', 'brand_id', 'gateway', 'method', 'idempotency_key', 'status', 'created_at'];

      for (const columnName of requiredColumns) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = $1
          )`,
          [columnName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have correct columns on vendors table', async () => {
      const requiredColumns = ['id', 'branch_id', 'name', 'service_type', 'merchant_account_id', 'is_active', 'created_at'];

      for (const columnName of requiredColumns) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name = $1
          )`,
          [columnName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have correct columns on vendor_services table', async () => {
      const requiredColumns = ['id', 'vendor_id', 'name', 'description', 'price', 'is_active', 'created_at'];

      for (const columnName of requiredColumns) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'vendor_services' AND column_name = $1
          )`,
          [columnName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have correct columns on reservation_addons table', async () => {
      const requiredColumns = ['id', 'reservation_id', 'vendor_id', 'service_type', 'service_name', 'price', 'quantity', 'notes', 'created_at'];

      for (const columnName of requiredColumns) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'reservation_addons' AND column_name = $1
          )`,
          [columnName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have correct columns on vendor_settlements table', async () => {
      const requiredColumns = ['id', 'branch_id', 'vendor_id', 'reservation_id', 'transaction_type', 'amount', 'gateway_transaction_id', 'idempotency_key', 'status', 'created_at'];

      for (const columnName of requiredColumns) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'vendor_settlements' AND column_name = $1
          )`,
          [columnName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have correct columns on vendor_refunds table', async () => {
      const requiredColumns = ['id', 'branch_id', 'vendor_id', 'reservation_id', 'original_amount', 'refund_amount', 'refund_percentage', 'status', 'created_at'];

      for (const columnName of requiredColumns) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'vendor_refunds' AND column_name = $1
          )`,
          [columnName]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });
  });

  describe('Foreign Key Constraints', () => {
    beforeEach(async () => {
      // Run migrations before each test
      const runner = new MigrationRunner(pool);
      await runner.migrate();
    });

    it('should enforce FK constraint on tables.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';

      try {
        await pool.query(
          `INSERT INTO tables (id, branch_id, name, capacity)
           VALUES (gen_random_uuid(), $1::uuid, 'Test Table', 4)`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503'); // FK violation error code
      }
    });

    it('should enforce FK constraint on customers.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';

      try {
        await pool.query(
          `INSERT INTO customers (id, branch_id, email, name)
           VALUES (gen_random_uuid(), $1::uuid, 'test@example.com', 'Test Customer')`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK constraint on reservations.customer_id', async () => {
      // First create a valid branch and table
      const branchResult = await pool.query(
        `INSERT INTO branches (name, code) VALUES ('Test Branch', 'TEST')
         RETURNING id`
      );
      const branchId = branchResult.rows[0].id;

      const tableResult = await pool.query(
        `INSERT INTO tables (branch_id, name, capacity) VALUES ($1, 'Test Table', 4)
         RETURNING id`,
        [branchId]
      );
      const tableId = tableResult.rows[0].id;

      const invalidCustomerId = '00000000-0000-0000-0000-000000000000';

      try {
        await pool.query(
          `INSERT INTO reservations (branch_id, customer_id, table_id, reference_number, reservation_time, party_size)
           VALUES ($1, $2::uuid, $3, 'TEST-2025-1', NOW(), 2)`,
          [branchId, invalidCustomerId, tableId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK constraint on orders.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';

      try {
        await pool.query(
          `INSERT INTO orders (id, branch_id)
           VALUES (gen_random_uuid(), $1::uuid)`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK constraint on invoices.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';

      try {
        await pool.query(
          `INSERT INTO invoices (id, branch_id)
           VALUES (gen_random_uuid(), $1::uuid)`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK constraint on transactions.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';

      try {
        await pool.query(
          `INSERT INTO transactions (id, branch_id)
           VALUES (gen_random_uuid(), $1::uuid)`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK constraint on vendors.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';

      try {
        await pool.query(
          `INSERT INTO vendors (id, branch_id, name, service_type, merchant_account_id)
           VALUES (gen_random_uuid(), $1::uuid, 'Test Vendor', 'decoration', 'merchant_123')`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK constraint on vendor_services.vendor_id', async () => {
      const invalidVendorId = '00000000-0000-0000-0000-000000000000';

      try {
        await pool.query(
          `INSERT INTO vendor_services (id, vendor_id, name, price)
           VALUES (gen_random_uuid(), $1::uuid, 'Test Service', 50.00)`,
          [invalidVendorId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK constraint on reservation_addons.reservation_id', async () => {
      const invalidReservationId = '00000000-0000-0000-0000-000000000000';
      const invalidVendorId = '00000000-0000-0000-0000-000000000001';

      try {
        await pool.query(
          `INSERT INTO reservation_addons (id, reservation_id, vendor_id, service_type, service_name, price)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'decoration', 'Test', 50.00)`,
          [invalidReservationId, invalidVendorId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK constraint on vendor_settlements.vendor_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      const invalidVendorId = '00000000-0000-0000-0000-000000000001';
      const invalidReservationId = '00000000-0000-0000-0000-000000000002';

      try {
        await pool.query(
          `INSERT INTO vendor_settlements (id, branch_id, vendor_id, reservation_id, transaction_type, amount, idempotency_key)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'charge', 50.00, 'key-123')`,
          [invalidBranchId, invalidVendorId, invalidReservationId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK constraint on vendor_refunds.vendor_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      const invalidVendorId = '00000000-0000-0000-0000-000000000001';
      const invalidReservationId = '00000000-0000-0000-0000-000000000002';

      try {
        await pool.query(
          `INSERT INTO vendor_refunds (id, branch_id, vendor_id, reservation_id, original_amount, refund_amount, refund_percentage)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 50.00, 25.00, 50)`,
          [invalidBranchId, invalidVendorId, invalidReservationId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });
  });

  describe('Column Constraints', () => {
    beforeEach(async () => {
      // Run migrations before each test
      const runner = new MigrationRunner(pool);
      await runner.migrate();
    });

    it('should enforce NOT NULL on branches.booking_deposit_amt', async () => {
      try {
        await pool.query(
          `INSERT INTO branches (name, code, booking_deposit_amt)
           VALUES ('Test', 'TEST2', NULL)`
        );
        expect.fail('NOT NULL constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23502'); // NOT NULL violation error code
      }
    });

    it('should enforce NOT NULL on reservations.deposit_paid', async () => {
      // Create valid branch, customer, and table
      const branchResult = await pool.query(
        `INSERT INTO branches (name, code) VALUES ('Test Branch 2', 'TEST2')
         RETURNING id`
      );
      const branchId = branchResult.rows[0].id;

      const customerResult = await pool.query(
        `INSERT INTO customers (branch_id, email, name) VALUES ($1, 'test@example.com', 'Test')
         RETURNING id`,
        [branchId]
      );
      const customerId = customerResult.rows[0].id;

      const tableResult = await pool.query(
        `INSERT INTO tables (branch_id, name, capacity) VALUES ($1, 'Test Table', 4)
         RETURNING id`,
        [branchId]
      );
      const tableId = tableResult.rows[0].id;

      try {
        await pool.query(
          `INSERT INTO reservations (branch_id, customer_id, table_id, reference_number, reservation_time, party_size, deposit_paid)
           VALUES ($1, $2, $3, 'TEST2-2025-1', NOW(), 2, NULL)`,
          [branchId, customerId, tableId]
        );
        expect.fail('NOT NULL constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23502');
      }
    });

    it('should have default value for booking_deposit_amt', async () => {
      const result = await pool.query(
        `INSERT INTO branches (name, code) VALUES ('Test Branch 3', 'TEST3')
         RETURNING booking_deposit_amt`
      );
      expect(result.rows[0].booking_deposit_amt).toBe('50.00');
    });

    it('should have default value for deposit_paid', async () => {
      const branchResult = await pool.query(
        `INSERT INTO branches (name, code) VALUES ('Test Branch 4', 'TEST4')
         RETURNING id`
      );
      const branchId = branchResult.rows[0].id;

      const customerResult = await pool.query(
        `INSERT INTO customers (branch_id, email, name) VALUES ($1, 'test2@example.com', 'Test')
         RETURNING id`,
        [branchId]
      );
      const customerId = customerResult.rows[0].id;

      const tableResult = await pool.query(
        `INSERT INTO tables (branch_id, name, capacity) VALUES ($1, 'Test Table', 4)
         RETURNING id`,
        [branchId]
      );
      const tableId = tableResult.rows[0].id;

      const result = await pool.query(
        `INSERT INTO reservations (branch_id, customer_id, table_id, reference_number, reservation_time, party_size)
         VALUES ($1, $2, $3, 'TEST4-2025-1', NOW(), 2)
         RETURNING deposit_paid`,
        [branchId, customerId, tableId]
      );
      expect(result.rows[0].deposit_paid).toBe('0');
    });
  });

  describe('Unique Constraints', () => {
    beforeEach(async () => {
      // Run migrations before each test
      const runner = new MigrationRunner(pool);
      await runner.migrate();
    });

    it('should enforce unique constraint on branches.code', async () => {
      await pool.query(
        `INSERT INTO branches (name, code) VALUES ('Branch A', 'UNIQUE_TEST')`
      );

      try {
        await pool.query(
          `INSERT INTO branches (name, code) VALUES ('Branch B', 'UNIQUE_TEST')`
        );
        expect.fail('UNIQUE constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23505'); // UNIQUE violation error code
      }
    });

    it('should enforce unique constraint on reservations.reference_number', async () => {
      const branchResult = await pool.query(
        `INSERT INTO branches (name, code) VALUES ('Test Branch 5', 'TEST5')
         RETURNING id`
      );
      const branchId = branchResult.rows[0].id;

      const customerResult = await pool.query(
        `INSERT INTO customers (branch_id, email, name) VALUES ($1, 'test3@example.com', 'Test')
         RETURNING id`,
        [branchId]
      );
      const customerId = customerResult.rows[0].id;

      const tableResult = await pool.query(
        `INSERT INTO tables (branch_id, name, capacity) VALUES ($1, 'Test Table', 4)
         RETURNING id`,
        [branchId]
      );
      const tableId = tableResult.rows[0].id;

      await pool.query(
        `INSERT INTO reservations (branch_id, customer_id, table_id, reference_number, reservation_time, party_size)
         VALUES ($1, $2, $3, 'UNIQUE_REF', NOW(), 2)`,
        [branchId, customerId, tableId]
      );

      try {
        await pool.query(
          `INSERT INTO reservations (branch_id, customer_id, table_id, reference_number, reservation_time, party_size)
           VALUES ($1, $2, $3, 'UNIQUE_REF', NOW(), 2)`,
          [branchId, customerId, tableId]
        );
        expect.fail('UNIQUE constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23505');
      }
    });
  });
});
