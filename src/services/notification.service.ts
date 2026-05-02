/**
 * Notification Service
 *
 * Queue-backed email sender using SMTP (nodemailer).
 * Supports retry with exponential backoff (1s, 2s, 4s — up to 3 attempts).
 * Emits Sentry event when all retries are exhausted.
 *
 * Supported notification types:
 *   reservation_confirmed | reservation_reminder_24h | reservation_reminder_2h
 *   reservation_cancelled | reservation_modified
 *
 * Admin can configure which types are enabled per branch via
 * branches.notification_settings (JSONB). If the column is absent or the
 * type is not listed, the notification is sent by default.
 *
 * Requirements: 15.1, 15.4, 15.5, 15.6, 15.7
 */

import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../config/logger.js';
import { captureException } from '../config/sentry.js';
import { getDatabase } from '../config/database.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'reservation_confirmed'
  | 'reservation_reminder_24h'
  | 'reservation_reminder_2h'
  | 'reservation_cancelled'
  | 'reservation_modified';

export interface NotificationPayload {
  type: NotificationType;
  branchId: string;
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback */
  text?: string;
  /** Metadata for logging */
  meta?: Record<string, unknown>;
}

interface QueueItem {
  payload: NotificationPayload;
  attempt: number;
  nextRetryAt: number; // epoch ms
}

// ─── SMTP transport factory ───────────────────────────────────────────────────

function createTransport(): Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class NotificationService {
  private static queue: QueueItem[] = [];
  private static processing = false;
  private static transport: Transporter | null = null;

  /** Retry delays in ms: attempt 1 → 1s, attempt 2 → 2s, attempt 3 → 4s */
  private static readonly RETRY_DELAYS_MS = [1000, 2000, 4000];
  private static readonly MAX_ATTEMPTS = 3;

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enqueue a notification for delivery.
   * Returns immediately; delivery happens asynchronously.
   */
  static async enqueue(payload: NotificationPayload): Promise<void> {
    // Check if this notification type is enabled for the branch
    const enabled = await NotificationService.isTypeEnabled(
      payload.branchId,
      payload.type
    );
    if (!enabled) {
      logger.info(
        {
          event: 'notification_skipped',
          branch_id: payload.branchId,
          type: payload.type,
          to: payload.to,
        },
        'Notification type disabled for branch — skipped'
      );
      return;
    }

    NotificationService.queue.push({
      payload,
      attempt: 0,
      nextRetryAt: Date.now(),
    });

    logger.info(
      {
        event: 'notification_enqueued',
        branch_id: payload.branchId,
        type: payload.type,
        to: payload.to,
        queue_depth: NotificationService.queue.length,
      },
      'Notification enqueued'
    );

    // Kick off processing if not already running
    if (!NotificationService.processing) {
      NotificationService.processQueue().catch((err) =>
        logger.error({ err }, 'Notification queue processor crashed')
      );
    }
  }

  /**
   * Convenience: enqueue a reservation confirmation email.
   * Requirements: 15.1
   */
  static async sendReservationConfirmed(params: {
    branchId: string;
    to: string;
    customerName: string;
    referenceNumber: string;
    branchName: string;
    reservationTime: string;
    tableName: string;
    partySize: number;
  }): Promise<void> {
    const { to, customerName, referenceNumber, branchName, reservationTime, tableName, partySize } = params;
    await NotificationService.enqueue({
      type: 'reservation_confirmed',
      branchId: params.branchId,
      to,
      subject: `Reservation Confirmed — ${referenceNumber}`,
      html: buildConfirmationHtml({ customerName, referenceNumber, branchName, reservationTime, tableName, partySize }),
      text: `Hi ${customerName}, your reservation ${referenceNumber} at ${branchName} on ${reservationTime} (Table: ${tableName}, Party: ${partySize}) is confirmed.`,
      meta: { referenceNumber, branchName },
    });
  }

  /**
   * Convenience: enqueue a 24h reminder email.
   * Requirements: 15.2
   */
  static async sendReminder24h(params: {
    branchId: string;
    to: string;
    customerName: string;
    referenceNumber: string;
    branchName: string;
    reservationTime: string;
    tableName: string;
    partySize: number;
  }): Promise<void> {
    const { to, customerName, referenceNumber, branchName, reservationTime, tableName, partySize } = params;
    await NotificationService.enqueue({
      type: 'reservation_reminder_24h',
      branchId: params.branchId,
      to,
      subject: `Reminder: Your reservation tomorrow — ${referenceNumber}`,
      html: buildReminderHtml({ customerName, referenceNumber, branchName, reservationTime, tableName, partySize, window: '24 hours' }),
      text: `Hi ${customerName}, reminder: your reservation ${referenceNumber} at ${branchName} is tomorrow at ${reservationTime}.`,
      meta: { referenceNumber, reminderType: '24h' },
    });
  }

  /**
   * Convenience: enqueue a 2h reminder email.
   * Requirements: 15.3
   */
  static async sendReminder2h(params: {
    branchId: string;
    to: string;
    customerName: string;
    referenceNumber: string;
    branchName: string;
    reservationTime: string;
    tableName: string;
    partySize: number;
  }): Promise<void> {
    const { to, customerName, referenceNumber, branchName, reservationTime, tableName, partySize } = params;
    await NotificationService.enqueue({
      type: 'reservation_reminder_2h',
      branchId: params.branchId,
      to,
      subject: `Reminder: Your reservation in 2 hours — ${referenceNumber}`,
      html: buildReminderHtml({ customerName, referenceNumber, branchName, reservationTime, tableName, partySize, window: '2 hours' }),
      text: `Hi ${customerName}, reminder: your reservation ${referenceNumber} at ${branchName} is in 2 hours at ${reservationTime}.`,
      meta: { referenceNumber, reminderType: '2h' },
    });
  }

  /**
   * Convenience: enqueue a cancellation confirmation email.
   * Requirements: 15.4
   */
  static async sendReservationCancelled(params: {
    branchId: string;
    to: string;
    customerName: string;
    referenceNumber: string;
    branchName: string;
    reservationTime: string;
    refundAmount?: number;
  }): Promise<void> {
    const { to, customerName, referenceNumber, branchName, reservationTime, refundAmount } = params;
    await NotificationService.enqueue({
      type: 'reservation_cancelled',
      branchId: params.branchId,
      to,
      subject: `Reservation Cancelled — ${referenceNumber}`,
      html: buildCancellationHtml({ customerName, referenceNumber, branchName, reservationTime, refundAmount }),
      text: `Hi ${customerName}, your reservation ${referenceNumber} at ${branchName} has been cancelled.${refundAmount ? ` Refund: RM ${refundAmount.toFixed(2)}.` : ''}`,
      meta: { referenceNumber, refundAmount },
    });
  }

  /**
   * Convenience: enqueue a modification confirmation email.
   * Requirements: 17.5
   */
  static async sendReservationModified(params: {
    branchId: string;
    to: string;
    customerName: string;
    referenceNumber: string;
    branchName: string;
    newReservationTime: string;
    newTableName: string;
    newPartySize: number;
  }): Promise<void> {
    const { to, customerName, referenceNumber, branchName, newReservationTime, newTableName, newPartySize } = params;
    await NotificationService.enqueue({
      type: 'reservation_modified',
      branchId: params.branchId,
      to,
      subject: `Reservation Updated — ${referenceNumber}`,
      html: buildModificationHtml({ customerName, referenceNumber, branchName, newReservationTime, newTableName, newPartySize }),
      text: `Hi ${customerName}, your reservation ${referenceNumber} at ${branchName} has been updated to ${newReservationTime} (Table: ${newTableName}, Party: ${newPartySize}).`,
      meta: { referenceNumber },
    });
  }

  // ── Queue processor ────────────────────────────────────────────────────────

  private static async processQueue(): Promise<void> {
    NotificationService.processing = true;

    while (NotificationService.queue.length > 0) {
      const now = Date.now();
      const item = NotificationService.queue[0];

      // Not yet ready for retry
      if (item.nextRetryAt > now) {
        await sleep(Math.min(item.nextRetryAt - now, 500));
        continue;
      }

      NotificationService.queue.shift();

      try {
        await NotificationService.deliver(item.payload);

        logger.info(
          {
            event: 'notification_sent',
            branch_id: item.payload.branchId,
            type: item.payload.type,
            to: item.payload.to,
            attempt: item.attempt + 1,
            ...item.payload.meta,
          },
          'Notification delivered'
        );
      } catch (err) {
        const nextAttempt = item.attempt + 1;

        logger.warn(
          {
            event: 'notification_attempt_failed',
            branch_id: item.payload.branchId,
            type: item.payload.type,
            to: item.payload.to,
            attempt: nextAttempt,
            max_attempts: NotificationService.MAX_ATTEMPTS,
            err,
          },
          'Notification delivery attempt failed'
        );

        if (nextAttempt < NotificationService.MAX_ATTEMPTS) {
          // Re-queue with backoff
          const delayMs = NotificationService.RETRY_DELAYS_MS[nextAttempt] ?? 4000;
          NotificationService.queue.push({
            payload: item.payload,
            attempt: nextAttempt,
            nextRetryAt: Date.now() + delayMs,
          });
        } else {
          // All retries exhausted — emit Sentry event
          const error = err instanceof Error ? err : new Error(String(err));
          captureException(error, {
            notification_type: item.payload.type,
            branch_id: item.payload.branchId,
            to: item.payload.to,
            attempts: NotificationService.MAX_ATTEMPTS,
          });

          logger.error(
            {
              event: 'notification_exhausted',
              branch_id: item.payload.branchId,
              type: item.payload.type,
              to: item.payload.to,
              attempts: NotificationService.MAX_ATTEMPTS,
              err,
            },
            'Notification delivery exhausted all retries — Sentry event emitted'
          );
        }
      }
    }

    NotificationService.processing = false;
  }

  private static async deliver(payload: NotificationPayload): Promise<void> {
    if (!NotificationService.transport) {
      NotificationService.transport = createTransport();
    }

    const from = process.env.SMTP_FROM || 'noreply@restaurant.local';

    await NotificationService.transport.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
  }

  // ── Branch notification settings ───────────────────────────────────────────

  /**
   * Check if a notification type is enabled for a branch.
   * Reads `notification_settings` JSONB column from branches table.
   * If the column is absent or the type is not listed, defaults to enabled.
   * Requirements: 15.6
   */
  static async isTypeEnabled(
    branchId: string,
    type: NotificationType
  ): Promise<boolean> {
    try {
      const db = getDatabase();
      const result = await db.query(
        `SELECT notification_settings FROM branches WHERE id = $1`,
        [branchId]
      );
      if (result.rows.length === 0) return true;

      const settings: Record<string, boolean> | null =
        result.rows[0].notification_settings;
      if (!settings || typeof settings !== 'object') return true;

      // If the type key is explicitly set to false, disable it
      return settings[type] !== false;
    } catch {
      // If column doesn't exist yet, default to enabled
      return true;
    }
  }

  /**
   * Update notification settings for a branch (Admin).
   * Requirements: 15.6
   */
  static async updateBranchSettings(
    branchId: string,
    settings: Partial<Record<NotificationType, boolean>>
  ): Promise<void> {
    const db = getDatabase();
    await db.query(
      `UPDATE branches
       SET notification_settings = COALESCE(notification_settings, '{}'::jsonb) || $1::jsonb
       WHERE id = $2`,
      [JSON.stringify(settings), branchId]
    );

    logger.info(
      {
        event: 'notification_settings_updated',
        branch_id: branchId,
        settings,
      },
      'Branch notification settings updated'
    );
  }

  /** Expose queue depth for health checks / tests */
  static get queueDepth(): number {
    return NotificationService.queue.length;
  }

  /** Reset transport (useful in tests) */
  static resetTransport(): void {
    NotificationService.transport = null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── HTML builders ────────────────────────────────────────────────────────────

function buildConfirmationHtml(p: {
  customerName: string;
  referenceNumber: string;
  branchName: string;
  reservationTime: string;
  tableName: string;
  partySize: number;
}): string {
  return `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2 style="color:#2d6a4f">Reservation Confirmed ✓</h2>
  <p>Hi ${esc(p.customerName)},</p>
  <p>Your reservation has been confirmed. Here are your details:</p>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px 0;color:#555">Reference</td><td><strong>${esc(p.referenceNumber)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#555">Branch</td><td>${esc(p.branchName)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Date &amp; Time</td><td>${esc(p.reservationTime)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Table</td><td>${esc(p.tableName)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Party Size</td><td>${p.partySize}</td></tr>
  </table>
  <p style="color:#888;font-size:12px;margin-top:24px">Please arrive on time. We look forward to seeing you!</p>
</div>`;
}

function buildReminderHtml(p: {
  customerName: string;
  referenceNumber: string;
  branchName: string;
  reservationTime: string;
  tableName: string;
  partySize: number;
  window: string;
}): string {
  return `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2 style="color:#1d6fa4">Reservation Reminder 🔔</h2>
  <p>Hi ${esc(p.customerName)},</p>
  <p>This is a reminder that your reservation is in <strong>${esc(p.window)}</strong>.</p>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px 0;color:#555">Reference</td><td><strong>${esc(p.referenceNumber)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#555">Branch</td><td>${esc(p.branchName)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Date &amp; Time</td><td>${esc(p.reservationTime)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Table</td><td>${esc(p.tableName)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Party Size</td><td>${p.partySize}</td></tr>
  </table>
  <p style="color:#888;font-size:12px;margin-top:24px">We look forward to seeing you!</p>
</div>`;
}

function buildCancellationHtml(p: {
  customerName: string;
  referenceNumber: string;
  branchName: string;
  reservationTime: string;
  refundAmount?: number;
}): string {
  const refundLine = p.refundAmount != null && p.refundAmount > 0
    ? `<tr><td style="padding:6px 0;color:#555">Refund</td><td>RM ${p.refundAmount.toFixed(2)}</td></tr>`
    : '';
  return `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2 style="color:#c0392b">Reservation Cancelled</h2>
  <p>Hi ${esc(p.customerName)},</p>
  <p>Your reservation has been cancelled.</p>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px 0;color:#555">Reference</td><td><strong>${esc(p.referenceNumber)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#555">Branch</td><td>${esc(p.branchName)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Date &amp; Time</td><td>${esc(p.reservationTime)}</td></tr>
    ${refundLine}
  </table>
  <p style="color:#888;font-size:12px;margin-top:24px">We hope to see you again soon.</p>
</div>`;
}

function buildModificationHtml(p: {
  customerName: string;
  referenceNumber: string;
  branchName: string;
  newReservationTime: string;
  newTableName: string;
  newPartySize: number;
}): string {
  return `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2 style="color:#8e44ad">Reservation Updated ✏️</h2>
  <p>Hi ${esc(p.customerName)},</p>
  <p>Your reservation has been updated. Here are your new details:</p>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px 0;color:#555">Reference</td><td><strong>${esc(p.referenceNumber)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#555">Branch</td><td>${esc(p.branchName)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">New Date &amp; Time</td><td>${esc(p.newReservationTime)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">New Table</td><td>${esc(p.newTableName)}</td></tr>
    <tr><td style="padding:6px 0;color:#555">Party Size</td><td>${p.newPartySize}</td></tr>
  </table>
  <p style="color:#888;font-size:12px;margin-top:24px">We look forward to seeing you!</p>
</div>`;
}

/** Minimal HTML entity escaping to prevent XSS in email bodies */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default NotificationService;
