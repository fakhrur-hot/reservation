/**
 * Walk-In Service
 *
 * Handles direct table occupation by staff without a prior reservation.
 * In TABLE_ONLY mode: no payment or invoice steps are triggered.
 *
 * Requirements: 18.1–18.6
 */

import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { TableService } from './table.service.js';
import { AuditService } from './audit.service.js';
import { WebSocketPublisher } from './websocket-publisher.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalkIn {
  id: string;
  branch_id: string;
  table_id: string;
  staff_id: string;
  party_size: number;
  notes: string | null;
  status: 'open' | 'closed';
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWalkInInput {
  branchId: string;
  tableId: string;
  staffId: string;
  partySize: number;
  notes?: string;
}

// ─── Domain errors ────────────────────────────────────────────────────────────

export class TableNotAvailableError extends Error {
  readonly code = 'TABLE_NOT_AVAILABLE';
  constructor(message: string) { super(message); this.name = 'TableNotAvailableError'; }
}

export class WalkInNotFoundError extends Error {
  readonly code = 'WALK_IN_NOT_FOUND';
  constructor(message: string) { super(message); this.name = 'WalkInNotFoundError'; }
}

export class WalkInAlreadyClosedError extends Error {
  readonly code = 'WALK_IN_ALREADY_CLOSED';
  constructor(message: string) { super(message); this.name = 'WalkInAlreadyClosedError'; }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class WalkInService {
  /**
   * Create a walk-in: validate table is available, set it to occupied,
   * emit WS event, and write the walk_ins record.
   *
   * In TABLE_ONLY mode: payment and invoice steps are suppressed.
   * Requirements: 18.1, 18.2, 18.3, 18.4, 18.6
   */
  static async createWalkIn(
    input: CreateWalkInInput,
    actorIp?: string
  ): Promise<WalkIn> {
    const { branchId, tableId, staffId, partySize, notes } = input;

    // ── 1. Validate table is available (Requirement 18.1) ───────────────────
    const currentStatus = await TableService.deriveTableStatus(branchId, tableId);
    if (currentStatus !== 'available') {
      throw new TableNotAvailableError(
        `Table ${tableId} is not available (current status: ${currentStatus})`
      );
    }

    // ── 2. Validate table exists and belongs to branch ───────────────────────
    const db = getDatabase();
    const tableResult = await db.query(
      `SELECT id, name, capacity FROM tables WHERE id = $1 AND branch_id = $2 AND is_active = true`,
      [tableId, branchId]
    );
    if (tableResult.rows.length === 0) {
      throw new Error(`Table ${tableId} not found or inactive in branch ${branchId}`);
    }

    // ── 3. Write walk_ins record (Requirement 18.2) ──────────────────────────
    // TABLE_ONLY: no payment or invoice steps (Requirement 18.4)
    const insertResult = await db.query<WalkIn>(
      `INSERT INTO walk_ins (branch_id, table_id, staff_id, party_size, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING id, branch_id, table_id, staff_id, party_size, notes,
                 status, closed_at, closed_by, created_at, updated_at`,
      [branchId, tableId, staffId, partySize, notes ?? null]
    );
    const walkIn = insertResult.rows[0];

    // ── 4. Emit WS table.status_changed occupied (Requirement 18.3) ─────────
    WebSocketPublisher.publishTableStatusChanged(branchId, tableId, 'occupied')
      .catch((err) => logger.error({ err }, 'Failed to publish WS table.status_changed occupied (walk-in)'));

    // ── 5. Audit log (Requirement 18.6) ─────────────────────────────────────
    await AuditService.logCreate(
      branchId,
      staffId,
      'walk_in',
      walkIn.id,
      { table_id: tableId, party_size: partySize, notes: notes ?? null },
      actorIp
    );

    logger.info({
      event: 'walk_in_created',
      branch_id: branchId,
      walk_in_id: walkIn.id,
      table_id: tableId,
      staff_id: staffId,
      party_size: partySize,
    }, 'Walk-in created');

    return walkIn;
  }

  /**
   * Close a walk-in: set table back to available and emit WS event.
   * Requirements: 18.5, 18.6
   */
  static async closeWalkIn(
    walkInId: string,
    branchId: string,
    staffId: string,
    actorIp?: string
  ): Promise<WalkIn> {
    const db = getDatabase();

    // ── 1. Fetch walk-in record ──────────────────────────────────────────────
    const fetchResult = await db.query<WalkIn>(
      `SELECT id, branch_id, table_id, staff_id, party_size, notes,
              status, closed_at, closed_by, created_at, updated_at
       FROM walk_ins
       WHERE id = $1 AND branch_id = $2`,
      [walkInId, branchId]
    );

    if (fetchResult.rows.length === 0) {
      throw new WalkInNotFoundError(`Walk-in ${walkInId} not found`);
    }

    const walkIn = fetchResult.rows[0];

    if (walkIn.status === 'closed') {
      throw new WalkInAlreadyClosedError(`Walk-in ${walkInId} is already closed`);
    }

    // ── 2. Mark as closed ────────────────────────────────────────────────────
    const updateResult = await db.query<WalkIn>(
      `UPDATE walk_ins
       SET status = 'closed', closed_at = NOW(), closed_by = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, branch_id, table_id, staff_id, party_size, notes,
                 status, closed_at, closed_by, created_at, updated_at`,
      [staffId, walkInId]
    );
    const closed = updateResult.rows[0];

    // ── 3. Emit WS table.status_changed available ────────────────────────────
    WebSocketPublisher.publishTableStatusChanged(branchId, walkIn.table_id, 'available')
      .catch((err) => logger.error({ err }, 'Failed to publish WS table.status_changed available (walk-in close)'));

    // ── 4. Audit log (Requirement 18.6) ─────────────────────────────────────
    await AuditService.logUpdate(
      branchId,
      staffId,
      'walk_in',
      walkInId,
      { status: 'open' },
      { status: 'closed', closed_by: staffId },
      actorIp
    );

    logger.info({
      event: 'walk_in_closed',
      branch_id: branchId,
      walk_in_id: walkInId,
      table_id: walkIn.table_id,
      staff_id: staffId,
    }, 'Walk-in closed');

    return closed;
  }
}

export default WalkInService;
