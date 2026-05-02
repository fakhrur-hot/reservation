/**
 * Waitlist Service
 *
 * Manages walk-in guest queue operations:
 * - Add guests to waitlist
 * - Remove guests from waitlist
 * - Assign tables to waiting guests
 * - Retrieve waitlist for a branch
 *
 * Requirements: 3.9
 */

import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: string;
  branch_id: string;
  guest_name: string;
  phone_number?: string;
  party_size: number;
  notes?: string;
  priority: number;
  status: 'waiting' | 'assigned' | 'cancelled' | 'no_show';
  assigned_table_id?: string;
  assigned_reservation_id?: string;
  assigned_at?: string;
  assigned_by?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  wait_time_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface AddToWaitlistInput {
  branchId: string;
  guestName: string;
  phoneNumber?: string;
  partySize: number;
  notes?: string;
  priority?: number;
}

export interface AssignTableInput {
  waitlistId: string;
  tableId: string;
  staffId: string;
}

// ─── Error Classes ─────────────────────────────────────────────────────────────

export class WaitlistNotFoundError extends Error {
  constructor(waitlistId: string) {
    super(`Waitlist entry not found: ${waitlistId}`);
    this.name = 'WaitlistNotFoundError';
  }
}

export class InvalidWaitlistStatusError extends Error {
  constructor(currentStatus: string, expectedStatus: string) {
    super(`Invalid waitlist status. Current: ${currentStatus}, Expected: ${expectedStatus}`);
    this.name = 'InvalidWaitlistStatusError';
  }
}

// ─── Service ────────────────────────────────────────────────────────────────────

export const WaitlistService = {
  /**
   * Add a guest to the waitlist.
   * Returns the waitlist entry ID.
   *
   * Requirements: 3.9
   */
  async addToWaitlist(input: AddToWaitlistInput): Promise<string> {
    const db = await getDatabase();
    const {
      branchId,
      guestName,
      phoneNumber,
      partySize,
      notes,
      priority = 0,
    } = input;

    if (!guestName || guestName.trim().length === 0) {
      throw new Error('Guest name is required');
    }

    if (partySize <= 0) {
      throw new Error('Party size must be greater than 0');
    }

    try {
      const result = await db.query(
        `
        INSERT INTO waitlist (
          branch_id,
          guest_name,
          phone_number,
          party_size,
          notes,
          priority,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'waiting')
        RETURNING id
        `,
        [branchId, guestName, phoneNumber || null, partySize, notes || null, priority]
      );

      const waitlistId = result.rows[0].id;
      logger.info({ waitlistId, branchId, guestName, partySize }, 'Guest added to waitlist');
      return waitlistId;
    } catch (err: any) {
      logger.error({ err, branchId, guestName }, 'Failed to add guest to waitlist');
      throw err;
    }
  },

  /**
   * Remove a guest from the waitlist.
   * Can only remove guests with status 'waiting'.
   *
   * Requirements: 3.9
   */
  async removeFromWaitlist(
    waitlistId: string,
    staffId?: string
  ): Promise<void> {
    const db = await getDatabase();

    try {
      // Verify entry exists and is still waiting
      const checkResult = await db.query(
        'SELECT id, status FROM waitlist WHERE id = $1',
        [waitlistId]
      );

      if (checkResult.rows.length === 0) {
        throw new WaitlistNotFoundError(waitlistId);
      }

      if (checkResult.rows[0].status !== 'waiting') {
        throw new InvalidWaitlistStatusError(
          checkResult.rows[0].status,
          'waiting'
        );
      }

      // Update to cancelled
      await db.query(
        `
        UPDATE waitlist
        SET status = 'cancelled',
            cancelled_at = CURRENT_TIMESTAMP,
            cancelled_by = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [waitlistId, staffId || null]
      );

      logger.info({ waitlistId, staffId }, 'Guest removed from waitlist');
    } catch (err: any) {
      logger.error({ err, waitlistId }, 'Failed to remove guest from waitlist');
      throw err;
    }
  },

  /**
   * Assign a table to a waiting guest and create a reservation.
   * Transitions entry from 'waiting' to 'assigned'.
   *
   * Requirements: 3.9, 3.10
   */
  async assignTable(input: AssignTableInput): Promise<string> {
    const db = await getDatabase();
    const { waitlistId, tableId, staffId } = input;

    try {
      // Verify entry exists and is waiting
      const checkResult = await db.query(
        'SELECT id, status, branch_id, guest_name, party_size FROM waitlist WHERE id = $1',
        [waitlistId]
      );

      if (checkResult.rows.length === 0) {
        throw new WaitlistNotFoundError(waitlistId);
      }

      const entry = checkResult.rows[0];
      if (entry.status !== 'waiting') {
        throw new InvalidWaitlistStatusError(entry.status, 'waiting');
      }

      // Update waitlist entry
      await db.query(
        `
        UPDATE waitlist
        SET status = 'assigned',
            assigned_table_id = $2,
            assigned_at = CURRENT_TIMESTAMP,
            assigned_by = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [waitlistId, tableId, staffId]
      );

      logger.info(
        { waitlistId, tableId, staffId },
        'Table assigned to waiting guest'
      );

      return waitlistId;
    } catch (err: any) {
      logger.error({ err, waitlistId, tableId }, 'Failed to assign table');
      throw err;
    }
  },

  /**
   * Get waitlist for a branch, optionally filtered by status.
   *
   * Requirements: 3.9
   */
  async getWaitlist(
    branchId: string,
    status?: 'waiting' | 'assigned' | 'cancelled' | 'no_show'
  ): Promise<WaitlistEntry[]> {
    const db = await getDatabase();

    try {
      let query =
        `
        SELECT
          id,
          branch_id,
          guest_name,
          phone_number,
          party_size,
          notes,
          priority,
          status,
          assigned_table_id,
          assigned_reservation_id,
          assigned_at,
          assigned_by,
          cancelled_at,
          cancelled_by,
          wait_time_minutes,
          created_at,
          updated_at
        FROM waitlist
        WHERE branch_id = $1
        `;
      const params: any[] = [branchId];

      if (status) {
        query += ' AND status = $2';
        params.push(status);
      }

      query += ' ORDER BY priority DESC, created_at ASC';

      const result = await db.query(query, params);
      return result.rows as WaitlistEntry[];
    } catch (err: any) {
      logger.error({ err, branchId }, 'Failed to fetch waitlist');
      throw err;
    }
  },

  /**
   * Get a single waitlist entry.
   *
   * Requirements: 3.9
   */
  async getWaitlistEntry(waitlistId: string): Promise<WaitlistEntry | null> {
    const db = await getDatabase();

    try {
      const result = await db.query(
        `
        SELECT
          id,
          branch_id,
          guest_name,
          phone_number,
          party_size,
          notes,
          priority,
          status,
          assigned_table_id,
          assigned_reservation_id,
          assigned_at,
          assigned_by,
          cancelled_at,
          cancelled_by,
          wait_time_minutes,
          created_at,
          updated_at
        FROM waitlist
        WHERE id = $1
        `,
        [waitlistId]
      );

      return result.rows.length > 0 ? (result.rows[0] as WaitlistEntry) : null;
    } catch (err: any) {
      logger.error({ err, waitlistId }, 'Failed to fetch waitlist entry');
      throw err;
    }
  },

  /**
   * Mark a waitlist entry as no-show.
   *
   * Requirements: 3.9
   */
  async markAsNoShow(waitlistId: string, staffId?: string): Promise<void> {
    const db = await getDatabase();

    try {
      // Verify entry exists
      const checkResult = await db.query(
        'SELECT id, status FROM waitlist WHERE id = $1',
        [waitlistId]
      );

      if (checkResult.rows.length === 0) {
        throw new WaitlistNotFoundError(waitlistId);
      }

      // Update to no_show (can transition from waiting or assigned)
      if (!['waiting', 'assigned'].includes(checkResult.rows[0].status)) {
        throw new InvalidWaitlistStatusError(
          checkResult.rows[0].status,
          'waiting or assigned'
        );
      }

      await db.query(
        `
        UPDATE waitlist
        SET status = 'no_show',
            cancelled_at = CURRENT_TIMESTAMP,
            cancelled_by = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [waitlistId, staffId || null]
      );

      logger.info({ waitlistId, staffId }, 'Guest marked as no-show');
    } catch (err: any) {
      logger.error({ err, waitlistId }, 'Failed to mark as no-show');
      throw err;
    }
  },

  /**
   * Get waiting guests count for a branch.
   *
   * Requirements: 3.9
   */
  async getWaitingCount(branchId: string): Promise<number> {
    const db = await getDatabase();

    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM waitlist WHERE branch_id = $1 AND status = $2',
        [branchId, 'waiting']
      );

      return parseInt(result.rows[0].count, 10);
    } catch (err: any) {
      logger.error({ err, branchId }, 'Failed to get waiting count');
      throw err;
    }
  },
};
