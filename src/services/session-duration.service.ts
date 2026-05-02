/**
 * Session Duration Service
 *
 * Calculates session durations based on time of day and promo codes.
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7
 *
 * Session Duration Rules:
 * - Daytime (9:00 AM – 6:59 PM): 1.5 hours (90 minutes)
 * - Evening (7:00 PM – 10:00 PM): 3.0 hours (180 minutes)
 * - VIP_Code: Forces 3-hour session duration even for daytime slots
 */

import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimeSlot {
  startTime: string;
  endTime: string;
  duration: number;
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_DURATION_DAYTIME_MINUTES = 90;   // 1.5 hours in minutes
const SESSION_DURATION_EVENING_MINUTES = 180;  // 3 hours in minutes
const SESSION_DURATION_VIP_MINUTES = 180;      // VIP always gets 3 hours

const EVENING_START_HOUR = 19;  // 7:00 PM (24-hour format)
const DAYTIME_END_HOUR = 18;    // 6:59 PM (last hour for daytime)

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Parse a time string (HH:MM) into hours and minutes.
 */
function parseTime(timeString: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeString.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Check if a time is within the daytime window (9:00 AM - 6:59 PM).
 */
function isDaytime(hours: number, minutes: number): boolean {
  // Daytime: 9:00 AM (09:00) to 6:59 PM (18:59)
  if (hours < 9) return false;
  if (hours > DAYTIME_END_HOUR) return false;
  if (hours === DAYTIME_END_HOUR && minutes > 59) return false;
  return true;
}

/**
 * Check if a promo code is a VIP code that forces 3-hour duration.
 */
async function isVIPCode(promoCode: string): Promise<boolean> {
  if (!promoCode) return false;

  const db = getDatabase();

  try {
    const result = await db.query(
      `SELECT type, is_active FROM promo_codes WHERE code = $1 LIMIT 1`,
      [promoCode.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return false;
    }

    // Only apply VIP override if the code is active
    const promoCodeData = result.rows[0];
    if (!promoCodeData.is_active) {
      return false;
    }

    return promoCodeData.type === 'vip';
  } catch (error) {
    logger.error({ error, promoCode }, 'Failed to check promo code type');
    return false;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SessionDurationService {
  /**
   * Get the session duration in minutes for a given start time.
   * VIP codes override to 3 hours even for daytime slots.
   *
   * @param startTime - Start time in HH:MM format (24-hour)
   * @param promoCode - Optional promo code that may override duration
   * @returns Session duration in minutes
   */
  static async getSessionDuration(
    startTime: string,
    promoCode?: string
  ): Promise<number> {
    const { hours, minutes } = parseTime(startTime);

    // Check if promo code is a VIP code that forces 3-hour duration
    if (promoCode) {
      const isVIP = await isVIPCode(promoCode);
      if (isVIP) {
        logger.info({
          event: 'session_duration_vip_override',
          start_time: startTime,
          promo_code: promoCode,
          duration_minutes: SESSION_DURATION_VIP_MINUTES,
        });
        return SESSION_DURATION_VIP_MINUTES;
      }
    }

    // Standard durations based on time of day
    const isDaytimeSlot = isDaytime(hours, minutes);
    const duration = isDaytimeSlot
      ? SESSION_DURATION_DAYTIME_MINUTES
      : SESSION_DURATION_EVENING_MINUTES;

    logger.info({
      event: 'session_duration_calculated',
      start_time: startTime,
      promo_code: promoCode || null,
      is_daytime: isDaytimeSlot,
      duration_minutes: duration,
    });

    return duration;
  }

  /**
   * Calculate the end time given a start time and duration.
   *
   * @param startTime - Start time in HH:MM format (24-hour)
   * @param duration - Duration in minutes
   * @returns End time in HH:MM format (24-hour)
   */
  static calculateEndTime(startTime: string, duration: number): string {
    const { hours, minutes } = parseTime(startTime);

    // Calculate total minutes from midnight
    const totalMinutes = hours * 60 + minutes + duration;

    // Handle overflow past midnight (wrap to next day, but we only return time)
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;

    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

    logger.info({
      event: 'end_time_calculated',
      start_time: startTime,
      duration_minutes: duration,
      end_time: endTime,
    });

    return endTime;
  }

  /**
   * Check if a time slot is available for a specific table on a given date.
   * Queries the database for conflicting reservations.
   *
   * @param startTime - Start time in HH:MM format
   * @param endTime - End time in HH:MM format
   * @param tableId - The table ID to check
   * @param date - The date of the reservation
   * @returns Availability result with available flag and reason if not available
   */
  static async isTimeSlotAvailable(
    startTime: string,
    endTime: string,
    tableId: string,
    date: Date | string
  ): Promise<AvailabilityResult> {
    const db = getDatabase();

    try {
      // Build full ISO datetime strings for the slot
      const dateStr = date instanceof Date
        ? date.toISOString().split('T')[0]
        : String(date);

      const slotStart = `${dateStr}T${startTime}:00`;
      const slotEnd   = `${dateStr}T${endTime}:00`;

      // Check for conflicting reservations using reservation_time + session_duration_minutes
      // A conflict exists if: existing_start < slot_end AND existing_end > slot_start
      const result = await db.query(
        `SELECT COUNT(*) AS count
         FROM reservations
         WHERE table_id = $1
           AND status IN ('confirmed', 'seated')
           AND reservation_time AT TIME ZONE 'Asia/Kuala_Lumpur' < $3::timestamptz
           AND (
             reservation_time + COALESCE(session_duration_minutes, 90) * INTERVAL '1 minute'
           ) AT TIME ZONE 'Asia/Kuala_Lumpur' > $2::timestamptz`,
        [tableId, slotStart, slotEnd]
      );

      const conflictCount = parseInt(result.rows[0].count, 10);

      if (conflictCount > 0) {
        return {
          available: false,
          reason: 'Time slot conflicts with existing reservation',
        };
      }

      return { available: true };
    } catch (error) {
      logger.error(
        { error, startTime, endTime, tableId, date },
        'Failed to check time slot availability'
      );
      return {
        available: false,
        reason: 'Unable to verify availability',
      };
    }
  }

  /**
   * Get a complete time slot object with start time, end time, and duration.
   * Convenience method that combines getSessionDuration and calculateEndTime.
   *
   * @param startTime - Start time in HH:MM format
   * @param promoCode - Optional promo code that may affect duration
   * @param date - Optional date for availability check
   * @param tableId - Optional table ID for availability check
   * @returns Time slot object or null if slot is not available
   */
  static async getTimeSlot(
    startTime: string,
    promoCode?: string,
    date?: Date,
    tableId?: string
  ): Promise<TimeSlot | null> {
    const duration = await SessionDurationService.getSessionDuration(startTime, promoCode);
    const endTime = SessionDurationService.calculateEndTime(startTime, duration);

    // If date and tableId are provided, check availability
    if (date && tableId) {
      const availability = await SessionDurationService.isTimeSlotAvailable(
        startTime,
        endTime,
        tableId,
        date
      );

      if (!availability.available) {
        return null;
      }
    }

    return {
      startTime,
      endTime,
      duration,
    };
  }
}

export default SessionDurationService;