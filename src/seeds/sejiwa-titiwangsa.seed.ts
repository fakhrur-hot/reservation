import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

/**
 * SEJIWA Titiwangsa Seed
 *
 * Initializes SEJIWA Titiwangsa cafe with:
 * - Sections (dining areas)
 * - Tables with proper capacity and features
 * - Sample customers
 * - Manager and waiter staff accounts
 *
 * This seed is idempotent and only runs once on fresh database.
 */

export async function SEJIWATitiwangsaSeed(pool: Pool): Promise<void> {
  try {
    // Get SEJIWA Titiwangsa branch ID
    const branchResult = await pool.query(
      `SELECT id FROM branches WHERE code = 'SEJWKL01'`
    );

    if (branchResult.rows.length === 0) {
      console.warn('  ⚠ SEJIWA Titiwangsa branch not found — skipping seeding');
      return;
    }

    const branchId = branchResult.rows[0].id;
    console.log(`  📍 SEJIWA Titiwangsa (${branchId}): Seeding sections and tables...`);

    // ─── Sections (Dining Areas) ───────────────────────────────────────────

    const sections = [
      {
        id: uuidv4(),
        name: 'Main Hall',
        description: 'Spacious main dining area with open layout',
        capacity: 60,
        order: 1,
      },
      {
        id: uuidv4(),
        name: 'Private Room',
        description: 'Intimate private dining room for special occasions',
        capacity: 30,
        order: 2,
      },
      {
        id: uuidv4(),
        name: 'Garden Lounge',
        description: 'Open-air garden seating with outdoor ambiance',
        capacity: 40,
        order: 3,
      },
      {
        id: uuidv4(),
        name: 'VIP Booth',
        description: 'Premium booth seating for VIP guests',
        capacity: 12,
        order: 4,
      },
      {
        id: uuidv4(),
        name: 'Lounge Bar',
        description: 'Casual lounge seating with bar counter',
        capacity: 25,
        order: 5,
      },
    ];

    // Insert sections (idempotent)
    for (const section of sections) {
      await pool.query(
        `INSERT INTO sections (id, branch_id, name, description, capacity, display_order, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
         ON CONFLICT DO NOTHING`,
        [section.id, branchId, section.name, section.description, section.capacity, section.order]
      );
    }

    console.log(`  ✓ Created ${sections.length} sections`);

    // ─── Tables ────────────────────────────────────────────────────────────

    const sectionMap = new Map(sections.map(s => [s.name, s.id]));
    const tables = [];

    // Main Hall: Mix of 2-pax, 4-pax, 6-pax, 8-pax tables
    for (let i = 1; i <= 10; i++) {
      tables.push({
        sectionId: sectionMap.get('Main Hall'),
        name: `T${i}`,
        capacity: 2,
        order: i,
        hasWindow: i % 3 === 0, // Some window seats
        isAccessible: true,
      });
    }
    for (let i = 11; i <= 15; i++) {
      tables.push({
        sectionId: sectionMap.get('Main Hall'),
        name: `T${i}`,
        capacity: 4,
        order: i,
        hasWindow: i % 2 === 0,
        isAccessible: true,
      });
    }
    for (let i = 16; i <= 18; i++) {
      tables.push({
        sectionId: sectionMap.get('Main Hall'),
        name: `T${i}`,
        capacity: 6,
        order: i,
        hasWindow: false,
        isAccessible: true,
      });
    }
    for (let i = 19; i <= 20; i++) {
      tables.push({
        sectionId: sectionMap.get('Main Hall'),
        name: `T${i}`,
        capacity: 8,
        order: i,
        hasWindow: false,
        isAccessible: false,
      });
    }

    // Private Room: Long table and round tables
    tables.push({
      sectionId: sectionMap.get('Private Room'),
      name: 'PR-1',
      capacity: 12,
      order: 1,
      hasWindow: false,
      isAccessible: true,
    });
    tables.push({
      sectionId: sectionMap.get('Private Room'),
      name: 'PR-2',
      capacity: 10,
      order: 2,
      hasWindow: false,
      isAccessible: true,
    });
    tables.push({
      sectionId: sectionMap.get('Private Room'),
      name: 'PR-3',
      capacity: 8,
      order: 3,
      hasWindow: false,
      isAccessible: true,
    });

    // Garden Lounge: Outdoor seating
    for (let i = 1; i <= 8; i++) {
      tables.push({
        sectionId: sectionMap.get('Garden Lounge'),
        name: `GL-${i}`,
        capacity: 4 + (i % 2),
        order: i,
        hasWindow: true,
        isAccessible: true,
      });
    }

    // VIP Booth: Premium seating
    for (let i = 1; i <= 3; i++) {
      tables.push({
        sectionId: sectionMap.get('VIP Booth'),
        name: `VIP-${i}`,
        capacity: 10,
        order: i,
        hasWindow: i !== 2,
        isAccessible: false,
      });
    }

    // Lounge Bar: High stools and lounge seating
    tables.push({
      sectionId: sectionMap.get('Lounge Bar'),
      name: 'Bar Counter',
      capacity: 6,
      order: 1,
      hasWindow: false,
      isAccessible: true,
    });
    for (let i = 1; i <= 4; i++) {
      tables.push({
        sectionId: sectionMap.get('Lounge Bar'),
        name: `L-${i}`,
        capacity: 4,
        order: i + 1,
        hasWindow: false,
        isAccessible: true,
      });
    }

    // Insert tables
    for (const table of tables) {
      await pool.query(
        `INSERT INTO tables (id, section_id, branch_id, name, capacity, has_window, is_wheelchair_accessible, display_order, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())
         ON CONFLICT DO NOTHING`,
        [
          uuidv4(),
          table.sectionId,
          branchId,
          table.name,
          table.capacity,
          table.hasWindow,
          table.isAccessible,
          table.order,
        ]
      );
    }

    console.log(`  ✓ Created ${tables.length} tables across ${sections.length} sections`);

    // ─── Sample Customers ──────────────────────────────────────────────────

    const sampleCustomers = [
      { name: 'Ali Mohamed', phone: '60123456789', email: 'ali.m@email.com' },
      { name: 'Siti Aminah', phone: '60187654321', email: 'siti.a@email.com' },
      { name: 'Ravi Kumar', phone: '60198765432', email: 'ravi.k@email.com' },
      { name: 'Chen Wei', phone: '60145678901', email: 'chen.w@email.com' },
      { name: 'Priya Sharma', phone: '60156789012', email: 'priya.s@email.com' },
      { name: 'Muhammad Hassan', phone: '60167890123', email: 'hassan.m@email.com' },
      { name: 'Leong Mei Lin', phone: '60178901234', email: 'mei.l@email.com' },
      { name: 'Fatima Zahra', phone: '60189012345', email: 'fatima.z@email.com' },
      { name: 'Bala Krishnan', phone: '60190123456', email: 'bala.k@email.com' },
      { name: 'Jessica Wong', phone: '60112345678', email: 'jessica.w@email.com' },
      { name: 'Amin Ibrahim', phone: '60123456780', email: 'amin.i@email.com' },
      { name: 'Kavya Patel', phone: '60134567890', email: 'kavya.p@email.com' },
      { name: 'Toh Chew Huat', phone: '60145678902', email: 'toh.c@email.com' },
      { name: 'Nur Aisha', phone: '60156789013', email: 'nur.a@email.com' },
      { name: 'Vikram Singh', phone: '60167890124', email: 'vikram.s@email.com' },
    ];

    for (const customer of sampleCustomers) {
      await pool.query(
        `INSERT INTO customers (id, branch_id, name, phone, email, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW())
         ON CONFLICT (email) DO NOTHING`,
        [uuidv4(), branchId, customer.name, customer.phone, customer.email]
      );
    }

    console.log(`  ✓ Created ${sampleCustomers.length} sample customers`);

    // ─── Additional Staff (Manager + Waiters) ──────────────────────────────

    const staffPassword = await import('bcrypt').then(b =>
      b.hash('TempPassword123!', 12)
    );

    // Manager Account
    await pool.query(
      `INSERT INTO staff (id, branch_id, email, name, role, password_hash, phone, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
       ON CONFLICT (email) DO NOTHING`,
      [
        uuidv4(),
        branchId,
        'manager@sejiwa.my',
        'SEJIWA Manager',
        'manager',
        staffPassword,
        '+60 3-4101 0101 ext. 101',
      ]
    );

    // Waiter Accounts
    for (let i = 1; i <= 5; i++) {
      await pool.query(
        `INSERT INTO staff (id, branch_id, email, name, role, phone, password_hash, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
         ON CONFLICT (email) DO NOTHING`,
        [
          uuidv4(),
          branchId,
          `waiter${i}@sejiwa.my`,
          `Waiter ${i}`,
          'waiter',
          `+60 3-4101 010${i}`,
          staffPassword,
        ]
      );
    }

    console.log(`  ✓ Created 1 manager + 5 waiter accounts`);

    // ─── Configure Default Notification Alert Settings ─────────────────────

    await pool.query(
      `UPDATE branches
       SET notification_alert_settings = $1
       WHERE id = $2`,
      [
        JSON.stringify({
          reservation_created_enabled: true,
          reservation_cancelled_enabled: true,
          reservation_no_show_enabled: true,
          reservation_upcoming_15min_enabled: true,
          upcoming_seat_lead_time_minutes: 15,
        }),
        branchId,
      ]
    );

    console.log(`  ✓ Configured notification alert settings`);

    console.log(`  ✅ SEJIWA Titiwangsa initialization complete!`);
  } catch (error) {
    console.error('  ❌ Error in SEJIWA Titiwangsa seed:', error);
    throw error;
  }
}

export default SEJIWATitiwangsaSeed;
