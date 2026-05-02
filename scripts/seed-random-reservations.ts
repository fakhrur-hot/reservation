#!/usr/bin/env ts-node
/**
 * Script to seed random reservations for the next 3 days
 * Usage: npx ts-node scripts/seed-random-reservations.ts
 */

import { Pool } from 'pg';
import { config } from 'dotenv';

config();

async function main() {
  const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'reservation',
  });

  try {
    console.log('\n📋 Seeding Random Reservations for Next 3 Days\n');
    console.log('Connecting to database...');

    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✓ Connected to database\n');

    // Import and run the seed
    const { SeedRunner } = await import('../src/seeds/runner.js');
    const runner = new SeedRunner(pool);

    await runner.seedRandomReservations();
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
