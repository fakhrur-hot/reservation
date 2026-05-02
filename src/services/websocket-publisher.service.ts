/**
 * WebSocket Event Publisher
 *
 * Publishes typed events to Redis Pub/Sub channel ws:events:{branchId}.
 * The WebSocket gateway subscribes to these channels and fans out to
 * all connected Sneat Dashboard clients for the branch.
 *
 * Call these functions after any table status change:
 *   - Lock acquired / released
 *   - Reservation confirmed / cancelled
 *   - No-show flagged
 *   - Walk-in created / closed
 *   - Guest seated
 *
 * Requirements: 11.3, 11.4, 14.2, 16.4, 18.3
 */

import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import {
  TableStatus,
  TABLE_STATUS_COLOUR,
  TableStatusEvent,
  NoShowAlertEvent,
} from './websocket.service.js';
import type { PrintJobType } from './printer/print-job.service.js';

// ─── Publisher ────────────────────────────────────────────────────────────────

export class WebSocketPublisher {
  /**
   * Publish a table status change event.
   * Colour is automatically derived from status (Requirement 11.3):
   *   available → green | locked → yellow | reserved → blue | occupied → red
   */
  static async publishTableStatusChanged(
    branchId: string,
    tableId: string,
    status: TableStatus
  ): Promise<void> {
    const event: TableStatusEvent = {
      event: 'table.status_changed',
      tableId,
      branchId,
      status,
      colour: TABLE_STATUS_COLOUR[status],
      timestamp: new Date().toISOString(),
    };

    await WebSocketPublisher.publish(branchId, event);

    logger.info({
      event: 'ws_event_published',
      type: 'table.status_changed',
      branch_id: branchId,
      table_id: tableId,
      status,
      colour: event.colour,
      timestamp: event.timestamp,
    }, 'Published table status change event');
  }

  /**
   * Publish a no-show alert event to the branch dashboard.
   * Requirement 14.2, 14.3
   */
  static async publishNoShowAlert(
    branchId: string,
    reservationId: string,
    referenceNumber: string,
    tableId: string
  ): Promise<void> {
    const event: NoShowAlertEvent = {
      event: 'reservation.no_show',
      reservationId,
      referenceNumber,
      tableId,
      branchId,
      timestamp: new Date().toISOString(),
    };

    await WebSocketPublisher.publish(branchId, event);

    logger.info({
      event: 'ws_event_published',
      type: 'reservation.no_show',
      branch_id: branchId,
      reservation_id: reservationId,
      reference_number: referenceNumber,
      table_id: tableId,
      timestamp: event.timestamp,
    }, 'Published no-show alert event');
  }

  /**
   * Publish a print job failure alert to the branch dashboard.
   * Requirement 10.5
   */
  static async publishPrintJobAlert(
    branchId: string,
    jobType: PrintJobType,
    errorMessage: string
  ): Promise<void> {
    const event = {
      event: 'print_job.failed',
      branchId,
      jobType,
      errorMessage,
      timestamp: new Date().toISOString(),
    };

    await WebSocketPublisher.publish(branchId, event);

    logger.info({
      event: 'ws_event_published',
      type: 'print_job.failed',
      branch_id: branchId,
      job_type: jobType,
      error: errorMessage,
    }, 'Published print job failure alert');
  }

  /**
   * Publish a waitlist update event.
   * Used for:
   *   - guest_added
   *   - guest_removed
   *   - table_assigned
   * Requirement: 3.10
   */
  static async publishWaitlistUpdate(
    branchId: string,
    action: 'guest_added' | 'guest_removed' | 'table_assigned',
    data: Record<string, any>
  ): Promise<void> {
    const event = {
      event: 'waitlist.updated',
      action,
      branchId,
      data,
      timestamp: new Date().toISOString(),
    };

    await WebSocketPublisher.publish(branchId, event);

    logger.info({
      event: 'ws_event_published',
      type: 'waitlist.updated',
      branch_id: branchId,
      action,
    }, 'Published waitlist update event');
  }

  /**
   * Publish a real-time notification alert to connected staff/admin portals.
   * Used for new bookings, cancellations, no-shows, and upcoming seat arrivals.
   */
  static async publishNotificationAlert(
    branchId: string,
    alertPayload: object
  ): Promise<void> {
    const event = {
      type: 'notification-alert',
      data: {
        branchId,
        alert: alertPayload,
      },
      timestamp: new Date().toISOString(),
    };

    await WebSocketPublisher.publish(branchId, event);

    logger.debug({
      event: 'ws_event_published',
      type: 'notification-alert',
      branch_id: branchId,
    }, 'Published notification alert event');
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private static async publish(branchId: string, event: object): Promise<void> {
    try {
      const redis = getRedis();
      const channel = `ws:events:${branchId}`;
      await redis.publish(channel, JSON.stringify(event));
    } catch (err) {
      // Non-fatal: log and continue — WS delivery is best-effort
      logger.error({ err, branch_id: branchId }, 'Failed to publish WebSocket event to Redis');
    }
  }
}

export default WebSocketPublisher;
