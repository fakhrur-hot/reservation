/**
 * Table Lock Routes
 *
 * Customer-facing table lock/unlock endpoints for the booking flow.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 11.4
 *
 * Endpoints:
 * - POST /api/v1/tables/:tableId/lock - Acquire 30-min Redis lock on a table
 * - POST /api/v1/tables/:tableId/unlock - Release the lock
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TableLockService } from '../services/table-lock.service.js';
import { logger } from '../config/logger.js';

// ─── Param / Body types ───────────────────────────────────────────────────────

interface TableIdParams {
  tableId: string;
}

interface LockTableBody {
  sessionId: string;
  branchId: string;
  durationMinutes?: number;
}

interface UnlockTableBody {
  sessionId: string;
  branchId: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function tableLockRoutes(fastify: FastifyInstance) {
  // ── POST /api/v1/tables/:tableId/lock ─────────────────────────────────────
  // Customer acquires a 30-min Redis lock on a table before booking.
  // Requirement 8.1: WHEN a customer selects a Time slot, THE system SHALL
  // immediately call POST /tables/:tableId/lock to acquire a 30-minute Redis lock.
  fastify.post<{ Params: TableIdParams; Body: LockTableBody }>(
    '/api/v1/tables/:tableId/lock',
    async (
      request: FastifyRequest<{ Params: TableIdParams; Body: LockTableBody }>,
      reply: FastifyReply
    ) => {
      const { tableId } = request.params;
      const { sessionId, branchId, durationMinutes } = request.body ?? {};

      // Validate required fields
      if (!sessionId) {
        return reply.status(422).send({
          error: 'validation_error',
          message: 'sessionId is required',
        });
      }

      if (!branchId) {
        return reply.status(422).send({
          error: 'validation_error',
          message: 'branchId is required',
        });
      }

      try {
        const result = await TableLockService.acquireLock(
          tableId,
          branchId,
          sessionId,
          durationMinutes ?? 30 // Default 30 minutes (Requirement 8.2)
        );

        if (result.acquired) {
          // Requirement 8.2: Return acquired, tableId, and lockExpiresAt (ISO timestamp)
          return reply.status(200).send({
            acquired: true,
            tableId,
            lockExpiresAt: result.lockExpiresAt,
          });
        }

        // Requirement 8.3: Handle already-locked tables with alternatives
        logger.info({
          event: 'lock_already_held',
          branchId,
          tableId,
          sessionId,
          alternativesCount: result.alternatives?.length ?? 0,
        }, 'Table lock already held by another session');

        return reply.status(409).send({
          acquired: false,
          tableId,
          error: 'table_already_locked',
          message: 'This table is currently locked by another customer',
          alternatives: result.alternatives ?? [],
        });
      } catch (err: any) {
        logger.error({ err, branchId, tableId, sessionId }, 'Failed to acquire table lock');
        return reply.status(503).send({
          error: 'service_unavailable',
          message: 'Lock service is temporarily unavailable',
        });
      }
    }
  );

  // ── POST /api/v1/tables/:tableId/unlock ───────────────────────────────────
  // Customer releases a lock (e.g., when abandoning booking flow).
  // Requirement 8.4: THE backend API endpoint POST /tables/:tableId/unlock
  // SHALL release the lock and make the table available for other customers.
  fastify.post<{ Params: TableIdParams; Body: UnlockTableBody }>(
    '/api/v1/tables/:tableId/unlock',
    async (
      request: FastifyRequest<{ Params: TableIdParams; Body: UnlockTableBody }>,
      reply: FastifyReply
    ) => {
      const { tableId } = request.params;
      const { sessionId, branchId } = request.body ?? {};

      // Validate required fields
      if (!sessionId) {
        return reply.status(422).send({
          error: 'validation_error',
          message: 'sessionId is required',
        });
      }

      if (!branchId) {
        return reply.status(422).send({
          error: 'validation_error',
          message: 'branchId is required',
        });
      }

      try {
        const released = await TableLockService.releaseLock(tableId, branchId, sessionId);

        if (released) {
          logger.info({
            event: 'lock_released_via_api',
            branchId,
            tableId,
            sessionId,
          }, 'Table lock released via API');

          return reply.status(200).send({
            released: true,
            tableId,
            message: 'Table lock has been released',
          });
        }

        // Lock exists but owned by different session
        logger.warn({
          event: 'lock_release_denied',
          branchId,
          tableId,
          sessionId,
        }, 'Lock release denied - ownership mismatch');

        return reply.status(403).send({
          released: false,
          tableId,
          error: 'ownership_mismatch',
          message: 'You do not own this lock',
        });
      } catch (err: any) {
        logger.error({ err, branchId, tableId, sessionId }, 'Failed to release table lock');
        return reply.status(503).send({
          error: 'service_unavailable',
          message: 'Lock service is temporarily unavailable',
        });
      }
    }
  );

  // ── GET /api/v1/tables/:tableId/lock-status ────────────────────────────────
  // Check if a table is currently locked (for UI state management).
  fastify.get<{ Params: TableIdParams; Querystring: { branchId: string } }>(
    '/api/v1/tables/:tableId/lock-status',
    async (
      request: FastifyRequest<{ Params: TableIdParams; Querystring: { branchId: string } }>,
      reply: FastifyReply
    ) => {
      const { tableId } = request.params;
      const { branchId } = request.query;

      if (!branchId) {
        return reply.status(422).send({
          error: 'validation_error',
          message: 'branchId query parameter is required',
        });
      }

      try {
        const isLocked = await TableLockService.isLocked(tableId, branchId);
        const owner = isLocked ? await TableLockService.getLockOwner(branchId, tableId) : null;

        return reply.status(200).send({
          tableId,
          isLocked,
          owner: owner ?? null,
        });
      } catch (err: any) {
        logger.error({ err, branchId, tableId }, 'Failed to check table lock status');
        return reply.status(503).send({
          error: 'service_unavailable',
          message: 'Lock service is temporarily unavailable',
        });
      }
    }
  );
}

export default tableLockRoutes;