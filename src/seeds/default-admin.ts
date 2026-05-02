import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

/**
 * Seed script for default admin account.
 * Generates a secure BCrypt hash for a temporary password and inserts the admin record.
 * The temporary password is printed to stdout once for the operator to use on first login.
 */
export async function seedDefaultAdmin(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    // Check if default branch exists
    const branchResult = await client.query(
      "SELECT id FROM branches WHERE code = '[BRANCH_CODE]' LIMIT 1"
    );

    if (branchResult.rows.length === 0) {
      console.warn('⚠  WARNING: Default branch not found. Skipping admin seed.');
      return;
    }

    const branchId = branchResult.rows[0].id;

    // Check if admin already exists
    const adminResult = await client.query(
      "SELECT id FROM staff WHERE branch_id = $1 AND role = 'admin' LIMIT 1",
      [branchId]
    );

    if (adminResult.rows.length > 0) {
      console.log('✓ Default admin account already exists');
      return;
    }

    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(2, 10).toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Insert default admin account
    await client.query(
      `INSERT INTO staff (branch_id, email, password_hash, name, role, is_active)
       VALUES ($1, '[Admin_Email]', $2, '[Admin_Name]', 'admin', true)`,
      [branchId, passwordHash]
    );

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         DEFAULT ADMIN ACCOUNT CREATED                      ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║ Email:    [Admin_Email]`);
    console.log(`║ Password: ${tempPassword}`);
    console.log('║                                                            ║');
    console.log('║ ⚠  IMPORTANT: Change this password immediately after       ║');
    console.log('║    your first login. This temporary password is printed    ║');
    console.log('║    here only once.                                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  } finally {
    client.release();
  }
}

/**
 * Check for placeholder values in the database and warn if any are found.
 */
export async function checkPlaceholders(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT COUNT(*) as count FROM branches 
       WHERE name LIKE '%[%]%' OR code LIKE '%[%]%' OR address LIKE '%[%]%' OR phone LIKE '%[%]%'`
    );

    if (result.rows[0].count > 0) {
      console.warn('\n⚠  WARNING: Default seed placeholders detected.');
      console.warn('   Update branch and admin details before going live.\n');
    }
  } finally {
    client.release();
  }
}
