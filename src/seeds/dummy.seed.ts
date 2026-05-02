import { Pool } from 'pg';
import { faker } from '@faker-js/faker';

/**
 * DummySeed generates fake development/test data using Faker.
 * Only executes when NODE_ENV is 'development' or 'test'.
 * Uses a deterministic seed so results are reproducible across runs.
 */
export async function DummySeed(pool: Pool): Promise<void> {
  // Set deterministic seed for reproducibility
  faker.seed(12345);

  // Get the default branch
  const branchResult = await pool.query(
    "SELECT id FROM branches WHERE code = '[BRANCH_CODE]' LIMIT 1"
  );

  if (branchResult.rows.length === 0) {
    console.warn('  ⚠ Default branch not found, skipping dummy seed');
    return;
  }

  const branchId = branchResult.rows[0].id;

  // Generate 50 fake customers
  console.log('  Generating 50 fake customers...');
  for (let i = 0; i < 50; i++) {
    const email = faker.internet.email();
    const name = faker.person.fullName();
    const phone = faker.phone.number();

    await pool.query(
      `INSERT INTO customers (
        branch_id, email, name, phone
      ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [branchId, email, name, phone]
    );
  }

  // Generate 100 fake reservations
  console.log('  Generating 100 fake reservations...');

  // Get some customers and tables for the reservations
  const customersResult = await pool.query(
    'SELECT id FROM customers WHERE branch_id = $1 LIMIT 100',
    [branchId]
  );

  const tablesResult = await pool.query(
    'SELECT id FROM tables WHERE branch_id = $1',
    [branchId]
  );

  if (customersResult.rows.length === 0 || tablesResult.rows.length === 0) {
    console.warn('  ⚠ No customers or tables found, skipping reservations');
    return;
  }

  const customers = customersResult.rows;
  const tables = tablesResult.rows;

  for (let i = 0; i < 100; i++) {
    const customerId = customers[i % customers.length].id;
    const tableId = tables[i % tables.length].id;
    const partySize = faker.number.int({ min: 1, max: 8 });
    const reservationTime = faker.date.future();
    const status = faker.helpers.arrayElement(['confirmed', 'seated', 'closed']);
    // Generate a unique reference number: DUMMY-{year}-{i+1}
    const year = new Date().getFullYear();
    const referenceNumber = `DUMMY-${year}-${String(i + 1).padStart(4, '0')}`;

    await pool.query(
      `INSERT INTO reservations (
        branch_id, customer_id, table_id, party_size,
        reservation_time, status, reference_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (reference_number) DO NOTHING`,
      [branchId, customerId, tableId, partySize, reservationTime, status, referenceNumber]
    );
  }

  console.log('  ✓ Dummy seed data generated');
}
