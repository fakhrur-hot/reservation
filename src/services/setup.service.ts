import { Pool, PoolClient } from 'pg';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { logger } from '../config/logger.js';

export interface SetupPayload {
  restaurantName: string;
  branchCode: string;
  address: string;
  phone: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
  timezone?: string;
  currency?: string;
  website?: string;
  openingHour?: string;
  closingHour?: string;
  sections?: SectionInput[];
  businessHours?: DaySchedule[];
  /** Alias for businessHours — sent by the wizard as operatingHours */
  operatingHours?: { schedule: DaySchedule[]; noShowGraceMinutes?: number; modificationCutoffHours?: number; lastOrderCutoffMinutes?: number };
  managers?: ManagerInput[];
  smtpSettings?: SmtpSettingsData | null;
  depositSettings?: DepositSettingsData;
}

export interface SectionInput {
  name: string;
  description?: string;
  type: 'indoor' | 'outdoor';
  tables: TableInput[];
}

export interface TableInput {
  name: string;
  capacity: number;
  tableType: 'standard' | 'booth' | 'bar' | 'private';
}

export interface DaySchedule {
  dayOfWeek: number;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
}

export interface ManagerInput {
  fullName: string;
  email: string;
  temporaryPassword: string;
}

export interface SmtpSettingsData {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  tls: boolean;
}

export interface DepositSettingsData {
  depositAmount: number;
  depositRequired: boolean;
  refundTier1Percent: number;
  refundTier2Percent: number;
  refundTier3Percent: number;
}

export interface SetupResult {
  branchId: string;
  adminStaffId: string;
}

export interface SetupStatus {
  setupRequired: boolean;
  currentStep?: number;
  partialData?: boolean;
  branchId?: string;
  branchName?: string;
}

export interface SmtpTestResult {
  success: boolean;
  error?: string;
}

/**
 * SetupService handles all setup operations.
 */
export class SetupService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Check if setup is complete.
   */
  async isSetupComplete(): Promise<boolean> {
    try {
      const result = await this.pool.query(
        "SELECT value FROM app_config WHERE key = 'setup_completed'"
      );
      return result.rows.length > 0 && result.rows[0].value === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Get current setup status.
   */
  async getStatus(): Promise<SetupStatus> {
    const setupComplete = await this.isSetupComplete();

    if (setupComplete) {
      // Return the real branch ID (exclude placeholder seed branch)
      try {
        const result = await this.pool.query(
          `SELECT id, name FROM branches 
           WHERE is_active = true 
           AND name != '[Restaurant_Name]' 
           AND code != '[BRANCH_CODE]'
           ORDER BY created_at DESC 
           LIMIT 1`
        );
        if (result.rows.length > 0) {
          return {
            setupRequired: false,
            branchId: result.rows[0].id,
            branchName: result.rows[0].name,
          };
        }
      } catch {
        // Ignore
      }
      return { setupRequired: false };
    }

    try {
      const result = await this.pool.query(
        "SELECT value FROM app_config WHERE key = 'setup_progress'"
      );

      if (result.rows.length > 0) {
        const progress = JSON.parse(result.rows[0].value);
        return {
          setupRequired: true,
          currentStep: progress.currentStep,
          partialData: true,
        };
      }
    } catch {
      // Ignore errors
    }

    return { setupRequired: true };
  }

  /**
   * Save setup progress.
   */
  async saveProgress(step: number, partialData: any): Promise<void> {
    const progress = { currentStep: step, data: partialData };

    await this.pool.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['setup_progress', JSON.stringify(progress)]
    );
  }

  /**
   * Complete setup with full payload.
   * Includes auto-recovery: if a unique constraint violation is detected (stale
   * data from a previous failed attempt), orphaned rows are cleaned up and the
   * insert is retried once automatically.
   */
  async completeSetup(payload: SetupPayload, _retrying = false): Promise<SetupResult> {
    // Validate required fields
    this.validateSetupPayload(payload);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Create branch
      logger.info({ step: 1, branchCode: payload.branchCode }, 'Creating branch');
      const branchId = await this.insertBranch(client, payload);
      logger.info({ step: 1, branchId }, 'Branch created');

      // 2. Create sections and tables
      if (payload.sections && payload.sections.length > 0) {
        logger.info({ step: 2, sectionCount: payload.sections.length }, 'Creating sections and tables');
        await this.insertSections(client, branchId, payload.sections);
        logger.info({ step: 2 }, 'Sections and tables created');
      }

      // 3. Create business hours — accept either businessHours or operatingHours.schedule
      const scheduleSource = payload.businessHours ??
        payload.operatingHours?.schedule?.map(d => ({
          dayOfWeek: d.dayOfWeek,
          isOpen: d.isOpen,
          openTime: d.openTime,
          closeTime: d.closeTime,
        }));
      if (scheduleSource && scheduleSource.length > 0) {
        logger.info({ step: 3, scheduleLength: scheduleSource.length }, 'Creating business hours');
        await this.insertBusinessHours(client, branchId, scheduleSource);
        logger.info({ step: 3 }, 'Business hours created');
      }

      // 4. Create admin staff
      logger.info({ step: 4, adminEmail: payload.adminEmail }, 'Creating admin staff');
      const adminStaffId = await this.insertAdminStaff(client, branchId, payload);
      logger.info({ step: 4, adminStaffId }, 'Admin staff created');

      // 5. Create manager staff
      if (payload.managers && payload.managers.length > 0) {
        logger.info({ step: 5, managerCount: payload.managers.length }, 'Creating manager staff');
        await this.insertManagerStaff(client, branchId, payload.managers);
        logger.info({ step: 5 }, 'Manager staff created');
      }

      // 6. Store SMTP config if provided
      if (payload.smtpSettings) {
        logger.info({ step: 6 }, 'Storing SMTP config');
        await this.storeSmtpConfig(client, payload.smtpSettings);
        logger.info({ step: 6 }, 'SMTP config stored');
      }

      // 7. Store deposit config
      if (payload.depositSettings) {
        logger.info({ step: 7, depositAmount: payload.depositSettings.depositAmount }, 'Storing deposit config');
        await this.storeDepositConfig(client, branchId, payload.depositSettings);
        logger.info({ step: 7 }, 'Deposit config stored');
      }

      // 8. Mark setup complete
      logger.info({ step: 8 }, 'Marking setup complete');
      await this.markSetupComplete(client);
      logger.info({ step: 8 }, 'Setup marked complete');

      // Clear setup progress
      await client.query(
        "DELETE FROM app_config WHERE key = 'setup_progress'"
      );

      await client.query('COMMIT');

      logger.info({ branchId, adminStaffId }, 'Setup completed successfully');
      return { branchId, adminStaffId };
    } catch (error: any) {
      await client.query('ROLLBACK');

      logger.error({
        error: error.message,
        code: error.code,
        detail: error.detail,
        constraint: error.constraint,
        table: error.table,
        branchCode: payload.branchCode,
        adminEmail: payload.adminEmail,
        retrying: _retrying
      }, 'Setup completion failed in completeSetup');

      // Auto-recovery: unique constraint violation means a previous partial
      // setup left orphaned rows. Clean them up and retry once automatically.
      // This is safe — setup is not yet complete, so the data is test/stale data.
      if (error.code === '23505' && !_retrying) {
        logger.info({ branchCode: payload.branchCode, adminEmail: payload.adminEmail }, 'Auto-recovering from unique constraint violation');
        const managerEmails = (payload.managers ?? []).map((m) => m.email);
        await this.cleanStaleSetupData(payload.branchCode, payload.adminEmail, managerEmails);
        return this.completeSetup(payload, true);
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove ALL orphaned rows from any previous setup attempt.
   * On a fresh install (setup not complete), any non-placeholder branch is stale
   * test data and can be safely wiped. Also removes staff by email globally.
   * Only runs when setup_completed is NOT set.
   */
  async cleanStaleSetupData(branchCode: string, adminEmail: string, managerEmails: string[] = []): Promise<void> {
    const isComplete = await this.isSetupComplete();
    if (isComplete) {
      throw new Error('Setup is already complete. Cannot overwrite an existing installation.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete ALL non-placeholder branches — on a fresh install every real branch
      // is stale test data. Cascade handles sections, tables, staff, business_hours, etc.
      await client.query(
        `DELETE FROM branches WHERE code != '[BRANCH_CODE]'`
      );

      // Also delete any staff whose email matches (covers staff inserted under
      // the placeholder branch or any other branch in a previous run)
      const allEmails = [adminEmail, ...managerEmails].filter(Boolean);
      if (allEmails.length > 0) {
        await client.query(
          'DELETE FROM staff WHERE email = ANY($1::text[])',
          [allEmails]
        );
      }

      // Clear stale progress flag
      await client.query("DELETE FROM app_config WHERE key = 'setup_progress'");

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Test SMTP connection.
   */
  async testSmtp(settings: SmtpSettingsData): Promise<SmtpTestResult> {
    try {
      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.tls,
        auth: {
          user: settings.username,
          pass: settings.password,
        },
      });

      await transporter.verify();

      // Send test email
      await transporter.sendMail({
        from: `${settings.fromName} <${settings.fromEmail}>`,
        to: settings.fromEmail,
        subject: 'Test Email from Setup Wizard',
        text: 'This is a test email to verify your SMTP configuration.',
        html: '<p>This is a test email to verify your SMTP configuration.</p>',
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate setup payload.
   */
  private validateSetupPayload(payload: SetupPayload): void {
    const required = [
      'restaurantName',
      'branchCode',
      'address',
      'phone',
      'adminEmail',
      'adminPassword',
    ];

    for (const field of required) {
      if (!payload[field as keyof SetupPayload]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.adminEmail)) {
      throw new Error('Invalid email format');
    }

    // Validate password length
    if (payload.adminPassword.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Validate sections
    if (!payload.sections || payload.sections.length === 0) {
      throw new Error('At least one section is required');
    }

    for (const section of payload.sections) {
      if (!section.name || section.tables.length === 0) {
        throw new Error('Each section must have a name and at least one table');
      }

      // Check for duplicate section names
      const sectionNames = payload.sections.map((s) => s.name.toLowerCase());
      if (new Set(sectionNames).size !== sectionNames.length) {
        throw new Error('Duplicate section names are not allowed');
      }

      for (const table of section.tables) {
        if (!table.name || table.capacity < 1) {
          throw new Error('Each table must have a name and capacity >= 1');
        }
      }
    }

    // Validate managers
    if (!payload.managers || payload.managers.length === 0) {
      throw new Error('At least one manager is required');
    }

    for (const manager of payload.managers) {
      if (!manager.fullName || !manager.email || !manager.temporaryPassword) {
        throw new Error('All manager fields are required');
      }
      // Admin and manager cannot share the same email
      if (manager.email.toLowerCase() === payload.adminEmail.toLowerCase()) {
        throw new Error(`Manager email cannot be the same as the admin email (${payload.adminEmail})`);
      }
    }

    // Manager emails must be unique among themselves
    const managerEmails = payload.managers.map(m => m.email.toLowerCase());
    if (new Set(managerEmails).size !== managerEmails.length) {
      throw new Error('Manager emails must be unique');
    }
  }

  /**
   * Insert branch record — saves all fields from the setup wizard.
   */
  private async insertBranch(client: PoolClient, payload: SetupPayload): Promise<string> {
    // Resolve timing rules: prefer wizard values, fall back to defaults
    const noShowGraceMin = payload.operatingHours?.noShowGraceMinutes ?? 15;
    const modCutoffHours = payload.operatingHours?.modificationCutoffHours ?? 2;

    const result = await client.query(
      `INSERT INTO branches (
        name, code, address, phone,
        booking_deposit_amt, app_operating_mode,
        no_show_grace_min, mod_cutoff_hours,
        timezone, currency, website_url, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        payload.restaurantName,
        payload.branchCode,
        payload.address,
        payload.phone,
        payload.depositSettings?.depositAmount || 50.00,
        'TABLE_ONLY',
        noShowGraceMin,
        modCutoffHours,
        payload.timezone || 'Asia/Kuala_Lumpur',
        payload.currency || 'MYR',
        payload.website || null,
        true,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Insert sections and tables.
   */
  private async insertSections(
    client: PoolClient,
    branchId: string,
    sections: SectionInput[]
  ): Promise<void> {
    for (const section of sections) {
      const sectionResult = await client.query(
        `INSERT INTO sections (branch_id, name, description, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [branchId, section.name, section.description || null, true]
      );

      const sectionId = sectionResult.rows[0].id;

      // Insert tables for this section
      for (const table of section.tables) {
        await client.query(
          `INSERT INTO tables (
            branch_id, section_id, name, capacity, table_type, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [branchId, sectionId, table.name, table.capacity, table.tableType, true]
        );
      }
    }
  }

  /**
   * Insert business hours.
   */
  private async insertBusinessHours(
    client: PoolClient,
    branchId: string,
    schedule: DaySchedule[]
  ): Promise<void> {
    for (const day of schedule) {
      await client.query(
        `INSERT INTO business_hours (
          branch_id, day_of_week, open_time, close_time, is_open
        ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (branch_id, day_of_week) DO UPDATE
         SET open_time = $3, close_time = $4, is_open = $5`,
        [
          branchId,
          day.dayOfWeek,
          day.isOpen ? day.openTime : '00:00',
          day.isOpen ? day.closeTime : '00:00',
          day.isOpen,
        ]
      );
    }
  }

  /**
   * Insert admin staff — uses adminName from payload if provided, else derives from email.
   */
  private async insertAdminStaff(
    client: PoolClient,
    branchId: string,
    payload: SetupPayload
  ): Promise<string> {
    const passwordHash = await bcrypt.hash(payload.adminPassword, 12);
    const adminName = payload.adminName || payload.adminEmail.split('@')[0];

    const result = await client.query(
      `INSERT INTO staff (
        branch_id, email, name, role, password_hash, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [branchId, payload.adminEmail, adminName, 'admin', passwordHash, true]
    );

    return result.rows[0].id;
  }

  /**
   * Insert manager staff.
   */
  private async insertManagerStaff(
    client: PoolClient,
    branchId: string,
    managers: ManagerInput[]
  ): Promise<string[]> {
    const ids: string[] = [];

    for (const manager of managers) {
      const passwordHash = await bcrypt.hash(manager.temporaryPassword, 12);

      const result = await client.query(
        `INSERT INTO staff (
          branch_id, email, name, role, password_hash, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [branchId, manager.email, manager.fullName, 'manager', passwordHash, true]
      );

      ids.push(result.rows[0].id);
    }

    return ids;
  }

  /**
   * Store SMTP configuration.
   */
  private async storeSmtpConfig(
    client: PoolClient,
    settings: SmtpSettingsData
  ): Promise<void> {
    // Encrypt password before storing (simple base64 for now, should use proper encryption)
    const encryptedPassword = Buffer.from(settings.password).toString('base64');

    await client.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['smtp_host', settings.host]
    );

    await client.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['smtp_port', settings.port.toString()]
    );

    await client.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['smtp_username', settings.username]
    );

    await client.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['smtp_password', encryptedPassword]
    );

    await client.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['smtp_from_name', settings.fromName]
    );

    await client.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['smtp_from_email', settings.fromEmail]
    );

    await client.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['smtp_tls', settings.tls.toString()]
    );
  }

  /**
   * Store deposit configuration.
   */
  private async storeDepositConfig(
    client: PoolClient,
    branchId: string,
    settings: DepositSettingsData
  ): Promise<void> {
    // Update branch with deposit amount
    await client.query(
      'UPDATE branches SET booking_deposit_amt = $1 WHERE id = $2',
      [settings.depositAmount, branchId]
    );
  }

  /**
   * Mark setup as complete.
   */
  private async markSetupComplete(client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      ['setup_completed', 'true']
    );
  }
}
