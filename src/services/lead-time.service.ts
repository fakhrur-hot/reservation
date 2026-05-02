/**
 * Lead-Time Validation Service
 *
 * Validates booking lead-times based on booking type and promo codes.
 * Requirements: 2.1, 2.2, 2.3, 2.8, 2.9
 *
 * Lead-Time Rules:
 * - Standard Booking (no decoration): 24 hours minimum
 * - Decorated Booking (with decoration): 48 hours minimum
 * - Priority_Code: Overrides lead-time to 1 hour
 */

import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookingType = 'standard' | 'decorated';

export interface LeadTimeValidationResult {
  valid: boolean;
  reason?: string;
  minLeadTimeMinutes?: number;
}

export interface DateRangeResult {
  minDate: Date;
  maxDate: Date;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAD_TIME_STANDARD_MINUTES = 24 * 60;   // 24 hours in minutes
const LEAD_TIME_DECORATED_MINUTES = 48 * 60;  // 48 hours in minutes
const LEAD_TIME_PRIORITY_MINUTES = 60;        // 1 hour in minutes

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get the current UTC timestamp.
 * Using Date.now() for consistent server-side time calculation and testability.
 */
function getCurrentTime(): Date {
  return new Date(Date.now());
}

/**
 * Calculate the minimum allowed booking time based on lead-time in minutes.
 */
function calculateMinBookingTime(leadTimeMinutes: number): Date {
  const minTime = new Date(getCurrentTime().getTime() + leadTimeMinutes * 60 * 1000);
  return minTime;
}

/**
 * Check if a promo code is a Priority code that overrides lead-time.
 * Priority codes allow same-day/next-hour bookings.
 */
async function isPriorityCode(promoCode: string): Promise<boolean> {
  if (!promoCode) return false;

  const db = getDatabase();

  try {
    const result = await db.query(
      `SELECT type FROM promo_codes WHERE code = $1 AND is_active = true LIMIT 1`,
      [promoCode.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].type === 'priority';
  } catch (error) {
    logger.error({ error, promoCode }, 'Failed to check promo code type');
    return false;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class LeadTimeService {
  /**
   * Get the minimum lead-time in minutes for a booking type.
   * Priority codes override the default lead-time to 1 hour.
   *
   * @param bookingType - The type of booking (standard or decorated)
   * @param promoCode - Optional promo code that may override lead-time
   * @returns Minimum lead-time in minutes
   */
  static async getMinLeadTime(
    bookingType: BookingType,
    promoCode?: string
  ): Promise<number> {
    // Check if promo code is a Priority code that overrides lead-time
    if (promoCode) {
      const isPriority = await isPriorityCode(promoCode);
      if (isPriority) {
        logger.info({
          event: 'lead_time_override',
          booking_type: bookingType,
          promo_code: promoCode,
          override_to_minutes: LEAD_TIME_PRIORITY_MINUTES,
        });
        return LEAD_TIME_PRIORITY_MINUTES;
      }
    }

    // Default lead-times based on booking type
    const minLeadTime = bookingType === 'decorated'
      ? LEAD_TIME_DECORATED_MINUTES
      : LEAD_TIME_STANDARD_MINUTES;

    logger.info({
      event: 'lead_time_determined',
      booking_type: bookingType,
      promo_code: promoCode || null,
      min_lead_time_minutes: minLeadTime,
    });

    return minLeadTime;
  }

  /**
   * Validate if a selected date/time satisfies the lead-time requirement.
   *
   * @param bookingType - The type of booking (standard or decorated)
   * @param selectedDateTime - The date/time the customer wants to book
   * @param promoCode - Optional promo code that may override lead-time
   * @returns Validation result with valid flag and reason if invalid
   */
  static async validateLeadTime(
    bookingType: BookingType,
    selectedDateTime: Date,
    promoCode?: string
  ): Promise<LeadTimeValidationResult> {
    const minLeadTimeMinutes = await LeadTimeService.getMinLeadTime(
      bookingType,
      promoCode
    );

    const minBookingTime = calculateMinBookingTime(minLeadTimeMinutes);
    const selectedTime = new Date(selectedDateTime);

    // Check if selected time is at or after the minimum booking time
    if (selectedTime >= minBookingTime) {
      logger.info({
        event: 'lead_time_valid',
        booking_type: bookingType,
        selected_time: selectedTime.toISOString(),
        min_booking_time: minBookingTime.toISOString(),
        lead_time_minutes: minLeadTimeMinutes,
      });

      return {
        valid: true,
        minLeadTimeMinutes,
      };
    }

    // Calculate how many minutes early the booking attempt is
    const earlyMinutes = Math.ceil(
      (minBookingTime.getTime() - selectedTime.getTime()) / (60 * 1000)
    );

    const reason = LeadTimeService.getErrorMessage(
      bookingType,
      minLeadTimeMinutes,
      earlyMinutes
    );

    logger.warn({
      event: 'lead_time_invalid',
      booking_type: bookingType,
      selected_time: selectedTime.toISOString(),
      min_booking_time: minBookingTime.toISOString(),
      lead_time_minutes: minLeadTimeMinutes,
      early_minutes: earlyMinutes,
      reason,
    });

    return {
      valid: false,
      reason,
      minLeadTimeMinutes,
    };
  }

  /**
   * Get the available date range for a booking based on lead-time rules.
   *
   * @param bookingType - The type of booking (standard or decorated)
   * @param promoCode - Optional promo code that may override lead-time
   * @returns Object with minDate and maxDate for available booking dates
   */
  static async getAvailableDateRange(
    bookingType: BookingType,
    promoCode?: string
  ): Promise<DateRangeResult> {
    const minLeadTimeMinutes = await LeadTimeService.getMinLeadTime(
      bookingType,
      promoCode
    );

    const minDate = calculateMinBookingTime(minLeadTimeMinutes);

    // Max date is 90 days from now (configurable business rule)
    const maxDate = new Date(getCurrentTime().getTime() + 90 * 24 * 60 * 60 * 1000);

    logger.info({
      event: 'date_range_calculated',
      booking_type: bookingType,
      promo_code: promoCode || null,
      min_date: minDate.toISOString(),
      max_date: maxDate.toISOString(),
      lead_time_minutes: minLeadTimeMinutes,
    });

    return {
      minDate,
      maxDate,
    };
  }

  /**
   * Generate a user-friendly error message for lead-time violations.
   */
  private static getErrorMessage(
    bookingType: BookingType,
    minLeadTimeMinutes: number,
    earlyMinutes: number
  ): string {
    const hoursRequired = Math.floor(minLeadTimeMinutes / 60);
    const hoursEarly = Math.floor(earlyMinutes / 60);
    const minsEarly = earlyMinutes % 60;

    if (minLeadTimeMinutes === LEAD_TIME_PRIORITY_MINUTES) {
      return `Please select a time at least ${hoursRequired} hour from now. ` +
        `Your selected time is ${hoursEarly > 0 ? `${hoursEarly} hour ` : ''}${minsEarly > 0 ? `${minsEarly} minutes` : ''} too early.`;
    }

    const bookingTypeLabel = bookingType === 'decorated'
      ? 'Special Occasion bookings'
      : 'Reservations';

    return `${bookingTypeLabel} require at least ${hoursRequired} hours advance notice. ` +
      `Your selected time is ${hoursEarly > 0 ? `${hoursEarly} hour ` : ''}${minsEarly > 0 ? `${minsEarly} minutes` : ''} too early.`;
  }
}

export default LeadTimeService;