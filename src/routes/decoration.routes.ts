/**
 * Decoration Routes
 *
 * Public endpoints for decoration colors and packages per branch.
 * Requirements: 22.1, 22.3
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../config/database.js';
import { logger } from '../config/logger.js';

interface BranchParams {
  branchId: string;
}

export async function decorationRoutes(fastify: FastifyInstance) {
  // ── GET /api/v1/branches/:branchId/decoration-colors ─────────────────────
  // Returns all active decoration colors for the branch, sorted by sort_order.
  // Requirements: 22.3
  fastify.get<{ Params: BranchParams }>(
    '/api/v1/branches/:branchId/decoration-colors',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const contextBranchId = request.branchContext?.branchId;
      const { branchId } = request.params;

      if (!contextBranchId || contextBranchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const result = await query(
          `SELECT id, color_name AS name, color_code AS hex_code, image_url, sort_order
           FROM decoration_colors
           WHERE branch_id = $1 AND is_active = true
           ORDER BY sort_order ASC NULLS LAST, created_at ASC`,
          [branchId]
        );

        return reply.send(result.rows);
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to fetch decoration colors');
        return reply.status(500).send({ error: 'Failed to fetch decoration colors' });
      }
    }
  );

  // ── GET /api/v1/branches/:branchId/decoration-packages ───────────────────
  // Returns all active decoration packages for the branch.
  // Requirements: 22.1
  fastify.get<{ Params: BranchParams }>(
    '/api/v1/branches/:branchId/decoration-packages',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const contextBranchId = request.branchContext?.branchId;
      const { branchId } = request.params;

      if (!contextBranchId || contextBranchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const result = await query(
          `SELECT id, package_name AS name, description, price
           FROM decoration_packages
           WHERE branch_id = $1 AND is_active = true
           ORDER BY created_at ASC`,
          [branchId]
        );

        return reply.send(result.rows);
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to fetch decoration packages');
        return reply.status(500).send({ error: 'Failed to fetch decoration packages' });
      }
    }
  );
}

export default decorationRoutes;
