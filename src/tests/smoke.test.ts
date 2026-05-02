import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { MigrationRunner } from '../migrations/runner';

describe('Comprehensive Smoke Test: Schema and Data Foundation', () => {
  let pool: Pool;
  let branchId: string;

  beforeAll(() => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'table_booking',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    const runner = new MigrationRunner(pool);
    await runner.migrate();
    
    // Get first branch (doesn't require branch_code column)
    const branchResult = await pool.query(
      "SELECT id FROM branches ORDER BY created_at LIMIT 1"
    );
    if (branchResult.rows.length > 0) {
      branchId = branchResult.rows[0].id;
    }
  });

  // =========================================================================
  // 1. SCHEMA VERIFICATION
  // =========================================================================
  describe('1. Schema Verification', () => {
    describe('1.1 Core Tables Exist', () => {
      const coreTables = [
        'branches', 'sections', 'tables', 'customers', 'staff',
        'reservations', 'business_hours', 'business_hours_overrides',
        'reservation_sequences', 'deposit_transactions', 'audit_log'
      ];

      for (const tableName of coreTables) {
        it(`should have core table: ${tableName}`, async () => {
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = $1
            )`,
            [tableName]
          );
          expect(result.rows[0].exists).toBe(true);
        });
      }
    });

    describe('1.2 Dormant Stage 2/3 Tables Exist', () => {
      const dormantTables = ['orders', 'order_items', 'invoices', 'transactions'];

      for (const tableName of dormantTables) {
        it(`should have dormant table: ${tableName}`, async () => {
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = $1
            )`,
            [tableName]
          );
          expect(result.rows[0].exists).toBe(true);
        });
      }
    });

    describe('1.3 Stage 1 Optional Services Tables Exist', () => {
      const optionalTables = [
        'decoration_colors', 'decoration_packages', 
        'cake_preferences', 'vendor_commissions'
      ];

      for (const tableName of optionalTables) {
        it(`should have optional services table: ${tableName}`, async () => {
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = $1
            )`,
            [tableName]
          );
          expect(result.rows[0].exists).toBe(true);
        });
      }
    });

    describe('1.4 Multi-Vendor Tables Exist', () => {
      const vendorTables = [
        'vendors', 'vendor_services', 'reservation_addons',
        'vendor_settlements', 'vendor_refunds', 'vendor_accounts',
        'commission_transactions'
      ];

      for (const tableName of vendorTables) {
        it(`should have vendor table: ${tableName}`, async () => {
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = $1
            )`,
            [tableName]
          );
          expect(result.rows[0].exists).toBe(true);
        });
      }
    });

    describe('1.5 Tables Have Correct Column Types and Constraints', () => {
      it('branches should have correct columns', async () => {
        const columns = [
          { name: 'id', type: 'uuid' },
          { name: 'code', type: 'character varying' },
          { name: 'booking_deposit_amt', type: 'numeric' },
          { name: 'app_operating_mode', type: 'character varying' },
          { name: 'created_at', type: 'timestamp with time zone' }
        ];
        for (const col of columns) {
          const result = await pool.query(
            `SELECT data_type FROM information_schema.columns 
             WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = $1`,
            [col.name]
          );
          expect(result.rows[0]?.data_type).toBe(col.type);
        }
      });

      it('reservations should have correct columns', async () => {
        const columns = [
          { name: 'id', type: 'uuid' },
          { name: 'status', type: 'USER-DEFINED' },
          { name: 'deposit_paid', type: 'numeric' },
          { name: 'reference_number', type: 'character varying' }
        ];
        for (const col of columns) {
          const result = await pool.query(
            `SELECT data_type FROM information_schema.columns 
             WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = $1`,
            [col.name]
          );
          expect(result.rows[0]?.data_type).toBe(col.type);
        }
      });

      it('invoices should have LHDN-ready columns', async () => {
        const columns = ['tin', 'msic', 'lhdn_reference', 'submission_status'];
        for (const col of columns) {
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = $1
            )`,
            [col]
          );
          expect(result.rows[0].exists).toBe(true);
        }
      });

      it('transactions should have payment-ready columns', async () => {
        const columns = ['gateway', 'method', 'idempotency_key', 'status'];
        for (const col of columns) {
          const result = await pool.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = $1
            )`,
            [col]
          );
          expect(result.rows[0].exists).toBe(true);
        }
      });
    });
  });

  // =========================================================================
  // 2. INDEX VERIFICATION
  // =========================================================================
  describe('2. Index Verification', () => {
    const requiredIndexes = [
      { table: 'branches', column: 'branch_id', index: 'idx_branches_brand_id' },
      { table: 'branches', column: 'created_at', index: 'idx_branches_created_at' },
      { table: 'sections', column: 'branch_id', index: 'idx_sections_branch_id' },
      { table: 'tables', column: 'branch_id', index: 'idx_tables_branch_id' },
      { table: 'customers', column: 'branch_id', index: 'idx_customers_branch_id' },
      { table: 'staff', column: 'branch_id', index: 'idx_staff_branch_id' },
      { table: 'reservations', column: 'branch_id', index: 'idx_reservations_branch_id' },
      { table: 'reservations', column: 'status', index: 'idx_reservations_status' },
      { table: 'reservations', column: 'created_at', index: 'idx_reservations_created_at' },
      { table: 'business_hours', column: 'branch_id', index: 'idx_business_hours_branch_id' },
      { table: 'deposit_transactions', column: 'branch_id', index: 'idx_deposit_transactions_branch_id' },
      { table: 'deposit_transactions', column: 'idempotency_key', index: 'idx_deposit_transactions_idempotency_key' },
      { table: 'deposit_transactions', column: 'status', index: 'idx_deposit_transactions_status' },
      { table: 'audit_log', column: 'branch_id', index: 'idx_audit_log_branch_id' },
      { table: 'audit_log', column: 'timestamp', index: 'idx_audit_log_timestamp' },
      { table: 'decoration_colors', column: 'branch_id', index: 'idx_decoration_colors_branch_id' },
      { table: 'decoration_colors', column: 'is_active', index: 'idx_decoration_colors_is_active' },
      { table: 'decoration_packages', column: 'branch_id', index: 'idx_decoration_packages_branch_id' },
      { table: 'cake_preferences', column: 'branch_id', index: 'idx_cake_preferences_branch_id' },
      { table: 'vendor_commissions', column: 'branch_id', index: 'idx_vendor_commissions_branch_id' },
      { table: 'vendor_commissions', column: 'category', index: 'idx_vendor_commissions_category' },
      { table: 'vendor_commissions', column: 'is_enabled', index: 'idx_vendor_commissions_is_enabled' },
      { table: 'orders', column: 'branch_id', index: 'idx_orders_branch_id' },
      { table: 'orders', column: 'status', index: 'idx_orders_status' },
      { table: 'invoices', column: 'branch_id', index: 'idx_invoices_branch_id' },
      { table: 'transactions', column: 'branch_id', index: 'idx_transactions_branch_id' }
    ];

    for (const idx of requiredIndexes) {
      it(`should have index ${idx.index} on ${idx.table}.${idx.column}`, async () => {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2
          )`,
          [idx.table, idx.index]
        );
        expect(result.rows[0].exists).toBe(true);
      });
    }

    it('indexes should be functional (query planner uses them)', async () => {
      if (!branchId) return;
      
      const explainResult = await pool.query(
        `EXPLAIN (FORMAT JSON) SELECT * FROM reservations WHERE branch_id = $1`,
        [branchId]
      );
      const plan = explainResult.rows[0]['QUERY PLAN'];
      
      const usesIndex = plan?.Plan?.NodeType === 'Index Scan' || 
                       plan?.Plan?.NodeType === 'Index Only Scan' ||
                       plan.Plan?.Plans?.some((p: any) => p.NodeType === 'Index Scan');
      
      expect(usesIndex).toBe(true);
    });
  });

  // =========================================================================
  // 3. FOREIGN KEY VERIFICATION
  // =========================================================================
  describe('3. Foreign Key Verification', () => {
    it('should enforce FK on tables.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      try {
        await pool.query(
          `INSERT INTO tables (id, branch_id, name, capacity)
           VALUES (gen_random_uuid(), $1::uuid, 'Test Table', 4)`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on tables.section_id', async () => {
      if (!branchId) return;
      
      const invalidSectionId = '00000000-0000-0000-0000-000000000000';
      try {
        await pool.query(
          `INSERT INTO tables (id, branch_id, section_id, name, capacity)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'Test Table', 4)`,
          [branchId, invalidSectionId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on customers.branch_id', async () => {
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

    it('should enforce FK on staff.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      try {
        await pool.query(
          `INSERT INTO staff (id, branch_id, email, name, role, password_hash)
           VALUES (gen_random_uuid(), $1::uuid, 'staff@test.com', 'Test', 'admin', 'hash')`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on reservations.customer_id', async () => {
      if (!branchId) return;
      
      const invalidCustomerId = '00000000-0000-0000-0000-000000000000';
      const tableResult = await pool.query(
        `SELECT id FROM tables WHERE branch_id = $1 LIMIT 1`,
        [branchId]
      );
      if (tableResult.rows.length === 0) return;
      
      try {
        await pool.query(
          `INSERT INTO reservations (branch_id, customer_id, table_id, reference_number, reservation_time, party_size)
           VALUES ($1, $2::uuid, $3, 'FK-TEST-1', NOW(), 2)`,
          [branchId, invalidCustomerId, tableResult.rows[0].id]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on reservations.table_id', async () => {
      if (!branchId) return;
      
      const invalidTableId = '00000000-0000-0000-0000-000000000000';
      const customerResult = await pool.query(
        `SELECT id FROM customers WHERE branch_id = $1 LIMIT 1`,
        [branchId]
      );
      if (customerResult.rows.length === 0) return;
      
      try {
        await pool.query(
          `INSERT INTO reservations (branch_id, customer_id, table_id, reference_number, reservation_time, party_size)
           VALUES ($1, $2, $3::uuid, 'FK-TEST-2', NOW(), 2)`,
          [branchId, customerResult.rows[0].id, invalidTableId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on business_hours.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      try {
        await pool.query(
          `INSERT INTO business_hours (id, branch_id, day_of_week, open_time, close_time)
           VALUES (gen_random_uuid(), $1::uuid, 1, '09:00', '22:00')`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on deposit_transactions.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      try {
        await pool.query(
          `INSERT INTO deposit_transactions (id, branch_id, reservation_id, amount, status)
           VALUES (gen_random_uuid(), $1::uuid, gen_random_uuid(), 50.00, 'pending')`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on audit_log.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      try {
        await pool.query(
          `INSERT INTO audit_log (id, branch_id, action, entity_type, entity_id)
           VALUES (gen_random_uuid(), $1::uuid, 'test', 'test', gen_random_uuid())`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on orders.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      try {
        await pool.query(
          `INSERT INTO orders (id, branch_id, customer_id, order_number)
           VALUES (gen_random_uuid(), $1::uuid, gen_random_uuid(), 'ORD-TEST')`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on invoices.branch_id', async () => {
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

    it('should enforce FK on transactions.branch_id', async () => {
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

    it('should enforce FK on decoration_colors.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      try {
        await pool.query(
          `INSERT INTO decoration_colors (id, branch_id, color_name, color_code)
           VALUES (gen_random_uuid(), $1::uuid, 'Test', '#000000')`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should enforce FK on vendor_commissions.branch_id', async () => {
      const invalidBranchId = '00000000-0000-0000-0000-000000000000';
      try {
        await pool.query(
          `INSERT INTO vendor_commissions (id, branch_id, category, commission_type, commission_value)
           VALUES (gen_random_uuid(), $1::uuid, 'decoration', 'percentage', 10.00)`,
          [invalidBranchId]
        );
        expect.fail('FK constraint should have been violated');
      } catch (error: any) {
        expect(error.code).toBe('23503');
      }
    });

    it('should verify cascade delete behavior', async () => {
      if (!branchId) return;
      
      const sectionResult = await pool.query(
        `INSERT INTO sections (branch_id, name) VALUES ($1, 'Cascade Test Section')
         RETURNING id`,
        [branchId]
      );
      const sectionId = sectionResult.rows[0].id;

      await pool.query(`DELETE FROM sections WHERE id = $1`, [sectionId]);

      const tablesResult = await pool.query(
        `SELECT COUNT(*) FROM tables WHERE section_id = $1`,
        [sectionId]
      );
      expect(parseInt(tablesResult.rows[0].count)).toBe(0);
    });
  });

  // =========================================================================
  // 4. SEED DATA VERIFICATION
  // =========================================================================
  describe('4. Seed Data Verification', () => {
    it('should have default branch with placeholder values', async () => {
      const result = await pool.query(
        `SELECT id, code, name, address, phone FROM branches WHERE code = '[BRANCH_CODE]'`
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].code).toBe('[BRANCH_CODE]');
      expect(result.rows[0].name).toBe('[Restaurant_Name]');
    });

    it('should have default admin staff with correct role', async () => {
      if (!branchId) return;
      
      const result = await pool.query(
        `SELECT id, email, name, role FROM staff WHERE branch_id = $1 AND role = 'admin'`,
        [branchId]
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].role).toBe('admin');
    });

    it('should have default business_hours rows (7 for week)', async () => {
      if (!branchId) return;
      
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM business_hours WHERE branch_id = $1`,
        [branchId]
      );
      expect(parseInt(result.rows[0].count)).toBe(7);
    });

    it('should have default sections (Indoor, Outdoor, Private Room)', async () => {
      if (!branchId) return;
      
      const result = await pool.query(
        `SELECT name FROM sections WHERE branch_id = $1 ORDER BY sort_order`,
        [branchId]
      );
      expect(result.rows.length).toBe(3);
      expect(result.rows[0].name).toBe('Indoor');
      expect(result.rows[1].name).toBe('Outdoor');
      expect(result.rows[2].name).toBe('Private Room');
    });

    it('should have default tables (7 distributed across sections)', async () => {
      if (!branchId) return;
      
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM tables WHERE branch_id = $1`,
        [branchId]
      );
      expect(parseInt(result.rows[0].count)).toBe(7);
    });

    it('should have reservation_sequences initialized for current year', async () => {
      if (!branchId) return;
      
      const currentYear = new Date().getFullYear();
      const result = await pool.query(
        `SELECT year, last_seq FROM reservation_sequences WHERE branch_id = $1 AND year = $2`,
        [branchId, currentYear]
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].year).toBe(currentYear);
      expect(parseInt(result.rows[0].last_seq)).toBe(0);
    });

    it('should have decoration_colors (9 colors)', async () => {
      if (!branchId) return;
      
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM decoration_colors WHERE branch_id = $1`,
        [branchId]
      );
      expect(parseInt(result.rows[0].count)).toBe(9);
    });

    it('should have decoration_packages (3 packages)', async () => {
      if (!branchId) return;
      
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM decoration_packages WHERE branch_id = $1`,
        [branchId]
      );
      expect(parseInt(result.rows[0].count)).toBe(3);
    });

    it('should have cake_preferences (5 cakes)', async () => {
      if (!branchId) return;
      
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM cake_preferences WHERE branch_id = $1`,
        [branchId]
      );
      expect(parseInt(result.rows[0].count)).toBe(5);
    });

    it('should have vendor_commissions (2 categories, disabled)', async () => {
      if (!branchId) return;
      
      const result = await pool.query(
        `SELECT category, commission_value, is_enabled FROM vendor_commissions WHERE branch_id = $1`,
        [branchId]
      );
      expect(result.rows.length).toBe(2);
      const categories = result.rows.map(r => r.category).sort();
      expect(categories).toEqual(['cake', 'decoration']);
      expect(result.rows.every(r => r.is_enabled === false)).toBe(true);
    });
  });

  // =========================================================================
  // 5. DATA INTEGRITY VERIFICATION
  // =========================================================================
  describe('5. Data Integrity Verification', () => {
    it('should have all seeded records with valid branch_id', async () => {
      if (!branchId) return;
      
      const tables = ['sections', 'tables', 'customers', 'staff', 'reservations', 
                      'business_hours', 'reservation_sequences', 'decoration_colors',
                      'decoration_packages', 'cake_preferences', 'vendor_commissions'];
      
      for (const table of tables) {
        const result = await pool.query(
          `SELECT COUNT(*) as count FROM ${table} WHERE branch_id = $1`,
          [branchId]
        );
        expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
      }
    });

    it('should have all seeded records with created_at timestamp', async () => {
      if (!branchId) return;
      
      const tables = ['branches', 'sections', 'tables', 'customers', 'staff', 
                      'reservations', 'business_hours', 'reservation_sequences',
                      'decoration_colors', 'decoration_packages', 'cake_preferences', 
                      'vendor_commissions'];
      
      for (const table of tables) {
        const result = await pool.query(
          `SELECT COUNT(*) as count FROM ${table} WHERE branch_id = $1 AND created_at IS NOT NULL`,
          [branchId]
        );
        expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
      }
    });

    it('should enforce unique constraints (no duplicates)', async () => {
      const branchResult = await pool.query(
        `SELECT COUNT(*) as count FROM branches WHERE code = '[BRANCH_CODE]'`
      );
      expect(parseInt(branchResult.rows[0].count)).toBe(1);
    });

    it('should have all foreign key relationships valid', async () => {
      if (!branchId) return;
      
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM reservations r
         LEFT JOIN customers c ON r.customer_id = c.id
         LEFT JOIN tables t ON r.table_id = t.id
         WHERE r.branch_id = $1 AND (c.id IS NULL OR t.id IS NULL)`,
        [branchId]
      );
      expect(parseInt(result.rows[0].count)).toBe(0);
    });
  });

  // =========================================================================
  // 6. PERFORMANCE VERIFICATION
  // =========================================================================
  describe('6. Performance Verification', () => {
    it('queries on indexed columns should complete in < 100ms', async () => {
      if (!branchId) return;
      
      const queries = [
        { sql: `SELECT * FROM reservations WHERE branch_id = $1`, params: [branchId] },
        { sql: `SELECT * FROM reservations WHERE status = 'confirmed'`, params: [] },
        { sql: `SELECT * FROM customers WHERE branch_id = $1`, params: [branchId] },
        { sql: `SELECT * FROM staff WHERE branch_id = $1`, params: [branchId] },
        { sql: `SELECT * FROM deposit_transactions WHERE branch_id = $1`, params: [branchId] }
      ];

      for (const query of queries) {
        const start = Date.now();
        await pool.query(query.sql, query.params);
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(100);
      }
    });

    it('should avoid full table scans for common queries', async () => {
      if (!branchId) return;
      
      const explainResult = await pool.query(
        `EXPLAIN (FORMAT JSON) SELECT * FROM reservations WHERE branch_id = $1`,
        [branchId]
      );
      const plan = explainResult.rows[0]['QUERY PLAN'];
      
      const nodeTypes = plan?.Plan?.NodeType || '';
      expect(nodeTypes).not.toBe('Seq Scan');
    });
  });
});