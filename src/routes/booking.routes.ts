/**
 * Booking Routes
 *
 * GET /api/v1/available-slots â€” Get available time slots for a branch
 * POST /api/v1/promo-codes/validate â€” Validate a promo code
 *
 * Requirements: 1.6, 1.7, 2.6, 2.7, 2.8, 3.6, 3.7
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LeadTimeService, BookingType } from '../services/lead-time.service.js';
import { SessionDurationService } from '../services/session-duration.service.js';
import { TableLockService } from '../services/table-lock.service.js';
import { PromoCodeService, PromoCodeType } from '../services/promo-code.service.js';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AvailableSlotsQuery {
  branchId: string;
  date: string;       // ISO date string YYYY-MM-DD
  partySize: number;
  isDecorated: boolean;
  promoCode?: string;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  duration: number;
  available: boolean;
  tableId?: string; // Add tableId to represent the locked resource
  reason?: string;
}

interface AvailableSlotsResponse {
  slots: TimeSlot[];
  leadTimeApplied: number;        // hours
  promoCodeValid: boolean | null; // null if no promo code provided
  date: string;
  partySize: number;
  isDecorated: boolean;
  depositAmount: number;
  cakeDepositAmt: number;
  cakeDepositType: 'fixed' | 'percentage';
}

interface PromoCodeValidationRequest {
  code: string;
  branchId: string;
  bookingType: 'standard' | 'decorated';
  partySize: number;
  selectedTime?: string;
  selectedDate?: string; // ISO date string YYYY-MM-DD
}

interface PromoCodeValidationResponse {
  valid: boolean;
  details?: {
    code: string;
    type: PromoCodeType;
    description?: string;
    // Priority code
    overrideLeadTime?: boolean;
    minLeadTimeMinutes?: number;
    // Turnover code
    validFromTime?: string;
    validToTime?: string;
    validDaysOfWeek?: string;
    // VIP code
    sessionDurationMinutes?: number;
    // Group code
    minPartySize?: number;
    // Discount code
    discountType?: 'percentage' | 'fixed';
    discountValue?: number;
    // Affiliate code
    affiliateId?: string;
  };
  error?: string;
  errorCode?: string;
}

// â”€â”€â”€ Helper Functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Parse time string HH:MM into hours and minutes.
 */
function parseTime(timeString: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeString.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Format hours/minutes into HH:MM string.
 */
function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Get operating hours for a branch on a specific date.
 * Returns { openTime, closeTime } or null if closed.
 */
async function getOperatingHours(
  branchId: string,
  date: Date
): Promise<{ openTime: string; closeTime: string } | null> {
  const db = getDatabase();
  const dateStr = date.toISOString().slice(0, 10);
  const dayOfWeek = date.getDay();

  // Check for override first
  const overrideResult = await db.query(
    `SELECT is_open, open_time, close_time
     FROM business_hours_overrides
     WHERE branch_id = $1 AND override_date = $2
     LIMIT 1`,
    [branchId, dateStr]
  );

  if (overrideResult.rows.length > 0) {
    const row = overrideResult.rows[0];
    if (!row.is_open || !row.open_time || !row.close_time) {
      return null;
    }
    return {
      openTime: row.open_time.slice(0, 5),
      closeTime: row.close_time.slice(0, 5),
    };
  }

  // Fall back to weekly schedule
  const scheduleResult = await db.query(
    `SELECT is_open, open_time, close_time
     FROM business_hours
     WHERE branch_id = $1 AND day_of_week = $2
     LIMIT 1`,
    [branchId, dayOfWeek]
  );

  if (scheduleResult.rows.length === 0) {
    return null;
  }

  const row = scheduleResult.rows[0];
  if (!row.is_open || !row.open_time || !row.close_time) {
    return null;
  }

  return {
    openTime: row.open_time.slice(0, 5),
    closeTime: row.close_time.slice(0, 5),
  };
}

/**
 * Get available tables for a branch that can accommodate the party size.
 */
async function getAvailableTables(
  branchId: string,
  partySize: number,
  isDecorated: boolean
): Promise<{ id: string; name: string; capacity: number }[]> {
  const db = getDatabase();

  const result = await db.query(
    `SELECT id, name, capacity
     FROM tables
     WHERE branch_id = $1 AND is_active = true AND capacity >= $2
     ${isDecorated ? ' AND can_be_decorated = true' : ''}
     ORDER BY capacity ASC, name ASC`,
    [branchId, partySize]
  );

  return result.rows;
}

// â”€â”€â”€ Plugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function bookingRoutes(fastify: FastifyInstance) {
  // â”€â”€ GET /api/v1/available-slots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fastify.get<{ Querystring: AvailableSlotsQuery }>(
    '/api/v1/available-slots',
    async (
      request: FastifyRequest<{ Querystring: AvailableSlotsQuery }>,
      reply: FastifyReply
    ) => {
      const { branchId, date, partySize, isDecorated, promoCode } = request.query;

      // Parse and validate parameters
      const parsedBranchId = String(branchId || '').trim();
      if (!parsedBranchId) {
        return reply.status(400).send({
          error: 'branchId is required',
          code: 'MISSING_BRANCH_ID',
        });
      }

      const parsedDate = String(date || '').trim();
      if (!parsedDate) {
        return reply.status(400).send({
          error: 'date is required',
          code: 'MISSING_DATE',
        });
      }

      const parsedPartySize = parseInt(String(partySize), 10);
      if (isNaN(parsedPartySize) || parsedPartySize < 1) {
        return reply.status(400).send({
          error: 'partySize must be a positive integer',
          code: 'INVALID_PARTY_SIZE',
        });
      }

      if (isDecorated === undefined || isDecorated === null) {
        return reply.status(400).send({
          error: 'isDecorated is required',
          code: 'MISSING_IS_DECORATED',
        });
      }
      const parsedIsDecorated = String(isDecorated).toLowerCase() === 'true';

      // Parse and validate date
      const selectedDate = new Date(parsedDate);
      if (isNaN(selectedDate.getTime())) {
        return reply.status(400).send({
          error: 'date must be a valid ISO date string',
          code: 'INVALID_DATE',
        });
      }

      // Determine booking type for lead-time calculation
      const bookingType: BookingType = parsedIsDecorated ? 'decorated' : 'standard';

      // Validate promo code if provided
      let promoCodeValid = null;

      if (promoCode) {
        const promoValidation = await PromoCodeService.validate(
          promoCode,
          parsedBranchId,
          bookingType,
          parsedPartySize
        );
        if (!promoValidation.valid) {
          return reply.status(400).send({
            error: promoValidation.error,
            code: 'INVALID_PROMO_CODE',
          });
        }
        promoCodeValid = true;
      }

      // Validate lead-time
      const selectedDateTime = new Date(selectedDate);
      selectedDateTime.setHours(12, 0, 0, 0); // Use noon as representative time

      const leadTimeValidation = await LeadTimeService.validateLeadTime(
        bookingType,
        selectedDateTime,
        promoCode
      );

      if (!leadTimeValidation.valid) {
        return reply.status(400).send({
          error: leadTimeValidation.reason,
          code: 'LEAD_TIME_VIOLATION',
          minLeadTimeHours: (leadTimeValidation.minLeadTimeMinutes ?? 0) / 60,
        });
      }

      // Get operating hours for the branch on the selected date
      const operatingHours = await getOperatingHours(parsedBranchId, selectedDate);

      if (!operatingHours) {
        return reply.status(400).send({
          error: 'Branch is not open on the selected date',
          code: 'BRANCH_CLOSED',
        });
      }

      // Fetch deposit settings
      const db = getDatabase();
      const branchSettingsResult = await db.query(
        `SELECT booking_deposit_amt, cake_deposit_amt, cake_deposit_type, decoration_package_price FROM branches WHERE id = $1`,
        [parsedBranchId]
      );
      const depositAmount = Number(branchSettingsResult.rows[0]?.booking_deposit_amt || 50);
      const cakeDepositAmt = Number(branchSettingsResult.rows[0]?.cake_deposit_amt || 0);
      const cakeDepositType = (branchSettingsResult.rows[0]?.cake_deposit_type as 'fixed' | 'percentage') || 'fixed';

      // Get available tables
      const tables = await getAvailableTables(parsedBranchId, parsedPartySize, parsedIsDecorated);

      if (tables.length === 0) {
        return reply.status(400).send({
          error: 'No tables available for the requested party size',
          code: 'NO_TABLES',
        });
      }

      // Generate time slots (30-minute intervals)
      const slots: TimeSlot[] = [];
      const { openTime, closeTime } = operatingHours;

      const open = parseTime(openTime);
      const close = parseTime(closeTime);

      // Generate slots from open time to close time
      // Use 30-minute intervals
      const slotIntervalMinutes = 30;

      for (let minutes = 0; ; minutes += slotIntervalMinutes) {
        const totalMinutes = open.hours * 60 + open.minutes + minutes;
        const slotHours = Math.floor(totalMinutes / 60) % 24;
        const slotMinutes = totalMinutes % 60;

        // Stop if the slot starts less than 30 minutes before closing time
        // Calculate minutes until closing time
        const closingTotalMinutes = close.hours * 60 + close.minutes;
        if (totalMinutes > closingTotalMinutes - 30) {
          break;
        }

        const startTime = formatTime(slotHours, slotMinutes);

        // Calculate session duration based on time of day and promo code
        const duration = await SessionDurationService.getSessionDuration(
          startTime,
          promoCode
        );

        // Calculate end time
        const endTime = SessionDurationService.calculateEndTime(startTime, duration);

        // Remove the endTime check so that the last booking time (half hour before close) is always shown.

        // Check availability for each table
        let isAvailable = false;
        let availabilityReason = 'No tables available';
        let foundTableId = '';

        for (const table of tables) {
          // Check if table is locked
          const isTableLocked = await TableLockService.isLocked(table.id, parsedBranchId);
          if (isTableLocked) {
            continue; // Skip locked tables
          }

          // Check for conflicting reservations
          const availabilityResult = await SessionDurationService.isTimeSlotAvailable(
            startTime,
            endTime,
            table.id,
            selectedDate
          );

          if (availabilityResult.available) {
            isAvailable = true;
            foundTableId = table.id;
            availabilityReason = '';
            break; // Found an available table
          } else {
            availabilityReason = availabilityResult.reason || availabilityReason;
          }
        }

        slots.push({
          startTime,
          endTime,
          duration,
          available: isAvailable,
          tableId: foundTableId || undefined,
          reason: isAvailable ? undefined : availabilityReason,
        });
      }

      logger.info({
        event: 'available_slots_generated',
        branch_id: parsedBranchId,
        date: parsedDate,
        party_size: parsedPartySize,
        is_decorated: parsedIsDecorated,
        promo_code: promoCode || null,
        total_slots: slots.length,
        available_slots: slots.filter(s => s.available).length,
      });

      const response: AvailableSlotsResponse = {
        slots,
        leadTimeApplied: (leadTimeValidation.minLeadTimeMinutes ?? 0) / 60,
        promoCodeValid,
        date: parsedDate,
        partySize: parsedPartySize,
        isDecorated: parsedIsDecorated,
        depositAmount,
        cakeDepositAmt,
        cakeDepositType,
        decorationPackagePrice: Number(branchSettingsResult.rows[0]?.decoration_package_price || 50),
      };

      return reply.send(response);
    }
  );

}

export default bookingRoutes;