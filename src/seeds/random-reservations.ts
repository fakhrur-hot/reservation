import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

/**
 * RandomReservationsSeed generates random reservations for the next 3 days
 * across all active branches. Creates dummy customers and tables if needed.
 * Useful for development and testing.
 */
export async function RandomReservationsSeed(pool: Pool): Promise<void> {
  try {
    console.log('  🔄 Generating random reservations for next 3 days...');

    // Get all active branches
    const branchesResult = await pool.query(
      'SELECT id, NAME FROM branches WHERE is_active = true'
    );

    if (branchesResult.rows.length === 0) {
      console.warn('  ⚠ No active branches found');
      return;
    }

    console.log(`  📍 Found ${branchesResult.rows.length} active branches`);

    const reservationStatuses = [
      'confirmed',
      'seated',
      'closed',
      'no_show',
    ];
    const occasionTypes = ['birthday', 'anniversary', 'bachelorette'];
    const decorationColors = ['red', 'blue', 'gold', 'silver', 'pink'];
    const sections = ['Main Hall', 'Private Room', 'Patio', 'Bar Area'];

    let totalCreated = 0;

    // Process each branch
    for (const branch of branchesResult.rows) {
      const branchId = branch.id;
      const branchName = branch.name;

      // Get or create customers for this branch
      let customersResult = await pool.query(
        'SELECT id FROM customers WHERE branch_id = $1 LIMIT 100',
        [branchId]
      );

      if (customersResult.rows.length === 0) {
        console.log(
          `    📝 Creating 30 dummy customers for "${branchName}"...`
        );
        // Create 30 dummy customers
        for (let i = 0; i < 30; i++) {
          const names = [
            'Alice Johnson',
            'Bob Smith',
            'Carol White',
            'David Brown',
            'Emma Davis',
            'Frank Miller',
            'Grace Lee',
            'Henry Wilson',
            'Ivy Taylor',
            'Jack Anderson',
          ];
          const name = names[i % names.length] + ` ${Math.floor(i / 10)}`;
          const email = `customer${i}@example.com`;
          const phone = `+60${Math.floor(Math.random() * 900000000 + 100000000)}`;

          await pool.query(
            `INSERT INTO customers (branch_id, email, name, phone)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO NOTHING`,
            [branchId, email, name, phone]
          );
        }

        // Re-fetch customers
        customersResult = await pool.query(
          'SELECT id FROM customers WHERE branch_id = $1 LIMIT 100',
          [branchId]
        );
      }

      // Get or create tables for this branch
      let tablesResult = await pool.query(
        'SELECT id FROM tables WHERE branch_id = $1',
        [branchId]
      );

      if (tablesResult.rows.length === 0) {
        console.log(
          `    📝 Creating dummy sections and 20 dummy tables for "${branchName}"...`
        );
        
        let sectionResult = await pool.query('SELECT id FROM sections WHERE branch_id = $1 LIMIT 1', [branchId]);
        if (sectionResult.rows.length === 0) {
          await pool.query('INSERT INTO sections (branch_id, name) VALUES ($1, $2)', [branchId, 'Main Hall']);
          sectionResult = await pool.query('SELECT id FROM sections WHERE branch_id = $1 LIMIT 1', [branchId]);
        }
        const sectionId = sectionResult.rows[0].id;

        // Create 20 dummy tables
        for (let i = 0; i < 20; i++) {
          const tableNumber = i + 1;
          const capacity = (i % 4) + 2; // 2-5 capacity

          await pool.query(
            `INSERT INTO tables (branch_id, section_id, name, capacity)
             VALUES ($1, $2, $3, $4)`,
            [branchId, sectionId, `T${String(tableNumber).padStart(2, '0')}`, capacity]
          );
        }

        // Re-fetch tables
        tablesResult = await pool.query(
          'SELECT id FROM tables WHERE branch_id = $1',
          [branchId]
        );
      }

      const customers = customersResult.rows;
      const tables = tablesResult.rows;

      if (customers.length === 0 || tables.length === 0) {
        console.warn(
          `  ⚠ Branch "${branchName}" still has no customers or tables after creation`
        );
        continue;
      }

      // Generate 15-25 random reservations per branch for next 3 days
      const reservationsPerBranch = Math.floor(
        Math.random() * 11 + 15
      );

      for (let i = 0; i < reservationsPerBranch; i++) {
        try {
          // Random day in next 3 days
          const daysOffset = Math.floor(Math.random() * 3);
          const reservationDate = new Date();
          reservationDate.setDate(reservationDate.getDate() + daysOffset);

          // Random time between 11:00 and 22:00
          const hours = Math.floor(Math.random() * 11 + 11);
          const minutes = Math.floor(Math.random() * 60);
          reservationDate.setHours(hours, minutes, 0, 0);

          // Random party size (2-8 people)
          const partySize = Math.floor(Math.random() * 7 + 2);

          // Random session duration (60-180 minutes)
          const sessionDuration = Math.floor(Math.random() * 121 + 60);

          // Calculate end time
          const endTime = new Date(
            reservationDate.getTime() + sessionDuration * 60000
          );

          // Random customer and table
          const customer =
            customers[Math.floor(Math.random() * customers.length)];
          const table = tables[Math.floor(Math.random() * tables.length)];
          const status =
            reservationStatuses[
              Math.floor(Math.random() * reservationStatuses.length)
            ];

          // 30% chance of VIP
          const isVip = Math.random() < 0.3;

          // 40% chance of decoration
          const hasDecoration = Math.random() < 0.4;
          const decorationColor = hasDecoration
            ? decorationColors[
                Math.floor(Math.random() * decorationColors.length)
              ]
            : null;
          const decorationAmount = hasDecoration
            ? Math.floor(Math.random() * 10 + 5) * 100
            : 0; // 500-1500
          const decorationNotes = hasDecoration
            ? ['Balloon arch', 'Table flowers', 'Candles', 'Ribbons'][
                Math.floor(Math.random() * 4)
              ]
            : null;

          // 20% chance of occasion
          const hasOccasion = Math.random() < 0.2;
          const occasionType = hasOccasion
            ? occasionTypes[Math.floor(Math.random() * occasionTypes.length)]
            : null;

          // 15% chance of promo code
          const hasPromo = Math.random() < 0.15;
          const promoCode = hasPromo
            ? ['VIP2024', 'EARLY20', 'GROUP10', 'AFFILIATE'][
                Math.floor(Math.random() * 4)
              ]
            : null;
          const promoCodeDiscount = hasPromo ? Math.floor(Math.random() * 500 + 100) : null; // 100-600

          // Reference number
          const referenceNumber = `REF-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)
            .toUpperCase()}`;

          // 70% chance of deposit paid (for confirmed/seated/completed)
          const depositPaid =
            status !== 'confirmed' || Math.random() < 0.7
              ? Math.floor(Math.random() * 2000 + 500)
              : 0; // 500-2500

          // Seated at (for checked-in, seated, completed)
          let seatedAt = null;
          if (status !== 'confirmed') {
            seatedAt = new Date(
              reservationDate.getTime() + Math.floor(Math.random() * 30 * 60000)
            );
          }

          // Closed at (for closed)
          let closedAt = null;
          if (status === 'closed') {
            closedAt = new Date(
              (seatedAt || reservationDate).getTime() +
                sessionDuration * 60000
            );
          }

          const insertQuery = `
            INSERT INTO reservations (
              id, branch_id, customer_id, table_id,
              reference_number, reservation_time, party_size,
              status, deposit_paid, is_vip,
              seated_at, closed_at,
              created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4,
              $5, $6, $7,
              $8, $9, $10,
              $11, $12,
              $13, $14
            )
          `;

          await pool.query(insertQuery, [
            uuidv4(),
            branchId,
            customer.id,
            table.id,
            referenceNumber,
            reservationDate,
            partySize,
            status,
            depositPaid,
            isVip,
            seatedAt,
            closedAt,
            new Date(),
            new Date(),
          ]);

          totalCreated++;
        } catch (error) {
          console.error(`    Error creating reservation: ${error}`);
        }
      }

      console.log(
        `  ✓ Created ${reservationsPerBranch} reservations for "${branchName}"`
      );
    }

    console.log(`  ✅ Successfully created ${totalCreated} random reservations`);
  } catch (error) {
    console.error('  ❌ Error in RandomReservationsSeed:', error);
    throw error;
  }
}
