/**
 * Promo Metrics Service
 *
 * Calculates performance metrics for promo codes:
 * - Usage count and trends
 * - Conversion rates
 * - ROI (Return on Investment)
 * - No-show impact
 * - Discount effectiveness
 *
 * Requirements: 4.9, 4.10, 4.11
 * Uses Redis caching for performance (5-minute TTL)
 */

import { getDatabase } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromoMetrics {
  codeId: string;
  code: string;
  type: string;
  isActive: boolean;
  usageCount: number;
  maxUses?: number;
  currentUses?: number;
  bookingCount: number;
  totalDiscountGiven: number;
  averageDiscountPerBooking: number;
  conversionRate: number;
  roiPercentage: number;
  noShowRate: number;
  noShowCount: number;
  confirmedCount: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface MetricsTrend {
  date: string;
  usageCount: number;
  bookingCount: number;
  totalDiscount: number;
  noShowCount: number;
}

// ─── Cache Manager ────────────────────────────────────────────────────────────

const CACHE_TTL = 300; // 5 minutes in seconds
const CACHE_PREFIX = 'promo:metrics:';

function getCacheKey(branchId: string, codeId?: string, dateRange?: DateRange): string {
  let key = `${CACHE_PREFIX}${branchId}`;
  if (codeId) {
    key += `:${codeId}`;
  }
  if (dateRange) {
    const startStr = dateRange.startDate.toISOString().split('T')[0];
    const endStr = dateRange.endDate.toISOString().split('T')[0];
    key += `:${startStr}:${endStr}`;
  }
  return key;
}

async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    logger.warn({ err, key }, 'Failed to get from metrics cache');
    return null;
  }
}

async function setToCache<T>(key: string, value: T): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(key, CACHE_TTL, JSON.stringify(value));
  } catch (err) {
    logger.warn({ err, key }, 'Failed to set metrics cache');
  }
}

async function invalidateCache(branchId: string): Promise<void> {
  try {
    const redis = getRedis();
    const pattern = `${CACHE_PREFIX}${branchId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.warn({ err, branchId }, 'Failed to invalidate metrics cache');
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export class PromoMetricsService {
  /**
   * Get comprehensive metrics for one or all promo codes in a branch.
   * Supports date range filtering for time-based analysis.
   */
  static async getMetrics(
    branchId: string,
    codeId?: string,
    dateRange?: DateRange
  ): Promise<PromoMetrics | PromoMetrics[]> {
    const cacheKey = getCacheKey(branchId, codeId, dateRange);

    // Try cache first
    const cached = await getFromCache<PromoMetrics | PromoMetrics[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let result: PromoMetrics | PromoMetrics[];

      if (codeId) {
        // Single code metrics
        result = await this.getMetricsForCode(branchId, codeId, dateRange);
      } else {
        // All codes metrics for branch
        result = await this.getMetricsForBranch(branchId, dateRange);
      }

      await setToCache(cacheKey, result);
      return result;
    } catch (err) {
      logger.error({ err, branchId, codeId }, 'Failed to get promo metrics');
      throw new Error('Failed to calculate metrics');
    }
  }

  /**
   * Get metrics for a single promo code.
   */
  private static async getMetricsForCode(
    branchId: string,
    codeId: string,
    dateRange?: DateRange
  ): Promise<PromoMetrics> {
    const db = getDatabase();

    // Base query
    let whereClause = 'WHERE pc.branch_id = $1 AND pc.id = $2';
    const params: any[] = [branchId, codeId];
    let paramIndex = 3;

    // Add date range filter if provided
    let dateFilter = '';
    if (dateRange) {
      dateFilter = ` AND r.created_at >= $${paramIndex} AND r.created_at < $${paramIndex + 1}`;
      params.push(dateRange.startDate.toISOString());
      params.push(dateRange.endDate.toISOString());
      paramIndex += 2;
    }

    // Get promo code details
    const codeResult = await db.query(
      `SELECT id, code, type, is_active, current_uses, max_uses
       FROM promo_codes ${whereClause}`,
      params.slice(0, 2)
    );

    if (codeResult.rows.length === 0) {
      throw new Error(`Promo code ${codeId} not found`);
    }

    const codeRow = codeResult.rows[0];

    // Get metrics from reservations
    const metricsResult = await db.query(
      `SELECT
         COUNT(r.id) as total_reservations,
         COUNT(CASE WHEN r.promo_code IS NOT NULL THEN 1 END) as usage_count,
         SUM(CASE WHEN r.promo_code IS NOT NULL THEN r.promo_code_discount ELSE 0 END) as total_discount,
         COUNT(CASE WHEN r.promo_code IS NOT NULL AND r.status = 'confirmed' THEN 1 END) as confirmed_count,
         COUNT(CASE WHEN r.promo_code IS NOT NULL AND r.status = 'no_show' THEN 1 END) as no_show_count,
         COUNT(CASE WHEN r.status = 'confirmed' THEN 1 END) as all_confirmed
       FROM reservations r
       WHERE r.branch_id = $1 AND r.promo_code = $2${dateFilter}`,
      params.slice(0, 2)
    );

    const metrics = metricsResult.rows[0];
    const usageCount = parseInt(metrics.usage_count || 0);
    const totalDiscount = parseFloat(metrics.total_discount || 0);
    const confirmedCount = parseInt(metrics.confirmed_count || 0);
    const noShowCount = parseInt(metrics.no_show_count || 0);
    const allConfirmed = parseInt(metrics.all_confirmed || 1);

    // Calculate derived metrics
    const conversionRate =
      allConfirmed > 0 ? (confirmedCount / allConfirmed) * 100 : 0;
    const averageDiscountPerBooking =
      usageCount > 0 ? totalDiscount / usageCount : 0;
    const roiPercentage = totalDiscount > 0
      ? ((confirmedCount - noShowCount) / usageCount) * 100
      : 0;
    const noShowRate =
      usageCount > 0 ? (noShowCount / usageCount) * 100 : 0;

    return {
      codeId: codeRow.id,
      code: codeRow.code,
      type: codeRow.type,
      isActive: codeRow.is_active,
      usageCount,
      maxUses: codeRow.max_uses,
      currentUses: codeRow.current_uses,
      bookingCount: parseInt(metrics.total_reservations || 0),
      totalDiscountGiven: totalDiscount,
      averageDiscountPerBooking,
      conversionRate,
      roiPercentage,
      noShowRate,
      noShowCount,
      confirmedCount,
    };
  }

  /**
   * Get metrics for all active promo codes in a branch.
   */
  private static async getMetricsForBranch(
    branchId: string,
    dateRange?: DateRange
  ): Promise<PromoMetrics[]> {
    const db = getDatabase();

    // Get all active promo codes
    const codesResult = await db.query(
      `SELECT id FROM promo_codes
       WHERE branch_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [branchId]
    );

    const codes = codesResult.rows as Array<{ id: string }>;
    const metrics: PromoMetrics[] = [];

    // Calculate metrics for each code
    for (const codeRow of codes) {
      try {
        const codeMetrics = await this.getMetricsForCode(
          branchId,
          codeRow.id,
          dateRange
        );
        metrics.push(codeMetrics);
      } catch (err) {
        logger.warn({ err, codeId: codeRow.id }, 'Failed to get metrics for code');
        // Continue with other codes if one fails
      }
    }

    return metrics;
  }

  /**
   * Get usage trends for a promo code over a date range.
   * Returns daily aggregated data for charting.
   */
  static async getTrends(
    branchId: string,
    codeId: string,
    dateRange: DateRange
  ): Promise<MetricsTrend[]> {
    const db = getDatabase();

    const result = await db.query(
      `SELECT
         DATE(r.created_at) as date,
         COUNT(CASE WHEN r.promo_code = $2 THEN 1 END) as usage_count,
         COUNT(r.id) as booking_count,
         SUM(CASE WHEN r.promo_code = $2 THEN r.promo_code_discount ELSE 0 END) as total_discount,
         COUNT(CASE WHEN r.promo_code = $2 AND r.status = 'no_show' THEN 1 END) as no_show_count
       FROM reservations r
       WHERE r.branch_id = $1
         AND r.created_at >= $3
         AND r.created_at < $4
       GROUP BY DATE(r.created_at)
       ORDER BY DATE(r.created_at) ASC`,
      [
        branchId,
        codeId,
        dateRange.startDate.toISOString(),
        dateRange.endDate.toISOString(),
      ]
    );

    return result.rows.map((row: any) => ({
      date: row.date,
      usageCount: parseInt(row.usage_count),
      bookingCount: parseInt(row.booking_count),
      totalDiscount: parseFloat(row.total_discount || 0),
      noShowCount: parseInt(row.no_show_count),
    }));
  }

  /**
   * Calculate ROI (Return on Investment) for a promo code.
   * ROI = (Confirmed Bookings - No-Shows) / Total Code Uses * 100
   */
  static async calculateROI(
    branchId: string,
    codeId: string,
    dateRange?: DateRange
  ): Promise<number> {
    const db = getDatabase();

    let query = `SELECT
                   COUNT(CASE WHEN r.promo_code = $2 THEN 1 END) as usage_count,
                   COUNT(CASE WHEN r.promo_code = $2 AND r.status = 'confirmed' THEN 1 END) as confirmed_count,
                   COUNT(CASE WHEN r.promo_code = $2 AND r.status = 'no_show' THEN 1 END) as no_show_count
                 FROM reservations r
                 WHERE r.branch_id = $1`;

    const params: any[] = [branchId, codeId];
    let paramIndex = 3;

    if (dateRange) {
      query += ` AND r.created_at >= $${paramIndex} AND r.created_at < $${paramIndex + 1}`;
      params.push(dateRange.startDate.toISOString());
      params.push(dateRange.endDate.toISOString());
    }

    const result = await db.query(query, params);
    const row = result.rows[0];

    const usageCount = parseInt(row.usage_count || 0);
    if (usageCount === 0) return 0;

    const confirmedCount = parseInt(row.confirmed_count || 0);
    const noShowCount = parseInt(row.no_show_count || 0);
    const effectiveCount = confirmedCount - noShowCount;

    return (effectiveCount / usageCount) * 100;
  }

  /**
   * Calculate conversion rate (Confirmed / Total Bookings).
   */
  static async calculateConversionRate(
    branchId: string,
    codeId: string,
    dateRange?: DateRange
  ): Promise<number> {
    const db = getDatabase();

    let query = `SELECT
                   COUNT(CASE WHEN r.promo_code = $2 THEN 1 END) as promo_uses,
                   COUNT(CASE WHEN r.promo_code = $2 AND r.status = 'confirmed' THEN 1 END) as confirmed
                 FROM reservations r
                 WHERE r.branch_id = $1`;

    const params: any[] = [branchId, codeId];
    let paramIndex = 3;

    if (dateRange) {
      query += ` AND r.created_at >= $${paramIndex} AND r.created_at < $${paramIndex + 1}`;
      params.push(dateRange.startDate.toISOString());
      params.push(dateRange.endDate.toISOString());
    }

    const result = await db.query(query, params);
    const row = result.rows[0];

    const promoUses = parseInt(row.promo_uses || 0);
    const confirmed = parseInt(row.confirmed || 0);

    if (promoUses === 0) return 0;
    return (confirmed / promoUses) * 100;
  }

  /**
   * Calculate no-show rate for a promo code.
   * No-Show Rate = No-Shows / Total Uses * 100
   */
  static async calculateNoShowRate(
    branchId: string,
    codeId: string,
    dateRange?: DateRange
  ): Promise<number> {
    const db = getDatabase();

    let query = `SELECT
                   COUNT(CASE WHEN r.promo_code = $2 THEN 1 END) as usage_count,
                   COUNT(CASE WHEN r.promo_code = $2 AND r.status = 'no_show' THEN 1 END) as no_show_count
                 FROM reservations r
                 WHERE r.branch_id = $1`;

    const params: any[] = [branchId, codeId];
    let paramIndex = 3;

    if (dateRange) {
      query += ` AND r.created_at >= $${paramIndex} AND r.created_at < $${paramIndex + 1}`;
      params.push(dateRange.startDate.toISOString());
      params.push(dateRange.endDate.toISOString());
    }

    const result = await db.query(query, params);
    const row = result.rows[0];

    const usageCount = parseInt(row.usage_count || 0);
    const noShowCount = parseInt(row.no_show_count || 0);

    if (usageCount === 0) return 0;
    return (noShowCount / usageCount) * 100;
  }

  /**
   * Invalidate metrics cache after promo code changes.
   * Called by promo-code.routes.ts after create/update/delete operations.
   */
  static async invalidateMetricsCache(branchId: string): Promise<void> {
    await invalidateCache(branchId);
  }

  /**
   * Export metrics to CSV format for reporting.
   */
  static async exportMetricsCSV(
    branchId: string,
    codeId?: string,
    dateRange?: DateRange
  ): Promise<string> {
    const metrics = await this.getMetrics(branchId, codeId, dateRange);

    const isArray = Array.isArray(metrics);
    const metricsArray = isArray ? metrics : [metrics];

    // CSV header
    const header = [
      'Code',
      'Type',
      'Status',
      'Usage Count',
      'Max Uses',
      'Conversion Rate (%)',
      'ROI (%)',
      'Total Discount',
      'Avg Discount/Booking',
      'No-Show Rate (%)',
      'Confirmed Bookings',
      'No-Shows',
    ].join(',');

    // CSV rows
    const rows = metricsArray.map((m) =>
      [
        m.code,
        m.type,
        m.isActive ? 'Active' : 'Inactive',
        m.usageCount,
        m.maxUses || 'Unlimited',
        m.conversionRate.toFixed(2),
        m.roiPercentage.toFixed(2),
        m.totalDiscountGiven.toFixed(2),
        m.averageDiscountPerBooking.toFixed(2),
        m.noShowRate.toFixed(2),
        m.confirmedCount,
        m.noShowCount,
      ].join(',')
    );

    return [header, ...rows].join('\n');
  }
}
