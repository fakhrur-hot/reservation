/**
 * Reservation Routes
 *
 * POST /api/v1/reservations          — customer creates reservation
 * GET  /api/v1/reservations/:ref     — customer reads own reservation
 * GET  /api/manager/v1/branches/:id/reservations — manager lists all
 *
 * Requirements: 9.1–9.9, 16.3, 16.5, 16.8
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ReservationService,
  LockMissingError,
  LockExpiredError,
  LockOwnershipError,
  OutsideBusinessHoursError,
  PartySizeExceededError,
  TcAcknowledgementRequiredError,
  DepositFailedError,
  ModificationCutoffError,
  LockTransferError,
  ReservationNotModifiableError,
  ReservationNotFoundError,
  ReservationAccessDeniedError,
  VALID_DECORATION_COLORS,
  VALID_OCCASION_TYPES,
  VALID_CAKE_CHOICES,
} from '../services/reservation.service.js';
import { TableLockService } from '../services/table-lock.service.js';
import { LeadTimeService } from '../services/lead-time.service.js';
import { WebSocketPublisher } from '../services/websocket-publisher.service.js';
import { getDatabase } from '../config/database.js';
import { NotificationService } from '../services/notification.service.js';
import { triggerReservationSlipPrint } from '../services/printer/print-job.service.js';
import { logger } from '../config/logger.js';

// ─── Param / Body types ───────────────────────────────────────────────────────

// ─── Notification helper ──────────────────────────────────────────────────────

/**
 * Fetch customer + branch + table details needed for notification emails.
 * Returns null if any lookup fails (non-fatal — notification is best-effort).
 */
async function fetchNotificationContext(
  branchId: string,
  customerId: string,
  tableId: string
): Promise<{
  customerEmail: string;
  customerName: string;
  branchName: string;
  tableName: string;
  timezone: string;
} | null> {
  try {
    const db = getDatabase();
    const result = await db.query(
      `SELECT
         c.email    AS customer_email,
         c.name     AS customer_name,
         b.name     AS branch_name,
         b.timezone AS branch_timezone,
         t.name     AS table_name
       FROM customers c
       JOIN branches b ON b.id = $1
       JOIN tables   t ON t.id = $3
       WHERE c.id = $2`,
      [branchId, customerId, tableId]
    );
    if (result.rows.length === 0) return null;
    return {
      customerEmail: result.rows[0].customer_email,
      customerName: result.rows[0].customer_name,
      branchName: result.rows[0].branch_name,
      tableName: result.rows[0].table_name,
      timezone: result.rows[0].branch_timezone || 'Asia/Kuala_Lumpur',
    };
  } catch {
    return null;
  }
}

interface BranchParams {
  id: string;
}

interface RefParams {
  ref: string;
}

interface CreateReservationBody {
  tableId: string;
  sessionId: string;
  reservationTime: string;   // ISO 8601
  partySize: number;
  tcAcknowledged?: boolean;
  specialRequests?: string;
  depositIdempotencyKey?: string;
  depositMethod?: 'fpx' | 'card';
  // Optional decoration / occasion fields
  has_decoration?: boolean;
  occasion_type?: string;
  decoration_color?: string;
  cake_choice?: string;
  decoration_notes?: string;
  // Cake menu integration (Stage 2 ready)
  cake_menu_id?: string;
  cake_custom_notes?: string;
  // Promo code fields (Requirement 4.8)
  promoCode?: string;
  promoCodeDiscount?: number;
  // Table lock ID from Redis (Requirement 5.4)
  tableLockId?: string;
  // Session duration and end time (Requirement 3.1, 3.2)
  sessionDurationMinutes?: number;
  endTime?: string; // ISO 8601
  // Booking type for server-side lead-time validation (Requirement 2.9)
  isDecorated?: boolean;
}

interface ListReservationsQuery {
  status?: string;
  date?: string;
  tableId?: string;
}

interface ModifyReservationBody {
  newTableId?: string;
  newReservationTime?: string;
  newPartySize?: number;
  sessionId: string;
}

interface TableIdParams {
  tableId: string;
}

interface UpdateDecorationBody {
  has_decoration?: boolean;
  occasion_type?: string;
  decoration_color?: string;
  cake_choice?: string;
  decoration_notes?: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function reservationRoutes(fastify: FastifyInstance) {
  // ── POST /api/v1/reservations ─────────────────────────────────────────────
  fastify.post<{ Body: CreateReservationBody }>(
    '/api/v1/reservations',
    async (
      request: FastifyRequest<{ Body: CreateReservationBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'Branch context is required' });
      }

      // Customer must be authenticated (JWT sub = customerId)
      const customerId = (request as any).customerContext?.customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const body = request.body as CreateReservationBody;

      // Validate required fields
      if (!body?.tableId || !body?.sessionId || !body?.reservationTime || body?.partySize == null) {
        return reply.status(422).send({
          error: 'tableId, sessionId, reservationTime, and partySize are required',
        });
      }

      if (typeof body.partySize !== 'number' || body.partySize < 1) {
        return reply.status(422).send({ error: 'partySize must be a positive integer' });
      }

      const reservationTime = new Date(body.reservationTime);
      if (isNaN(reservationTime.getTime())) {
        return reply.status(422).send({ error: 'reservationTime must be a valid ISO 8601 date' });
      }

      // ── Decoration / occasion validation ──────────────────────────────────
      if (body.decoration_color !== undefined) {
        const normalised = VALID_DECORATION_COLORS.map((c) => c.toLowerCase());
        if (!normalised.includes(body.decoration_color.toLowerCase())) {
          return reply.status(422).send({
            error: `decoration_color must be one of: ${VALID_DECORATION_COLORS.join(', ')}`,
          });
        }
      }

      if (body.occasion_type !== undefined) {
        if (!(VALID_OCCASION_TYPES as readonly string[]).includes(body.occasion_type)) {
          return reply.status(422).send({
            error: `occasion_type must be one of: ${VALID_OCCASION_TYPES.join(', ')}`,
          });
        }
      }

      if (body.cake_choice !== undefined) {
        const normalised = VALID_CAKE_CHOICES.map((c) => c.toLowerCase());
        if (!normalised.includes(body.cake_choice.toLowerCase())) {
          return reply.status(422).send({
            error: `cake_choice must be one of: ${VALID_CAKE_CHOICES.join(', ')}`,
          });
        }
      }

      // Validate cake_choice and cake_menu_id are mutually exclusive
      if (body.cake_choice !== undefined && body.cake_menu_id !== undefined) {
        return reply.status(422).send({
          error: 'cake_choice and cake_menu_id are mutually exclusive — provide at most one',
        });
      }

      // ── Server-side lead-time validation (Requirement 2.9) ─────────────────
      // Re-verify lead-time delta on server side to ensure client-side validation is not bypassed
      if (body.isDecorated !== undefined) {
        const bookingType: 'standard' | 'decorated' = body.isDecorated ? 'decorated' : 'standard';
        const leadTimeValidation = await LeadTimeService.validateLeadTime(
          bookingType,
          reservationTime,
          body.promoCode
        );

        if (!leadTimeValidation.valid) {
          return reply.status(400).send({
            error: leadTimeValidation.reason,
            code: 'LEAD_TIME_VIOLATION',
            minLeadTimeHours: (leadTimeValidation.minLeadTimeMinutes ?? 0) / 60,
          });
        }
      }

      // If cake_menu_id provided, validate the menu item exists and is available
      if (body.cake_menu_id !== undefined) {
        try {
          const db = getDatabase();
          const menuItemResult = await db.query(
            `SELECT id FROM menu_items WHERE id = $1 AND branch_id = $2 AND is_available = true`,
            [body.cake_menu_id, branchId]
          );
          if (menuItemResult.rows.length === 0) {
            return reply.status(422).send({
              error: 'cake_menu_id references a menu item that does not exist or is unavailable',
            });
          }
        } catch (menuErr: any) {
          // If menu_items table doesn't exist yet (dormant), reject the cake_menu_id
          if (menuErr?.code === '42P01') {
            return reply.status(422).send({
              error: 'cake_menu_id references a menu item that does not exist or is unavailable',
            });
          }
          throw menuErr;
        }
      }

      // Parse endTime if provided
      const parsedEndTime = body.endTime ? new Date(body.endTime) : undefined;
      if (body.endTime && isNaN(parsedEndTime!.getTime())) {
        return reply.status(422).send({ error: 'endTime must be a valid ISO 8601 date' });
      }

      try {
        const result = await ReservationService.createReservation(
          {
            branchId,
            customerId,
            tableId: body.tableId,
            sessionId: body.sessionId,
            reservationTime,
            partySize: body.partySize,
            tcAcknowledged: body.tcAcknowledged,
            specialRequests: body.specialRequests,
            depositIdempotencyKey: body.depositIdempotencyKey,
            depositMethod: body.depositMethod,
            has_decoration: body.has_decoration,
            occasion_type: body.occasion_type,
            decoration_color: body.decoration_color,
            cake_choice: body.cake_choice,
            decoration_notes: body.decoration_notes,
            cake_menu_id: body.cake_menu_id,
            cake_custom_notes: body.cake_custom_notes,
            // Promo code fields (Requirement 4.8)
            promoCode: body.promoCode,
            promoCodeDiscount: body.promoCodeDiscount,
            // Table lock ID (Requirement 5.4)
            tableLockId: body.tableLockId,
            // Session duration and end time (Requirement 3.1, 3.2)
            sessionDurationMinutes: body.sessionDurationMinutes,
            endTime: parsedEndTime,
          },
          request.ip
        );

        // Publish real-time table status change to Sneat Dashboard (Requirement 11.4)
        WebSocketPublisher.publishTableStatusChanged(
          branchId,
          body.tableId,
          'reserved'
        ).catch((err) => logger.error({ err }, 'Failed to publish WS table.status_changed'));

        // Background: print slip + confirmation email (non-blocking, Requirement 9.6, 10.3, 15.1)
        void (async () => {
          const ctx = await fetchNotificationContext(branchId, customerId, body.tableId);
          if (!ctx) return;

          let cakeName: string | null = null;
          let cakePrice: number | null = null;
          if (result.reservation.cake_menu_id) {
            try {
              const db = getDatabase();
              const cakeResult = await db.query(
                `SELECT name, price FROM menu_items WHERE id = $1`,
                [result.reservation.cake_menu_id]
              );
              if (cakeResult.rows.length > 0) {
                cakeName = cakeResult.rows[0].name;
                cakePrice = cakeResult.rows[0].price != null ? Number(cakeResult.rows[0].price) : null;
              }
            } catch {
              // best-effort
            }
          }

          await triggerReservationSlipPrint(branchId, {
            branchName: ctx.branchName,
            referenceNumber: result.reservation.reference_number,
            reservationTime: result.reservation.reservation_time,
            tableName: ctx.tableName,
            guestName: ctx.customerName,
            partySize: result.reservation.party_size,
            has_decoration: result.reservation.has_decoration,
            occasion_type: result.reservation.occasion_type,
            decoration_color: result.reservation.decoration_color,
            cake_choice: result.reservation.cake_choice,
            decoration_notes: result.reservation.decoration_notes,
            decoration_amount: result.reservation.decoration_amount,
            cake_menu_name: cakeName,
            cake_menu_price: cakePrice,
            cake_custom_notes: result.reservation.cake_custom_notes ?? null,
          }).catch((err: unknown) => logger.error({ err }, 'Failed to trigger print job'));

          await NotificationService.sendReservationConfirmed({
            branchId,
            to: ctx.customerEmail,
            customerName: ctx.customerName,
            referenceNumber: result.reservation.reference_number,
            branchName: ctx.branchName,
            reservationTime: new Date(result.reservation.reservation_time).toLocaleString('en-MY', { timeZone: ctx.timezone }),
            tableName: ctx.tableName,
            partySize: result.reservation.party_size,
          }).catch((err: unknown) => logger.error({ err }, 'Failed to send confirmation email'));
        })().catch((err) => logger.error({ err }, 'Unexpected error in background notification'));

        return reply.status(201).send({
          reservation: result.reservation,
          depositRequired: result.depositRequired,
          depositAmount: result.depositAmount,
          commissionBreakdown: {
            items: result.commissionBreakdown.items.map((item) => ({
              category: item.category,
              serviceAmount: item.serviceAmount,
              commissionType: item.commissionType,
              commissionValue: item.commissionValue,
              commissionAmount: item.commissionAmount,
              isEnabled: item.isEnabled,
            })),
            totalCommission: result.commissionBreakdown.totalCommission,
          },
        });
      } catch (err: any) {
        if (err instanceof LockExpiredError) {
          return reply.status(410).send({
            error: err.message,
            code: err.code,
            message: 'Your table lock has expired. Please select a new time.',
          });
        }
        if (err instanceof LockMissingError || err instanceof LockOwnershipError) {
          return reply.status(409).send({ error: err.message, code: err.code });
        }
        if (err instanceof OutsideBusinessHoursError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        if (err instanceof PartySizeExceededError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        if (err instanceof TcAcknowledgementRequiredError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        if (err instanceof DepositFailedError) {
          return reply.status(402).send({ error: err.message, code: err.code });
        }
        logger.error({ err, branchId }, 'Failed to create reservation');
        return reply.status(500).send({ error: 'Failed to create reservation' });
      }
    }
  );

  // ── GET /api/v1/reservations/:ref ─────────────────────────────────────────
  fastify.get<{ Params: RefParams }>(
    '/api/v1/reservations/:ref',
    async (
      request: FastifyRequest<{ Params: RefParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'Branch context is required' });
      }

      const customerId = (request as any).customerContext?.customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      try {
        const reservation = await ReservationService.getByReference(
          branchId,
          request.params.ref
        );

        if (!reservation) {
          return reply.status(404).send({ error: 'Reservation not found' });
        }

        // Customers can only read their own reservations
        if (reservation.customer_id !== customerId) {
          return reply.status(403).send({ error: 'Access denied' });
        }

        return reply.send(reservation);
      } catch (err: any) {
        logger.error({ err, branchId, ref: request.params.ref }, 'Failed to get reservation');
        return reply.status(500).send({ error: 'Failed to get reservation' });
      }
    }
  );

  // ── GET /api/manager/v1/branches/:id/tables/:tableId/reservation ──────────
  // Returns the active (confirmed/seated) reservation for a table with full
  // customer + booking details for the floor-plan table detail modal.
  fastify.get<{ Params: { id: string; tableId: string } }>(
    '/api/manager/v1/branches/:id/tables/:tableId/reservation',
    async (request: FastifyRequest<{ Params: { id: string; tableId: string } }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const { tableId } = request.params;
      try {
        const db = getDatabase();
        const result = await db.query(
          `SELECT
             r.id,
             r.reference_number,
             r.reservation_time,
             r.party_size,
             r.status,
             r.deposit_paid,
             r.tc_acknowledged_at,
             r.special_requests,
             r.seated_at,
             r.has_decoration,
             r.decoration_amount,
             r.occasion_type,
             r.decoration_color,
             r.cake_choice,
             r.decoration_notes,
             r.cake_menu_id,
             r.cake_custom_notes,
             r.promo_code,
             r.promo_code_discount,
             r.session_duration_minutes,
             r.end_time,
             r.is_vip,
             r.created_at,
             c.id          AS customer_id,
             c.name        AS customer_name,
             c.email       AS customer_email,
             c.phone       AS customer_phone,
             mi.name       AS cake_menu_name,
             mi.price      AS cake_menu_price,
             pc.type       AS promo_type,
             pc.description AS promo_description
           FROM reservations r
           JOIN customers c ON c.id = r.customer_id
           LEFT JOIN menu_items mi ON mi.id = r.cake_menu_id
           LEFT JOIN promo_codes pc ON pc.code = r.promo_code AND pc.branch_id = r.branch_id
           WHERE r.table_id = $1
             AND r.branch_id = $2
             AND r.status IN ('confirmed', 'seated')
           ORDER BY r.reservation_time DESC
           LIMIT 1`,
          [tableId, branchId]
        );
        if (result.rows.length > 0) {
          const row = result.rows[0];
          return reply.send({
            id: row.id,
            isWalkIn: false,
            referenceNumber: row.reference_number,
            reservationTime: row.reservation_time,
            partySize: row.party_size,
            status: row.status,
            depositPaid: Number(row.deposit_paid),
            tcAcknowledgedAt: row.tc_acknowledged_at,
            specialRequests: row.special_requests,
            seatedAt: row.seated_at,
            isVip: row.is_vip,
            createdAt: row.created_at,
            sessionDurationMinutes: row.session_duration_minutes,
            endTime: row.end_time,
            // Customer
            customer: {
              id: row.customer_id,
              name: row.customer_name,
              email: row.customer_email,
              phone: row.customer_phone,
            },
            // Decoration
            hasDecoration: row.has_decoration,
            decorationAmount: Number(row.decoration_amount),
            occasionType: row.occasion_type,
            decorationColor: row.decoration_color,
            decorationNotes: row.decoration_notes,
            // Cake
            cakeChoice: row.cake_choice,
            cakeMenuId: row.cake_menu_id,
            cakeMenuName: row.cake_menu_name,
            cakeMenuPrice: row.cake_menu_price ? Number(row.cake_menu_price) : null,
            cakeCustomNotes: row.cake_custom_notes,
            // Promo
            promoCode: row.promo_code,
            promoCodeDiscount: row.promo_code_discount ? Number(row.promo_code_discount) : null,
            promoType: row.promo_type,
            promoDescription: row.promo_description,
            // Booking type
            bookingType: row.promo_code ? 'promo' : 'normal',
          });
        }

        // 2. If no reservation, check for an active walk-in
        const walkInResult = await db.query(
          `SELECT w.id, w.party_size, w.notes, w.created_at, w.status,
                  s.name AS staff_name
           FROM walk_ins w
           LEFT JOIN staff s ON s.id = w.staff_id
           WHERE w.table_id = $1 AND w.branch_id = $2 AND w.status = 'open'
           LIMIT 1`,
          [tableId, branchId]
        );

        if (walkInResult.rows.length > 0) {
          const w = walkInResult.rows[0];
          return reply.send({
            id: w.id,
            isWalkIn: true,
            status: 'seated', // Map 'open' walk-in to 'seated' status for UI consistency
            partySize: w.party_size,
            notes: w.notes,
            createdAt: w.created_at,
            reservationTime: w.created_at,
            customer: {
              name: 'Walk-In Customer',
              email: null,
              phone: null,
            },
            staffName: w.staff_name,
            referenceNumber: `WI-${w.id.slice(0, 8).toUpperCase()}`,
            bookingType: 'walk-in'
          });
        }

        return reply.status(404).send({ error: 'No active reservation or walk-in found' });
      } catch (err: any) {
        logger.error({ err, branchId, tableId }, 'Failed to get table reservation');
        return reply.status(500).send({ error: 'Failed to get table reservation' });
      }
    }
  );

  // ── GET /api/manager/v1/branches/:id/reservations ─────────────────────────
  fastify.get<{ Params: BranchParams; Querystring: ListReservationsQuery }>(
    '/api/manager/v1/branches/:id/reservations',
    async (
      request: FastifyRequest<{ Params: BranchParams; Querystring: ListReservationsQuery }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { status, date, tableId } = request.query as ListReservationsQuery;

      const validStatuses = ['confirmed', 'seated', 'closed', 'cancelled', 'no_show'];
      if (status && !validStatuses.includes(status)) {
        return reply.status(422).send({
          error: `status must be one of: ${validStatuses.join(', ')}`,
        });
      }

      try {
        const reservations = await ReservationService.listByBranch(
          branchId,
          { status: status as any, date, tableId },
          request.branchContext?.timezone
        );
        return reply.send(reservations);
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to list reservations');
        return reply.status(500).send({ error: 'Failed to list reservations' });
      }
    }
  );

  // ── PATCH /api/v1/reservations/:ref ──────────────────────────────────────
  fastify.patch<{ Params: RefParams; Body: ModifyReservationBody }>(
    '/api/v1/reservations/:ref',
    async (
      request: FastifyRequest<{ Params: RefParams; Body: ModifyReservationBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) return reply.status(400).send({ error: 'Branch context is required' });

      const customerId = (request as any).customerContext?.customerId;
      if (!customerId) return reply.status(401).send({ error: 'Authentication required' });

      const body = request.body as ModifyReservationBody;
      if (!body?.sessionId) {
        return reply.status(422).send({ error: 'sessionId is required' });
      }

      const newReservationTime = body.newReservationTime
        ? new Date(body.newReservationTime)
        : undefined;
      if (newReservationTime && isNaN(newReservationTime.getTime())) {
        return reply.status(422).send({ error: 'newReservationTime must be a valid ISO 8601 date' });
      }

      try {
        const reservation = await ReservationService.modifyReservation(
          branchId,
          request.params.ref,
          customerId,
          {
            newTableId: body.newTableId,
            newReservationTime,
            newPartySize: body.newPartySize,
            sessionId: body.sessionId,
          },
          request.ip
        );

        // Enqueue modification email async (Requirement 17.5)
        const targetTableId = body.newTableId ?? reservation.table_id;
        fetchNotificationContext(branchId, customerId, targetTableId).then((ctx) => {
          if (!ctx) return;
          NotificationService.sendReservationModified({
            branchId,
            to: ctx.customerEmail,
            customerName: ctx.customerName,
            referenceNumber: reservation.reference_number,
            branchName: ctx.branchName,
            newReservationTime: new Date(reservation.reservation_time).toLocaleString('en-MY', { timeZone: ctx.timezone }),
            newTableName: ctx.tableName,
            newPartySize: reservation.party_size,
          }).catch((err) => logger.error({ err }, 'Failed to enqueue modification email'));
        }).catch((err) => logger.error({ err }, 'Failed to fetch notification context for modification'));

        return reply.send({ reservation });
      } catch (err: any) {
        if (err instanceof ReservationNotFoundError) {
          return reply.status(404).send({ error: err.message, code: err.code });
        }
        if (err instanceof ReservationAccessDeniedError) {
          return reply.status(403).send({ error: err.message, code: err.code });
        }
        if (err instanceof ReservationNotModifiableError || err instanceof ModificationCutoffError || err instanceof OutsideBusinessHoursError || err instanceof PartySizeExceededError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        if (err instanceof LockTransferError) {
          return reply.status(409).send({ error: err.message, code: err.code, alternatives: err.alternatives });
        }
        logger.error({ err, branchId, ref: request.params.ref }, 'Failed to modify reservation');
        return reply.status(500).send({ error: 'Failed to modify reservation' });
      }
    }
  );

  // ── DELETE /api/v1/reservations/:ref ─────────────────────────────────────
  fastify.delete<{ Params: RefParams }>(
    '/api/v1/reservations/:ref',
    async (
      request: FastifyRequest<{ Params: RefParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) return reply.status(400).send({ error: 'Branch context is required' });

      const customerId = (request as any).customerContext?.customerId;
      if (!customerId) return reply.status(401).send({ error: 'Authentication required' });

      try {
        const result = await ReservationService.cancelReservation(
          branchId,
          request.params.ref,
          customerId,
          'customer',
          request.ip
        );

        // Enqueue cancellation email async (Requirement 15.4)
        fetchNotificationContext(branchId, customerId, result.reservation.table_id).then((ctx) => {
          if (!ctx) return;
          NotificationService.sendReservationCancelled({
            branchId,
            to: ctx.customerEmail,
            customerName: ctx.customerName,
            referenceNumber: result.reservation.reference_number,
            branchName: ctx.branchName,
            reservationTime: new Date(result.reservation.reservation_time).toLocaleString('en-MY', { timeZone: ctx.timezone }),
            refundAmount: result.refundResult?.refundAmount,
          }).catch((err) => logger.error({ err }, 'Failed to enqueue cancellation email'));
        }).catch((err) => logger.error({ err }, 'Failed to fetch notification context for cancellation'));

        return reply.send({ reservation: result.reservation, refundResult: result.refundResult });
      } catch (err: any) {
        if (err instanceof ReservationNotFoundError) {
          return reply.status(404).send({ error: err.message, code: err.code });
        }
        if (err instanceof ReservationAccessDeniedError) {
          return reply.status(403).send({ error: err.message, code: err.code });
        }
        if (err instanceof ReservationNotModifiableError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        logger.error({ err, branchId, ref: request.params.ref }, 'Failed to cancel reservation');
        return reply.status(500).send({ error: 'Failed to cancel reservation' });
      }
    }
  );

  // ── PATCH /api/manager/v1/reservations/:ref/cancel ────────────────────────
  fastify.patch<{ Params: RefParams }>(
    '/api/manager/v1/reservations/:ref/cancel',
    async (
      request: FastifyRequest<{ Params: RefParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) return reply.status(400).send({ error: 'Branch context is required' });

      const staffId = (request as any).staffContext?.staffId;
      const role = (request as any).staffContext?.role;
      if (!staffId || !['manager', 'admin'].includes(role)) {
        return reply.status(403).send({ error: 'Manager or admin role required' });
      }

      try {
        const result = await ReservationService.cancelReservation(
          branchId,
          request.params.ref,
          staffId,
          'manager',
          request.ip
        );

        // Enqueue cancellation email async (Requirement 15.4)
        fetchNotificationContext(branchId, result.reservation.customer_id, result.reservation.table_id).then((ctx) => {
          if (!ctx) return;
          NotificationService.sendReservationCancelled({
            branchId,
            to: ctx.customerEmail,
            customerName: ctx.customerName,
            referenceNumber: result.reservation.reference_number,
            branchName: ctx.branchName,
            reservationTime: new Date(result.reservation.reservation_time).toLocaleString('en-MY', { timeZone: ctx.timezone }),
            refundAmount: result.refundResult?.refundAmount,
          }).catch((err) => logger.error({ err }, 'Failed to enqueue cancellation email (manager)'));
        }).catch((err) => logger.error({ err }, 'Failed to fetch notification context for manager cancellation'));

        return reply.send({ reservation: result.reservation, refundResult: result.refundResult });
      } catch (err: any) {
        if (err instanceof ReservationNotFoundError) {
          return reply.status(404).send({ error: err.message, code: err.code });
        }
        if (err instanceof ReservationNotModifiableError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        logger.error({ err, branchId, ref: request.params.ref }, 'Failed to cancel reservation (manager)');
        return reply.status(500).send({ error: 'Failed to cancel reservation' });
      }
    }
  );

  // ── PATCH /api/waiter/v1/reservations/:ref/seat ───────────────────────────
  fastify.patch<{ Params: RefParams }>(
    '/api/waiter/v1/reservations/:ref/seat',
    async (
      request: FastifyRequest<{ Params: RefParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) return reply.status(400).send({ error: 'Branch context is required' });

      const staffId = (request as any).staffContext?.staffId;
      const role = (request as any).staffContext?.role;
      if (!staffId || !['waiter', 'manager', 'admin'].includes(role)) {
        return reply.status(403).send({ error: 'Waiter, manager, or admin role required' });
      }

      try {
        const reservation = await ReservationService.seatReservation(
          branchId,
          request.params.ref,
          staffId,
          request.ip
        );
        return reply.send({ reservation });
      } catch (err: any) {
        if (err instanceof ReservationNotFoundError) {
          return reply.status(404).send({ error: err.message, code: err.code });
        }
        if (err instanceof ReservationNotModifiableError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        logger.error({ err, branchId, ref: request.params.ref }, 'Failed to seat reservation');
        return reply.status(500).send({ error: 'Failed to seat reservation' });
      }
    }
  );

  // ── PATCH /api/manager/v1/reservations/:ref/no-show-override ─────────────
  fastify.patch<{ Params: RefParams }>(
    '/api/manager/v1/reservations/:ref/no-show-override',
    async (
      request: FastifyRequest<{ Params: RefParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) return reply.status(400).send({ error: 'Branch context is required' });

      const staffId = (request as any).staffContext?.staffId;
      const role = (request as any).staffContext?.role;
      if (!staffId || !['manager', 'admin'].includes(role)) {
        return reply.status(403).send({ error: 'Manager or admin role required' });
      }

      try {
        const reservation = await ReservationService.overrideNoShow(
          branchId,
          request.params.ref,
          staffId,
          request.ip
        );
        return reply.send({ reservation });
      } catch (err: any) {
        if (err instanceof ReservationNotFoundError) {
          return reply.status(404).send({ error: err.message, code: err.code });
        }
        if (err instanceof ReservationNotModifiableError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        logger.error({ err, branchId, ref: request.params.ref }, 'Failed to override no-show');
        return reply.status(500).send({ error: 'Failed to override no-show' });
      }
    }
  );

  // ── PATCH /api/v1/reservations/:ref/decoration ───────────────────────────
  fastify.patch<{ Params: RefParams; Body: UpdateDecorationBody }>(
    '/api/v1/reservations/:ref/decoration',
    async (
      request: FastifyRequest<{ Params: RefParams; Body: UpdateDecorationBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) return reply.status(400).send({ error: 'Branch context is required' });

      const customerId = (request as any).customerContext?.customerId;
      if (!customerId) return reply.status(401).send({ error: 'Authentication required' });

      const body = request.body as UpdateDecorationBody;

      // Validate enum fields
      if (body.decoration_color !== undefined) {
        const normalised = VALID_DECORATION_COLORS.map((c) => c.toLowerCase());
        if (!normalised.includes(body.decoration_color.toLowerCase())) {
          return reply.status(422).send({
            error: `decoration_color must be one of: ${VALID_DECORATION_COLORS.join(', ')}`,
          });
        }
      }

      if (body.occasion_type !== undefined) {
        if (!(VALID_OCCASION_TYPES as readonly string[]).includes(body.occasion_type)) {
          return reply.status(422).send({
            error: `occasion_type must be one of: ${VALID_OCCASION_TYPES.join(', ')}`,
          });
        }
      }

      if (body.cake_choice !== undefined) {
        const normalised = VALID_CAKE_CHOICES.map((c) => c.toLowerCase());
        if (!normalised.includes(body.cake_choice.toLowerCase())) {
          return reply.status(422).send({
            error: `cake_choice must be one of: ${VALID_CAKE_CHOICES.join(', ')}`,
          });
        }
      }

      try {
        const reservation = await ReservationService.updateDecorationDetails(
          branchId,
          request.params.ref,
          customerId,
          {
            has_decoration: body.has_decoration,
            occasion_type: body.occasion_type,
            decoration_color: body.decoration_color,
            cake_choice: body.cake_choice,
            decoration_notes: body.decoration_notes,
          },
          request.ip
        );
        return reply.send({ reservation });
      } catch (err: any) {
        if (err instanceof ReservationNotFoundError) {
          return reply.status(404).send({ error: err.message, code: err.code });
        }
        if (err instanceof ReservationAccessDeniedError) {
          return reply.status(403).send({ error: err.message, code: err.code });
        }
        if (err instanceof ReservationNotModifiableError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        logger.error({ err, branchId, ref: request.params.ref }, 'Failed to update decoration details');
        return reply.status(500).send({ error: 'Failed to update decoration details' });
      }
    }
  );

  // ── PATCH /api/manager/v1/tables/:tableId/unlock ──────────────────────────
  fastify.patch<{ Params: TableIdParams }>(
    '/api/manager/v1/tables/:tableId/unlock',
    async (
      request: FastifyRequest<{ Params: TableIdParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) return reply.status(400).send({ error: 'Branch context is required' });

      const staffId = (request as any).staffContext?.staffId;
      const role = (request as any).staffContext?.role;
      if (!staffId || !['manager', 'admin'].includes(role)) {
        return reply.status(403).send({ error: 'Manager or admin role required' });
      }

      const { tableId } = request.params;

      try {
        await TableLockService.forceReleaseLock(branchId, tableId);
        return reply.send({ message: 'Table lock released', tableId });
      } catch (err: any) {
        logger.error({ err, branchId, tableId }, 'Failed to force-release table lock');
        return reply.status(500).send({ error: 'Failed to release table lock' });
      }
    }
  );
}

export default reservationRoutes;
