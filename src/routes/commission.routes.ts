/**
 * Commission Routes
 *
 * GET   /api/admin/v1/branches/:id/commission-settings           — list all commission configs (Admin only)
 * PATCH /api/admin/v1/branches/:id/commission-settings/:category — update a category's commission (Admin only)
 * POST  /api/admin/v1/branches/:id/commission-settings/reset     — reset all to defaults (Admin only)
 * GET   /api/admin/v1/branches/:id/commission-statistics         — aggregated commission stats (Admin only)
 *
 * Requirements: 36.6, 36.9, 40.1, 40.4, 40.5, 40.6, 40.7
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database.js';
import { AuditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchParams {
  id: string;
}

interface CategoryParams extends BranchParams {
  category: string;
}

interface UpdateCommissionBody {
  commission_type?: 'percentage' | 'fixed';
  commission_value?: number;
  is_enabled?: boolean;
}

interface VendorCommission {
  category: string;
  commission_type: string;
  commission_value: string;
  is_enabled: boolean;
}

const VALID_CATEGORIES = ['decoration', 'cake'] as const;

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function commissionRoutes(fastify: FastifyInstance) {
  // ── GET /api/admin/v1/branches/:id/commission-settings ────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/commission-settings',
    async (
      request: FastifyRequest<{ Params: BranchParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const role = request.staffContext?.role;
      if (role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      try {
        const db = getDatabase();
        const result = await db.query<VendorCommission>(
          'SELECT category, commission_type, commission_value, is_enabled' +
          ' FROM vendor_commissions WHERE branch_id = $1 ORDER BY category',
          [branchId]
        );

        return reply.send({
          branchId,
          commissionSettings: result.rows.map((row) => ({
            category: row.category,
            commissionType: row.commission_type,
            commissionValue: Number(row.commission_value),
            isEnabled: row.is_enabled,
          })),
        });
      } catch (err: unknown) {
        logger.error({ err, branchId }, 'Failed to get commission settings');
        return reply.status(500).send({ error: 'Failed to get commission settings' });
      }
    }
  );

  // ── PATCH /api/admin/v1/branches/:id/commission-settings/:category ────────
  fastify.patch<{ Params: CategoryParams; Body: UpdateCommissionBody }>(
    '/api/admin/v1/branches/:id/commission-settings/:category',
    async (
      request: FastifyRequest<{ Params: CategoryParams; Body: UpdateCommissionBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const role = request.staffContext?.role;
      const actorId = request.staffContext?.staffId;
      if (role !== 'admin' || !actorId) {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const { category } = request.params;
      if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
        return reply.status(422).send({ error: 'category must be one of: decoration, cake' });
      }

      const body = request.body as UpdateCommissionBody;

      if (body.commission_type !== undefined && !['percentage', 'fixed'].includes(body.commission_type)) {
        return reply.status(422).send({ error: 'commission_type must be percentage or fixed' });
      }

      if (body.commission_value !== undefined) {
        if (typeof body.commission_value !== 'number' || isNaN(body.commission_value)) {
          return reply.status(422).send({ error: 'commission_value must be a number' });
        }
        if (body.commission_type === 'percentage' && (body.commission_value < 0 || body.commission_value > 100)) {
          return reply.status(422).send({ error: 'commission_value must be between 0 and 100 for percentage type' });
        }
        if (body.commission_type === 'fixed' && body.commission_value < 0) {
          return reply.status(422).send({ error: 'commission_value must be >= 0 for fixed type' });
        }
      }

      try {
        const db = getDatabase();

        // Fetch current row for audit + deferred value validation when type not provided
        const current = await db.query<VendorCommission>(
          'SELECT category, commission_type, commission_value, is_enabled' +
          ' FROM vendor_commissions WHERE branch_id = $1 AND category = $2',
          [branchId, category]
        );

        if (current.rows.length === 0) {
          return reply.status(404).send({ error: 'Commission setting not found' });
        }

        const old = current.rows[0];

        // Deferred validation: value provided but no type — validate against existing type
        if (body.commission_value !== undefined && body.commission_type === undefined) {
          const resolvedType = old.commission_type;
          if (resolvedType === 'percentage' && (body.commission_value < 0 || body.commission_value > 100)) {
            return reply.status(422).send({ error: 'commission_value must be between 0 and 100 for percentage type' });
          }
          if (resolvedType === 'fixed' && body.commission_value < 0) {
            return reply.status(422).send({ error: 'commission_value must be >= 0 for fixed type' });
          }
        }

        // Build dynamic UPDATE
        const setClauses: string[] = [];
        const params: unknown[] = [];
        let p = 1;

        if (body.commission_type !== undefined) {
          setClauses.push('commission_type = $' + p++);
          params.push(body.commission_type);
        }
        if (body.commission_value !== undefined) {
          setClauses.push('commission_value = $' + p++);
          params.push(body.commission_value);
        }
        if (body.is_enabled !== undefined) {
          setClauses.push('is_enabled = $' + p++);
          params.push(body.is_enabled);
        }

        if (setClauses.length === 0) {
          return reply.status(422).send({ error: 'At least one field must be provided' });
        }

        const branchParamIdx = p++;
        const categoryParamIdx = p;
        params.push(branchId);
        params.push(category);

        const updated = await db.query<VendorCommission>(
          'UPDATE vendor_commissions SET ' + setClauses.join(', ') +
          ' WHERE branch_id = $' + branchParamIdx + ' AND category = $' + categoryParamIdx +
          ' RETURNING category, commission_type, commission_value, is_enabled',
          params
        );

        const newRow = updated.rows[0];

        await AuditService.logUpdate(
          branchId,
          actorId,
          'vendor_commission',
          branchId + ':' + category,
          {
            category: old.category,
            commission_type: old.commission_type,
            commission_value: Number(old.commission_value),
            is_enabled: old.is_enabled,
          },
          {
            category: newRow.category,
            commission_type: newRow.commission_type,
            commission_value: Number(newRow.commission_value),
            is_enabled: newRow.is_enabled,
          },
          request.ip
        );

        logger.info({ branchId, actorId, category, changes: body }, 'Commission setting updated');

        return reply.send({
          branchId,
          category: newRow.category,
          commissionType: newRow.commission_type,
          commissionValue: Number(newRow.commission_value),
          isEnabled: newRow.is_enabled,
        });
      } catch (err: unknown) {
        logger.error({ err, branchId, category }, 'Failed to update commission setting');
        return reply.status(500).send({ error: 'Failed to update commission setting' });
      }
    }
  );

  // ── POST /api/admin/v1/branches/:id/commission-settings/reset ─────────────
  fastify.post<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/commission-settings/reset',
    async (
      request: FastifyRequest<{ Params: BranchParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const role = request.staffContext?.role;
      const actorId = request.staffContext?.staffId;
      if (role !== 'admin' || !actorId) {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      try {
        const db = getDatabase();

        await db.query(
          "UPDATE vendor_commissions SET commission_type = 'percentage', commission_value = 0, is_enabled = false WHERE branch_id = $1",
          [branchId]
        );

        await AuditService.logUpdate(
          branchId,
          actorId,
          'vendor_commission',
          branchId,
          {},
          {
            reset: true,
            commission_type: 'percentage',
            commission_value: 0,
            is_enabled: false,
            timestamp: new Date().toISOString(),
          },
          request.ip
        );

        logger.info({ branchId, actorId }, 'Commission settings reset to defaults');

        return reply.send({ branchId, reset: true });
      } catch (err: unknown) {
        logger.error({ err, branchId }, 'Failed to reset commission settings');
        return reply.status(500).send({ error: 'Failed to reset commission settings' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id/commission-statistics ──────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/commission-statistics',    async (
      request: FastifyRequest<{ Params: BranchParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const role = request.staffContext?.role;
      if (role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      try {
        const db = getDatabase();

        const chargedResult = await db.query<{ category: string; total: string }>(
          "SELECT category, COALESCE(SUM(amount_charged), 0) AS total" +
          " FROM commission_transactions WHERE branch_id = $1 AND status = 'completed' GROUP BY category",
          [branchId]
        );

        const refundedResult = await db.query<{ category: string; total: string }>(
          "SELECT category, COALESCE(SUM(refund_amount), 0) AS total" +
          " FROM commission_refunds WHERE branch_id = $1 AND status = 'completed' GROUP BY category",
          [branchId]
        );

        const charged: Record<string, number> = {};
        for (const row of chargedResult.rows) {
          charged[row.category] = Number(row.total);
        }

        const refunded: Record<string, number> = {};
        for (const row of refundedResult.rows) {
          refunded[row.category] = Number(row.total);
        }

        const breakdown = ['decoration', 'cake'].map((cat) => {
          const c = charged[cat] ?? 0;
          const r = refunded[cat] ?? 0;
          return { category: cat, charged: c, refunded: r, net: c - r };
        });

        const totalCharged = breakdown.reduce((sum, b) => sum + b.charged, 0);
        const totalRefunded = breakdown.reduce((sum, b) => sum + b.refunded, 0);

        return reply.send({
          branchId,
          totalCharged,
          totalRefunded,
          net: totalCharged - totalRefunded,
          breakdown,
        });
      } catch (err: unknown) {
        logger.error({ err, branchId }, 'Failed to get commission statistics');
        return reply.status(500).send({ error: 'Failed to get commission statistics' });
      }
    }
  );

  // NOTE: Tiered commission settings are now stored via AdminSettingsRoutes
  // This endpoint was removed to avoid route duplication conflicts with the category-specific endpoint above

  // ── GET /api/admin/v1/branches/:id/vendor-payment-summary ─────────────────
  // Returns per-category: total service revenue, total commission earned,
  // total vendor payments made, and balance owed to vendor.
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/vendor-payment-summary',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      if (request.staffContext?.role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      try {
        const db = getDatabase();

        // Count bookings and revenue per category from reservations
        const bookingsResult = await db.query<{
          category: string;
          booking_count: string;
          total_service_revenue: string;
        }>(
          `SELECT
             'decoration' AS category,
             COUNT(*) FILTER (WHERE has_decoration = true AND status NOT IN ('cancelled','no_show')) AS booking_count,
             COALESCE(SUM(decoration_amount) FILTER (WHERE has_decoration = true AND status NOT IN ('cancelled','no_show')), 0) AS total_service_revenue
           FROM reservations WHERE branch_id = $1
           UNION ALL
           SELECT
             'cake' AS category,
             COUNT(*) FILTER (WHERE cake_choice IS NOT NULL AND status NOT IN ('cancelled','no_show')) AS booking_count,
             COALESCE(SUM(decoration_amount) FILTER (WHERE cake_choice IS NOT NULL AND status NOT IN ('cancelled','no_show')), 0) AS total_service_revenue
           FROM reservations WHERE branch_id = $1`,
          [branchId]
        );

        // Total commission earned per category (what cafe keeps)
        const commissionResult = await db.query<{ category: string; total_commission: string }>(
          `SELECT category, COALESCE(SUM(amount_charged), 0) AS total_commission
           FROM commission_transactions
           WHERE branch_id = $1 AND status = 'completed'
           GROUP BY category`,
          [branchId]
        );

        // Total payments already made to vendors
        const paymentsResult = await db.query<{ category: string; total_paid: string; payment_count: string }>(
          `SELECT category,
             COALESCE(SUM(amount_paid), 0) AS total_paid,
             COUNT(*) AS payment_count
           FROM vendor_payments
           WHERE branch_id = $1
           GROUP BY category`,
          [branchId]
        );

        // Recent payment history
        const historyResult = await db.query<{
          id: string; category: string; amount_paid: string;
          note: string | null; paid_at: string; paid_by_name: string | null;
        }>(
          `SELECT vp.id, vp.category, vp.amount_paid, vp.note, vp.paid_at,
                  s.name AS paid_by_name
           FROM vendor_payments vp
           LEFT JOIN staff s ON s.id = vp.paid_by
           WHERE vp.branch_id = $1
           ORDER BY vp.paid_at DESC
           LIMIT 20`,
          [branchId]
        );

        // Build summary per category
        const commissionMap: Record<string, number> = {};
        for (const r of commissionResult.rows) commissionMap[r.category] = Number(r.total_commission);

        const paymentsMap: Record<string, { paid: number; count: number }> = {};
        for (const r of paymentsResult.rows) {
          paymentsMap[r.category] = { paid: Number(r.total_paid), count: Number(r.payment_count) };
        }

        const summary = bookingsResult.rows.map(row => {
          const cat = row.category;
          const serviceRevenue = Number(row.total_service_revenue);
          const commission = commissionMap[cat] ?? 0;
          const vendorDue = serviceRevenue - commission; // what vendor is owed
          const paid = paymentsMap[cat]?.paid ?? 0;
          const balance = vendorDue - paid; // still owed

          return {
            category: cat,
            bookingCount: Number(row.booking_count),
            totalServiceRevenue: serviceRevenue,
            totalCommissionEarned: commission,
            totalVendorDue: vendorDue,
            totalPaidToVendor: paid,
            paymentCount: paymentsMap[cat]?.count ?? 0,
            balanceOwed: Math.max(0, balance),
          };
        });

        return reply.send({
          branchId,
          summary,
          recentPayments: historyResult.rows.map(r => ({
            id: r.id,
            category: r.category,
            amountPaid: Number(r.amount_paid),
            note: r.note,
            paidAt: r.paid_at,
            paidByName: r.paid_by_name,
          })),
        });
      } catch (err) {
        logger.error({ err }, 'Failed to get vendor payment summary');
        return reply.status(500).send({ error: 'Failed to get vendor payment summary' });
      }
    }
  );

  // ── POST /api/admin/v1/branches/:id/vendor-payments ───────────────────────
  // Record a manual payment made to a vendor.
  fastify.post<{ Params: BranchParams; Body: { category: string; amountPaid: number; note?: string } }>(
    '/api/admin/v1/branches/:id/vendor-payments',
    async (request: FastifyRequest<{ Params: BranchParams; Body: { category: string; amountPaid: number; note?: string } }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const actorId = request.staffContext?.staffId;
      if (request.staffContext?.role !== 'admin' || !actorId) {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const { category, amountPaid, note } = request.body ?? {};

      if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
        return reply.status(422).send({ error: 'category must be decoration or cake' });
      }
      if (!amountPaid || typeof amountPaid !== 'number' || amountPaid <= 0) {
        return reply.status(422).send({ error: 'amountPaid must be a positive number' });
      }

      try {
        const db = getDatabase();
        const result = await db.query(
          `INSERT INTO vendor_payments (branch_id, category, amount_paid, note, paid_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, category, amount_paid, note, paid_at`,
          [branchId, category, amountPaid, note || null, actorId]
        );

        await AuditService.logUpdate(
          branchId, actorId, 'vendor_payment', result.rows[0].id,
          {}, { category, amountPaid, note }, request.ip
        );

        logger.info({ branchId, actorId, category, amountPaid }, 'Vendor payment recorded');
        return reply.status(201).send({
          id: result.rows[0].id,
          category: result.rows[0].category,
          amountPaid: Number(result.rows[0].amount_paid),
          note: result.rows[0].note,
          paidAt: result.rows[0].paid_at,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to record vendor payment');
        return reply.status(500).send({ error: 'Failed to record vendor payment' });
      }
    }
  );
}
