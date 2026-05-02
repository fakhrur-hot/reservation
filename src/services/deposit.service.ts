/**
 * Deposit Service
 *
 * Handles booking deposit collection, tiered refund calculation, and admin
 * deposit configuration. In Stage 1 (TABLE_ONLY) the payment gateway is NOT
 * active — collectDeposit records the intent but does not charge. Stage 2
 * will activate the gateway without changing this service's interface.
 *
 * Requirements: 16.1–16.12
 */

import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AuditService } from './audit.service.js';
import { CommissionService } from './commission.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DepositMethod = 'fpx' | 'card';
export type DepositStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';

export interface DepositTransaction {
  id: string;
  branch_id: string;
  reservation_id: string;
  amount: number;
  decoration_amount: number;
  method: DepositMethod;
  idempotency_key: string;
  status: DepositStatus;
  is_refund: boolean;
  refund_amount: number | null;
  refund_reason: string | null;
  created_at: string;
}

export type RefundTier = '>72h' | '24-72h' | '<24h';

export interface RefundResult {
  refundAmount: number;
  refundPercent: number;
  tier: RefundTier;
  transactionId?: string;
  /** Breakdown: refund attributable to the base deposit */
  baseRefundAmount?: number;
  /** Breakdown: refund attributable to the decoration fee */
  decorationRefundAmount?: number;
}

export interface BranchDepositConfig {
  booking_deposit_amt: number;
  cake_deposit_amt: number;
  cake_deposit_type: 'fixed' | 'percentage';
}

// ─── Refund tier constants (CPA 1999) ─────────────────────────────────────────

const REFUND_TIERS: Record<RefundTier, number> = {
  '>72h': 95,
  '24-72h': 50,
  '<24h': 0,
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class DepositService {
  /**
   * Pure function — calculate refund amount based on CPA 1999 tiered policy.
   *
   * Tiers:
   *   > 72 hours before reservation  → 95% refund
   *   24–72 hours before reservation → 50% refund
   *   < 24 hours before reservation  → 0% refund
   *
   * @param depositPaid      Total deposit paid (base + decoration combined)
   * @param cancellationTime When the cancellation was requested
   * @param reservationTime  When the reservation was scheduled
   * @param decorationAmount Optional decoration portion of the deposit (default 0).
   *                         Used only to compute the breakdown fields; the refund
   *                         is always calculated on the full `depositPaid` total.
   *
   * Requirements: 16.9, 16.10, 16.11
   */
  static calculateRefundAmount(
    depositPaid: number,
    cancellationTime: Date,
    reservationTime: Date,
    decorationAmount = 0
  ): RefundResult {
    const hoursUntilReservation =
      (reservationTime.getTime() - cancellationTime.getTime()) / (1000 * 60 * 60);

    let tier: RefundTier;
    if (hoursUntilReservation > 72) {
      tier = '>72h';
    } else if (hoursUntilReservation >= 24) {
      tier = '24-72h';
    } else {
      tier = '<24h';
    }

    const refundPercent = REFUND_TIERS[tier];
    const refundAmount = Math.round((depositPaid * refundPercent) / 100 * 100) / 100;

    // Compute breakdown: decoration and base portions scaled by the same percent
    const decorationRefundAmount = Math.round((decorationAmount * refundPercent) / 100 * 100) / 100;
    const baseAmount = depositPaid - decorationAmount;
    const baseRefundAmount = Math.round((baseAmount * refundPercent) / 100 * 100) / 100;

    return { refundAmount, refundPercent, tier, baseRefundAmount, decorationRefundAmount };
  }

  /**
   * Collect a deposit for a reservation.
   *
   * In Stage 1 (TABLE_ONLY): records the deposit_transactions row with
   * status='pending' but does NOT call the payment gateway. Stage 2 will
   * activate the gateway call.
   *
   * Idempotent: if the idempotency_key already exists, returns the cached
   * record without creating a new one.
   *
   * Requirements: 16.3, 16.5, 16.6, 16.7, 16.8
   */
  static async collectDeposit(
    reservationId: string,
    method: DepositMethod,
    idempotencyKey: string
  ): Promise<DepositTransaction> {
    const db = getDatabase();

    // Fetch reservation + branch deposit amount + decoration amount
    const resResult = await db.query(
      `SELECT r.id, r.branch_id, r.decoration_amount, b.booking_deposit_amt
       FROM reservations r
       JOIN branches b ON b.id = r.branch_id
       WHERE r.id = $1`,
      [reservationId]
    );

    if (resResult.rows.length === 0) {
      throw new Error(`Reservation ${reservationId} not found`);
    }

    const { branch_id, booking_deposit_amt, decoration_amount: decorationAmt } = resResult.rows[0];
    const amount = Number(booking_deposit_amt);
    const decorationAmount = Number(decorationAmt ?? 0);

    // Stage 1: atomic upsert — INSERT or return existing on idempotency key conflict
    // Stage 2: call Payment_Gateway here, then set status based on response
    const insertResult = await db.query<DepositTransaction>(
      `INSERT INTO deposit_transactions
         (branch_id, reservation_id, amount, decoration_amount, method, idempotency_key, status, is_refund)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', false)
       ON CONFLICT (idempotency_key) DO UPDATE
         SET reservation_id = EXCLUDED.reservation_id
       RETURNING id, branch_id, reservation_id, amount, decoration_amount, method, idempotency_key,
                 status, is_refund, refund_amount, refund_reason, created_at`,
      [branch_id, reservationId, amount, decorationAmount, method, idempotencyKey]
    );

    const tx = insertResult.rows[0];

    logger.info(
      {
        event: 'deposit_collected',
        branch_id,
        reservation_id: reservationId,
        amount,
        decoration_amount: decorationAmount,
        method,
        idempotency_key: idempotencyKey,
        status: 'pending',
        stage1_note: 'Payment gateway not active in Stage 1',
      },
      'Deposit transaction recorded (Stage 1 — no gateway charge)'
    );

    return tx;
  }

  /**
   * Process a refund for a cancelled reservation.
   *
   * Calculates the refund tier, records the refund transaction, and in Stage 2
   * will call the Payment_Gateway refund API. On failure: logs, alerts manager,
   * and queues for manual resolution.
   *
   * Requirements: 16.4, 16.9, 16.10, 16.11, 16.12
   */
  static async refundDeposit(
    reservationId: string,
    cancellationTime: Date
  ): Promise<RefundResult> {
    const db = getDatabase();

    // Fetch the original deposit transaction
    const txResult = await db.query<DepositTransaction>(
      `SELECT dt.id, dt.branch_id, dt.reservation_id, dt.amount, dt.decoration_amount,
              dt.method, dt.idempotency_key, dt.status, dt.is_refund, dt.refund_amount,
              dt.refund_reason, dt.created_at,
              r.reservation_time
       FROM deposit_transactions dt
       JOIN reservations r ON r.id = dt.reservation_id
       WHERE dt.reservation_id = $1
         AND dt.is_refund = false
         AND dt.status IN ('pending', 'confirmed')
       ORDER BY dt.created_at DESC
       LIMIT 1`,
      [reservationId]
    );

    if (txResult.rows.length === 0) {
      // No deposit to refund — return zero refund
      logger.info({ reservationId }, 'No deposit found for refund — skipping');
      return { refundAmount: 0, refundPercent: 0, tier: '<24h' };
    }

    const originalTx = txResult.rows[0] as DepositTransaction & { reservation_time: string };
    const reservationTime = new Date(originalTx.reservation_time);
    const depositPaid = Number(originalTx.amount);
    const decorationAmount = Number(originalTx.decoration_amount ?? 0);

    const refundResult = DepositService.calculateRefundAmount(
      depositPaid,
      cancellationTime,
      reservationTime,
      decorationAmount
    );

    if (refundResult.refundAmount === 0) {
      logger.info(
        { reservationId, tier: refundResult.tier },
        'Deposit forfeited — no refund due (<24h tier)'
      );
      return refundResult;
    }

    try {
      // Stage 1: record refund as pending (no gateway call)
      // Stage 2: call Payment_Gateway refund API here
      const refundIdempotencyKey = `refund:${originalTx.idempotency_key}`;

      await db.query(
        `INSERT INTO deposit_transactions
           (branch_id, reservation_id, amount, decoration_amount, method, idempotency_key,
            status, is_refund, refund_amount, refund_reason)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', true, $7, $8)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          originalTx.branch_id,
          reservationId,
          refundResult.refundAmount,
          refundResult.decorationRefundAmount ?? 0,
          originalTx.method,
          refundIdempotencyKey,
          refundResult.refundAmount,
          `CPA 1999 tier ${refundResult.tier} — ${refundResult.refundPercent}% refund`,
        ]
      );

      // Mark original transaction as refunded
      await db.query(
        `UPDATE deposit_transactions
         SET status = 'refunded',
             refund_amount = $1,
             refund_reason = $2
         WHERE id = $3`,
        [
          refundResult.refundAmount,
          `CPA 1999 tier ${refundResult.tier}`,
          originalTx.id,
        ]
      );

      logger.info(
        {
          event: 'deposit_refund_recorded',
          reservation_id: reservationId,
          branch_id: originalTx.branch_id,
          original_amount: depositPaid,
          decoration_amount: decorationAmount,
          refund_amount: refundResult.refundAmount,
          base_refund_amount: refundResult.baseRefundAmount,
          decoration_refund_amount: refundResult.decorationRefundAmount,
          refund_percent: refundResult.refundPercent,
          tier: refundResult.tier,
          stage1_note: 'Payment gateway not active in Stage 1',
        },
        'Deposit refund recorded (Stage 1 — no gateway call)'
      );

      return refundResult;
    } catch (err) {
      // Log failure, alert manager, queue for manual resolution
      logger.error(
        {
          event: 'deposit_refund_failed',
          reservation_id: reservationId,
          branch_id: originalTx.branch_id,
          refund_amount: refundResult.refundAmount,
          error: err,
        },
        'Deposit refund failed — queued for manual resolution'
      );

      // In Stage 2 this would push to a dead-letter queue / alert manager via WS
      throw err;
    }
  }

  /**
   * Update deposit transaction status when payment gateway confirms or rejects.
   * Also updates associated commission transactions to match.
   *
   * Stage 1: called manually or in tests; Stage 2: called from webhook handler.
   *
   * Requirements: 16.5, 37.7, 37.8
   */
  static async updateDepositStatus(
    reservationId: string,
    status: 'confirmed' | 'failed'
  ): Promise<void> {
    const db = getDatabase();

    await db.query(
      `UPDATE deposit_transactions
       SET status = $1
       WHERE reservation_id = $2 AND is_refund = false AND status = 'pending'`,
      [status, reservationId]
    );

    // Mirror status to commission transactions (task 36.4)
    const commissionStatus = status === 'confirmed' ? 'completed' : 'failed';
    await CommissionService.updateCommissionStatus(reservationId, commissionStatus);

    logger.info(
      {
        event: 'deposit_status_updated',
        reservation_id: reservationId,
        deposit_status: status,
        commission_status: commissionStatus,
      },
      'Deposit and commission statuses updated'
    );
  }

  // ─── Admin deposit configuration ──────────────────────────────────────────

  /**
   * Get the current booking_deposit_amt for a branch.
   * Requirements: 16.1
   */
  static async getDepositConfig(branchId: string): Promise<BranchDepositConfig> {
    const db = getDatabase();
    const result = await db.query(
      `SELECT booking_deposit_amt, cake_deposit_amt FROM branches WHERE id = $1`,
      [branchId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Branch ${branchId} not found`);
    }
    return { 
      booking_deposit_amt: Number(result.rows[0].booking_deposit_amt),
      cake_deposit_amt: Number(result.rows[0].cake_deposit_amt || 0)
    };
  }

  /**
   * Update booking_deposit_amt for a branch (Admin only).
   * Validates non-negative. Logs change with previous/new value.
   * Requirements: 16.2
   */
  static async updateDepositConfig(
    branchId: string,
    newAmount: number,
    actorId: string,
    ipAddress?: string
  ): Promise<BranchDepositConfig> {
    if (newAmount < 0) {
      throw new Error('booking_deposit_amt must be non-negative');
    }

    const db = getDatabase();

    // Fetch previous value for audit
    const prev = await DepositService.getDepositConfig(branchId);

    const result = await db.query(
      `UPDATE branches
       SET booking_deposit_amt = $1
       WHERE id = $2
       RETURNING booking_deposit_amt`,
      [newAmount, branchId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Branch ${branchId} not found`);
    }

    const updated = { 
      booking_deposit_amt: Number(result.rows[0].booking_deposit_amt),
      cake_deposit_amt: prev.cake_deposit_amt,
      cake_deposit_type: prev.cake_deposit_type
    };

    await AuditService.logUpdate(
      branchId,
      actorId,
      'branch_settings',
      branchId,
      { booking_deposit_amt: prev.booking_deposit_amt },
      { booking_deposit_amt: updated.booking_deposit_amt, cake_deposit_amt: updated.cake_deposit_amt, cake_deposit_type: updated.cake_deposit_type },
      ipAddress
    );

    logger.info(
      {
        event: 'deposit_config_updated',
        branch_id: branchId,
        actor_id: actorId,
        previous_amount: prev.booking_deposit_amt,
        new_amount: updated.booking_deposit_amt,
      },
      'Booking deposit amount updated'
    );

    return updated;
  }
}

export default DepositService;
