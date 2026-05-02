import 'dotenv/config';
import { Pool, QueryResultRow } from 'pg';

let _pool: Pool | null = null;

/**
 * Returns a shared Pool connected via DATABASE_URL from process.env.
 */
export async function getTestPool(): Promise<Pool> {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Ensure .env is present or the variable is exported.');
  }

  _pool = new Pool({ connectionString });
  return _pool;
}

/**
 * Returns true if the given table exists in the public schema.
 */
export async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );
  return result.rows[0].exists;
}

/**
 * Returns true if the given column exists on the table in the public schema.
 */
export async function columnExists(
  pool: Pool,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [tableName, columnName],
  );
  return result.rows[0].exists;
}

/**
 * Returns the number of rows in the given table, with an optional WHERE clause.
 * The `where` parameter should be a raw SQL fragment (e.g. "status = 'active'").
 */
export async function countRows(
  pool: Pool,
  tableName: string,
  where?: string,
): Promise<number> {
  const sql = where
    ? `SELECT COUNT(*) AS count FROM ${tableName} WHERE ${where}`
    : `SELECT COUNT(*) AS count FROM ${tableName}`;

  const result = await pool.query<{ count: string }>(sql);
  return parseInt(result.rows[0].count, 10);
}

/**
 * Runs the given SQL and returns the first row cast to T, or null if no rows.
 */
export async function queryOne<T extends QueryResultRow>(
  pool: Pool,
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await pool.query<T>(sql, params as unknown[]);
  return result.rows.length > 0 ? result.rows[0] : null;
}
