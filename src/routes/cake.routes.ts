/**
 * Cake Routes
 *
 * GET /api/v1/branches/:branchId/cake-preferences          — list active predefined cake preferences (all modes)
 * GET /api/v1/branches/:branchId/cake-options              — unified cake list with Stage 1/2 fallback (all modes)
 * GET /api/v1/branches/:branchId/menu-items                — list menu items by category (Stage 2+ only; 403 in TABLE_ONLY)
 * GET /api/v1/branches/:branchId/menu-items/:itemId        — get single menu item (Stage 2+ only; 403 in TABLE_ONLY)
 *
 * Requirements: 27.1, 27.3, 27.4, 27.10
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query, getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { APP_OPERATING_MODES } from '../middleware/operating-mode.middleware.js';

interface BranchParams {
  branchId: string;
}

interface MenuItemParams {
  branchId: string;
  itemId: string;
}

interface MenuItemsQuery {
  category?: string;
}

export async function cakeRoutes(fastify: FastifyInstance) {
  // ── GET /api/v1/branches/:branchId/cake-preferences ──────────────────────
  // Returns all active cake preferences for the branch, sorted by sort_order.
  // Requirements: 27.1
  fastify.get<{ Params: BranchParams }>(
    '/api/v1/branches/:branchId/cake-preferences',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const contextBranchId = request.branchContext?.branchId;
      const { branchId } = request.params;

      if (!contextBranchId || contextBranchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        // 1. Fetch predefined preferences
        const prefResult = await query(
          `SELECT id, cake_name, description, sort_order, 'preference' as type
           FROM cake_preferences
           WHERE branch_id = $1 AND is_active = true`,
          [branchId]
        );

        // 2. Fetch cakes from menu_items
        let menuCakes: any[] = [];
        try {
          const menuResult = await query(
            `SELECT i.id, i.name as cake_name, i.description, 99 as sort_order, 'menu_item' as type
             FROM menu_items i
             JOIN menu_sections s ON i.section_id = s.id
             WHERE s.branch_id = $1 AND s.section_type = 'cakes' AND i.is_available = true`,
            [branchId]
          );
          menuCakes = menuResult.rows;
        } catch (e) {
          // Ignore if menu tables don't exist yet
        }

        const allCakes = [...prefResult.rows, ...menuCakes].sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));

        return reply.send(allCakes);
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to fetch cake preferences');
        return reply.status(500).send({ error: 'Failed to fetch cake preferences' });
      }
    }
  );

  // ── GET /api/v1/branches/:branchId/cake-options ──────────────────────────
  // Unified cake list with Stage 1/2 fallback (Requirement 27.10):
  //   • TABLE_ONLY mode  → predefined cake_preferences only
  //   • MENU_READY+ mode → merge predefined cakes + menu_items (category='cake')
  //                        gracefully falls back to predefined-only if menu_items
  //                        table is missing or empty.
  // Always available in all operating modes.
  // Requirements: 27.10
  fastify.get<{ Params: BranchParams }>(
    '/api/v1/branches/:branchId/cake-options',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const contextBranchId = request.branchContext?.branchId;
      const { branchId } = request.params;

      if (!contextBranchId || contextBranchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const mode = (request.branchContext?.appOperatingMode || APP_OPERATING_MODES.TABLE_ONLY).toUpperCase();
      const isTableOnly = mode === APP_OPERATING_MODES.TABLE_ONLY;

      try {
        // Always fetch predefined cakes
        const predefinedResult = await query(
          `SELECT id, cake_name AS name, description, sort_order, 'predefined' AS source
           FROM cake_preferences
           WHERE branch_id = $1 AND is_active = true
           ORDER BY sort_order ASC NULLS LAST, created_at ASC`,
          [branchId]
        );

        // In TABLE_ONLY mode return predefined cakes only
        if (isTableOnly) {
          return reply.send({
            mode,
            source: 'predefined',
            items: predefinedResult.rows,
          });
        }

        // MENU_READY+ mode: attempt to merge menu_items (category='cake')
        let menuCakes: any[] = [];
        try {
          const db = getDatabase();
          const menuResult = await db.query(
            `SELECT i.id, i.name, i.description, i.price, i.image_url, 'menu' AS source
             FROM menu_items i
             JOIN menu_sections s ON i.section_id = s.id
             WHERE s.branch_id = $1 AND s.section_type = 'cakes' AND i.is_available = true
             ORDER BY i.name ASC`,
            [branchId]
          );
          menuCakes = menuResult.rows;
        } catch (menuErr: any) {
          // Gracefully handle missing table (dormant) or any query error
          if (menuErr?.code !== '42P01') {
            logger.warn({ menuErr, branchId }, 'Failed to fetch menu cake items; falling back to predefined only');
          }
        }

        // Merge: predefined first, then menu items (deduplication not needed — different sources)
        const allItems = [...predefinedResult.rows, ...menuCakes];

        return reply.send({
          mode,
          source: menuCakes.length > 0 ? 'merged' : 'predefined',
          items: allItems,
        });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to fetch cake options');
        return reply.status(500).send({ error: 'Failed to fetch cake options' });
      }
    }
  );

  // ── GET /api/v1/branches/:branchId/menu-items ─────────────────────────────
  // Returns available menu items filtered by category (Stage 2 ready).
  // Returns empty array gracefully if menu_items table has no data.
  // Requirements: 27.3
  fastify.get<{ Params: BranchParams; Querystring: MenuItemsQuery }>(
    '/api/v1/branches/:branchId/menu-items',
    async (
      request: FastifyRequest<{ Params: BranchParams; Querystring: MenuItemsQuery }>,
      reply: FastifyReply
    ) => {
      const contextBranchId = request.branchContext?.branchId;
      const { branchId } = request.params;
      const { category } = request.query as MenuItemsQuery;

      if (!contextBranchId || contextBranchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const db = getDatabase();

        // Build query
        const params: any[] = [branchId];
        let sql = `
          SELECT i.id, i.name, i.description, i.price, i.image_url, i.ingredients, i.allergens, s.section_type as category
          FROM menu_items i
          JOIN menu_sections s ON i.section_id = s.id
          WHERE s.branch_id = $1 AND i.is_available = true`;

        if (category) {
          const normalizedCategory = category.toLowerCase() === 'cake' ? 'cakes' : category;
          params.push(normalizedCategory);
          sql += ` AND s.section_type = $${params.length}`;
        }

        sql += ` ORDER BY i.name ASC`;

        const result = await db.query(sql, params);
        return reply.send(result.rows);
      } catch (err: any) {
        // If the table doesn't exist yet (dormant Stage 2), return empty array
        if (err?.code === '42P01') {
          return reply.send([]);
        }
        logger.error({ err, branchId, category }, 'Failed to fetch menu items');
        return reply.status(500).send({ error: 'Failed to fetch menu items' });
      }
    }
  );

  // ── GET /api/v1/branches/:branchId/menu-items/:itemId ────────────────────
  // Returns full details of a specific menu item.
  // Requirements: 27.4
  fastify.get<{ Params: MenuItemParams }>(
    '/api/v1/branches/:branchId/menu-items/:itemId',
    async (request: FastifyRequest<{ Params: MenuItemParams }>, reply: FastifyReply) => {
      const contextBranchId = request.branchContext?.branchId;
      const { branchId, itemId } = request.params;

      if (!contextBranchId || contextBranchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const result = await query(
          `SELECT i.id, i.name, i.description, i.price, i.image_url, i.ingredients, i.allergens, s.section_type as category, i.is_available
           FROM menu_items i
           JOIN menu_sections s ON i.section_id = s.id
           WHERE i.id = $1 AND s.branch_id = $2`,
          [itemId, branchId]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Menu item not found' });
        }

        return reply.send(result.rows[0]);
      } catch (err: any) {
        // If the table doesn't exist yet (dormant Stage 2), return 404
        if (err?.code === '42P01') {
          return reply.status(404).send({ error: 'Menu item not found' });
        }
        logger.error({ err, branchId, itemId }, 'Failed to fetch menu item');
        return reply.status(500).send({ error: 'Failed to fetch menu item' });
      }
    }
  );
}

export default cakeRoutes;
