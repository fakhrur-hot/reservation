/**
 * Walk-In Routes
 *
 * POST  /api/waiter/v1/branches/:id/walk-ins  — create walk-in (Waiter/Manager/Admin)
 * PATCH /api/waiter/v1/walk-ins/:id/close     — close walk-in  (Waiter/Manager/Admin)
 *
 * Requirements: 18.1–18.6
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  WalkInService,
  TableNotAvailableError,
  WalkInNotFoundError,
  WalkInAlreadyClosedError,
} from '../services/walk-in.service.js';
import { logger } from '../config/logger.js';

// ─── Param / Body types ───────────────────────────────────────────────────────

interface BranchParams {
  id: string;
}

interface WalkInParams {
  id: string;
}

interface CreateWalkInBody {
  tableId?: string;
  table_id?: string;
  partySize?: number;
  party_size?: number;
  notes?: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function walkInRoutes(fastify: FastifyInstance) {
  // ── POST /api/waiter/v1/branches/:id/walk-ins ─────────────────────────────
  fastify.post<{ Params: BranchParams; Body: CreateWalkInBody }>(
    '/api/waiter/v1/branches/:id/walk-ins',
    async (
      request: FastifyRequest<{ Params: BranchParams; Body: CreateWalkInBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      // Require waiter, manager, or admin role
      const staffId = (request as any).staffContext?.staffId;
      const role = (request as any).staffContext?.role;
      if (!staffId || !['waiter', 'manager', 'admin'].includes(role)) {
        return reply.status(403).send({ error: 'Waiter, manager, or admin role required' });
      }

      const body = request.body as CreateWalkInBody;

      const tableId = body?.tableId ?? body?.table_id;
      const partySize = body?.partySize ?? body?.party_size;

      if (!tableId) {
        return reply.status(422).send({ error: 'tableId is required' });
      }
      if (partySize == null || typeof partySize !== 'number' || partySize < 1) {
        return reply.status(422).send({ error: 'partySize must be a positive integer' });
      }

      try {
        const walkIn = await WalkInService.createWalkIn(
          {
            branchId,
            tableId,
            staffId,
            partySize,
            notes: body.notes,
          },
          request.ip
        );

        return reply.status(201).send({ walkIn });
      } catch (err: any) {
        if (err instanceof TableNotAvailableError) {
          return reply.status(409).send({ error: err.message, code: err.code });
        }
        logger.error({ err, branchId }, 'Failed to create walk-in');
        return reply.status(500).send({ error: 'Failed to create walk-in' });
      }
    }
  );

  // ── PATCH /api/waiter/v1/walk-ins/:id/close ───────────────────────────────
  fastify.patch<{ Params: WalkInParams }>(
    '/api/waiter/v1/walk-ins/:id/close',
    async (
      request: FastifyRequest<{ Params: WalkInParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'Branch context is required' });
      }

      const staffId = (request as any).staffContext?.staffId;
      const role = (request as any).staffContext?.role;
      if (!staffId || !['waiter', 'manager', 'admin'].includes(role)) {
        return reply.status(403).send({ error: 'Waiter, manager, or admin role required' });
      }

      try {
        const walkIn = await WalkInService.closeWalkIn(
          request.params.id,
          branchId,
          staffId,
          request.ip
        );

        return reply.send({ walkIn });
      } catch (err: any) {
        if (err instanceof WalkInNotFoundError) {
          return reply.status(404).send({ error: err.message, code: err.code });
        }
        if (err instanceof WalkInAlreadyClosedError) {
          return reply.status(422).send({ error: err.message, code: err.code });
        }
        logger.error({ err, branchId, walkInId: request.params.id }, 'Failed to close walk-in');
        return reply.status(500).send({ error: 'Failed to close walk-in' });
      }
    }
  );
}

export default walkInRoutes;
