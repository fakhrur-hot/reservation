import { Pool } from 'pg';

/**
 * SeedRunner orchestrates the three-layer seeding system.
 * Layers are executed in order: SystemSeed → DefaultSeed → DummySeed
 * Each layer is wrapped in a transaction; failure rolls back without affecting previous layers.
 */
export class SeedRunner {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Check if a seed layer has already been applied.
   */
  private async isApplied(key: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'SELECT value FROM app_config WHERE key = $1',
        [key]
      );
      return result.rows.length > 0;
    } catch {
      // app_config table may not exist yet
      return false;
    }
  }

  /**
   * Mark a seed layer as applied.
   */
  private async markApplied(key: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, 'true']
    );
  }

  /**
   * Run all seed layers in order.
   */
  async run(): Promise<void> {
    console.log('\n🌱 Starting seed runner...\n');

    // Layer 1: System Seed
    await this.runLayer('system_seed_applied', 'System Seed', async () => {
      const { SystemSeed } = await import('./system.seed.js');
      await SystemSeed(this.pool);
    });

    // Layer 2: Default Seed
    await this.runLayer('default_seed_applied', 'Default Seed', async () => {
      const { DefaultSeed } = await import('./default.seed.js');
      await DefaultSeed(this.pool);
    });

    // Layer 2.5: SEJIWA Titiwangsa Initialization (sections, tables, staff)
    await this.runLayer('sejiwa_titiwangsa_seed_applied', 'SEJIWA Titiwangsa Seed', async () => {
      const { default: SEJIWATitiwangsaSeed } = await import('./sejiwa-titiwangsa.seed.js');
      await SEJIWATitiwangsaSeed(this.pool);
    });

    // Layer 3: Dummy Seed (only in dev/test)
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      await this.runLayer('dummy_seed_applied', 'Dummy Seed', async () => {
        const { DummySeed } = await import('./dummy.seed.js');
        await DummySeed(this.pool);
      });

      // Layer 4: Random Reservations (optional, for testing - not tracked)
      const shouldSeedReservations =
        process.env.SEED_RANDOM_RESERVATIONS === 'true';
      if (shouldSeedReservations) {
        console.log('  ⟳ Applying Random Reservations Seed...');
        try {
          const { RandomReservationsSeed } = await import(
            './random-reservations.js'
          );
          await RandomReservationsSeed(this.pool);
          console.log('  ✓ Random Reservations Seed applied');
        } catch (error: any) {
          console.error(
            `  ✗ Random Reservations Seed failed: ${error.message}`
          );
        }
      }
    }

    console.log('\n✓ Seed runner completed\n');
  }

  /**
   * Run a single seed layer with transaction support.
   */
  private async runLayer(
    key: string,
    name: string,
    seedFn: () => Promise<void>
  ): Promise<void> {
    const applied = await this.isApplied(key);

    if (applied) {
      console.log(`  ⊘ ${name} already applied, skipping`);
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      console.log(`  ⟳ Applying ${name}...`);

      // Create a temporary pool for the seed function
      const tempPool = {
        query: (sql: string, params?: any[]) => client.query(sql, params),
      } as any;

      await seedFn();

      await client.query('COMMIT');
      await this.markApplied(key);

      console.log(`  ✓ ${name} applied`);
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error(`  ✗ ${name} failed: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run random reservations seed on-demand (not tracked, can be run multiple times)
   */
  async seedRandomReservations(): Promise<void> {
    try {
      const { RandomReservationsSeed } = await import(
        './random-reservations.js'
      );
      await RandomReservationsSeed(this.pool);
      console.log(
        '✅ Random reservations seeded successfully (next 3 days)\n'
      );
    } catch (error: any) {
      console.error('❌ Error seeding random reservations:', error.message);
      throw error;
    }
  }
}

/**
 * Run seeds from CLI.
 */
export async function runSeeds(pool: Pool): Promise<void> {
  const runner = new SeedRunner(pool);
  await runner.run();
}
