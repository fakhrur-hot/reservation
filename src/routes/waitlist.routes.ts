/**
 * Waitlist Routes
 *
 * POST   /api/v1/waitlist                  — add guest to waitlist
 * DELETE /api/v1/waitlist/:waitlistId      — remove from waitlist
 * POST   /api/v1/waitlist/:waitlistId/assign — assign table to guest
 * GET    /api/v1/waitlist?branchId=:id     — get branch waitlist
 *
 * Requirements: 3.10
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  WaitlistService,
  WaitlistNotFoundError,
  InvalidWaitlistStatusError,
} from '../services/waitlist.service.js';
import { WebSocketPublisher } from '../services/websocket-publisher.service.js';
import { AuditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddToWaitlistBody {
  guestName: string;
  phoneNumber?: string;
  partySize: number;
  notes?: string;
  priority?: number;
}

interface AssignTableBody {
  tableId: string;
}

interface GetWaitlistQuery {
  branchId: string;
  status?: 'waiting' | 'assigned' | 'cancelled' | 'no_show';
}

// ─── Routes ────────────────────────────────────────────────────────────────────

export async function registerWaitlistRoutes(fastify: FastifyInstance) {
  // ── POST /api/v1/waitlist ──────────────────────────────────────────────────
  /**
   * Add guest to waitlist.
   * Staff endpoint - requires staff authentication.
   * Publishes WebSocket notification to all connected clients.
   *
   * Requirements: 3.10
   */
  fastify.post<{ Body: AddToWaitlistBody }>(
    '/api/v1/waitlist',
    async (request: FastifyRequest<{ Body: AddToWaitlistBody }>, reply: FastifyReply) => {
      // Verify staff authentication
      if (!request.staffContext?.staffId) {
        logger.warn('Unauthorized attempt to add to waitlist');
        return reply.status(401).send({ error: 'Staff authentication required' });
      }

      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'branchId is required' });
      }

      const { guestName, phoneNumber, partySize, notes, priority } = request.body;

      // Validate input
      if (!guestName || guestName.trim().length === 0) {
        return reply.status(400).send({ error: 'guestName is required' });
      }

      if (!partySize || partySize <= 0) {
        return reply.status(400).send({ error: 'partySize must be greater than 0' });
      }

      try {
        const waitlistId = await WaitlistService.addToWaitlist({
          branchId,
          guestName: guestName.trim(),
          phoneNumber,
          partySize,
          notes,
          priority,
        });

        // Publish WebSocket notification
        await WebSocketPublisher.publishWaitlistUpdate(branchId, 'guest_added', {
          waitlistId,
          guestName,
          partySize,
        });

        // Audit log
        await AuditService.log({
          branchId,
          actorId: request.staffContext.staffId,
          action: 'ADD_TO_WAITLIST',
          entityType: 'waitlist',
          entityId: waitlistId,
          newValue: {
            guestName,
            partySize,
            phoneNumber,
          },
          ipAddress: request.ip,
        });

        return reply.status(201).send({
          waitlistId,
          guestName,
          partySize,
          status: 'waiting',
          createdAt: new Date().toISOString(),
        });
      } catch (err: any) {
        logger.error({ err, branchId, guestName }, 'Failed to add to waitlist');
        return reply.status(500).send({ error: 'Failed to add to waitlist' });
      }
    }
  );

  // ── DELETE /api/v1/waitlist/:waitlistId ────────────────────────────────────
  /**
   * Remove guest from waitlist.
   * Staff endpoint - requires staff authentication.
   * Can only remove guests with status 'waiting'.
   *
   * Requirements: 3.10
   */
  fastify.delete<{ Params: { waitlistId: string } }>(
    '/api/v1/waitlist/:waitlistId',
    async (
      request: FastifyRequest<{ Params: { waitlistId: string } }>,
      reply: FastifyReply
    ) => {
      // Verify staff authentication
      if (!request.staffContext?.staffId) {
        logger.warn('Unauthorized attempt to remove from waitlist');
        return reply.status(401).send({ error: 'Staff authentication required' });
      }

      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'branchId is required' });
      }

      const { waitlistId } = request.params;

      try {
        // Fetch entry to verify it belongs to branch
        const entry = await WaitlistService.getWaitlistEntry(waitlistId);
        if (!entry) {
          return reply.status(404).send({ error: 'Waitlist entry not found' });
        }

        if (entry.branch_id !== branchId) {
          return reply.status(403).send({ error: 'Unauthorized' });
        }

        await WaitlistService.removeFromWaitlist(waitlistId, request.staffContext.staffId);

        // Publish WebSocket notification
        await WebSocketPublisher.publishWaitlistUpdate(branchId, 'guest_removed', {
          waitlistId,
        });

        // Audit log
        await AuditService.log({
          branchId,
          actorId: request.staffContext.staffId,
          action: 'REMOVE_FROM_WAITLIST',
          entityType: 'waitlist',
          entityId: waitlistId,
          ipAddress: request.ip,
        });

        return reply.status(200).send({ success: true });
      } catch (err: any) {
        if (err instanceof WaitlistNotFoundError) {
          return reply.status(404).send({ error: err.message });
        }

        if (err instanceof InvalidWaitlistStatusError) {
          return reply.status(409).send({ error: err.message });
        }

        logger.error({ err, waitlistId }, 'Failed to remove from waitlist');
        return reply.status(500).send({ error: 'Failed to remove from waitlist' });
      }
    }
  );

  // ── POST /api/v1/waitlist/:waitlistId/assign ────────────────────────────────
  /**
   * Assign table to waiting guest.
   * Staff endpoint - requires staff authentication.
   * Transitions guest from 'waiting' to 'assigned'.
   *
   * Requirements: 3.10
   */
  fastify.post<{ Params: { waitlistId: string }; Body: AssignTableBody }>(
    '/api/v1/waitlist/:waitlistId/assign',
    async (
      request: FastifyRequest<{ Params: { waitlistId: string }; Body: AssignTableBody }>,
      reply: FastifyReply
    ) => {
      // Verify staff authentication
      if (!request.staffContext?.staffId) {
        logger.warn('Unauthorized attempt to assign table');
        return reply.status(401).send({ error: 'Staff authentication required' });
      }

      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'branchId is required' });
      }

      const { waitlistId } = request.params;
      const { tableId } = request.body;

      if (!tableId) {
        return reply.status(400).send({ error: 'tableId is required' });
      }

      try {
        // Verify entry belongs to branch
        const entry = await WaitlistService.getWaitlistEntry(waitlistId);
        if (!entry) {
          return reply.status(404).send({ error: 'Waitlist entry not found' });
        }

        if (entry.branch_id !== branchId) {
          return reply.status(403).send({ error: 'Unauthorized' });
        }

        await WaitlistService.assignTable({
          waitlistId,
          tableId,
          staffId: request.staffContext.staffId,
        });

        // Publish WebSocket notification
        await WebSocketPublisher.publishWaitlistUpdate(branchId, 'table_assigned', {
          waitlistId,
          tableId,
          guestName: entry.guest_name,
        });

        // Audit log
        await AuditService.log({
          branchId,
          actorId: request.staffContext.staffId,
          action: 'ASSIGN_TABLE_TO_WAITLIST_GUEST',
          entityType: 'waitlist',
          entityId: waitlistId,
          newValue: {
            tableId,
            guestName: entry.guest_name,
          },
          ipAddress: request.ip,
        });

        return reply.status(200).send({ success: true });
      } catch (err: any) {
        if (err instanceof WaitlistNotFoundError) {
          return reply.status(404).send({ error: err.message });
        }

        if (err instanceof InvalidWaitlistStatusError) {
          return reply.status(409).send({ error: err.message });
        }

        logger.error({ err, waitlistId, tableId }, 'Failed to assign table');
        return reply.status(500).send({ error: 'Failed to assign table' });
      }
    }
  );

  // ── GET /api/v1/waitlist ────────────────────────────────────────────────────
  /**
   * Get waitlist for a branch.
   * Staff endpoint - requires staff authentication.
   * Optionally filter by status.
   *
   * Requirements: 3.10
   */
  fastify.get<{ Querystring: GetWaitlistQuery }>(
    '/api/v1/waitlist',
    async (request: FastifyRequest<{ Querystring: GetWaitlistQuery }>, reply: FastifyReply) => {
      // Verify staff authentication
      if (!request.staffContext?.staffId) {
        logger.warn('Unauthorized attempt to fetch waitlist');
        return reply.status(401).send({ error: 'Staff authentication required' });
      }

      const { branchId, status } = request.query;

      if (!branchId) {
        return reply.status(400).send({ error: 'branchId is required' });
      }

      // Verify branch access
      if (request.branchContext?.branchId !== branchId) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      try {
        const waitlist = await WaitlistService.getWaitlist(branchId, status);

        return reply.status(200).send({
          branchId,
          count: waitlist.length,
          waitlist,
        });
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to fetch waitlist');
        return reply.status(500).send({ error: 'Failed to fetch waitlist' });
      }
    }
  );
}
