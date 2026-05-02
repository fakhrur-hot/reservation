import { Pool } from 'pg';

/**
 * Verify that all seed data was inserted correctly and log summary.
 * Called after migrations to validate the seed data migration (015_seed_default_data.sql).
 */
export async function verifySeedData(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('VERIFYING SEED DATA INTEGRITY');
    console.log('════════════════════════════════════════════════════════════\n');

    // 1. Verify default branch exists
    const branchResult = await client.query(
      "SELECT id, code, name FROM branches WHERE code = '[BRANCH_CODE]' LIMIT 1"
    );

    if (branchResult.rows.length === 0) {
      console.error('✗ ERROR: Default branch not found');
      return;
    }

    const branchId = branchResult.rows[0].id;
    console.log(`✓ Default branch exists: ${branchId}`);
    console.log(`  Branch Code: ${branchResult.rows[0].code}`);
    console.log(`  Branch Name: ${branchResult.rows[0].name}`);

    // 2. Verify default admin staff exists
    const staffResult = await client.query(
      "SELECT id, email, name, role FROM staff WHERE branch_id = $1 AND role = 'admin' LIMIT 1",
      [branchId]
    );

    if (staffResult.rows.length === 0) {
      console.error('✗ ERROR: Default admin staff not found');
      return;
    }

    console.log(`✓ Default admin staff exists: ${staffResult.rows[0].id}`);
    console.log(`  Email: ${staffResult.rows[0].email}`);
    console.log(`  Name: ${staffResult.rows[0].name}`);

    // 3. Verify business hours (7 rows)
    const businessHoursResult = await client.query(
      'SELECT COUNT(*) as count FROM business_hours WHERE branch_id = $1',
      [branchId]
    );

    const businessHoursCount = businessHoursResult.rows[0].count;
    console.log(`✓ Business hours: ${businessHoursCount} rows`);

    if (businessHoursCount !== 7) {
      console.warn(`  ⚠ Expected 7 business hours rows, found ${businessHoursCount}`);
    }

    // 4. Verify sections
    const sectionsResult = await client.query(
      'SELECT id, name FROM sections WHERE branch_id = $1 ORDER BY sort_order',
      [branchId]
    );

    console.log(`✓ Sections: ${sectionsResult.rows.length} rows`);
    sectionsResult.rows.forEach((row) => {
      console.log(`  - ${row.name}`);
    });

    // 5. Verify tables
    const tablesResult = await client.query(
      'SELECT id, name, capacity FROM tables WHERE branch_id = $1 ORDER BY name',
      [branchId]
    );

    console.log(`✓ Tables: ${tablesResult.rows.length} rows`);
    tablesResult.rows.forEach((row) => {
      console.log(`  - ${row.name} (${row.capacity} seats)`);
    });

    // 6. Verify reservation sequences
    const sequencesResult = await client.query(
      'SELECT id, year, last_seq FROM reservation_sequences WHERE branch_id = $1',
      [branchId]
    );

    console.log(`✓ Reservation sequences: ${sequencesResult.rows.length} rows`);
    sequencesResult.rows.forEach((row) => {
      console.log(`  - Year ${row.year}: last_seq = ${row.last_seq}`);
    });

    // 7. Verify decoration colors (9 rows)
    const colorsResult = await client.query(
      'SELECT id, color_name, color_code FROM decoration_colors WHERE branch_id = $1 ORDER BY sort_order',
      [branchId]
    );

    console.log(`✓ Decoration colors: ${colorsResult.rows.length} rows`);
    colorsResult.rows.forEach((row) => {
      console.log(`  - ${row.color_name} (${row.color_code})`);
    });

    // 8. Verify decoration packages (3 rows)
    const packagesResult = await client.query(
      'SELECT id, package_name, price FROM decoration_packages WHERE branch_id = $1',
      [branchId]
    );

    console.log(`✓ Decoration packages: ${packagesResult.rows.length} rows`);
    packagesResult.rows.forEach((row) => {
      console.log(`  - ${row.package_name} (RM ${row.price})`);
    });

    // 9. Verify cake preferences (5 rows)
    const cakesResult = await client.query(
      'SELECT id, cake_name FROM cake_preferences WHERE branch_id = $1 ORDER BY sort_order',
      [branchId]
    );

    console.log(`✓ Cake preferences: ${cakesResult.rows.length} rows`);
    cakesResult.rows.forEach((row) => {
      console.log(`  - ${row.cake_name}`);
    });

    // 10. Verify vendor commissions (2 rows)
    const commissionsResult = await client.query(
      'SELECT id, category, commission_type, commission_value, is_enabled FROM vendor_commissions WHERE branch_id = $1',
      [branchId]
    );

    console.log(`✓ Vendor commissions: ${commissionsResult.rows.length} rows`);
    commissionsResult.rows.forEach((row) => {
      console.log(
        `  - ${row.category}: ${row.commission_value}% (${row.is_enabled ? 'enabled' : 'disabled'})`
      );
    });

    // 11. Check for placeholder values
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('PLACEHOLDER VALUES CHECK');
    console.log('════════════════════════════════════════════════════════════\n');

    const placeholderResult = await client.query(
      `SELECT 
        COUNT(CASE WHEN code LIKE '%[%]%' THEN 1 END) as code_placeholders,
        COUNT(CASE WHEN name LIKE '%[%]%' THEN 1 END) as name_placeholders,
        COUNT(CASE WHEN address LIKE '%[%]%' THEN 1 END) as address_placeholders,
        COUNT(CASE WHEN phone LIKE '%[%]%' THEN 1 END) as phone_placeholders
      FROM branches WHERE id = $1`,
      [branchId]
    );

    const placeholders = placeholderResult.rows[0];
    const totalPlaceholders =
      placeholders.code_placeholders +
      placeholders.name_placeholders +
      placeholders.address_placeholders +
      placeholders.phone_placeholders;

    if (totalPlaceholders > 0) {
      console.warn('⚠ WARNING: Placeholder values detected in branch record:');
      if (placeholders.code_placeholders > 0)
        console.warn('  - Branch Code: [BRANCH_CODE]');
      if (placeholders.name_placeholders > 0)
        console.warn('  - Branch Name: [Restaurant_Name]');
      if (placeholders.address_placeholders > 0)
        console.warn('  - Address: [Restaurant_Address]');
      if (placeholders.phone_placeholders > 0)
        console.warn('  - Phone: [Restaurant_Phone]');
      console.warn('\n⚠ Update these values before going live.\n');
    } else {
      console.log('✓ No placeholder values detected\n');
    }

    // 12. Check staff placeholders
    const staffPlaceholderResult = await client.query(
      `SELECT 
        COUNT(CASE WHEN email LIKE '%[%]%' THEN 1 END) as email_placeholders,
        COUNT(CASE WHEN name LIKE '%[%]%' THEN 1 END) as name_placeholders
      FROM staff WHERE branch_id = $1 AND role = 'admin'`,
      [branchId]
    );

    const staffPlaceholders = staffPlaceholderResult.rows[0];
    const totalStaffPlaceholders =
      staffPlaceholders.email_placeholders + staffPlaceholders.name_placeholders;

    if (totalStaffPlaceholders > 0) {
      console.warn('⚠ WARNING: Placeholder values detected in admin staff record:');
      if (staffPlaceholders.email_placeholders > 0)
        console.warn('  - Email: [Admin_Email]');
      if (staffPlaceholders.name_placeholders > 0)
        console.warn('  - Name: [Admin_Name]');
      console.warn('\n⚠ Update these values before going live.\n');
    }

    // Final summary
    console.log('════════════════════════════════════════════════════════════');
    console.log('SEED DATA VERIFICATION COMPLETE');
    console.log('════════════════════════════════════════════════════════════\n');

    console.log('Summary:');
    console.log(`  ✓ Sections: ${sectionsResult.rows.length}`);
    console.log(`  ✓ Tables: ${tablesResult.rows.length}`);
    console.log(`  ✓ Decoration Colors: ${colorsResult.rows.length}`);
    console.log(`  ✓ Decoration Packages: ${packagesResult.rows.length}`);
    console.log(`  ✓ Cake Preferences: ${cakesResult.rows.length}`);
    console.log(`  ✓ Vendor Commissions: ${commissionsResult.rows.length}`);
    console.log(`  ✓ Business Hours: ${businessHoursCount}`);
    console.log('\n');
  } catch (error) {
    console.error('✗ Error verifying seed data:', error);
    throw error;
  } finally {
    client.release();
  }
}
