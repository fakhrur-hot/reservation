/**
 * Payment Routes
 *
 * POST /api/v1/payment/initiate          — customer initiates payment after booking
 * GET  /api/v1/payment/status/:reservationId — check payment status
 * POST /api/webhooks/billplz/callback    — Billplz payment callback (no auth)
 * POST /api/webhooks/ipay88/callback     — iPay88 backend callback (no auth)
 * POST /api/webhooks/ipay88/response     — iPay88 frontend response (no auth)
 *
 * All webhook endpoints are public (no JWT) — verified by gateway signature.
 * All customer endpoints require valid customer JWT.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PaymentGatewayService } from '../services/payment-gateway.service.js';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InitiatePaymentBody {
  reservationId: string;
  method?: 'fpx' | 'card' | 'ewallet';
  browserInfo?: {
    browser?: string;
    os?: string;
    device?: string;
    language?: string;
    timezone?: string;
    screenResolution?: string;
  };
}

interface ReservationIdParams {
  reservationId: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function paymentRoutes(fastify: FastifyInstance) {

  // ── POST /api/v1/payment/initiate ─────────────────────────────────────────
  // Customer calls this after reservation is confirmed to get the payment URL.
  fastify.post<{ Body: InitiatePaymentBody }>(
    '/api/v1/payment/initiate',
    async (request: FastifyRequest<{ Body: InitiatePaymentBody }>, reply: FastifyReply) => {
      // Require customer auth
      const customerId = (request as any).customerContext?.customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Customer authentication required' });
      }

      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'Branch context missing' });
      }

      const { reservationId, method, browserInfo } = request.body ?? {};
      if (!reservationId) {
        return reply.status(422).send({ error: 'reservationId is required' });
      }

      try {
        const db = getDatabase();

        // Fetch reservation + customer details
        const result = await db.query(
          `SELECT
             r.id, r.branch_id, r.reference_number, r.reservation_time,
             r.deposit_paid, r.status,
             b.booking_deposit_amt, b.decoration_package_price,
             r.has_decoration, r.decoration_amount,
             c.id AS customer_id, c.name AS customer_name,
             c.email AS customer_email, c.phone AS customer_phone
           FROM reservations r
           JOIN branches b ON b.id = r.branch_id
           JOIN customers c ON c.id = r.customer_id
           WHERE r.id = $1 AND r.branch_id = $2 AND r.customer_id = $3`,
          [reservationId, branchId, customerId]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Reservation not found' });
        }

        const res = result.rows[0];

        // Check reservation is in confirmed state
        if (res.status !== 'confirmed') {
          return reply.status(409).send({
            error: `Cannot initiate payment for reservation with status: ${res.status}`,
          });
        }

        // Check if already paid
        if (Number(res.deposit_paid) > 0) {
          return reply.status(409).send({ error: 'Deposit already paid for this reservation' });
        }

        // Calculate total amount
        const baseDeposit = Number(res.booking_deposit_amt) || 0;
        const decorationFee = res.has_decoration ? (Number(res.decoration_amount) || 0) : 0;
        const totalAmount = baseDeposit + decorationFee;

        if (totalAmount <= 0) {
          return reply.status(422).send({ error: 'No deposit required for this reservation' });
        }

        // Extract client context for audit trail
        const customerIp =
          (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          (request.headers['x-real-ip'] as string) ||
          request.ip ||
          'unknown';

        const userAgent = request.headers['user-agent'] || 'unknown';

        // Determine callback base URL
        const host = request.headers['x-forwarded-host'] || request.headers['host'] || 'localhost:3001';
        const protocol = request.headers['x-forwarded-proto'] || 'http';
        const callbackBaseUrl = `${protocol}://${host}`;

        const idempotencyKey = `pay:${reservationId}:${Date.now()}`;

        const paymentResult = await PaymentGatewayService.initiatePayment({
          reservationId,
          branchId,
          customerId: res.customer_id,
          customerName: res.customer_name,
          customerEmail: res.customer_email,
          customerPhone: res.customer_phone || '',
          customerIp,
          userAgent,
          browserInfo: browserInfo || {},
          amount: totalAmount,
          description: `Table reservation deposit — ${res.reference_number}`,
          referenceNumber: res.reference_number,
          idempotencyKey,
          callbackBaseUrl,
          method,
        });

        logger.info({
          event: 'payment_initiate_success',
          reservation_id: reservationId,
          customer_id: customerId,
          customer_ip: customerIp,
          gateway: paymentResult.gateway,
          amount: totalAmount,
        }, 'Payment initiation successful');

        return reply.send({
          paymentSessionId: paymentResult.paymentSessionId,
          paymentUrl: paymentResult.paymentUrl,
          gateway: paymentResult.gateway,
          amount: totalAmount,
          currency: 'MYR',
          expiresAt: paymentResult.expiresAt,
          // For iPay88: frontend needs to POST a form, not just redirect
          requiresFormPost: paymentResult.gateway === 'ipay88',
        });

      } catch (err) {
        logger.error({ err, reservationId }, 'Payment initiation failed');
        const message = err instanceof Error ? err.message : 'Payment initiation failed';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // ── GET /api/v1/payment/status/:reservationId ─────────────────────────────
  fastify.get<{ Params: ReservationIdParams }>(
    '/api/v1/payment/status/:reservationId',
    async (request: FastifyRequest<{ Params: ReservationIdParams }>, reply: FastifyReply) => {
      const customerId = (request as any).customerContext?.customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Customer authentication required' });
      }

      const { reservationId } = request.params;

      try {
        const status = await PaymentGatewayService.getPaymentStatus(reservationId);
        if (!status) {
          return reply.status(404).send({ error: 'No payment session found' });
        }
        return reply.send(status);
      } catch (err) {
        logger.error({ err, reservationId }, 'Failed to get payment status');
        return reply.status(500).send({ error: 'Failed to get payment status' });
      }
    }
  );

  // ── POST /api/webhooks/billplz/callback ───────────────────────────────────
  // Public endpoint — no JWT. Verified by X-Signature HMAC.
  fastify.post(
    '/api/webhooks/billplz/callback',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Billplz sends application/x-www-form-urlencoded
        const params = request.body as Record<string, string>;

        logger.info({ params }, 'Billplz callback received');

        const result = await PaymentGatewayService.handleBillplzCallback(params);

        if (!result.valid) {
          return reply.status(400).send({ error: 'Invalid signature' });
        }

        // Billplz expects 200 OK with no body on success
        return reply.status(200).send();
      } catch (err) {
        logger.error({ err }, 'Billplz callback processing failed');
        return reply.status(500).send({ error: 'Callback processing failed' });
      }
    }
  );

  // ── POST /api/webhooks/ipay88/callback ────────────────────────────────────
  // iPay88 backend URL — server-to-server, no redirect.
  fastify.post(
    '/api/webhooks/ipay88/callback',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.body as Record<string, string>;

        logger.info({ params }, 'iPay88 backend callback received');

        const result = await PaymentGatewayService.handleIpay88Callback(params);

        if (!result.valid) {
          return reply.status(400).send({ error: 'Invalid signature' });
        }

        // iPay88 expects "RECEIVEOK" text response on success
        return reply.status(200).send('RECEIVEOK');
      } catch (err) {
        logger.error({ err }, 'iPay88 callback processing failed');
        return reply.status(500).send({ error: 'Callback processing failed' });
      }
    }
  );

  // ── POST /api/webhooks/ipay88/response ────────────────────────────────────
  // iPay88 frontend response URL — customer is redirected here after payment.
  // Also verifies signature and updates status (in case backend URL was missed).
  fastify.post(
    '/api/webhooks/ipay88/response',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.body as Record<string, string>;

        logger.info({ params }, 'iPay88 response URL received');

        const result = await PaymentGatewayService.handleIpay88Callback(params);

        const refNo = params['RefNo'] || '';
        const paid = result.paid;

        // Redirect customer to booking result page
        const redirectUrl = `/booking/payment-result?ref=${encodeURIComponent(refNo)}&status=${paid ? 'success' : 'failed'}`;
        return reply.redirect(302, redirectUrl);
      } catch (err) {
        logger.error({ err }, 'iPay88 response processing failed');
        return reply.redirect(302, '/booking/payment-result?status=error');
      }
    }
  );
}

export default paymentRoutes;
