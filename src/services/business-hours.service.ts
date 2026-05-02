/**
 * Business Hours Service
 *
 * Manages branch operating hours, holiday overrides, and Open_Status derivation.
 * Manual overrides take precedence over the weekly schedule.
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8
 */

import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Types Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/** 0 = Sunday Ã¢â‚¬Â¦ 6 = Saturday (matches JS Date.getDay()) */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BusinessHoursRow {
  id: string;
  branch_id: string;
  day_of_week: DayOfWeek;
  open_time: string | null;   // 'HH:MM:SS'
  close_time: string | null;
  is_open: boolean;
  created_at: string;
}

export interface BusinessHoursOverrideRow {
  id: string;
  branch_id: string;
  override_date: string;       // 'YYYY-MM-DD'
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
  override_until: string | null;
  created_at: string;
}

export interface UpsertBusinessHoursData {
  day_of_week: DayOfWeek;
  open_time?: string | null;
  close_time?: string | null;
  is_open?: boolean;
}

export interface UpsertOverrideData {
  override_date: string;       // 'YYYY-MM-DD'
  is_open?: boolean;
  open_time?: string | null;
  close_time?: string | null;
  override_until?: string | null;
}

export interface OpenStatus {
  is_open: boolean;
  source: 'override' | 'schedule' | 'default_closed';
  open_time: string | null;
  close_time: string | null;
  override_date?: string;
}

export interface BranchTimingConfig {
  no_show_grace_min: number;
  mod_cutoff_hours: number;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Service Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export class BusinessHoursService {
  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Weekly Schedule Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /**
   * Upsert the weekly business hours for a branch.
   * Accepts an array of day configs; each is inserted or updated by (branch_id, day_of_week).
   */
  static async upsertSchedule(
    branchId: string,
    days: UpsertBusinessHoursData[]
  ): Promise<BusinessHoursRow[]> {
    const db = getDatabase();
    const results: BusinessHoursRow[] = [];

    for (const day of days) {
      const { day_of_week, open_time, close_time, is_open } = day;

      const result = await db.query<BusinessHoursRow>(
        `INSERT INTO business_hours (branch_id, day_of_week, open_time, close_time, is_open)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (branch_id, day_of_week)
         DO UPDATE SET
           open_time  = EXCLUDED.open_time,
           close_time = EXCLUDED.close_time,
           is_open = EXCLUDED.is_open
         RETURNING id, branch_id, day_of_week, open_time, close_time, is_open, created_at`,
        [
          branchId,
          day_of_week,
          open_time ?? null,
          close_time ?? null,
          is_open ?? true,
        ]
      );

      results.push(result.rows[0]);
    }

    logger.info({ branchId, daysUpdated: results.length }, 'Business hours schedule upserted');
    return results;
  }

  /**
   * Get the full weekly schedule for a branch.
   */
  static async getSchedule(branchId: string): Promise<BusinessHoursRow[]> {
    const db = getDatabase();
    const result = await db.query<BusinessHoursRow>(
      `SELECT id, branch_id, day_of_week, open_time, close_time, is_open, created_at
       FROM business_hours
       WHERE branch_id = $1
       ORDER BY day_of_week ASC`,
      [branchId]
    );
    return result.rows;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Overrides Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /**
   * Upsert a date-specific override (holiday or manual open/close).
   */
  static async upsertOverride(
    branchId: string,
    data: UpsertOverrideData
  ): Promise<BusinessHoursOverrideRow> {
    const db = getDatabase();
    const { override_date, is_open, open_time, close_time, override_until } = data;

    const result = await db.query<BusinessHoursOverrideRow>(
      `INSERT INTO business_hours_overrides (branch_id, override_date, is_open, open_time, close_time, override_until)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (branch_id, override_date)
       DO UPDATE SET
         is_open = EXCLUDED.is_open,
         open_time      = EXCLUDED.open_time,
         close_time     = EXCLUDED.close_time,
         override_until = EXCLUDED.override_until
       RETURNING id, branch_id, override_date, is_open, open_time, close_time, override_until, created_at`,
      [
        branchId,
        override_date,
        is_open ?? false,
        open_time ?? null,
        close_time ?? null,
        override_until ?? null,
      ]
    );

    logger.info({ branchId, override_date }, 'Business hours override upserted');
    return result.rows[0];
  }

  /**
   * List all overrides for a branch.
   */
  static async listOverrides(branchId: string): Promise<BusinessHoursOverrideRow[]> {
    const db = getDatabase();
    const result = await db.query<BusinessHoursOverrideRow>(
      `SELECT id, branch_id, override_date, is_open, open_time, close_time, override_until, created_at
       FROM business_hours_overrides
       WHERE branch_id = $1
       ORDER BY override_date ASC`,
      [branchId]
    );
    return result.rows;
  }

  /**
   * Delete an override by date.
   */
  static async deleteOverride(branchId: string, overrideDate: string): Promise<boolean> {
    const db = getDatabase();
    const result = await db.query(
      `DELETE FROM business_hours_overrides
       WHERE branch_id = $1 AND override_date = $2`,
      [branchId, overrideDate]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Open Status Derivation Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /**
   * Derive the current Open_Status for a branch.
   * Rule: active manual override wins over weekly schedule.
   *
   * @param branchId
   * @param atTime  Defaults to NOW(). Pass a specific Date for testing.
   */
  static async getOpenStatus(branchId: string, atTime?: Date): Promise<OpenStatus> {
    const db = getDatabase();
    const now = atTime ?? new Date();

    // Format date as 'YYYY-MM-DD' in local time
    const dateStr = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay() as DayOfWeek;

    // 1. Check for an active override on today's date
    const overrideResult = await db.query<BusinessHoursOverrideRow>(
      `SELECT id, branch_id, override_date, is_open, open_time, close_time, override_until
       FROM business_hours_overrides
       WHERE branch_id = $1
         AND override_date = $2
         AND (override_until IS NULL OR override_until > $3)
       LIMIT 1`,
      [branchId, dateStr, now.toISOString()]
    );

    if (overrideResult.rows.length > 0) {
      const ov = overrideResult.rows[0];
      return {
        is_open: ov.is_open,
        source: 'override',
        open_time: ov.open_time,
        close_time: ov.close_time,
        override_date: ov.override_date,
      };
    }

    // 2. Fall back to weekly schedule
    const scheduleResult = await db.query<BusinessHoursRow>(
      `SELECT id, branch_id, day_of_week, open_time, close_time, is_open
       FROM business_hours
       WHERE branch_id = $1 AND day_of_week = $2
       LIMIT 1`,
      [branchId, dayOfWeek]
    );

    if (scheduleResult.rows.length > 0) {
      const row = scheduleResult.rows[0];
      return {
        is_open: row.is_open,
        source: 'schedule',
        open_time: row.open_time,
        close_time: row.close_time,
      };
    }

    // 3. No schedule configured Ã¢â‚¬â€ default to closed
    return {
      is_open: false,
      source: 'default_closed',
      open_time: null,
      close_time: null,
    };
  }

  /**
   * Check whether a given reservation_time falls within the branch's Business_Hours.
   * Returns true if the time is within operating hours, false otherwise.
   */
  static async isWithinBusinessHours(branchId: string, reservationTime: Date): Promise<boolean> {
    const status = await BusinessHoursService.getOpenStatus(branchId, reservationTime);

    if (!status.is_open) return false;
    if (!status.open_time || !status.close_time) return false;

    // Compare HH:MM against open/close times
    const hhmm = reservationTime.toTimeString().slice(0, 5); // 'HH:MM'
    const openHHMM = status.open_time.slice(0, 5);
    const closeHHMM = status.close_time.slice(0, 5);

    return hhmm >= openHHMM && hhmm < closeHHMM;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Branch Timing Config Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /**
   * Update no_show_grace_min and/or mod_cutoff_hours on the branch record.
   */
  static async updateTimingConfig(
    branchId: string,
    config: Partial<BranchTimingConfig>
  ): Promise<BranchTimingConfig> {
    const db = getDatabase();

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (config.no_show_grace_min !== undefined) {
      fields.push(`no_show_grace_min = $${idx++}`);
      values.push(config.no_show_grace_min);
    }
    if (config.mod_cutoff_hours !== undefined) {
      fields.push(`mod_cutoff_hours = $${idx++}`);
      values.push(config.mod_cutoff_hours);
    }

    if (fields.length === 0) {
      // Nothing to update Ã¢â‚¬â€ return current values
      return BusinessHoursService.getTimingConfig(branchId);
    }

    values.push(branchId);
    const result = await db.query(
      `UPDATE branches SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING no_show_grace_min, mod_cutoff_hours`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error(`Branch ${branchId} not found`);
    }

    logger.info({ branchId, config }, 'Branch timing config updated');
    return result.rows[0] as BranchTimingConfig;
  }

  /**
   * Get the current timing config for a branch.
   */
  static async getTimingConfig(branchId: string): Promise<BranchTimingConfig> {
    const db = getDatabase();
    const result = await db.query(
      `SELECT no_show_grace_min, mod_cutoff_hours FROM branches WHERE id = $1`,
      [branchId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Branch ${branchId} not found`);
    }
    return result.rows[0] as BranchTimingConfig;
  }
}

export default BusinessHoursService;
