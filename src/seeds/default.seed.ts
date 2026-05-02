import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { DEFAULT_BRANCH } from './data/default-branch.js';

/**
 * DefaultSeed inserts placeholder branch and admin staff records.
 * This seed is idempotent - running it multiple times creates exactly one branch and one admin.
 */
export async function DefaultSeed(pool: Pool): Promise<void> {
  // Hash the temporary admin password with bcrypt cost factor 12
  const tempPassword = 'TempPassword123!';
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  // Insert default branch (idempotent via ON CONFLICT)
  const branchResult = await pool.query(
    `INSERT INTO branches (
      name, code, address, phone,
      booking_deposit_amt, app_operating_mode,
      no_show_grace_min, mod_cutoff_hours,
      timezone, currency, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (code) DO NOTHING
     RETURNING id`,
    [
      DEFAULT_BRANCH.name,
      DEFAULT_BRANCH.code,
      DEFAULT_BRANCH.address,
      DEFAULT_BRANCH.phone,
      50.00,
      DEFAULT_BRANCH.operatingMode,
      15,
      2,
      DEFAULT_BRANCH.timezone,
      DEFAULT_BRANCH.currency,
      true,
    ]
  );

  // Get the branch ID (either newly created or existing)
  let branchId: string;
  if (branchResult.rows.length > 0) {
    branchId = branchResult.rows[0].id;
  } else {
    const existingBranch = await pool.query(
      'SELECT id FROM branches WHERE code = $1',
      [DEFAULT_BRANCH.code]
    );
    branchId = existingBranch.rows[0].id;
  }

  // Insert default admin staff (idempotent via ON CONFLICT on email)
  await pool.query(
    `INSERT INTO staff (
      branch_id, email, name, role, password_hash, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING`,
    [
      branchId,
      DEFAULT_BRANCH.adminEmail,
      DEFAULT_BRANCH.adminName,
      'admin',
      passwordHash,
      true,
    ]
  );
}
