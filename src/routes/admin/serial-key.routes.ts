/**
 * Serial Key Routes
 *
 * POST /api/admin/v1/branches/:id/serial-key
 *
 * Accepts a serial key, validates the HMAC-SHA256 signature, checks expiry,
 * decodes the feature bitmask, updates branches.app_operating_mode, and logs
 * the change with the acting Admin's staff ID, previous mode, and new mode.
 *
 * Requirements: 20.6, 20.7
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateSerialKey, decodeBitmask } from '../../services/serial-key.service.js';
import { AuditService } from '../../services/audit.service.js';
import { getDatabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchParams {
  id: string;
}

interface SerialKeyBody {
  serialKey: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function serialKeyRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: BranchParams; Body: SerialKeyBody }>(
    '/api/admin/v1/branches/:id/serial-key',
    async (
      request: FastifyRequest<{ Params: BranchParams; Body: SerialKeyBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.params.id;

      // Verify branch context matches
      if (!request.branchContext || request.branchContext.branchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      // Require Admin role
      const actorId = request.staffContext?.staffId;
      const role = request.staffContext?.role;
      if (!actorId || role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const { serialKey } = request.body ?? {};
      if (!serialKey || typeof serialKey !== 'string') {
        return reply.status(400).send({ error: 'serialKey is required' });
      }

      // Validate the serial key
      const result = validateSerialKey(serialKey, branchId);
      if (!result.valid || !result.payload) {
        logger.warn(
          { branchId, actorId, error: result.error },
          'Serial key validation failed'
        );
        return reply.status(400).send({ error: result.error ?? 'Invalid serial key' });
      }

      const { featureBitmask } = result.payload;
      const newMode = decodeBitmask(featureBitmask)!;

      const db = getDatabase();

      // Fetch current mode
      const branchRow = await db.query(
        'SELECT app_operating_mode FROM branches WHERE id = $1',
        [branchId]
      );

      if (branchRow.rowCount === 0) {
        return reply.status(404).send({ error: 'Branch not found' });
      }

      const previousMode: string = branchRow.rows[0].app_operating_mode ?? 'TABLE_ONLY';

      // Update operating mode
      await db.query(
        'UPDATE branches SET app_operating_mode = $1 WHERE id = $2',
        [newMode, branchId]
      );

      // Log the change (Req 20.7)
      logger.info(
        { branchId, actorId, previousMode, newMode },
        'App_Operating_Mode changed via serial key'
      );

      await AuditService.logUpdate(
        branchId,
        actorId,
        'branch',
        branchId,
        { app_operating_mode: previousMode },
        { app_operating_mode: newMode },
        request.ip
      );

      return reply.send({
        branchId,
        previousMode,
        newMode,
      });
    }
  );
}

export default serialKeyRoutes;
