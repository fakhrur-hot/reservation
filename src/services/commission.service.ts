/**
 * Commission Service
 *
 * Modular, toggle-based vendor commission system.
 * Commission logic only executes when enabled for a category.
 * No impact on core booking when commission is disabled.
 *
 * Requirements: 37.1–37.9
 */

import { PoolClient } from 'pg';
import { getDatabase, transaction } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AuditService } from './audit.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommissionType = 'percentage' | 'fixed';
export type CommissionStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type CommissionRefundStatus = 'pending' | 'completed' | 'failed';
export type CommissionCategory = 'decoration' | 'cake';

export interface VendorCommission {
  id: string;
  branch_id: string;
  category: CommissionCategory;
  commission_type: CommissionType;
  commission_value: number;
  is_enabled: boolean;
}

export interface CommissionTransaction {
  id: string;
  branch_id: string;
  reservation_id: string;
  category: CommissionCategory;
  commission_type: CommissionType;
  commission_value: number;
  amount_charged: number;
  idempotency_key: string;
  status: CommissionStatus;
  created_at: string;
}

export interface CommissionCalculationResult {
  category: CommissionCategory;
  serviceAmount: number;
  commissionType: CommissionType;
  commissionValue: number;
  commissionAmount: number;
  isEnabled: boolean;
}

export interface CommissionBreakdown {
  items: CommissionCalculationResult[];
  totalCommission: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class CommissionService {
  /**
   * Calculate commission for a single service category.
   *
   * - If is_enabled === false: returns 0
   * - If commission_type === 'percentage': serviceAmount × (commission_value / 100)
   * - If commission_type === 'fixed': commission_value
   *
   * Requirements: 37.1, 37.2, 37.3
   */
  static async calculateCommission(
    serviceAmount: number,
    category: CommissionCategory,
    branchId: string
  ): Promise<CommissionCalculationResult> {
    const db = getDatabase();
    const result = await db.query<VendorCommission>(
      `SELECT id, branch_id, category, commission_type, commission_value, is_enabled
       FROM vendor_commissions
       WHERE branch_id = $1 AND category = $2
       LIMIT 1`,
      [branchId, category]
    );

    // If no config found, treat as disabled
    if (result.rows.length === 0) {
      return {
        category,
        serviceAmount,
        commissionType: 'percentage',
        commissionValue: 0,
        commissionAmount: 0,
        isEnabled: false,
      };
    }

    const config = result.rows[0];
    const commissionType = config.commission_type;
    const commissionValue = Number(config.commission_value);

    if (!config.is_enabled) {
      return {
        category,
        serviceAmount,
        commissionType,
        commissionValue,
        commissionAmount: 0,
        isEnabled: false,
      };
    }

    let commissionAmount: number;
    if (commissionType === 'percentage') {
      commissionAmount = Math.round((serviceAmount * commissionValue) / 100 * 100) / 100;
    } else {
      // fixed
      commissionAmount = Math.round(commissionValue * 100) / 100;
    }

    return {
      category,
      serviceAmount,
      commissionType,
      commissionValue,
      commissionAmount,
      isEnabled: true,
    };
  }

  /**
   * Calculate commissions for all applicable service categories in a reservation.
   * Returns a breakdown per category and the total commission amount.
   *
   * Requirements: 37.4, 37.9
   */
  static async calculateReservationCommissions(
    branchId: string,
    services: Partial<Record<CommissionCategory, number>>
  ): Promise<CommissionBreakdown> {
    const items: CommissionCalculationResult[] = [];

    for (const [category, serviceAmount] of Object.entries(services) as [CommissionCategory, number][]) {
      if (serviceAmount > 0) {
        const result = await CommissionService.calculateCommission(
          serviceAmount,
          category,
          branchId
        );
        items.push(result);
      }
    }

    const totalCommission = items.reduce((sum, item) => sum + item.commissionAmount, 0);

    return { items, totalCommission };
  }

  /**
   * Record commission charges in commission_transactions for each enabled category.
   * Called on reservation confirmation. Status starts as 'pending'.
   * Idempotent: uses idempotency_key to prevent duplicate records.
   *
   * Requirements: 37.6, 37.8
   */
  static async recordCommissionCharges(
    reservationId: string,
    branchId: string,
    breakdown: CommissionBreakdown,
    client?: PoolClient
  ): Promise<CommissionTransaction[]> {
    const db = client ?? getDatabase();
    const transactions: CommissionTransaction[] = [];

    for (const item of breakdown.items) {
      if (!item.isEnabled || item.commissionAmount === 0) continue;

      const idempotencyKey = `commission:${reservationId}:${item.category}`;

      const result = await db.query<CommissionTransaction>(
        `INSERT INTO commission_transactions
           (branch_id, reservation_id, category, commission_type, commission_value,
            amount_charged, idempotency_key, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         ON CONFLICT (idempotency_key) DO UPDATE
           SET reservation_id = EXCLUDED.reservation_id
         RETURNING id, branch_id, reservation_id, category, commission_type,
                   commission_value, amount_charged, idempotency_key, status, created_at`,
        [
          branchId,
          reservationId,
          item.category,
          item.commissionType,
          item.commissionValue,
          item.commissionAmount,
          idempotencyKey,
        ]
      );

      if (result.rows.length > 0) {
        transactions.push(result.rows[0]);
      }

      // Req 39.7 — immutable audit log for commission charge
      await AuditService.log({
        branchId,
        action: 'commission_charged',
        entityType: 'commission_transaction',
        entityId: result.rows[0]?.id ?? idempotencyKey,
        newValue: {
          reservation_id: reservationId,
          category: item.category,
          commission_type: item.commissionType,
          commission_value: item.commissionValue,
          amount_charged: item.commissionAmount,
          idempotency_key: idempotencyKey,
          status: 'pending',
        },
      });

      logger.info(
        {
          event: 'commission_recorded',
          branch_id: branchId,
          reservation_id: reservationId,
          category: item.category,
          commission_type: item.commissionType,
          commission_value: item.commissionValue,
          amount_charged: item.commissionAmount,
          idempotency_key: idempotencyKey,
        },
        'Commission transaction recorded (pending)'
      );
    }

    return transactions;
  }

  /**
   * Update commission transaction status when deposit payment succeeds or fails.
   *
   * - Payment success → status: 'completed'
   * - Payment failure → status: 'failed'
   *
   * Requirements: 37.7, 37.8
   */
  static async updateCommissionStatus(
    reservationId: string,
    status: 'completed' | 'failed'
  ): Promise<void> {
    const db = getDatabase();

    await db.query(
      `UPDATE commission_transactions
       SET status = $1
       WHERE reservation_id = $2 AND status = 'pending'`,
      [status, reservationId]
    );

    // Req 39.7 — audit log for status update
    await AuditService.log({
      branchId: 'system',
      action: 'commission_status_updated',
      entityType: 'commission_transaction',
      entityId: reservationId,
      newValue: { reservation_id: reservationId, status },
    });

    logger.info(
      {
        event: 'commission_status_updated',
        reservation_id: reservationId,
        status,
      },
      `Commission transactions updated to ${status}`
    );
  }

  /**
   * Calculate commission refund using the same CPA 1999 tiered policy as deposits.
   *
   * Tiers:
   *   > 72 hours before reservation  → 95% refund
   *   24–72 hours before reservation → 50% refund
   *   < 24 hours before reservation  → 0% refund
   *
   * Requirements: 38.1, 38.2
   */
  static calculateCommissionRefund(
    originalCommission: number,
    cancellationTime: Date,
    reservationTime: Date
  ): { refundAmount: number; refundPercentage: number; tier: '>72h' | '24-72h' | '<24h' } {
    const hoursUntilReservation =
      (reservationTime.getTime() - cancellationTime.getTime()) / (1000 * 60 * 60);

    let refundPercentage: number;
    let tier: '>72h' | '24-72h' | '<24h';

    if (hoursUntilReservation > 72) {
      refundPercentage = 95;
      tier = '>72h';
    } else if (hoursUntilReservation >= 24) {
      refundPercentage = 50;
      tier = '24-72h';
    } else {
      refundPercentage = 0;
      tier = '<24h';
    }

    const refundAmount = Math.round((originalCommission * refundPercentage) / 100 * 100) / 100;
    return { refundAmount, refundPercentage, tier };
  }

  /**
   * Process commission refunds for a cancelled reservation.
   *
   * For each commission_transaction on the reservation:
   *   1. Calculate refund using the CPA 1999 tiered policy
   *   2. Insert a commission_refunds record (status: 'pending')
   *   3. Update the refund record to 'completed' on success, 'failed' on error
   *   4. Update the commission_transaction status to 'refunded' on success, 'failed' on error
   *   5. On failure: log, alert manager (via logger), record failure_reason
   *
   * Requirements: 38.3, 38.4, 38.5, 38.6, 38.7
   */
  static async processCommissionRefunds(
    reservationId: string,
    branchId: string,
    cancellationTime: Date,
    reservationTime: Date
  ): Promise<void> {
    const db = getDatabase();

    // Fetch all chargeable commission transactions for this reservation (task 37.2)
    const txResult = await db.query<CommissionTransaction>(
      `SELECT id, branch_id, reservation_id, category, commission_type,
              commission_value, amount_charged, idempotency_key, status, created_at
       FROM commission_transactions
       WHERE reservation_id = $1 AND status IN ('pending', 'completed')`,
      [reservationId]
    );

    if (txResult.rows.length === 0) {
      logger.info({ reservationId }, 'No commission transactions found for refund — skipping');
      return;
    }

    for (const tx of txResult.rows) {
      const { refundAmount, refundPercentage, tier } =
        CommissionService.calculateCommissionRefund(
          Number(tx.amount_charged),
          cancellationTime,
          reservationTime
        );

      // Insert commission_refund record as 'pending' (task 37.5)
      let refundId: string | null = null;
      try {
        const insertResult = await db.query<{ id: string }>(
          `INSERT INTO commission_refunds
             (branch_id, reservation_id, category, original_commission,
              refund_amount, refund_percentage, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            branchId,
            reservationId,
            tx.category,
            tx.amount_charged,
            refundAmount,
            refundPercentage,
          ]
        );
        refundId = insertResult.rows[0]?.id ?? null;
      } catch (insertErr) {
        logger.error(
          {
            event: 'commission_refund_insert_failed',
            branch_id: branchId,
            reservation_id: reservationId,
            category: tx.category,
            error: insertErr,
          },
          'Failed to insert commission_refund record'
        );
        continue; // skip to next category
      }

      try {
        // Stage 1: no gateway call — mark as completed immediately.
        // Stage 2: call Payment_Gateway refund API here before marking completed.

        // Update commission_refund status → 'completed' (task 37.5)
        if (refundId) {
          await db.query(
            `UPDATE commission_refunds SET status = 'completed' WHERE id = $1`,
            [refundId]
          );
        }

        // Update commission_transaction status → 'refunded' (task 37.3)
        await db.query(
          `UPDATE commission_transactions SET status = 'refunded' WHERE id = $1`,
          [tx.id]
        );

        logger.info(
          {
            event: 'commission_refund_completed',
            branch_id: branchId,
            reservation_id: reservationId,
            category: tx.category,
            original_commission: tx.amount_charged,
            refund_amount: refundAmount,
            refund_percentage: refundPercentage,
            tier,
          },
          'Commission refund completed'
        );

        // Req 39.7 — audit log for refund completion
        await AuditService.log({
          branchId,
          action: 'commission_refunded',
          entityType: 'commission_transaction',
          entityId: tx.id,
          newValue: {
            reservation_id: reservationId,
            category: tx.category,
            original_commission: tx.amount_charged,
            refund_amount: refundAmount,
            refund_percentage: refundPercentage,
            tier,
            status: 'refunded',
          },
        });
      } catch (err) {
        // Task 37.3: update commission_transaction status → 'failed'
        await db.query(
          `UPDATE commission_transactions SET status = 'failed' WHERE id = $1`,
          [tx.id]
        ).catch(() => { /* best-effort */ });

        // Task 37.4: record failure_reason in commission_refunds, alert manager
        const failureReason = err instanceof Error ? err.message : String(err);
        if (refundId) {
          await db.query(
            `UPDATE commission_refunds
             SET status = 'failed', failure_reason = $1
             WHERE id = $2`,
            [failureReason, refundId]
          ).catch(() => { /* best-effort */ });
        }

        logger.error(
          {
            event: 'commission_refund_failed',
            branch_id: branchId,
            reservation_id: reservationId,
            category: tx.category,
            original_commission: tx.amount_charged,
            refund_amount: refundAmount,
            failure_reason: failureReason,
            error: err,
          },
          'Commission refund failed — queued for manual resolution (alert: manager)'
        );

        // Req 39.7 — audit log for refund failure
        await AuditService.log({
          branchId,
          action: 'commission_refund_failed',
          entityType: 'commission_transaction',
          entityId: tx.id,
          newValue: {
            reservation_id: reservationId,
            category: tx.category,
            original_commission: tx.amount_charged,
            refund_amount: refundAmount,
            failure_reason: failureReason,
            status: 'failed',
          },
        }).catch(() => { /* best-effort */ });
        // Non-fatal: continue processing other categories
      }
    }
  }
}

export default CommissionService;
