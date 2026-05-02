import { Pool, PoolClient } from 'pg';
import { logger } from './logger.js';
import { MigrationRunner } from '../migrations/runner.js';

let pool: Pool | null = null;

/**
 * Initialize PostgreSQL connection pool and run migrations
 */
export async function initializeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle client');
  });

  logger.info('PostgreSQL connection pool initialized');

  // Run migrations
  try {
    logger.info('Running database migrations...');
    const runner = new MigrationRunner(pool);
    await runner.migrate();
    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error({ error }, 'Database migration failed');
    throw error;
  }

  return pool;
}

/**
 * Get the database pool
 */
export function getDatabase(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

/**
 * Execute a query
 */
export async function query(text: string, params?: any[]) {
  const client = await getDatabase().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/**
 * Execute a transaction
 */
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the database pool
 */
export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL connection pool closed');
  }
}

export default { initializeDatabase, getDatabase, query, transaction, closeDatabase };
