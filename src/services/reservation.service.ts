/**
 * Reservation Service
 *
 * Handles reservation creation, reference number generation, and core
 * reservation data access. Integrates with TableLockService, BusinessHoursService,
 * and DepositService.
 *
 * Requirements: 9.1â€“9.9, 16.3, 16.5, 16.8
 */

import { PoolClient } from 'pg';
import { getDatabase, transaction } from '../config/database.js';
import { logger } from '../config/logger.js';
import { TableLockService } from './table-lock.service.js';
import { BusinessHoursService } from './business-hours.service.js';
import { DepositService, RefundResult } from './deposit.service.js';
import { CommissionService, CommissionBreakdown, CommissionCategory } from './commission.service.js';
import { AuditService } from './audit.service.js';
import { WebSocketPublisher } from './websocket-publisher.service.js';
import { NotificationAlertService } from './notification-alert.service.js';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ReservationStatus = 'confirmed' | 'seated' | 'closed' | 'cancelled' | 'no_show';

export interface Reservation {
  id: string;
  branch_id: string;
  customer_id: string;
  table_id: string;
  reference_number: string;
  reservation_time: string;
  party_size: number;
  status: ReservationStatus;
  deposit_paid: number;
  tc_acknowledged_at: string | null;
  special_requests: string | null;
  seated_at: string | null;
  seated_by: string | null;
  created_at: string;
  // Decoration / occasion fields (added in migration 020)
  has_decoration: boolean;
  decoration_amount: number;
  occasion_type: 'birthday' | 'anniversary' | 'bachelorette' | null;
  decoration_color: string | null;
  cake_choice: string | null;
  decoration_notes: string | null;
  // Cake menu integration (added in migration 024)
  cake_menu_id: string | null;
  cake_custom_notes: string | null;
  // Promo code fields (added in migration 040)
  promo_code: string | null;
  promo_code_discount: number | null;
  table_lock_id: string | null;
  session_duration_minutes: number | null;
  end_time: string | null;
  // Joined fields (available in list queries)
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  table_name?: string | null;
}

export interface ModifyReservationInput {
  newTableId?: string;
  newReservationTime?: Date;
  newPartySize?: number;
  sessionId: string;
}

// Valid decoration options (hardcoded list per task 23.3)
export const VALID_DECORATION_COLORS = [
  'Rose Gold', 'Blush Pink', 'Sage', 'Champagne', 'Lavender',
  'Mint', 'Gold', 'Silver', 'Custom',
] as const;

export const VALID_OCCASION_TYPES = ['birthday', 'anniversary', 'bachelorette'] as const;

export const VALID_CAKE_CHOICES = [
  'Chocolate', 'Vanilla', 'Strawberry', 'Carrot Cake', 'Cheesecake', 'custom_request',
] as const;

// Default decoration fee (fallback if not configured in branch settings)
export const DEFAULT_DECORATION_FEE = 50;

export interface CreateReservationInput {
  branchId: string;
  customerId: string;
  tableId: string;
  sessionId: string;
  reservationTime: Date;
  partySize: number;
  tcAcknowledged?: boolean;
  specialRequests?: string;
  /** Idempotency key for deposit collection (required when deposit > 0) */
  depositIdempotencyKey?: string;
  depositMethod?: 'fpx' | 'card';
  // Optional decoration / occasion fields
  has_decoration?: boolean;
  occasion_type?: string;
  decoration_color?: string;
  cake_choice?: string;
  decoration_notes?: string;
  // Cake menu integration (Stage 2 ready)
  cake_menu_id?: string;
  cake_custom_notes?: string;
  // Promo code fields (Requirement 4.8)
  promoCode?: string;
  promoCodeDiscount?: number;
  // Table lock ID from Redis (Requirement 5.4)
  tableLockId?: string;
  // Session duration and end time (Requirement 3.1, 3.2)
  sessionDurationMinutes?: number;
  endTime?: Date;
}

export interface CreateReservationResult {
  reservation: Reservation;
  depositRequired: boolean;
  depositAmount: number;
  /** Commission breakdown per service category (only populated when commissions are enabled) */
  commissionBreakdown: CommissionBreakdown;
}

// â”€â”€â”€ Reference number generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Generate the next reservation reference number for a branch+year.
 * Uses reservation_sequences table with atomic increment.
 * Format: {BRANCH_CODE}-{YEAR}-{SEQUENCE}  e.g. KL01-2025-42
 *
 * Requirements: 9.9
 */
export async function generateReferenceNumber(
  branchId: string,
  client: PoolClient
): Promise<string> {
  const year = new Date().getFullYear();

  // Atomic upsert + increment â€” returns the new sequence value
  const seqResult = await client.query(
    `INSERT INTO reservation_sequences (branch_id, year, last_seq)
     VALUES ($1, $2, 1)
     ON CONFLICT (branch_id, year)
     DO UPDATE SET last_seq = reservation_sequences.last_seq + 1
     RETURNING last_seq`,
    [branchId, year]
  );

  const seq: number = seqResult.rows[0].last_seq;

  // Fetch branch code
  const branchResult = await client.query(
    `SELECT code FROM branches WHERE id = $1`,
    [branchId]
  );

  if (branchResult.rows.length === 0) {
    throw new Error(`Branch ${branchId} not found`);
  }

  const branchCode: string = branchResult.rows[0].code;
  return `${branchCode}-${year}-${seq}`;
}

// â”€â”€â”€ Service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class ReservationService {
  /**
   * Create a confirmed reservation.
   *
   * Flow:
   *  1. Verify active Table_Lock owned by session
   *  2. Validate reservation_time within Business_Hours
   *  3. Validate party_size â‰¤ table.capacity
   *  4. If deposit > 0: require T&C acknowledgement
   *  5. Write reservations record + deposit_transactions + DEL Redis lock atomically
   *  6. Assign reference number
   *
   * Stage 1 note: deposit is recorded as 'pending' but no gateway charge occurs.
   * Stage 2 will activate the gateway call before the DB transaction.
   *
   * Requirements: 9.1â€“9.9, 16.3, 16.5, 16.8
   */
  static async createReservation(
    input: CreateReservationInput,
    actorIp?: string
  ): Promise<CreateReservationResult> {
    const {
      branchId,
      customerId,
      tableId,
      sessionId,
      reservationTime,
      partySize,
      tcAcknowledged,
      specialRequests,
      depositIdempotencyKey,
      depositMethod,
      has_decoration,
      occasion_type,
      decoration_color,
      cake_choice,
      decoration_notes,
      cake_menu_id,
      cake_custom_notes,
      promoCode,
      promoCodeDiscount,
      tableLockId,
      sessionDurationMinutes,
      endTime,
    } = input;

    // â”€â”€ 1. Verify Table_Lock ownership (Requirement 5.4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const lockOwner = await TableLockService.getLockOwner(branchId, tableId);
    if (!lockOwner) {
      throw new LockMissingError(
        `No active table lock for table ${tableId} in branch ${branchId}`
      );
    }
    if (lockOwner !== sessionId) {
      throw new LockOwnershipError(
        `Session ${sessionId} does not own the lock for table ${tableId}`
      );
    }

    // Verify lock is not expired (additional safety check)
    const lockTTL = await TableLockService.getLockTTL(branchId, tableId);
    if (lockTTL === null || lockTTL <= 0) {
      throw new LockExpiredError(
        `Table lock for ${tableId} has expired. Please select a new time slot.`
      );
    }

    // â”€â”€ 2. Validate reservation_time within Business_Hours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const withinHours = await BusinessHoursService.isWithinBusinessHours(
      branchId,
      reservationTime
    );
    if (!withinHours) {
      throw new OutsideBusinessHoursError(
        `Reservation time ${reservationTime.toISOString()} is outside business hours`
      );
    }

    // â”€â”€ 3. Validate party_size â‰¤ table.capacity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const db = getDatabase();
    const tableResult = await db.query(
      `SELECT id, capacity FROM tables WHERE id = $1 AND branch_id = $2 AND is_active = true`,
      [tableId, branchId]
    );
    if (tableResult.rows.length === 0) {
      throw new Error(`Table ${tableId} not found or inactive in branch ${branchId}`);
    }
    const tableCapacity: number = tableResult.rows[0].capacity;
    if (partySize > tableCapacity) {
      throw new PartySizeExceededError(
        `Party size ${partySize} exceeds table capacity ${tableCapacity}`
      );
    }

    // â”€â”€ 4. Deposit / T&C check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const depositConfig = await DepositService.getDepositConfig(branchId);
    const depositRequired = depositConfig.booking_deposit_amt > 0;
    let tcAcknowledgedAt: Date | null = null;

    if (depositRequired) {
      if (!tcAcknowledged) {
        throw new TcAcknowledgementRequiredError(
          'KPDN T&C acknowledgement is required before confirming a reservation with a deposit'
        );
      }
      tcAcknowledgedAt = new Date();

      if (!depositIdempotencyKey || !depositMethod) {
        throw new Error(
          'depositIdempotencyKey and depositMethod are required when deposit > 0'
        );
      }
      // Stage 1: deposit transaction is recorded inside the DB transaction below.
      // Stage 2: call Payment_Gateway here before the DB transaction; on failure
      // preserve the lock and throw DepositFailedError.
    }

    // â”€â”€ 4a. Fetch decoration fee from branch settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const branchResult = await db.query(
      `SELECT decoration_package_price FROM branches WHERE id = $1`,
      [branchId]
    );
    const decorationFee = branchResult.rows.length > 0 
      ? Number(branchResult.rows[0].decoration_package_price) 
      : DEFAULT_DECORATION_FEE;

    // â”€â”€ 4b. Calculate commissions for each service category â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Build service amounts map: only include categories with a non-zero amount.
    const serviceAmounts: Partial<Record<CommissionCategory, number>> = {};
    if (has_decoration) {
      serviceAmounts['decoration'] = decorationFee;
    }
    // cake_choice (string) or cake_menu_id (UUID) indicates a cake service.
    if (cake_menu_id) {
      // Fetch actual cake price from menu_items, ensuring it belongs to a 'cakes' section
      const cakeResult = await db.query(
        `SELECT i.price 
         FROM menu_items i
         JOIN menu_sections s ON i.section_id = s.id
         WHERE i.id = $1 AND s.section_type = 'cakes'`,
        [cake_menu_id]
      );
      if (cakeResult.rows.length > 0) {
        serviceAmounts['cake'] = Number(cakeResult.rows[0].price);
      } else {
        // Not a cake or not found — log warning but continue (legacy support)
        logger.warn({ cake_menu_id, branchId }, 'Provided cake_menu_id is not in a Cakes section');
        serviceAmounts['cake'] = decorationFee;
      }
    } else if (cake_choice) {
      // Legacy text-based choice, use decoration fee as proxy
      serviceAmounts['cake'] = decorationFee;
    }

    const commissionBreakdown = await CommissionService.calculateReservationCommissions(
      branchId,
      serviceAmounts
    );

    logger.info(
      {
        event: 'commission_calculated',
        branch_id: branchId,
        total_commission: commissionBreakdown.totalCommission,
        breakdown: commissionBreakdown.items.map((i) => ({
          category: i.category,
          amount: i.commissionAmount,
          enabled: i.isEnabled,
        })),
      },
      'Commission calculated for reservation'
    );

    // â”€â”€ 5. Compute deposit amounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const decorationAmount = has_decoration ? decorationFee : 0;

    let cakeDeposit = 0;
    if (cake_menu_id) {
      if (depositConfig.cake_deposit_type === 'percentage') {
        const cakePrice = serviceAmounts['cake'] || 0;
        cakeDeposit = Math.round((cakePrice * depositConfig.cake_deposit_amt) / 100 * 100) / 100;
      } else {
        cakeDeposit = depositConfig.cake_deposit_amt;
      }
    }

    const totalDeposit = depositRequired
      ? depositConfig.booking_deposit_amt + decorationAmount + cakeDeposit
      : decorationAmount + cakeDeposit;

    const finalDepositAmount = totalDeposit;

    // â”€â”€ 6. Write reservation + deposit record atomically â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const reservation = await transaction(async (client) => {
      const referenceNumber = await generateReferenceNumber(branchId, client);

      const insertResult = await client.query<Reservation>(
        `INSERT INTO reservations
           (branch_id, customer_id, table_id, reference_number, reservation_time,
            party_size, status, deposit_paid, tc_acknowledged_at, special_requests,
            has_decoration, decoration_amount, occasion_type, decoration_color,
            cake_choice, decoration_notes, cake_menu_id, cake_custom_notes,
            promo_code, promo_code_discount, table_lock_id, session_duration_minutes, end_time)
         VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         RETURNING id, branch_id, customer_id, table_id, reference_number,
                   reservation_time, party_size, status, deposit_paid,
                   tc_acknowledged_at, special_requests, created_at,
                   has_decoration, decoration_amount, occasion_type,
                   decoration_color, cake_choice, decoration_notes,
                   cake_menu_id, cake_custom_notes,
                   promo_code, promo_code_discount, table_lock_id, session_duration_minutes, end_time`,
        [
          branchId,
          customerId,
          tableId,
          referenceNumber,
          reservationTime.toISOString(),
          partySize,
          totalDeposit,
          tcAcknowledgedAt ? tcAcknowledgedAt.toISOString() : null,
          specialRequests ?? null,
          has_decoration ?? false,
          decorationAmount,
          occasion_type ?? null,
          decoration_color ?? null,
          cake_choice ?? null,
          decoration_notes ?? null,
          cake_menu_id ?? null,
          cake_custom_notes ?? null,
          promoCode ?? null,
          promoCodeDiscount ?? null,
          tableLockId ?? null,
          sessionDurationMinutes ?? null,
          endTime ? endTime.toISOString() : null,
        ]
      );

      const res = insertResult.rows[0];

      // Record deposit transaction with the real reservation ID
      if (depositRequired && depositIdempotencyKey && depositMethod) {
        await client.query(
          `INSERT INTO deposit_transactions
             (branch_id, reservation_id, amount, decoration_amount, method, idempotency_key, status, is_refund)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', false)
           ON CONFLICT (idempotency_key) DO UPDATE
             SET reservation_id = EXCLUDED.reservation_id`,
          [
            branchId,
            res.id,
            totalDeposit,
            decorationAmount,
            depositMethod,
            depositIdempotencyKey,
          ]
        );
      }

      // Record commission transactions for each enabled service category (task 36.3)
      if (commissionBreakdown.items.length > 0) {
        await CommissionService.recordCommissionCharges(
          res.id,
          branchId,
          commissionBreakdown,
          client
        );
      }

      return res;
    });

    // â”€â”€ 6. Release Redis lock (after DB commit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Released after the transaction commits to avoid a window where the
    // reservation exists but the lock is still held.
    try {
      await TableLockService.releaseLock(branchId, tableId, sessionId);
    } catch (err) {
      // Non-fatal: reservation is already confirmed. Log and continue.
      logger.warn(
        { err, branchId, tableId, sessionId, reservationId: reservation.id },
        'Failed to release table lock after reservation confirmation â€” lock will expire naturally'
      );
    }

    // â”€â”€ Audit log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await AuditService.logCreate(
      branchId,
      customerId,
      'reservation',
      reservation.id,
      {
        reference_number: reservation.reference_number,
        table_id: tableId,
        reservation_time: reservationTime.toISOString(),
        party_size: partySize,
        deposit_paid: reservation.deposit_paid,
      },
      actorIp
    );

    // Fetch customer, section, and table details for notification alert (parallelized)
    const [customerResult, sectionResult, tableDataResult] = await Promise.all([
      db.query(`SELECT name, email, phone FROM customers WHERE id = $1`, [customerId]),
      db.query(
        `SELECT s.name FROM sections s JOIN tables t ON t.section_id = s.id WHERE t.id = $1`,
        [tableId]
      ),
      db.query(`SELECT name FROM tables WHERE id = $1`, [tableId]),
    ]);
    const customer = customerResult.rows[0];
    const section = sectionResult.rows[0];
    const tableData = tableDataResult.rows[0];

    // Publish real-time notification alert
    await NotificationAlertService.publishAlert(db, {
      type: 'reservation_created',
      branchId,
      reservation: {
        id: reservation.id,
        referenceNumber: reservation.reference_number,
        customerName: customer?.name || 'Unknown',
        customerEmail: customer?.email || '',
        customerPhone: customer?.phone || '',
        reservationTime: reservation.reservation_time,
        partySize: reservation.party_size,
        sectionName: section?.name || 'Unknown',
        tableName: tableData?.name || 'Unknown',
        tableId: reservation.table_id,
        hasDecoration: reservation.has_decoration,
        decorationType: reservation.occasion_type,
        decorationColor: reservation.decoration_color,
        cakeChoice: reservation.cake_choice,
      },
    }).catch((err) => {
      logger.error(
        { err, reservation_id: reservation.id, branch_id: branchId },
        'Failed to publish reservation_created alert'
      );
    });

    logger.info(
      {
        event: 'reservation_confirmed',
        branch_id: branchId,
        reservation_id: reservation.id,
        reference_number: reservation.reference_number,
        customer_id: customerId,
        table_id: tableId,
        deposit_paid: reservation.deposit_paid,
      },
      'Reservation confirmed'
    );

    return {
      reservation,
      depositRequired,
      depositAmount: finalDepositAmount,
      commissionBreakdown,
    };
  }

  /**
   * Get a reservation by reference number.
   * Requirements: 9.3
   */
  static async getByReference(
    branchId: string,
    referenceNumber: string
  ): Promise<Reservation | null> {
    const db = getDatabase();
    const result = await db.query<Reservation>(
      `SELECT id, branch_id, customer_id, table_id, reference_number,
              reservation_time, party_size, status, deposit_paid,
              tc_acknowledged_at, special_requests, seated_at, seated_by, created_at,
              has_decoration, decoration_amount, occasion_type,
              decoration_color, cake_choice, decoration_notes
       FROM reservations
       WHERE branch_id = $1 AND reference_number = $2`,
      [branchId, referenceNumber]
    );
    return result.rows[0] ?? null;
  }

  /**
   * List all reservations for a branch (manager view).
   * Requirements: 9.3
   */
  static async listByBranch(
    branchId: string,
    filters?: { status?: ReservationStatus; date?: string; tableId?: string },
    timezone = 'Asia/Kuala_Lumpur'
  ): Promise<Reservation[]> {
    const db = getDatabase();
    const conditions: string[] = ['r.branch_id = $1'];
    const values: any[] = [branchId];
    let idx = 2;

    if (filters?.status) {
      conditions.push(`r.status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters?.date) {
      conditions.push(`DATE(r.reservation_time AT TIME ZONE $${idx++}) = $${idx++}`);
      values.push(timezone, filters.date);
    }
    if (filters?.tableId) {
      conditions.push(`r.table_id = $${idx++}`);
      values.push(filters.tableId);
    }

    const result = await db.query<Reservation>(
      `SELECT r.id, r.branch_id, r.customer_id, r.table_id, r.reference_number,
              r.reservation_time, r.party_size, r.status, r.deposit_paid,
              r.tc_acknowledged_at, r.special_requests, r.seated_at, r.seated_by, r.created_at,
              r.has_decoration, r.decoration_amount, r.occasion_type,
              r.decoration_color, r.cake_choice, r.decoration_notes,
              r.cake_custom_notes, r.promo_code,
              c.name  AS customer_name,
              c.email AS customer_email,
              c.phone AS customer_phone,
              t.name  AS table_name
       FROM reservations r
       LEFT JOIN customers c ON c.id = r.customer_id
       LEFT JOIN tables t ON t.id = r.table_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.reservation_time ASC`,
      values
    );
    return result.rows;
  }

  /**
   * Modify an existing confirmed reservation.
   * Requirements: 17.1â€“17.7
   */
  static async modifyReservation(
    branchId: string,
    referenceNumber: string,
    actorId: string,
    input: ModifyReservationInput,
    actorIp?: string
  ): Promise<Reservation> {
    const reservation = await ReservationService.getByReference(branchId, referenceNumber);
    if (!reservation) {
      throw new ReservationNotFoundError(`Reservation ${referenceNumber} not found`);
    }
    if (reservation.customer_id !== actorId) {
      throw new ReservationAccessDeniedError('Access denied');
    }
    if (reservation.status !== 'confirmed') {
      throw new ReservationNotModifiableError(
        `Reservation is not modifiable in status: ${reservation.status}`
      );
    }

    const timingConfig = await BusinessHoursService.getTimingConfig(branchId);
    const targetTime = input.newReservationTime ?? new Date(reservation.reservation_time);
    const now = new Date();
    const msUntilReservation = targetTime.getTime() - now.getTime();
    const cutoffMs = timingConfig.mod_cutoff_hours * 3600 * 1000;

    if (msUntilReservation < cutoffMs) {
      throw new ModificationCutoffError(
        `Modification cutoff reached â€” must modify at least ${timingConfig.mod_cutoff_hours}h before reservation`
      );
    }

    if (input.newReservationTime) {
      const withinHours = await BusinessHoursService.isWithinBusinessHours(
        branchId,
        input.newReservationTime
      );
      if (!withinHours) {
        throw new OutsideBusinessHoursError(
          `New reservation time is outside business hours`
        );
      }
    }

    const db = getDatabase();
    const newTableId = input.newTableId ?? reservation.table_id;
    const newPartySize = input.newPartySize ?? reservation.party_size;
    const tableChanged = newTableId !== reservation.table_id;

    if (tableChanged) {
      const tableResult = await db.query(
        `SELECT capacity FROM tables WHERE id = $1 AND branch_id = $2 AND is_active = true`,
        [newTableId, branchId]
      );
      if (tableResult.rows.length === 0) {
        throw new Error(`Table ${newTableId} not found or inactive`);
      }
      if (newPartySize > tableResult.rows[0].capacity) {
        throw new PartySizeExceededError(
          `Party size ${newPartySize} exceeds new table capacity ${tableResult.rows[0].capacity}`
        );
      }

      const lockResult = await TableLockService.transferLock(
        branchId,
        reservation.table_id,
        newTableId,
        input.sessionId
      );
      if (!lockResult.acquired) {
        throw new LockTransferError(
          `Could not acquire lock on new table ${newTableId}`,
          lockResult.alternatives
        );
      }
    }

    const oldValues = {
      table_id: reservation.table_id,
      reservation_time: reservation.reservation_time,
      party_size: reservation.party_size,
    };

    const updateResult = await db.query<Reservation>(
      `UPDATE reservations
       SET table_id = $1,
           reservation_time = $2,
           party_size = $3
       WHERE id = $4
       RETURNING id, branch_id, customer_id, table_id, reference_number,
                 reservation_time, party_size, status, deposit_paid,
                 tc_acknowledged_at, special_requests, seated_at, seated_by, created_at,
                 has_decoration, decoration_amount, occasion_type,
                 decoration_color, cake_choice, decoration_notes`,
      [
        newTableId,
        (input.newReservationTime ?? new Date(reservation.reservation_time)).toISOString(),
        newPartySize,
        reservation.id,
      ]
    );

    const updated = updateResult.rows[0];

    if (tableChanged) {
      WebSocketPublisher.publishTableStatusChanged(branchId, reservation.table_id, 'available')
        .catch((err) => logger.error({ err }, 'Failed to publish WS old table available'));
      WebSocketPublisher.publishTableStatusChanged(branchId, newTableId, 'reserved')
        .catch((err) => logger.error({ err }, 'Failed to publish WS new table reserved'));
    }

    await AuditService.logUpdate(
      branchId,
      actorId,
      'reservation',
      reservation.id,
      oldValues,
      { table_id: newTableId, reservation_time: updated.reservation_time, party_size: newPartySize },
      actorIp
    );

    logger.info({
      event: 'reservation_modified',
      branch_id: branchId,
      reservation_id: reservation.id,
      reference_number: referenceNumber,
      actor_id: actorId,
      old: oldValues,
      new: { table_id: newTableId, reservation_time: updated.reservation_time, party_size: newPartySize },
    }, 'Reservation modified');

    return updated;
  }

  /**
   * Cancel a reservation (customer or manager).
   * Requirements: 17.1â€“17.12
   */
  static async cancelReservation(
    branchId: string,
    referenceNumber: string,
    actorId: string,
    actorRole: 'customer' | 'manager' | 'admin',
    actorIp?: string
  ): Promise<{ reservation: Reservation; refundResult: RefundResult | null }> {
    const reservation = await ReservationService.getByReference(branchId, referenceNumber);
    if (!reservation) {
      throw new ReservationNotFoundError(`Reservation ${referenceNumber} not found`);
    }
    if (actorRole === 'customer' && reservation.customer_id !== actorId) {
      throw new ReservationAccessDeniedError('Access denied');
    }
    if (reservation.status !== 'confirmed' && reservation.status !== 'seated') {
      throw new ReservationNotModifiableError(
        `Reservation cannot be cancelled in status: ${reservation.status}`
      );
    }

    const db = getDatabase();
    const updateResult = await db.query<Reservation>(
      `UPDATE reservations SET status = 'cancelled'
       WHERE id = $1
       RETURNING id, branch_id, customer_id, table_id, reference_number,
                 reservation_time, party_size, status, deposit_paid,
                 tc_acknowledged_at, special_requests, seated_at, seated_by, created_at,
                 has_decoration, decoration_amount, occasion_type,
                 decoration_color, cake_choice, decoration_notes`,
      [reservation.id]
    );
    const cancelled = updateResult.rows[0];

    WebSocketPublisher.publishTableStatusChanged(branchId, reservation.table_id, 'available')
      .catch((err) => logger.error({ err }, 'Failed to publish WS table available on cancel'));

    let refundResult: RefundResult | null = null;
    if (Number(reservation.deposit_paid) > 0) {
      try {
        refundResult = await DepositService.refundDeposit(reservation.id, new Date());
      } catch (err) {
        logger.error(
          { err, reservation_id: reservation.id, branch_id: branchId },
          'Deposit refund failed â€” logged for manual resolution'
        );
        // Non-fatal: cancellation proceeds regardless
      }
    }

    // Process commission refunds for each service category (task 36.5, 37.2)
    try {
      await CommissionService.processCommissionRefunds(
        reservation.id,
        branchId,
        new Date(),
        new Date(reservation.reservation_time)
      );
    } catch (err) {
      logger.error(
        { err, reservation_id: reservation.id, branch_id: branchId },
        'Commission refund processing failed â€” logged for manual resolution'
      );
      // Non-fatal: cancellation proceeds regardless
    }

    await AuditService.logUpdate(
      branchId,
      actorId,
      'reservation',
      reservation.id,
      { status: reservation.status },
      { status: 'cancelled', cancelled_by_role: actorRole, refund_amount: refundResult?.refundAmount ?? 0 },
      actorIp
    );

    // Fetch customer, section, and table details for notification alert
    const cancelCustomerResult = await db.query(
      `SELECT name, email, phone FROM customers WHERE id = $1`,
      [reservation.customer_id]
    );
    const cancelCustomer = cancelCustomerResult.rows[0];

    const cancelSectionResult = await db.query(
      `SELECT s.name FROM sections s JOIN tables t ON t.section_id = s.id WHERE t.id = $1`,
      [reservation.table_id]
    );
    const cancelSection = cancelSectionResult.rows[0];

    const cancelTableResult = await db.query(
      `SELECT name FROM tables WHERE id = $1`,
      [reservation.table_id]
    );
    const cancelTable = cancelTableResult.rows[0];

    // Publish real-time notification alert
    await NotificationAlertService.publishAlert(db, {
      type: 'reservation_cancelled',
      branchId,
      reservation: {
        id: reservation.id,
        referenceNumber: reservation.reference_number,
        customerName: cancelCustomer?.name || 'Unknown',
        customerEmail: cancelCustomer?.email || '',
        customerPhone: cancelCustomer?.phone || '',
        reservationTime: reservation.reservation_time,
        partySize: reservation.party_size,
        sectionName: cancelSection?.name || 'Unknown',
        tableName: cancelTable?.name || 'Unknown',
        tableId: reservation.table_id,
        hasDecoration: reservation.has_decoration,
        decorationType: reservation.occasion_type,
        decorationColor: reservation.decoration_color,
        cakeChoice: reservation.cake_choice,
      },
    }).catch((err) => {
      logger.error(
        { err, reservation_id: reservation.id, branch_id: branchId },
        'Failed to publish reservation_cancelled alert'
      );
    });

    logger.info({
      event: 'reservation_cancelled',
      branch_id: branchId,
      reservation_id: reservation.id,
      reference_number: referenceNumber,
      actor_id: actorId,
      actor_role: actorRole,
      refund_amount: refundResult?.refundAmount ?? 0,
    }, 'Reservation cancelled');

    return { reservation: cancelled, refundResult };
  }

  /**
   * Mark a reservation as seated.
   * Requirements: 11.6, 11.7
   */
  static async seatReservation(
    branchId: string,
    referenceNumber: string,
    staffId: string,
    actorIp?: string
  ): Promise<Reservation> {
    const reservation = await ReservationService.getByReference(branchId, referenceNumber);
    if (!reservation) {
      throw new ReservationNotFoundError(`Reservation ${referenceNumber} not found`);
    }
    if (reservation.status !== 'confirmed') {
      throw new ReservationNotModifiableError(
        `Reservation cannot be seated in status: ${reservation.status}`
      );
    }

    const db = getDatabase();
    const updateResult = await db.query<Reservation>(
      `UPDATE reservations
       SET status = 'seated', seated_at = NOW(), seated_by = $1
       WHERE id = $2
       RETURNING id, branch_id, customer_id, table_id, reference_number,
                 reservation_time, party_size, status, deposit_paid,
                 tc_acknowledged_at, special_requests, seated_at, seated_by, created_at,
                 has_decoration, decoration_amount, occasion_type,
                 decoration_color, cake_choice, decoration_notes`,
      [staffId, reservation.id]
    );
    const seated = updateResult.rows[0];

    WebSocketPublisher.publishTableStatusChanged(branchId, reservation.table_id, 'occupied')
      .catch((err) => logger.error({ err }, 'Failed to publish WS table occupied on seat'));

    await AuditService.logUpdate(
      branchId,
      staffId,
      'reservation',
      reservation.id,
      { status: reservation.status },
      { status: 'seated', seated_by: staffId },
      actorIp
    );

    logger.info({
      event: 'reservation_seated',
      branch_id: branchId,
      reservation_id: reservation.id,
      reference_number: referenceNumber,
      staff_id: staffId,
    }, 'Reservation seated');

    return seated;
  }

  /**
   * Mark a reservation as closed (finished).
   * Usually called when the table is cleared.
   */
  static async closeReservation(
    branchId: string,
    reservationId: string,
    staffId: string,
    actorIp?: string
  ): Promise<Reservation> {
    const db = getDatabase();
    
    // 1. Fetch current status for audit
    const fetchResult = await db.query<Reservation>(
      `SELECT status, table_id FROM reservations WHERE id = $1 AND branch_id = $2`,
      [reservationId, branchId]
    );
    if (fetchResult.rows.length === 0) {
      throw new ReservationNotFoundError(`Reservation ${reservationId} not found`);
    }
    const reservation = fetchResult.rows[0];

    // 2. Update to closed
    const updateResult = await db.query<Reservation>(
      `UPDATE reservations
       SET status = 'closed', updated_at = NOW()
       WHERE id = $1
       RETURNING id, branch_id, customer_id, table_id, reference_number,
                 reservation_time, party_size, status, deposit_paid,
                 tc_acknowledged_at, special_requests, seated_at, seated_by, created_at,
                 has_decoration, decoration_amount, occasion_type,
                 decoration_color, cake_choice, decoration_notes`,
      [reservationId]
    );
    const closed = updateResult.rows[0];

    // 3. Emit WS table available
    WebSocketPublisher.publishTableStatusChanged(branchId, reservation.table_id, 'available')
      .catch((err) => logger.error({ err }, 'Failed to publish WS table available on close'));

    // 4. Audit log
    await AuditService.logUpdate(
      branchId,
      staffId,
      'reservation',
      reservationId,
      { status: reservation.status },
      { status: 'closed' },
      actorIp
    );

    return closed;
  }

  /**
   * Update decoration details on a reservation before it is confirmed.
   * Requirements: 22.2
   */
  static async updateDecorationDetails(
    branchId: string,
    referenceNumber: string,
    customerId: string,
    input: {
      has_decoration?: boolean;
      occasion_type?: string | null;
      decoration_color?: string | null;
      cake_choice?: string | null;
      decoration_notes?: string | null;
    },
    actorIp?: string
  ): Promise<Reservation> {
    const reservation = await ReservationService.getByReference(branchId, referenceNumber);
    if (!reservation) {
      throw new ReservationNotFoundError(`Reservation ${referenceNumber} not found`);
    }
    if (reservation.customer_id !== customerId) {
      throw new ReservationAccessDeniedError('Access denied');
    }
    // Only allow updates before the reservation is seated/closed/cancelled
    if (reservation.status !== 'confirmed') {
      throw new ReservationNotModifiableError(
        `Decoration details can only be updated on confirmed reservations (current status: ${reservation.status})`
      );
    }

    // Fetch decoration fee from branch settings
    const db = getDatabase();
    const branchResult = await db.query(
      `SELECT decoration_package_price FROM branches WHERE id = $1`,
      [branchId]
    );
    const decorationFee = branchResult.rows.length > 0 
      ? Number(branchResult.rows[0].decoration_package_price) 
      : DEFAULT_DECORATION_FEE;

    // Determine new has_decoration value
    const newHasDecoration =
      input.has_decoration !== undefined ? input.has_decoration : reservation.has_decoration;

    // Recalculate decoration_amount and deposit_paid if has_decoration changed
    const oldHasDecoration = reservation.has_decoration;
    const decorationChanged = newHasDecoration !== oldHasDecoration;
    const newDecorationAmount = newHasDecoration ? decorationFee : 0;
    const depositDelta = decorationChanged
      ? newDecorationAmount - Number(reservation.decoration_amount)
      : 0;
    const newDepositPaid = Number(reservation.deposit_paid) + depositDelta;

    const updateResult = await db.query<Reservation>(
      `UPDATE reservations
       SET has_decoration    = $1,
           decoration_amount = $2,
           deposit_paid      = $3,
           occasion_type     = COALESCE($4, occasion_type),
           decoration_color  = COALESCE($5, decoration_color),
           cake_choice       = COALESCE($6, cake_choice),
           decoration_notes  = COALESCE($7, decoration_notes)
       WHERE id = $8
       RETURNING id, branch_id, customer_id, table_id, reference_number,
                 reservation_time, party_size, status, deposit_paid,
                 tc_acknowledged_at, special_requests, seated_at, seated_by, created_at,
                 has_decoration, decoration_amount, occasion_type,
                 decoration_color, cake_choice, decoration_notes`,
      [
        newHasDecoration,
        newDecorationAmount,
        newDepositPaid,
        input.occasion_type !== undefined ? input.occasion_type : null,
        input.decoration_color !== undefined ? input.decoration_color : null,
        input.cake_choice !== undefined ? input.cake_choice : null,
        input.decoration_notes !== undefined ? input.decoration_notes : null,
        reservation.id,
      ]
    );

    const updated = updateResult.rows[0];

    await AuditService.logUpdate(
      branchId,
      customerId,
      'reservation',
      reservation.id,
      {
        has_decoration: oldHasDecoration,
        decoration_amount: reservation.decoration_amount,
        deposit_paid: reservation.deposit_paid,
        occasion_type: reservation.occasion_type,
        decoration_color: reservation.decoration_color,
        cake_choice: reservation.cake_choice,
        decoration_notes: reservation.decoration_notes,
      },
      {
        has_decoration: newHasDecoration,
        decoration_amount: newDecorationAmount,
        deposit_paid: newDepositPaid,
        occasion_type: updated.occasion_type,
        decoration_color: updated.decoration_color,
        cake_choice: updated.cake_choice,
        decoration_notes: updated.decoration_notes,
      },
      actorIp
    );

    logger.info({
      event: 'reservation_decoration_updated',
      branch_id: branchId,
      reservation_id: reservation.id,
      reference_number: referenceNumber,
      customer_id: customerId,
      decoration_changed: decorationChanged,
      new_deposit_paid: newDepositPaid,
    }, 'Reservation decoration details updated');

    return updated;
  }

  /**
   * Override a no-show reservation back to confirmed (manager).
   * Requirements: 11.8
   */
  static async overrideNoShow(
    branchId: string,
    referenceNumber: string,
    managerId: string,
    actorIp?: string
  ): Promise<Reservation> {
    const reservation = await ReservationService.getByReference(branchId, referenceNumber);
    if (!reservation) {
      throw new ReservationNotFoundError(`Reservation ${referenceNumber} not found`);
    }
    if (reservation.status !== 'no_show') {
      throw new ReservationNotModifiableError(
        `Reservation is not in no_show status: ${reservation.status}`
      );
    }

    const db = getDatabase();
    const updateResult = await db.query<Reservation>(
      `UPDATE reservations SET status = 'confirmed'
       WHERE id = $1
       RETURNING id, branch_id, customer_id, table_id, reference_number,
                 reservation_time, party_size, status, deposit_paid,
                 tc_acknowledged_at, special_requests, seated_at, seated_by, created_at,
                 has_decoration, decoration_amount, occasion_type,
                 decoration_color, cake_choice, decoration_notes`,
      [reservation.id]
    );
    const reinstated = updateResult.rows[0];

    WebSocketPublisher.publishTableStatusChanged(branchId, reservation.table_id, 'reserved')
      .catch((err) => logger.error({ err }, 'Failed to publish WS table reserved on no-show override'));

    await AuditService.logUpdate(
      branchId,
      managerId,
      'reservation',
      reservation.id,
      { status: 'no_show' },
      { status: 'confirmed', overridden_by: managerId },
      actorIp
    );

    logger.info({
      event: 'no_show_overridden',
      branch_id: branchId,
      reservation_id: reservation.id,
      reference_number: referenceNumber,
      manager_id: managerId,
    }, 'No-show overridden to confirmed');

    return reinstated;
  }
}

// â”€â”€â”€ Domain errors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class LockMissingError extends Error {
  readonly code = 'LOCK_MISSING';
  constructor(message: string) { super(message); this.name = 'LockMissingError'; }
}

export class LockExpiredError extends Error {
  readonly code = 'LOCK_EXPIRED';
  constructor(message: string) { super(message); this.name = 'LockExpiredError'; }
}

export class LockOwnershipError extends Error {
  readonly code = 'LOCK_OWNERSHIP';
  constructor(message: string) { super(message); this.name = 'LockOwnershipError'; }
}

export class OutsideBusinessHoursError extends Error {
  readonly code = 'OUTSIDE_BUSINESS_HOURS';
  constructor(message: string) { super(message); this.name = 'OutsideBusinessHoursError'; }
}

export class PartySizeExceededError extends Error {
  readonly code = 'PARTY_SIZE_EXCEEDED';
  constructor(message: string) { super(message); this.name = 'PartySizeExceededError'; }
}

export class TcAcknowledgementRequiredError extends Error {
  readonly code = 'TC_ACKNOWLEDGEMENT_REQUIRED';
  constructor(message: string) { super(message); this.name = 'TcAcknowledgementRequiredError'; }
}

export class DepositFailedError extends Error {
  readonly code = 'DEPOSIT_FAILED';
  constructor(message: string) { super(message); this.name = 'DepositFailedError'; }
}

export class ModificationCutoffError extends Error {
  readonly code = 'MODIFICATION_CUTOFF';
  constructor(message: string) { super(message); this.name = 'ModificationCutoffError'; }
}

export class LockTransferError extends Error {
  readonly code = 'LOCK_TRANSFER_FAILED';
  readonly alternatives?: import('./table-lock.service.js').Table[];
  constructor(message: string, alternatives?: import('./table-lock.service.js').Table[]) {
    super(message);
    this.name = 'LockTransferError';
    this.alternatives = alternatives;
  }
}

export class ReservationNotModifiableError extends Error {
  readonly code = 'RESERVATION_NOT_MODIFIABLE';
  constructor(message: string) { super(message); this.name = 'ReservationNotModifiableError'; }
}

export class ReservationNotFoundError extends Error {
  readonly code = 'RESERVATION_NOT_FOUND';
  constructor(message: string) { super(message); this.name = 'ReservationNotFoundError'; }
}

export class ReservationAccessDeniedError extends Error {
  readonly code = 'RESERVATION_ACCESS_DENIED';
  constructor(message: string) { super(message); this.name = 'ReservationAccessDeniedError'; }
}

export default ReservationService;
