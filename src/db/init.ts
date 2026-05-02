import { Pool } from 'pg';
import { MigrationRunner } from '../migrations/runner';
import { seedDefaultAdmin, checkPlaceholders } from '../seeds/default-admin';
import { verifySeedData } from '../seeds/verify-seed-data';

/**
 * Initialize the database: run migrations, seed default data, and check for placeholders.
 */
export async function initializeDatabase(pool: Pool): Promise<void> {
  console.log('Initializing database...');

  try {
    // Run all migrations
    const runner = new MigrationRunner(pool);
    await runner.migrate();

    // Verify seed data was inserted correctly
    await verifySeedData(pool);

    // Seed default admin account
    await seedDefaultAdmin(pool);

    // Check for placeholder values
    await checkPlaceholders(pool);

    console.log('✓ Database initialization complete');
  } catch (error) {
    console.error('✗ Database initialization failed:', error);
    throw error;
  }
}

/**
 * Create a database pool with the provided configuration.
 */
export function createDatabasePool(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}
