/**
 * Promo Code Service
 *
 * Validates promo codes and returns type-specific details.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
 *
 * Promo Code Types:
 * - Priority_Code: Overrides Lead_Time to 1 hour (same-day/next-hour bookings)
 * - Turnover_Code: Restricts usage to specific time windows (e.g., 3:00 PM – 5:00 PM)
 * - VIP_Code: Forces 3-hour Session_Duration + loyalty benefits
 * - Affiliate_Code: Tracks booking sources for marketing ROI
 * - Group_Code: Validates minimum Party_Size (e.g., 6+ guests)
 * - Discount_Code: Applies percentage or fixed-amount discount to deposit
 */

import { getDatabase } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PromoCodeType = 'priority' | 'turnover' | 'vip' | 'affiliate' | 'group' | 'discount';

export interface PromoCodeDetails {
  id: string;
  code: string;
  type: PromoCodeType;
  description: string | null;
  // Priority code
  overrideLeadTime?: boolean;
  minLeadTimeMinutes?: number;
  // Turnover code
  validFromTime?: string;
  validToTime?: string;
  validDaysOfWeek?: string;
  // VIP code
  forceSessionDuration?: number;
  sessionDurationMinutes?: number; // For response
  // Group code
  minPartySize?: number;
  // Discount code
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  // Affiliate code
  affiliateId?: string;
  // Common
  validFrom?: Date;
  validTo?: Date;
  maxUses?: number;
  currentUses?: number;
  isActive?: boolean;
}

export interface PromoValidationResult {
  valid: boolean;
  details?: PromoCodeDetails;
  error?: string;
  errorCode?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 300; // 5 minutes

function cacheKey(code: string, branchId: string): string {
  return `promo:${code.toUpperCase()}:${branchId}`;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Parse a time string (HH:MM) into hours and minutes.
 */
function parseTime(timeString: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeString.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Check if a given time (HH:MM) falls within a time window.
 */
function isTimeInWindow(
  timeString: string,
  fromTime: string,
  toTime: string
): boolean {
  const time = parseTime(timeString);
  const from = parseTime(fromTime);
  const to = parseTime(toTime);

  // Convert to minutes for comparison
  const timeMinutes = time.hours * 60 + time.minutes;
  const fromMinutes = from.hours * 60 + from.minutes;
  const toMinutes = to.hours * 60 + to.minutes;

  return timeMinutes >= fromMinutes && timeMinutes < toMinutes;
}

/**
 * Check if a day of week is in the valid days list.
 */
function isDayValid(dayOfWeek: number, validDaysString: string): boolean {
  if (!validDaysString) return true;

  const validDays = validDaysString.split(',').map((d) => d.trim().toUpperCase());
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const dayName = dayNames[dayOfWeek];

  return validDays.includes(dayName);
}

/**
 * Build a details object from a promo code database row.
 */
function buildDetailsFromRow(row: Record<string, any>): PromoCodeDetails {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    description: row.description,
    overrideLeadTime: row.override_lead_time ?? undefined,
    minLeadTimeMinutes: row.override_lead_time ? 60 : undefined,
    validFromTime: row.valid_from_time?.slice(0, 5) ?? undefined,
    validToTime: row.valid_to_time?.slice(0, 5) ?? undefined,
    validDaysOfWeek: row.valid_days_of_week ?? undefined,
    forceSessionDuration: row.force_session_duration ?? undefined,
    minPartySize: row.min_party_size ?? undefined,
    discountType: row.discount_type ?? undefined,
    discountValue: row.discount_value ?? undefined,
    affiliateId: row.affiliate_id ?? undefined,
    validFrom: row.valid_from ? new Date(row.valid_from) : undefined,
    validTo: row.valid_to ? new Date(row.valid_to) : undefined,
    maxUses: row.max_uses ?? undefined,
    currentUses: row.current_uses ?? undefined,
    isActive: row.is_active,
  };
}

// ─── Validation Functions ─────────────────────────────────────────────────────

/**
 * Validate a Priority code - allows same-day/next-hour bookings.
 */
function validatePriorityCode(details: PromoCodeDetails): PromoValidationResult {
  return {
    valid: true,
    details: {
      ...details,
      overrideLeadTime: true,
      minLeadTimeMinutes: 60,
    },
  };
}

/**
 * Validate a Turnover code - restricts usage to specific time windows.
 */
function validateTurnoverCode(
  details: PromoCodeDetails,
  selectedTime: string,
  selectedDate: Date
): PromoValidationResult {
  // Check if time window is configured
  if (!details.validFromTime || !details.validToTime) {
    return {
      valid: false,
      error: 'Turnover code has no time window configured',
      errorCode: 'INVALID_CONFIGURATION',
    };
  }

  // Check if day of week is valid first (if specified)
  // This check is done before time check to give more specific error message
  if (details.validDaysOfWeek) {
    const dayOfWeek = selectedDate.getDay();
    if (!isDayValid(dayOfWeek, details.validDaysOfWeek)) {
      const validDays = details.validDaysOfWeek.split(',').join(', ');
      return {
        valid: false,
        error: `Code only valid on: ${validDays}`,
        errorCode: 'DAY_RESTRICTION',
        details: {
          ...details,
          validDaysOfWeek: details.validDaysOfWeek,
        },
      };
    }
  }

  // Check if selected time is within the valid window
  if (selectedTime && !isTimeInWindow(selectedTime, details.validFromTime, details.validToTime)) {
    return {
      valid: false,
      error: `Code only valid between ${details.validFromTime} and ${details.validToTime}`,
      errorCode: 'TIME_RESTRICTION',
      details: {
        ...details,
        validFromTime: details.validFromTime,
        validToTime: details.validToTime,
      },
    };
  }

  return {
    valid: true,
    details: {
      ...details,
      validFromTime: details.validFromTime,
      validToTime: details.validToTime,
      validDaysOfWeek: details.validDaysOfWeek,
    },
  };
}

/**
 * Validate a VIP code - forces 3-hour session duration.
 */
function validateVIPCode(details: PromoCodeDetails): PromoValidationResult {
  return {
    valid: true,
    details: {
      ...details,
      sessionDurationMinutes: details.forceSessionDuration || 180, // Default to 3 hours
    },
  };
}

/**
 * Validate an Affiliate code - tracks booking sources.
 */
function validateAffiliateCode(details: PromoCodeDetails): PromoValidationResult {
  return {
    valid: true,
    details: {
      ...details,
      affiliateId: details.affiliateId,
    },
  };
}

/**
 * Validate a Group code - requires minimum party size.
 */
function validateGroupCode(
  details: PromoCodeDetails,
  partySize: number
): PromoValidationResult {
  const minPartySize = details.minPartySize || 6; // Default to 6 if not set

  if (partySize < minPartySize) {
    return {
      valid: false,
      error: `Minimum party size is ${minPartySize} guests`,
      errorCode: 'PARTY_SIZE_TOO_SMALL',
      details: {
        ...details,
        minPartySize,
      },
    };
  }

  return {
    valid: true,
    details: {
      ...details,
      minPartySize,
    },
  };
}

/**
 * Validate a Discount code - applies percentage or fixed discount.
 */
function validateDiscountCode(details: PromoCodeDetails): PromoValidationResult {
  if (!details.discountType || !details.discountValue) {
    return {
      valid: false,
      error: 'Discount code has no discount configured',
      errorCode: 'INVALID_CONFIGURATION',
    };
  }

  return {
    valid: true,
    details: {
      ...details,
      discountType: details.discountType,
      discountValue: details.discountValue,
    },
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PromoCodeService {
  /**
   * Validate a promo code and return type-specific details.
   * Uses Redis caching with 5-minute TTL for performance.
   *
   * @param code - The promo code to validate
   * @param branchId - The branch ID context
   * @param bookingType - The booking type (standard or decorated)
   * @param partySize - The number of guests
   * @param selectedTime - Optional selected time for time-based validation
   * @param selectedDate - Optional selected date for day-based validation
   * @returns Validation result with details or error
   */
  static async validate(
    code: string,
    branchId: string,
    bookingType: 'standard' | 'decorated',
    partySize: number,
    selectedTime?: string,
    selectedDate?: Date
  ): Promise<PromoValidationResult> {
    const normalizedCode = code.toUpperCase().trim();

    if (!normalizedCode) {
      return {
        valid: false,
        error: 'Promo code is required',
        errorCode: 'MISSING_CODE',
      };
    }

    if (!branchId) {
      return {
        valid: false,
        error: 'branchId is required',
        errorCode: 'MISSING_BRANCH_ID',
      };
    }

    if (partySize == null || partySize < 1) {
      return {
        valid: false,
        error: 'partySize must be a positive integer',
        errorCode: 'INVALID_PARTY_SIZE',
      };
    }

    const redis = getRedis();
    const db = getDatabase();

    // Check Redis cache first (5-minute TTL)
    const cacheKeyValue = cacheKey(normalizedCode, branchId);
    try {
      const cached = await redis.get(cacheKeyValue);
      if (cached) {
        logger.debug({
          event: 'promo_code_cache_hit',
          code: normalizedCode,
          branch_id: branchId,
        });
        return JSON.parse(cached) as PromoValidationResult;
      }
    } catch (error) {
      logger.warn({ error, code: normalizedCode, branchId }, 'Redis cache read failed');
    }

    // Query database for the promo code
    try {
      const result = await db.query(
        `SELECT * FROM promo_codes
         WHERE code = $1 AND branch_id = $2
         LIMIT 1`,
        [normalizedCode, branchId]
      );

      if (result.rows.length === 0) {
        const result: PromoValidationResult = {
          valid: false,
          error: 'Promo code not found',
          errorCode: 'NOT_FOUND',
        };

        // Cache negative result briefly (30 seconds) to prevent DB hammering
        await redis.setex(cacheKeyValue, 30, JSON.stringify(result));

        return result;
      }

      const row = result.rows[0];
      const details = buildDetailsFromRow(row);

      // Check if code is active
      if (!row.is_active) {
        const result: PromoValidationResult = {
          valid: false,
          error: 'Promo code is inactive',
          errorCode: 'INACTIVE',
          details,
        };

        await redis.setex(cacheKeyValue, 30, JSON.stringify(result));

        return result;
      }

      // Check validity period
      const now = new Date();
      if (row.valid_from && new Date(row.valid_from) > now) {
        const result: PromoValidationResult = {
          valid: false,
          error: 'Promo code is not yet valid',
          errorCode: 'NOT_YET_VALID',
          details,
        };

        await redis.setex(cacheKeyValue, 30, JSON.stringify(result));

        return result;
      }

      if (row.valid_to && new Date(row.valid_to) < now) {
        const result: PromoValidationResult = {
          valid: false,
          error: 'Promo code has expired',
          errorCode: 'EXPIRED',
          details,
        };

        await redis.setex(cacheKeyValue, 30, JSON.stringify(result));

        return result;
      }

      // Check usage limit
      if (row.max_uses && row.current_uses >= row.max_uses) {
        const result: PromoValidationResult = {
          valid: false,
          error: 'Promo code usage limit reached',
          errorCode: 'USAGE_LIMIT',
          details,
        };

        await redis.setex(cacheKeyValue, 30, JSON.stringify(result));

        return result;
      }

      // Validate based on promo code type
      let validationResult: PromoValidationResult;

      switch (row.type) {
        case 'priority':
          validationResult = validatePriorityCode(details);
          break;

        case 'turnover':
          validationResult = validateTurnoverCode(
            details,
            selectedTime || '12:00',
            selectedDate || new Date()
          );
          break;

        case 'vip':
          validationResult = validateVIPCode(details);
          break;

        case 'affiliate':
          validationResult = validateAffiliateCode(details);
          break;

        case 'group':
          validationResult = validateGroupCode(details, partySize);
          break;

        case 'discount':
          validationResult = validateDiscountCode(details);
          break;

        default:
          validationResult = {
            valid: false,
            error: 'Unknown promo code type',
            errorCode: 'INVALID_TYPE',
            details,
          };
      }

      // Cache successful validation result
      if (validationResult.valid) {
        await redis.setex(cacheKeyValue, CACHE_TTL_SECONDS, JSON.stringify(validationResult));
      }

      logger.info({
        event: 'promo_code_validated',
        code: normalizedCode,
        branch_id: branchId,
        type: row.type,
        valid: validationResult.valid,
        error: validationResult.error,
      });

      return validationResult;
    } catch (error) {
      logger.error({ error, code: normalizedCode, branchId }, 'Failed to validate promo code');

      return {
        valid: false,
        error: 'Failed to validate promo code',
        errorCode: 'INTERNAL_ERROR',
      };
    }
  }

  /**
   * Increment the usage count for a promo code.
   * Should be called when a reservation is confirmed.
   *
   * @param codeId - The promo code ID
   */
  static async incrementUsage(codeId: string): Promise<void> {
    const db = getDatabase();

    try {
      await db.query(
        `UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = $1`,
        [codeId]
      );

      logger.info({
        event: 'promo_code_usage_incremented',
        code_id: codeId,
      });
    } catch (error) {
      logger.error({ error, codeId }, 'Failed to increment promo code usage');
      throw error;
    }
  }

  /**
   * Get performance metrics for promo codes in a branch.
   *
   * @param branchId - The branch ID
   * @param codeId - Optional specific code ID
   * @returns Array of promo code metrics
   */
  static async getPerformanceMetrics(
    branchId: string,
    codeId?: string
  ): Promise<Record<string, any>[]> {
    const db = getDatabase();

    try {
      let query = `
        SELECT
          p.id,
          p.code,
          p.type,
          p.current_uses as usage_count,
          p.max_uses,
          p.is_active,
          COUNT(r.id) as booking_count,
          COALESCE(SUM(r.promo_code_discount), 0) as total_discount_given
        FROM promo_codes p
        LEFT JOIN reservations r ON r.promo_code = p.code AND r.branch_id = p.branch_id
        WHERE p.branch_id = $1
      `;

      const params: any[] = [branchId];

      if (codeId) {
        query += ` AND p.id = $2`;
        params.push(codeId);
      }

      query += ` GROUP BY p.id ORDER BY p.created_at DESC`;

      const result = await db.query(query, params);

      return result.rows.map((row) => ({
        id: row.id,
        code: row.code,
        type: row.type,
        usageCount: parseInt(row.usage_count, 10),
        maxUses: row.max_uses,
        isActive: row.is_active,
        bookingCount: parseInt(row.booking_count, 10),
        totalDiscountGiven: parseFloat(row.total_discount_given) || 0,
      }));
    } catch (error) {
      logger.error({ error, branchId, codeId }, 'Failed to get promo code metrics');
      throw error;
    }
  }

  /**
   * Invalidate the cache for a specific promo code.
   * Call this when a promo code is updated or deactivated.
   *
   * @param code - The promo code
   * @param branchId - The branch ID
   */
  static async invalidateCache(code: string, branchId: string): Promise<void> {
    const redis = getRedis();
    const key = cacheKey(code.toUpperCase(), branchId);

    try {
      await redis.del(key);
      logger.info({
        event: 'promo_code_cache_invalidated',
        code: code.toUpperCase(),
        branch_id: branchId,
      });
    } catch (error) {
      logger.warn({ error, code, branchId }, 'Failed to invalidate promo code cache');
    }
  }
}

export default PromoCodeService;