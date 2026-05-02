/**
 * Table Routes
 *
 * Section and table CRUD endpoints for admin, manager, and public access.
 * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8, 8.6
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TableService, CreateSectionData, CreateTableData, UpdateTableData } from '../services/table.service.js';
import { TableLockService } from '../services/table-lock.service.js';
import { AuditService } from '../services/audit.service.js';
import { WalkInService } from '../services/walk-in.service.js';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// ─── Param / Body types ───────────────────────────────────────────────────────

interface BranchParams {
  id: string; // branch_id
}

interface TableParams {
  id: string;       // branch_id
  tableId: string;
}

interface CreateSectionBody {
  name: string;
  description?: string;
  sort_order?: number;
}

interface CreateTableBody {
  section_id: string;
  name: string;
  capacity: number;
  table_type?: string;
  has_window_view?: boolean;
  is_wheelchair_accessible?: boolean;
  supports_decoration?: boolean;
}

interface UpdateTableBody {
  name?: string;
  capacity?: number;
  table_type?: string;
  has_window_view?: boolean;
  is_wheelchair_accessible?: boolean;
  supports_decoration?: boolean;
  is_active?: boolean;
  section_id?: string;
}

interface LockTableBody {
  sessionId: string;
}

interface LockTableParams {
  id: string;
  tableId: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function tableRoutes(fastify: FastifyInstance) {
  // ── POST /api/admin/v1/branches/:id/sections ─────────────────────────────
  fastify.post<{ Params: BranchParams; Body: CreateSectionBody }>(
    '/api/admin/v1/branches/:id/sections',
    async (request: FastifyRequest<{ Params: BranchParams; Body: CreateSectionBody }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const body = request.body as CreateSectionBody;
      if (!body?.name) {
        return reply.status(422).send({ error: 'name is required' });
      }

      try {
        const data: CreateSectionData = {
          name: body.name,
          description: body.description,
          sort_order: body.sort_order,
        };

        const section = await TableService.createSection(branchId, data);

        await AuditService.logCreate(
          branchId,
          request.staffContext?.staffId,
          'section',
          section.id,
          section,
          request.ip
        );

        logger.info({ branchId, sectionId: section.id, actorId: request.staffContext?.staffId }, 'Section created');
        return reply.status(201).send(section);
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to create section');
        return reply.status(500).send({ error: 'Failed to create section' });
      }
    }
  );

  // ── GET /api/v1/branches/:id/sections ────────────────────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/v1/branches/:id/sections',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const sections = await TableService.listSections(branchId);
        return reply.send(sections);
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to list sections');
        return reply.status(500).send({ error: 'Failed to list sections' });
      }
    }
  );

  // ── POST /api/admin/v1/branches/:id/tables ───────────────────────────────
  fastify.post<{ Params: BranchParams; Body: CreateTableBody }>(
    '/api/admin/v1/branches/:id/tables',
    async (request: FastifyRequest<{ Params: BranchParams; Body: CreateTableBody }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const body = request.body as CreateTableBody;
      if (!body?.name || !body?.section_id || body?.capacity == null) {
        return reply.status(422).send({ error: 'name, section_id, and capacity are required' });
      }
      if (typeof body.capacity !== 'number' || body.capacity < 1) {
        return reply.status(422).send({ error: 'capacity must be a positive integer' });
      }

      try {
        const data: CreateTableData = {
          section_id: body.section_id,
          name: body.name,
          capacity: body.capacity,
          table_type: body.table_type,
          has_window_view: body.has_window_view,
          is_wheelchair_accessible: body.is_wheelchair_accessible,
          supports_decoration: body.supports_decoration,
        };

        const table = await TableService.createTable(branchId, data);

        await AuditService.logCreate(
          branchId,
          request.staffContext?.staffId,
          'table',
          table.id,
          table,
          request.ip
        );

        logger.info({ branchId, tableId: table.id, actorId: request.staffContext?.staffId }, 'Table created');
        return reply.status(201).send(table);
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to create table');
        if (err.code === '23503') {
          // FK violation — section_id not found in this branch
          return reply.status(422).send({ error: 'section_id does not exist for this branch' });
        }
        return reply.status(500).send({ error: 'Failed to create table' });
      }
    }
  );

  // ── PATCH /api/admin/v1/branches/:id/tables/:tableId ─────────────────────
  fastify.patch<{ Params: TableParams; Body: UpdateTableBody }>(
    '/api/admin/v1/branches/:id/tables/:tableId',
    async (request: FastifyRequest<{ Params: TableParams; Body: UpdateTableBody }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { tableId } = request.params;
      const body = request.body as UpdateTableBody;

      if (body?.capacity !== undefined && (typeof body.capacity !== 'number' || body.capacity < 1)) {
        return reply.status(422).send({ error: 'capacity must be a positive integer' });
      }

      try {
        const data: UpdateTableData = {
          name: body.name,
          capacity: body.capacity,
          table_type: body.table_type,
          has_window_view: body.has_window_view,
          is_wheelchair_accessible: body.is_wheelchair_accessible,
          supports_decoration: body.supports_decoration,
          is_active: body.is_active,
          section_id: body.section_id,
        };

        const result = await TableService.updateTable(branchId, tableId, data);

        if (!result) {
          return reply.status(404).send({ error: 'Table not found' });
        }

        await AuditService.logUpdate(
          branchId,
          request.staffContext?.staffId,
          'table',
          tableId,
          result.old,
          result.updated,
          request.ip
        );

        const action = body.is_active === false ? 'deactivated' : 'updated';
        logger.info({ branchId, tableId, actorId: request.staffContext?.staffId, action }, 'Table updated');
        return reply.send(result.updated);
      } catch (err: any) {
        logger.error({ err, branchId, tableId }, 'Failed to update table');
        return reply.status(500).send({ error: 'Failed to update table' });
      }
    }
  );

  // ── GET /api/v1/branches/:id/tables ──────────────────────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/v1/branches/:id/tables',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const tables = await TableService.listActiveTables(branchId);
        return reply.send(tables);
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to list active tables');
        return reply.status(500).send({ error: 'Failed to list tables' });
      }
    }
  );

  // ── GET /api/manager/v1/branches/:id/tables ───────────────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/manager/v1/branches/:id/tables',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const tables = await TableService.listAllTables(branchId);
        return reply.send(tables);
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to list all tables');
        return reply.status(500).send({ error: 'Failed to list tables' });
      }
    }
  );

  // ── POST /api/v1/branches/:id/tables/:tableId/lock ────────────────────────
  // Customer acquires a 30-min Redis lock on a table before booking.
  fastify.post<{ Params: LockTableParams; Body: LockTableBody }>(
    '/api/v1/branches/:id/tables/:tableId/lock',
    async (
      request: FastifyRequest<{ Params: LockTableParams; Body: LockTableBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { tableId } = request.params;
      const { sessionId } = request.body ?? {};

      if (!sessionId) {
        return reply.status(422).send({ error: 'sessionId is required' });
      }

      try {
        const result = await TableLockService.acquireLock(branchId, tableId, sessionId);
        if (result.acquired) {
          return reply.status(200).send({ acquired: true });
        }
        return reply.status(409).send({ acquired: false, alternatives: result.alternatives ?? [] });
      } catch (err: any) {
        logger.error({ err, branchId, tableId }, 'Failed to acquire table lock');
        return reply.status(503).send({ error: 'Lock service unavailable' });
      }
    }
  );

  // ── POST /api/v1/tables/:tableId/clear ──────────────────────────────────
  /**
   * Clear a table (mark as available for walk-ins and new bookings).
   * Staff endpoint - requires authentication.
   * Publishes WebSocket notification to all connected clients in branch.
   * 
   * Requirements: 3.8, 11.4
   */
  fastify.post<{ Params: { tableId: string } }>(
    '/api/v1/tables/:tableId/clear',
    async (
      request: FastifyRequest<{ Params: { tableId: string } }>,
      reply: FastifyReply
    ) => {
      // Verify staff authentication
      if (!request.staffContext?.staffId) {
        logger.warn('Unauthorized attempt to clear table');
        return reply.status(401).send({ error: 'Staff authentication required' });
      }

      const branchId = request.branchContext?.branchId;
      if (!branchId) {
        return reply.status(400).send({ error: 'branchId is required' });
      }

      const { tableId } = request.params;
      if (!tableId) {
        return reply.status(400).send({ error: 'tableId is required' });
      }

      try {
        // Verify table exists and belongs to branch
        const table = await TableService.getTable(branchId, tableId);
        if (!table) {
          return reply.status(404).send({ error: 'Table not found' });
        }

        // 1. Close any open walk-ins for this table
        const db = getDatabase();
        const openWalkIns = await db.query<{ id: string }>(
          `SELECT id FROM walk_ins WHERE table_id = $1 AND branch_id = $2 AND status = 'open'`,
          [tableId, branchId]
        );
        for (const row of openWalkIns.rows) {
          try {
            await WalkInService.closeWalkIn(row.id, branchId, request.staffContext!.staffId, request.ip);
          } catch (closeErr: any) {
            logger.warn({ closeErr, walkInId: row.id }, 'Failed to close walk-in during table clear — continuing');
          }
        }

        // 2. Close any active (confirmed/seated) reservations for this table
        const activeReservations = await db.query<{ id: string }>(
          `SELECT id FROM reservations 
           WHERE table_id = $1 AND branch_id = $2 AND status IN ('confirmed', 'seated')`,
          [tableId, branchId]
        );
        const { ReservationService } = await import('../services/reservation.service.js');
        for (const row of activeReservations.rows) {
          try {
            await ReservationService.closeReservation(branchId, row.id, request.staffContext!.staffId, request.ip);
          } catch (closeErr: any) {
            logger.warn({ closeErr, reservationId: row.id }, 'Failed to close reservation during table clear — continuing');
          }
        }

        // Publish WebSocket notification - table is now available (covers non-walk-in cases)
        const { WebSocketPublisher } = await import('../services/websocket-publisher.service.js');
        await WebSocketPublisher.publishTableStatusChanged(branchId, tableId, 'available');

        // Audit log
        await AuditService.log({
          branchId,
          actorId: request.staffContext.staffId,
          action: 'CLEAR_TABLE',
          entityType: 'table',
          entityId: tableId,
          newValue: {
            tableName: table.name,
            status: 'available',
            timestamp: new Date().toISOString(),
          },
          ipAddress: request.ip,
        });

        logger.info(
          { branchId, tableId, staffId: request.staffContext.staffId },
          'Table cleared'
        );

        return reply.status(200).send({
          success: true,
          message: `Table ${table.name} is now available`,
          tableId,
        });
      } catch (err: any) {
        logger.error({ err, branchId, tableId }, 'Failed to clear table');
        return reply.status(500).send({ error: 'Failed to clear table' });
      }
    }
  );
}

export default tableRoutes;
