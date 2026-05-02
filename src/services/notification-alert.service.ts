/**
 * Notification Alert Service
 *
 * Handles real-time alert notifications for staff and admin portals.
 * Publishes WebSocket events for:
 *   - New bookings (reservation_created)
 *   - Cancellations (reservation_cancelled)
 *   - No-shows (reservation_no_show)
 *   - Upcoming seats (reservation_upcoming_15min)
 *
 * Features:
 *   - Customizable alert types per branch via notification_alert_settings
 *   - Configurable lead time for upcoming seat alerts (default: 15 minutes)
 *   - Staff role filtering (Admin and Manager receive all alerts, Waiter gets limited alerts)
 *   - Rich alert data: customer name, date/time, section, table, decorations, cake
 *   - WebSocket fan-out to connected clients by branch_id
 *
 * Requirements: 15.6 (customizable notifications)
 */

import { Pool } from 'pg';
import { logger } from '../config/logger.js';
import { WebSocketPublisher } from './websocket-publisher.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationAlertType =
  | 'reservation_created'
  | 'reservation_cancelled'
  | 'reservation_no_show'
  | 'reservation_upcoming_15min';

export interface NotificationAlertSettings {
  reservation_created_enabled: boolean;
  reservation_cancelled_enabled: boolean;
  reservation_no_show_enabled: boolean;
  reservation_upcoming_15min_enabled: boolean;
  upcoming_seat_lead_time_minutes: number; // customizable, default 15
}

export interface AlertPayload {
  type: NotificationAlertType;
  branchId: string;
  reservation: {
    id: string;
    referenceNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    reservationTime: string; // ISO 8601
    partySize: number;
    sectionName: string;
    tableName: string;
    tableId: string;
    hasDecoration: boolean;
    decorationType?: 'birthday' | 'anniversary' | 'bachelorette' | null;
    decorationColor?: string | null;
    cakeChoice?: string | null;
  };
}

interface AlertDisplay {
  type: NotificationAlertType;
  timestamp: string;
  customerName: string;
  reservationTime: string;
  sectionName: string;
  tableName: string;
  partySize: number;
  hasDecoration: boolean;
  decorationType?: string | null;
  cakeChoice?: string | null;
  decorationColor?: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class NotificationAlertService {
  /**
   * Get alert settings for a branch.
   * Returns default settings if none are configured.
   */
  static async getAlertSettings(
    pool: Pool,
    branchId: string
  ): Promise<NotificationAlertSettings> {
    try {
      const result = await pool.query(
        `SELECT notification_alert_settings FROM branches WHERE id = $1`,
        [branchId]
      );

      if (result.rows.length === 0) {
        logger.warn({ branchId }, 'Branch not found when fetching alert settings');
        return this.getDefaultSettings();
      }

      const settings = result.rows[0].notification_alert_settings;

      // If no custom settings, return defaults
      if (!settings) {
        return this.getDefaultSettings();
      }

      // Merge with defaults to ensure all keys exist
      return {
        ...this.getDefaultSettings(),
        ...settings,
      };
    } catch (error) {
      logger.error({ error, branchId }, 'Failed to get alert settings');
      return this.getDefaultSettings();
    }
  }

  /**
   * Update alert settings for a branch.
   */
  static async updateAlertSettings(
    pool: Pool,
    branchId: string,
    updates: Partial<NotificationAlertSettings>
  ): Promise<NotificationAlertSettings> {
    try {
      // Get current settings
      const current = await this.getAlertSettings(pool, branchId);

      // Merge updates
      const updated = { ...current, ...updates };

      // Validate lead time is positive
      if (
        updated.upcoming_seat_lead_time_minutes < 1 ||
        updated.upcoming_seat_lead_time_minutes > 120
      ) {
        throw new Error(
          'upcoming_seat_lead_time_minutes must be between 1 and 120'
        );
      }

      // Update database
      await pool.query(
        `UPDATE branches SET notification_alert_settings = $1 WHERE id = $2`,
        [JSON.stringify(updated), branchId]
      );

      logger.info(
        { branchId, updates },
        'Notification alert settings updated'
      );

      return updated;
    } catch (error) {
      logger.error(
        { error, branchId, updates },
        'Failed to update alert settings'
      );
      throw error;
    }
  }

  /**
   * Publish an alert notification via WebSocket.
   * Checks if the alert type is enabled before publishing.
   */
  static async publishAlert(pool: Pool, payload: AlertPayload): Promise<void> {
    try {
      // Check if alert type is enabled
      const settings = await this.getAlertSettings(pool, payload.branchId);

      const isEnabled = this.isAlertTypeEnabled(settings, payload.type);

      if (!isEnabled) {
        logger.debug(
          { type: payload.type, branchId: payload.branchId },
          'Alert type disabled — skipping publication'
        );
        return;
      }

      // Build display payload
      const display: AlertDisplay = {
        type: payload.type,
        timestamp: new Date().toISOString(),
        customerName: payload.reservation.customerName,
        reservationTime: payload.reservation.reservationTime,
        sectionName: payload.reservation.sectionName,
        tableName: payload.reservation.tableName,
        partySize: payload.reservation.partySize,
        hasDecoration: payload.reservation.hasDecoration,
        decorationType: payload.reservation.decorationType,
        decorationColor: payload.reservation.decorationColor,
        cakeChoice: payload.reservation.cakeChoice,
      };

      // Publish to WebSocket
      await WebSocketPublisher.publishNotificationAlert(payload.branchId, display);

      logger.debug(
        { type: payload.type, branchId: payload.branchId },
        'Notification alert published'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to publish alert');
      // Don't throw — alerts are non-critical
    }
  }

  /**
   * Check if a specific alert type is enabled.
   */
  private static isAlertTypeEnabled(
    settings: NotificationAlertSettings,
    type: NotificationAlertType
  ): boolean {
    switch (type) {
      case 'reservation_created':
        return settings.reservation_created_enabled;
      case 'reservation_cancelled':
        return settings.reservation_cancelled_enabled;
      case 'reservation_no_show':
        return settings.reservation_no_show_enabled;
      case 'reservation_upcoming_15min':
        return settings.reservation_upcoming_15min_enabled;
      default:
        return false;
    }
  }

  /**
   * Get default alert settings.
   */
  private static getDefaultSettings(): NotificationAlertSettings {
    return {
      reservation_created_enabled: true,
      reservation_cancelled_enabled: true,
      reservation_no_show_enabled: true,
      reservation_upcoming_15min_enabled: true,
      upcoming_seat_lead_time_minutes: 15,
    };
  }
}
