/**
 * Background Scheduler
 *
 * Runs a 1-minute cron tick that handles:
 *   1. No-show detection — flags confirmed reservations past grace period
 *   2. 24h reminder window — enqueues reminder emails for reservations ~24h away
 *   3. 2h reminder window  — enqueues reminder emails for reservations ~2h away
 *
 * Each tick result is logged with Pino. Sentry is notified on any tick failure.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.5, 15.2, 15.3, 20.4
 */

import cron from 'node-cron';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { captureException } from '../config/sentry.js';
import { WebSocketPublisher } from './websocket-publisher.service.js';
import { NotificationService } from './notification.service.js';
import { NotificationAlertService } from './notification-alert.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TickResult {
  noShowsUpdated: number;
  reminders24hEnqueued: number;
  reminders2hEnqueued: number;
  upcomingSeatsAlerted: number;
  durationMs: number;
}

interface ReservationRow {
  id: string;
  branch_id: string;
  table_id: string;
  reference_number: string;
  reservation_time: string;
  party_size: number;
  customer_email: string;
  customer_name: string;
  branch_name: string;
  table_name: string;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export class SchedulerService {
  private static task: cron.ScheduledTask | null = null;

  /**
   * Start the 1-minute background scheduler.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  static start(): void {
    if (SchedulerService.task) {
      logger.warn('Scheduler already running — ignoring duplicate start()');
      return;
    }

    // Run every minute: "* * * * *"
    SchedulerService.task = cron.schedule('* * * * *', async () => {
      await SchedulerService.tick();
    });

    logger.info({ event: 'scheduler_started' }, 'Background scheduler started (1-minute cron)');
  }

  /**
   * Stop the scheduler (used in tests / graceful shutdown).
   */
  static stop(): void {
    if (SchedulerService.task) {
      SchedulerService.task.stop();
      SchedulerService.task = null;
      logger.info({ event: 'scheduler_stopped' }, 'Background scheduler stopped');
    }
  }

  /**
   * Execute one scheduler tick.
   * Exported for direct invocation in tests / manual triggers.
   * Requirements: 14.1, 14.2, 14.3, 15.2, 15.3, 20.4
   */
  static async tick(): Promise<TickResult> {
    const start = Date.now();
    const result: TickResult = {
      noShowsUpdated: 0,
      reminders24hEnqueued: 0,
      reminders2hEnqueued: 0,
      upcomingSeatsAlerted: 0,
      durationMs: 0,
    };

    try {
      const [noShows, r24h, r2h, upcomingSeats] = await Promise.all([
        SchedulerService.processNoShows(),
        SchedulerService.processReminders24h(),
        SchedulerService.processReminders2h(),
        SchedulerService.processUpcomingSeats(),
      ]);

      result.noShowsUpdated = noShows;
      result.reminders24hEnqueued = r24h;
      result.reminders2hEnqueued = r2h;
      result.upcomingSeatsAlerted = upcomingSeats;
      result.durationMs = Date.now() - start;

      logger.info(
        {
          event: 'scheduler_tick',
          no_shows_updated: result.noShowsUpdated,
          reminders_24h_enqueued: result.reminders24hEnqueued,
          reminders_2h_enqueued: result.reminders2hEnqueued,
          upcoming_seats_alerted: result.upcomingSeatsAlerted,
          duration_ms: result.durationMs,
        },
        'Scheduler tick completed'
      );
    } catch (err) {
      result.durationMs = Date.now() - start;

      const error = err instanceof Error ? err : new Error(String(err));
      captureException(error, { scheduler_tick: true });

      logger.error(
        {
          event: 'scheduler_tick_failed',
          err,
          duration_ms: result.durationMs,
        },
        'Scheduler tick failed — Sentry event emitted'
      );
    }

    return result;
  }

  // ── No-show detection ──────────────────────────────────────────────────────

  /**
   * Flag confirmed reservations where reservation_time + grace_min < NOW().
   * Updates status to no_show, emits WS event, sends in-dashboard alert.
   * Requirements: 14.1, 14.2, 14.3, 14.5
   */
  private static async processNoShows(): Promise<number> {
    const db = getDatabase();

    // Find all confirmed reservations past their grace period.
    // Joins branches to get no_show_grace_min per branch.
    const findResult = await db.query<ReservationRow>(
      `SELECT
         r.id,
         r.branch_id,
         r.table_id,
         r.reference_number,
         r.reservation_time,
         r.party_size,
         c.email   AS customer_email,
         c.name    AS customer_name,
         b.name    AS branch_name,
         t.name    AS table_name
       FROM reservations r
       JOIN branches b ON b.id = r.branch_id
       JOIN customers c ON c.id = r.customer_id
       JOIN tables   t ON t.id = r.table_id
       WHERE r.status = 'confirmed'
         AND r.reservation_time + (b.no_show_grace_min * INTERVAL '1 minute') < NOW()`
    );

    if (findResult.rows.length === 0) return 0;

    const ids = findResult.rows.map((r) => r.id);

    // Bulk update to no_show
    await db.query(
      `UPDATE reservations SET status = 'no_show'
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );

    // Per-reservation side-effects (WS + alert)
    for (const row of findResult.rows) {
      // Emit WS table.status_changed → available (Requirement 14.2)
      WebSocketPublisher.publishTableStatusChanged(
        row.branch_id,
        row.table_id,
        'available'
      ).catch((err) =>
        logger.error(
          { err, reservation_id: row.id, branch_id: row.branch_id },
          'Failed to publish WS no-show table available'
        )
      );

      // Emit WS reservation.no_show alert to Manager dashboard (Requirement 14.3)
      WebSocketPublisher.publishNoShowAlert(
        row.branch_id,
        row.id,
        row.reference_number,
        row.table_id
      ).catch((err) =>
        logger.error(
          { err, reservation_id: row.id },
          'Failed to publish WS no-show alert'
        )
      );

      // Publish real-time notification alert for staff/admin
      const db = getDatabase();
      await NotificationAlertService.publishAlert(db, {
        type: 'reservation_no_show',
        branchId: row.branch_id,
        reservation: {
          id: row.id,
          referenceNumber: row.reference_number,
          customerName: row.customer_name,
          customerEmail: row.customer_email,
          customerPhone: '',
          reservationTime: row.reservation_time,
          partySize: row.party_size,
          sectionName: '', // Not available in the query, will fetch if needed
          tableName: row.table_name,
          tableId: row.table_id,
          hasDecoration: false,
          decorationType: null,
          decorationColor: null,
          cakeChoice: null,
        },
      }).catch((err) => {
        logger.error(
          { err, reservation_id: row.id, branch_id: row.branch_id },
          'Failed to publish reservation_no_show alert'
        );
      });

      logger.info(
        {
          event: 'no_show_flagged',
          branch_id: row.branch_id,
          reservation_id: row.id,
          reference_number: row.reference_number,
          table_id: row.table_id,
          reservation_time: row.reservation_time,
        },
        'Reservation flagged as no-show'
      );
    }

    return findResult.rows.length;
  }

  // ── 24h reminder window ────────────────────────────────────────────────────

  /**
   * Enqueue 24h reminder emails for reservations in the 23h55m–24h05m window.
   * Requirements: 15.2
   */
  private static async processReminders24h(): Promise<number> {
    const db = getDatabase();

    const result = await db.query<ReservationRow>(
      `SELECT
         r.id,
         r.branch_id,
         r.table_id,
         r.reference_number,
         r.reservation_time,
         r.party_size,
         c.email   AS customer_email,
         c.name    AS customer_name,
         b.name    AS branch_name,
         t.name    AS table_name
       FROM reservations r
       JOIN branches  b ON b.id = r.branch_id
       JOIN customers c ON c.id = r.customer_id
       JOIN tables    t ON t.id = r.table_id
       WHERE r.status = 'confirmed'
         AND r.reservation_time BETWEEN NOW() + INTERVAL '23 hours 55 minutes'
                                    AND NOW() + INTERVAL '24 hours 5 minutes'`
    );

    for (const row of result.rows) {
      NotificationService.sendReminder24h({
        branchId: row.branch_id,
        to: row.customer_email,
        customerName: row.customer_name,
        referenceNumber: row.reference_number,
        branchName: row.branch_name,
        reservationTime: new Date(row.reservation_time).toLocaleString('en-MY', {
          timeZone: 'Asia/Kuala_Lumpur',
        }),
        tableName: row.table_name,
        partySize: row.party_size,
      }).catch((err) =>
        logger.error(
          { err, reservation_id: row.id },
          'Failed to enqueue 24h reminder'
        )
      );
    }

    if (result.rows.length > 0) {
      logger.info(
        {
          event: 'reminders_24h_enqueued',
          count: result.rows.length,
          reservation_ids: result.rows.map((r) => r.id),
        },
        '24h reminder emails enqueued'
      );
    }

    return result.rows.length;
  }

  // ── 2h reminder window ─────────────────────────────────────────────────────

  /**
   * Enqueue 2h reminder emails for reservations in the 1h55m–2h05m window.
   * Requirements: 15.3
   */
  private static async processReminders2h(): Promise<number> {
    const db = getDatabase();

    const result = await db.query<ReservationRow>(
      `SELECT
         r.id,
         r.branch_id,
         r.table_id,
         r.reference_number,
         r.reservation_time,
         r.party_size,
         c.email   AS customer_email,
         c.name    AS customer_name,
         b.name    AS branch_name,
         t.name    AS table_name
       FROM reservations r
       JOIN branches  b ON b.id = r.branch_id
       JOIN customers c ON c.id = r.customer_id
       JOIN tables    t ON t.id = r.table_id
       WHERE r.status = 'confirmed'
         AND r.reservation_time BETWEEN NOW() + INTERVAL '1 hour 55 minutes'
                                    AND NOW() + INTERVAL '2 hours 5 minutes'`
    );

    for (const row of result.rows) {
      NotificationService.sendReminder2h({
        branchId: row.branch_id,
        to: row.customer_email,
        customerName: row.customer_name,
        referenceNumber: row.reference_number,
        branchName: row.branch_name,
        reservationTime: new Date(row.reservation_time).toLocaleString('en-MY', {
          timeZone: 'Asia/Kuala_Lumpur',
        }),
        tableName: row.table_name,
        partySize: row.party_size,
      }).catch((err) =>
        logger.error(
          { err, reservation_id: row.id },
          'Failed to enqueue 2h reminder'
        )
      );
    }

    if (result.rows.length > 0) {
      logger.info(
        {
          event: 'reminders_2h_enqueued',
          count: result.rows.length,
          reservation_ids: result.rows.map((r) => r.id),
        },
        '2h reminder emails enqueued'
      );
    }

    return result.rows.length;
  }

  // ── Upcoming seats alerts ──────────────────────────────────────────────────

  /**
   * Check for upcoming reservations arriving within configured lead time.
   * For each branch with upcoming_seat alerts enabled, find confirmed
   * reservations where reservation_time is between NOW() and NOW() + lead_time.
   * Publish notification alerts for each matching reservation.
   * Requirements: Notification Alert System
   */
  private static async processUpcomingSeats(): Promise<number> {
    const db = getDatabase();
    let totalAlerted = 0;

    // Get all branches with their notification alert settings
    const branchesResult = await db.query<{
      id: string;
      notification_alert_settings: { upcoming_seat_lead_time_minutes: number } | null;
    }>(
      `SELECT id, notification_alert_settings FROM branches WHERE is_active = true`
    );

    for (const branch of branchesResult.rows) {
      // Get the lead time for this branch (default 15 minutes)
      const leadTimeMinutes = branch.notification_alert_settings?.upcoming_seat_lead_time_minutes ?? 15;

      // Find upcoming reservations within the lead time window
      const upcomingResult = await db.query<ReservationRow>(
        `SELECT
           r.id,
           r.branch_id,
           r.table_id,
           r.reference_number,
           r.reservation_time,
           r.party_size,
           c.email   AS customer_email,
           c.name    AS customer_name,
           b.name    AS branch_name,
           t.name    AS table_name
         FROM reservations r
         JOIN branches  b ON b.id = r.branch_id
         JOIN customers c ON c.id = r.customer_id
         JOIN tables    t ON t.id = r.table_id
         WHERE r.branch_id = $1
           AND r.status = 'confirmed'
           AND r.reservation_time BETWEEN NOW()
                                    AND NOW() + ($2 || ' minutes')::INTERVAL`,
        [branch.id, leadTimeMinutes]
      );

      // Publish alert for each upcoming reservation
      for (const row of upcomingResult.rows) {
        await NotificationAlertService.publishAlert(db, {
          type: 'reservation_upcoming_15min',
          branchId: row.branch_id,
          reservation: {
            id: row.id,
            referenceNumber: row.reference_number,
            customerName: row.customer_name,
            customerEmail: row.customer_email,
            customerPhone: '',
            reservationTime: row.reservation_time,
            partySize: row.party_size,
            sectionName: '', // Not in query
            tableName: row.table_name,
            tableId: row.table_id,
            hasDecoration: false,
            decorationType: null,
            decorationColor: null,
            cakeChoice: null,
          },
        }).catch((err) => {
          logger.error(
            { err, reservation_id: row.id, branch_id: row.branch_id },
            'Failed to publish reservation_upcoming_15min alert'
          );
        });

        totalAlerted++;
      }

      if (upcomingResult.rows.length > 0) {
        logger.info(
          {
            event: 'upcoming_seats_alerted',
            branch_id: branch.id,
            count: upcomingResult.rows.length,
            lead_time_minutes: leadTimeMinutes,
            reservation_ids: upcomingResult.rows.map((r) => r.id),
          },
          'Upcoming seat alerts published'
        );
      }
    }

    return totalAlerted;
  }
}

export default SchedulerService;
