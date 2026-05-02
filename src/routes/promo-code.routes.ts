/**
 * Promo Code Routes
 *
 * POST   /api/admin/v1/promo-codes             — create promo code (Admin only)
 * GET    /api/admin/v1/promo-codes             — list all promo codes for branch (Admin only)
 * GET    /api/admin/v1/promo-codes/:codeId     — get single promo code (Admin only)
 * PUT    /api/admin/v1/promo-codes/:codeId     — update promo code (Admin only)
 * DELETE /api/admin/v1/promo-codes/:codeId     — delete promo code (Admin only)
 * GET    /api/admin/v1/promo-codes/:codeId/performance — get promo code metrics (Admin only)
 * POST   /api/v1/promo-codes/validate          — validate promo code (Public)
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database.js';
import { PromoCodeService, PromoCodeType } from '../services/promo-code.service.js';
import { PromoMetricsService } from '../services/promo-metrics.service.js';
import { AuditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromoCodeParams {
  codeId: string;
}

interface CreatePromoCodeBody {
  code: string;
  type: PromoCodeType;
  description?: string;
  // Priority code
  overrideLeadTime?: boolean;
  // Turnover code
  validFromTime?: string;
  validToTime?: string;
  validDaysOfWeek?: string;
  // VIP code
  forceSessionDuration?: number;
  // Discount code
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  // Group code
  minPartySize?: number;
  // Affiliate code
  affiliateId?: string;
  // Validity
  validFrom?: string;
  validTo?: string;
  maxUses?: number;
}

interface UpdatePromoCodeBody {
  description?: string;
  validFromTime?: string;
  validToTime?: string;
  validDaysOfWeek?: string;
  forceSessionDuration?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  minPartySize?: number;
  affiliateId?: string;
  validFrom?: string;
  validTo?: string;
  maxUses?: number;
  isActive?: boolean;
}

interface ValidatePromoCodeBody {
  code: string;
  branchId: string;
  bookingType: 'standard' | 'decorated';
  partySize: number;
  selectedTime?: string;
  selectedDate?: string;
}

interface BranchParams {
  id: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_PROMO_TYPES: PromoCodeType[] = ['priority', 'turnover', 'vip', 'affiliate', 'group', 'discount'];
const VALID_DISCOUNT_TYPES = ['percentage', 'fixed'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate that all required fields are present in CreatePromoCodeBody.
 * Type-specific fields are required based on the promo code type.
 */
function validateCreatePromoCodeBody(body: CreatePromoCodeBody): { valid: boolean; error?: string } {
  if (!body.code || typeof body.code !== 'string' || body.code.trim().length === 0) {
    return { valid: false, error: 'code is required and must be a non-empty string' };
  }

  if (!body.type || !VALID_PROMO_TYPES.includes(body.type)) {
    return {
      valid: false,
      error: `type must be one of: ${VALID_PROMO_TYPES.join(', ')}`,
    };
  }

  // Type-specific validation
  switch (body.type) {
    case 'turnover':
      if (!body.validFromTime || !body.validToTime) {
        return {
          valid: false,
          error: 'Turnover code requires validFromTime and validToTime (HH:MM format)',
        };
      }
      break;

    case 'vip':
      if (body.forceSessionDuration !== undefined && body.forceSessionDuration <= 0) {
        return { valid: false, error: 'forceSessionDuration must be greater than 0' };
      }
      break;

    case 'discount':
      if (!body.discountType || !VALID_DISCOUNT_TYPES.includes(body.discountType)) {
        return {
          valid: false,
          error: `discountType must be: ${VALID_DISCOUNT_TYPES.join(', ')}`,
        };
      }
      if (body.discountValue === undefined || body.discountValue <= 0) {
        return { valid: false, error: 'discountValue must be greater than 0' };
      }
      break;

    case 'group':
      if (body.minPartySize !== undefined && body.minPartySize < 2) {
        return { valid: false, error: 'minPartySize must be at least 2' };
      }
      break;

    case 'affiliate':
      if (!body.affiliateId || typeof body.affiliateId !== 'string') {
        return { valid: false, error: 'Affiliate code requires affiliateId' };
      }
      break;
  }

  // Validate validity dates if provided
  if (body.validFrom && body.validTo) {
    const from = new Date(body.validFrom);
    const to = new Date(body.validTo);
    if (from >= to) {
      return { valid: false, error: 'validFrom must be before validTo' };
    }
  }

  // Validate max uses
  if (body.maxUses !== undefined && body.maxUses <= 0) {
    return { valid: false, error: 'maxUses must be greater than 0' };
  }

  return { valid: true };
}

/**
 * Convert database row to API response format.
 */
function formatPromoCodeResponse(row: Record<string, any>) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    description: row.description,
    overrideLeadTime: row.override_lead_time,
    validFromTime: row.valid_from_time?.slice(0, 5),
    validToTime: row.valid_to_time?.slice(0, 5),
    validDaysOfWeek: row.valid_days_of_week,
    forceSessionDuration: row.force_session_duration,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    minPartySize: row.min_party_size,
    affiliateId: row.affiliate_id,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    maxUses: row.max_uses,
    currentUses: row.current_uses,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function promoCodeRoutes(fastify: FastifyInstance) {
  const db = getDatabase();

  // ─── POST /api/admin/v1/promo-codes ──────────────────────────────────────
  /**
   * Create a new promo code for a branch.
   * Admin-only operation. Returns the newly created promo code.
   */
  fastify.post<{ Body: CreatePromoCodeBody }>(
    '/api/admin/v1/promo-codes',
    async (request: FastifyRequest<{ Body: CreatePromoCodeBody }>, reply: FastifyReply) => {
      // Admin role guard
      if (request.staffContext?.role !== 'admin') {
        logger.warn(
          { staffId: request.staffContext?.staffId },
          'Unauthorized attempt to create promo code'
        );
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'branchId is required' });
      }

      const body = request.body ?? {};

      // Validate body
      const validation = validateCreatePromoCodeBody(body);
      if (!validation.valid) {
        return reply.status(422).send({ error: validation.error });
      }

      try {
        // Insert promo code
        const result = await db.query(
          `INSERT INTO promo_codes (
            branch_id, code, type, description,
            override_lead_time, valid_from_time, valid_to_time, valid_days_of_week,
            force_session_duration, discount_type, discount_value,
            min_party_size, affiliate_id, valid_from, valid_to, max_uses
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
          ) RETURNING *`,
          [
            branchId,
            body.code.toUpperCase().trim(),
            body.type,
            body.description || null,
            body.overrideLeadTime || false,
            body.validFromTime || null,
            body.validToTime || null,
            body.validDaysOfWeek || null,
            body.forceSessionDuration || null,
            body.discountType || null,
            body.discountValue || null,
            body.minPartySize || null,
            body.affiliateId || null,
            body.validFrom ? new Date(body.validFrom) : null,
            body.validTo ? new Date(body.validTo) : null,
            body.maxUses || null,
          ]
        );

        const promoCode = result.rows[0];

        // Audit log
        // TODO: Implement AuditService.logAction call
        // await AuditService.logAction(db, { ... });

        logger.info(
          { promoCodeId: promoCode.id, code: promoCode.code, branchId },
          'Promo code created'
        );

        // Invalidate metrics cache
        await PromoMetricsService.invalidateMetricsCache(branchId);

        return reply.status(201).send(formatPromoCodeResponse(promoCode));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('unique_promo_code_per_branch')
        ) {
          logger.warn({ code: body.code, branchId }, 'Duplicate promo code');
          return reply.status(409).send({
            error: 'Promo code already exists for this branch',
          });
        }

        logger.error(
          { error, branchId, code: body.code },
          'Failed to create promo code'
        );
        return reply.status(500).send({ error: 'Failed to create promo code' });
      }
    }
  );

  // ─── GET /api/admin/v1/promo-codes ───────────────────────────────────────
  /**
   * List all promo codes for the authenticated branch.
   * Admin-only operation. Supports filtering and pagination.
   */
  fastify.get<{
    Querystring: {
      type?: string;
      isActive?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    '/api/admin/v1/promo-codes',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Admin role guard
      if (request.staffContext?.role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'branchId is required' });
      }

      const query = request.query as any;
      const type = query?.type;
      const isActive = query?.isActive;
      const limit = Math.min(parseInt(query?.limit || '100', 10), 1000);
      const offset = parseInt(query?.offset || '0', 10);

      try {
        // Build query with optional filters
        let whereClause = 'WHERE p.branch_id = $1';
        const params: any[] = [branchId];
        let paramIndex = 2;

        if (type && VALID_PROMO_TYPES.includes(type as PromoCodeType)) {
          whereClause += ` AND p.type = $${paramIndex}`;
          params.push(type);
          paramIndex++;
        }

        if (isActive === 'true' || isActive === 'false') {
          whereClause += ` AND p.is_active = $${paramIndex}`;
          params.push(isActive === 'true');
          paramIndex++;
        }

        // Count total
        const countResult = await db.query(
          `SELECT COUNT(*) as count FROM promo_codes p ${whereClause}`,
          params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Fetch promo codes
        const result = await db.query(
          `SELECT * FROM promo_codes p ${whereClause}
           ORDER BY p.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        );

        return reply.send({
          data: result.rows.map(formatPromoCodeResponse),
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          },
        });
      } catch (error) {
        logger.error({ error, branchId }, 'Failed to list promo codes');
        return reply.status(500).send({ error: 'Failed to list promo codes' });
      }
    }
  );

  // ─── GET /api/admin/v1/promo-codes/:codeId ───────────────────────────────
  /**
   * Get a single promo code by ID.
   * Admin-only operation.
   */
  fastify.get<{ Params: PromoCodeParams }>(
    '/api/admin/v1/promo-codes/:codeId',
    async (request: FastifyRequest<{ Params: PromoCodeParams }>, reply: FastifyReply) => {
      // Admin role guard
      if (request.staffContext?.role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const branchId = request.branchContext?.branchId;
      const codeId = request.params.codeId;

      if (!branchId || !codeId) {
        return reply.status(400).send({ error: 'branchId and codeId are required' });
      }

      try {
        const result = await db.query(
          `SELECT * FROM promo_codes WHERE id = $1 AND branch_id = $2 LIMIT 1`,
          [codeId, branchId]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Promo code not found' });
        }

        return reply.send(formatPromoCodeResponse(result.rows[0]));
      } catch (error) {
        logger.error({ error, branchId, codeId }, 'Failed to get promo code');
        return reply.status(500).send({ error: 'Failed to get promo code' });
      }
    }
  );

  // ─── PUT /api/admin/v1/promo-codes/:codeId ───────────────────────────────
  /**
   * Update a promo code.
   * Admin-only operation. Type and code cannot be changed.
   */
  fastify.put<{ Params: PromoCodeParams; Body: UpdatePromoCodeBody }>(
    '/api/admin/v1/promo-codes/:codeId',
    async (
      request: FastifyRequest<{ Params: PromoCodeParams; Body: UpdatePromoCodeBody }>,
      reply: FastifyReply
    ) => {
      // Admin role guard
      if (request.staffContext?.role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const branchId = request.branchContext?.branchId;
      const codeId = request.params.codeId;
      const body = request.body ?? {};

      if (!branchId || !codeId) {
        return reply.status(400).send({ error: 'branchId and codeId are required' });
      }

      try {
        // Fetch existing promo code
        const existing = await db.query(
          `SELECT * FROM promo_codes WHERE id = $1 AND branch_id = $2 LIMIT 1`,
          [codeId, branchId]
        );

        if (existing.rows.length === 0) {
          return reply.status(404).send({ error: 'Promo code not found' });
        }

        // Build dynamic update query
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (body.description !== undefined) {
          updates.push(`description = $${paramIndex++}`);
          values.push(body.description || null);
        }

        if (body.validFromTime !== undefined) {
          updates.push(`valid_from_time = $${paramIndex++}`);
          values.push(body.validFromTime || null);
        }

        if (body.validToTime !== undefined) {
          updates.push(`valid_to_time = $${paramIndex++}`);
          values.push(body.validToTime || null);
        }

        if (body.validDaysOfWeek !== undefined) {
          updates.push(`valid_days_of_week = $${paramIndex++}`);
          values.push(body.validDaysOfWeek || null);
        }

        if (body.forceSessionDuration !== undefined) {
          updates.push(`force_session_duration = $${paramIndex++}`);
          values.push(body.forceSessionDuration || null);
        }

        if (body.discountType !== undefined) {
          updates.push(`discount_type = $${paramIndex++}`);
          values.push(body.discountType || null);
        }

        if (body.discountValue !== undefined) {
          updates.push(`discount_value = $${paramIndex++}`);
          values.push(body.discountValue || null);
        }

        if (body.minPartySize !== undefined) {
          updates.push(`min_party_size = $${paramIndex++}`);
          values.push(body.minPartySize || null);
        }

        if (body.affiliateId !== undefined) {
          updates.push(`affiliate_id = $${paramIndex++}`);
          values.push(body.affiliateId || null);
        }

        if (body.validFrom !== undefined) {
          updates.push(`valid_from = $${paramIndex++}`);
          values.push(body.validFrom ? new Date(body.validFrom) : null);
        }

        if (body.validTo !== undefined) {
          updates.push(`valid_to = $${paramIndex++}`);
          values.push(body.validTo ? new Date(body.validTo) : null);
        }

        if (body.maxUses !== undefined) {
          updates.push(`max_uses = $${paramIndex++}`);
          values.push(body.maxUses || null);
        }

        if (body.isActive !== undefined) {
          updates.push(`is_active = $${paramIndex++}`);
          values.push(body.isActive);
        }

        if (updates.length === 0) {
          return reply.status(400).send({ error: 'No fields to update' });
        }

        // Always update updated_at
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(codeId, branchId);

        const result = await db.query(
          `UPDATE promo_codes SET ${updates.join(', ')}
           WHERE id = $${paramIndex++} AND branch_id = $${paramIndex++}
           RETURNING *`,
          values
        );

        const updated = result.rows[0];

        // Invalidate cache
        await PromoCodeService.invalidateCache(updated.code, branchId);
        await PromoMetricsService.invalidateMetricsCache(branchId);

        // Audit log
        // TODO: Implement AuditService.logAction call
        // await AuditService.logAction(db, { ... });

        logger.info(
          { promoCodeId: codeId, branchId },
          'Promo code updated'
        );

        return reply.send(formatPromoCodeResponse(updated));
      } catch (error) {
        logger.error({ error, branchId, codeId }, 'Failed to update promo code');
        return reply.status(500).send({ error: 'Failed to update promo code' });
      }
    }
  );

  // ─── DELETE /api/admin/v1/promo-codes/:codeId ────────────────────────────
  /**
   * Delete a promo code.
   * Admin-only operation. Soft delete (mark as inactive).
   */
  fastify.delete<{ Params: PromoCodeParams }>(
    '/api/admin/v1/promo-codes/:codeId',
    async (request: FastifyRequest<{ Params: PromoCodeParams }>, reply: FastifyReply) => {
      // Admin role guard
      if (request.staffContext?.role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const branchId = request.branchContext?.branchId;
      const codeId = request.params.codeId;

      if (!branchId || !codeId) {
        return reply.status(400).send({ error: 'branchId and codeId are required' });
      }

      try {
        // Fetch existing promo code
        const existing = await db.query(
          `SELECT * FROM promo_codes WHERE id = $1 AND branch_id = $2 LIMIT 1`,
          [codeId, branchId]
        );

        if (existing.rows.length === 0) {
          return reply.status(404).send({ error: 'Promo code not found' });
        }

        const promoCode = existing.rows[0];

        // Soft delete - mark as inactive
        await db.query(
          `UPDATE promo_codes SET is_active = false, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [codeId]
        );

        // Invalidate cache
        await PromoCodeService.invalidateCache(promoCode.code, branchId);
        await PromoMetricsService.invalidateMetricsCache(branchId);

        // Audit log
        // TODO: Implement AuditService.logAction call
        // await AuditService.logAction(db, { ... });

        logger.info(
          { promoCodeId: codeId, code: promoCode.code, branchId },
          'Promo code deleted'
        );

        return reply.status(204).send();
      } catch (error) {
        logger.error({ error, branchId, codeId }, 'Failed to delete promo code');
        return reply.status(500).send({ error: 'Failed to delete promo code' });
      }
    }
  );

  // ─── GET /api/admin/v1/promo-codes/:codeId/performance ───────────────────
  /**
   * Get performance metrics for a promo code.
   * Includes: usage count, booking count, total discount given, ROI metrics.
   * Optional query: startDate, endDate (ISO 8601 for date range filtering)
   */
  fastify.get<{ Params: PromoCodeParams; Querystring: any }>(
    '/api/admin/v1/promo-codes/:codeId/performance',
    async (request: FastifyRequest<{ Params: PromoCodeParams; Querystring: any }>, reply: FastifyReply) => {
      // Admin role guard
      if (request.staffContext?.role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const branchId = request.branchContext?.branchId;
      const codeId = request.params.codeId;

      if (!branchId || !codeId) {
        return reply.status(400).send({ error: 'branchId and codeId are required' });
      }

      try {
        // Optional date range filter
        let dateRange: { startDate: Date; endDate: Date } | undefined;
        const query = request.query as any;
        if (query.startDate && query.endDate) {
          dateRange = {
            startDate: new Date(query.startDate),
            endDate: new Date(query.endDate),
          };

          if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
            return reply.status(400).send({
              error: 'startDate and endDate must be valid ISO 8601 dates',
            });
          }
        }

        // Get metrics using PromoMetricsService
        const metrics = await PromoMetricsService.getMetrics(branchId, codeId, dateRange);

        // Handle single code response
        if (!Array.isArray(metrics)) {
          return reply.send({
            id: metrics.codeId,
            code: metrics.code,
            type: metrics.type,
            isActive: metrics.isActive,
            usageCount: metrics.usageCount,
            maxUses: metrics.maxUses,
            currentUses: metrics.currentUses,
            bookingCount: metrics.bookingCount,
            totalDiscountGiven: metrics.totalDiscountGiven,
            averageDiscountPerBooking: metrics.averageDiscountPerBooking,
            conversionRate: metrics.conversionRate,
            roiPercentage: metrics.roiPercentage,
            noShowRate: metrics.noShowRate,
            confirmedCount: metrics.confirmedCount,
            noShowCount: metrics.noShowCount,
          });
        }

        return reply.send({
          metrics: metrics.map((m) => ({
            id: m.codeId,
            code: m.code,
            type: m.type,
            isActive: m.isActive,
            usageCount: m.usageCount,
            maxUses: m.maxUses,
            currentUses: m.currentUses,
            bookingCount: m.bookingCount,
            totalDiscountGiven: m.totalDiscountGiven,
            averageDiscountPerBooking: m.averageDiscountPerBooking,
            conversionRate: m.conversionRate,
            roiPercentage: m.roiPercentage,
            noShowRate: m.noShowRate,
            confirmedCount: m.confirmedCount,
            noShowCount: m.noShowCount,
          })),
        });
      } catch (error) {
        logger.error(
          { error, branchId, codeId },
          'Failed to get promo code performance metrics'
        );
        return reply.status(500).send({ error: 'Failed to get metrics' });
      }
    }
  );

  // ─── GET /api/admin/v1/promo-codes/:codeId/trends ────────────────────────
  /**
   * Get usage trends for a promo code over a date range.
   * Returns daily aggregated data for chart visualization.
   * Query params: startDate (ISO 8601), endDate (ISO 8601)
   */
  fastify.get<{ Params: PromoCodeParams; Querystring: any }>(
    '/api/admin/v1/promo-codes/:codeId/trends',
    async (request: FastifyRequest<{ Params: PromoCodeParams; Querystring: any }>, reply: FastifyReply) => {
      // Admin role guard
      if (request.staffContext?.role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const branchId = request.branchContext?.branchId;
      const codeId = request.params.codeId;

      if (!branchId || !codeId) {
        return reply.status(400).send({ error: 'branchId and codeId are required' });
      }

      // Validate date range
      const query = request.query as any;
      if (!query.startDate || !query.endDate) {
        return reply.status(400).send({
          error: 'startDate and endDate query parameters are required (ISO 8601 format)',
        });
      }

      try {
        const startDate = new Date(query.startDate);
        const endDate = new Date(query.endDate);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return reply.status(400).send({
            error: 'startDate and endDate must be valid ISO 8601 dates',
          });
        }

        if (startDate >= endDate) {
          return reply.status(400).send({
            error: 'startDate must be before endDate',
          });
        }

        // Get trends
        const trends = await PromoMetricsService.getTrends(branchId, codeId, {
          startDate,
          endDate,
        });

        return reply.send({
          codeId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          trends,
        });
      } catch (error) {
        logger.error(
          { error, branchId, codeId },
          'Failed to get promo code trends'
        );
        return reply.status(500).send({ error: 'Failed to get trends' });
      }
    }
  );

  // ─── POST /api/v1/promo-codes/validate ─────────────────────────────────────
  /**
   * Validate a promo code (public endpoint, no auth required).
   * Used by the booking flow to validate codes before time selection.
   * Returns type-specific details for successful codes.
   */
  fastify.post<{ Body: ValidatePromoCodeBody }>(
    '/api/v1/promo-codes/validate',
    async (request: FastifyRequest<{ Body: ValidatePromoCodeBody }>, reply: FastifyReply) => {
      const body = request.body ?? {};

      // Validate required fields
      if (!body.code || typeof body.code !== 'string') {
        return reply.status(422).send({ error: 'code is required' });
      }

      if (!body.branchId || typeof body.branchId !== 'string') {
        return reply.status(422).send({ error: 'branchId is required' });
      }

      if (!body.bookingType || !['standard', 'decorated'].includes(body.bookingType)) {
        return reply.status(422).send({
          error: 'bookingType must be standard or decorated',
        });
      }

      if (body.partySize === undefined || body.partySize < 1) {
        return reply.status(422).send({ error: 'partySize must be a positive integer' });
      }

      try {
        const selectedDate = body.selectedDate ? new Date(body.selectedDate) : undefined;

        const result = await PromoCodeService.validate(
          body.code,
          body.branchId,
          body.bookingType,
          body.partySize,
          body.selectedTime,
          selectedDate
        );

        // Log validation attempt
        logger.debug({
          event: 'promo_code_validated_public',
          code: body.code.toUpperCase(),
          branchId: body.branchId,
          valid: result.valid,
        });

        return reply.send(result);
      } catch (error) {
        logger.error(
          { error, code: body.code, branchId: body.branchId },
          'Failed to validate promo code'
        );
        return reply.status(500).send({ error: 'Failed to validate promo code' });
      }
    }
  );
}

export default promoCodeRoutes;
