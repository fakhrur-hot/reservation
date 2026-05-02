import { Pool } from 'pg';
import { ROLES } from './data/roles.js';
import { DEFAULT_CURRENCY } from './data/currencies.js';
import { OPERATING_MODES } from './data/operating-modes.js';

/**
 * SystemSeed inserts default roles, operating modes, and currency defaults.
 * This seed is idempotent and can be run multiple times without creating duplicates.
 */
export async function SystemSeed(pool: Pool): Promise<void> {
  // Insert default roles
  for (const role of ROLES) {
    await pool.query(
      `INSERT INTO roles (name) VALUES ($1)
       ON CONFLICT (name) DO NOTHING`,
      [role]
    );
  }

  // Insert default operating modes
  for (const mode of OPERATING_MODES) {
    await pool.query(
      `INSERT INTO operating_modes (name) VALUES ($1)
       ON CONFLICT (name) DO NOTHING`,
      [mode]
    );
  }

  // Insert default currency
  await pool.query(
    `INSERT INTO currencies (code, name) VALUES ($1, $2)
     ON CONFLICT (code) DO NOTHING`,
    [DEFAULT_CURRENCY, 'Malaysian Ringgit']
  );
}
