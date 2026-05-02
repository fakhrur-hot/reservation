/**
 * Admin Staff Routes
 *
 * POST  /api/admin/v1/branches/:id/staff        — create staff account (Admin)
 * PATCH /api/admin/v1/branches/:id/staff/:staffId — edit / deactivate staff (Admin)
 *
 * Requirements: 12.2, 12.9, 12.13
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { getDatabase } from '../../config/database.js';
import { AuditService } from '../../services/audit.service.js';
import { logger } from '../../config/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const BCRYPT_COST = 12;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchParams {
  id: string;
}

interface StaffParams extends BranchParams {
  staffId: string;
}

interface CreateStaffBody {
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'waiter';
  password: string;
}

interface UpdateStaffBody {
  name?: string;
  role?: 'admin' | 'manager' | 'waiter';
  password?: string;
  is_active?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_ROLES = ['admin', 'manager', 'waiter'] as const;

function isValidRole(r: string): r is 'admin' | 'manager' | 'waiter' {
  return (VALID_ROLES as readonly string[]).includes(r);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function staffRoutes(fastify: FastifyInstance) {
  // ── GET /api/admin/v1/branches/:id/staff ──────────────────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/staff',
    async (
      request: FastifyRequest<{ Params: BranchParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.params.id;

      // Branch context guard
      if (!request.branchContext || request.branchContext.branchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const db = getDatabase();

      try {
        const result = await db.query(
          `SELECT id, email, name, role, is_active, created_at
           FROM staff
           WHERE branch_id = $1
           ORDER BY created_at DESC`,
          [branchId]
        );

        return reply.status(200).send({
          staff: result.rows.map((row) => ({
            id: row.id,
            email: row.email,
            name: row.name,
            role: row.role,
            is_active: row.is_active,
            created_at: row.created_at,
          })),
        });
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to list staff');
        return reply.status(500).send({ error: 'Failed to list staff' });
      }
    }
  );

  // ── POST /api/admin/v1/branches/:id/staff ─────────────────────────────────
  fastify.post<{ Params: BranchParams; Body: CreateStaffBody }>(
    '/api/admin/v1/branches/:id/staff',
    async (
      request: FastifyRequest<{ Params: BranchParams; Body: CreateStaffBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.params.id;

      // Branch context guard
      if (!request.branchContext || request.branchContext.branchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      // Admin role guard
      const actorId = request.staffContext?.staffId;
      const role = request.staffContext?.role;
      if (!actorId || role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const { email, name, role: staffRole, password } = request.body ?? {};

      // Validate required fields
      if (!email || typeof email !== 'string') {
        return reply.status(422).send({ error: 'email is required' });
      }
      if (!name || typeof name !== 'string') {
        return reply.status(422).send({ error: 'name is required' });
      }
      if (!staffRole || !isValidRole(staffRole)) {
        return reply.status(422).send({ error: 'role must be one of: admin, manager, waiter' });
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        return reply.status(422).send({ error: 'password must be at least 8 characters' });
      }

      const db = getDatabase();

      try {
        // Hash password — BCrypt cost 12 (Req 12.2)
        const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

        // Insert staff record
        const result = await db.query(
          `INSERT INTO staff (branch_id, email, name, role, password_hash, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, branch_id, email, name, role, is_active, failed_logins, locked_at, created_at, created_by`,
          [branchId, email.toLowerCase().trim(), name.trim(), staffRole, passwordHash, actorId]
        );

        const created = result.rows[0];

        logger.info(
          { branchId, actorId, staffId: created.id, email: created.email, role: staffRole },
          'Staff account created'
        );

        // Audit log (Req 12.13)
        await AuditService.logCreate(
          branchId,
          actorId,
          'staff',
          created.id,
          { email: created.email, name: created.name, role: created.role, branch_id: branchId },
          request.ip
        );

        return reply.status(201).send(created);
      } catch (err: any) {
        // Unique constraint on email (Req 12.9 — 409 on duplicate)
        if (err.code === '23505' && err.constraint?.includes('email')) {
          return reply.status(409).send({ error: 'Email already exists' });
        }
        logger.error({ err, branchId, actorId }, 'Failed to create staff account');
        return reply.status(500).send({ error: 'Failed to create staff account' });
      }
    }
  );

  // ── PATCH /api/admin/v1/branches/:id/staff/:staffId ───────────────────────
  fastify.patch<{ Params: StaffParams; Body: UpdateStaffBody }>(
    '/api/admin/v1/branches/:id/staff/:staffId',
    async (
      request: FastifyRequest<{ Params: StaffParams; Body: UpdateStaffBody }>,
      reply: FastifyReply
    ) => {
      const { id: branchId, staffId } = request.params;

      // Branch context guard
      if (!request.branchContext || request.branchContext.branchId !== branchId) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      // Admin role guard
      const actorId = request.staffContext?.staffId;
      const actorRole = request.staffContext?.role;
      if (!actorId || actorRole !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const body = request.body ?? {};

      // Validate optional fields if provided
      if (body.role !== undefined && !isValidRole(body.role)) {
        return reply.status(422).send({ error: 'role must be one of: admin, manager, waiter' });
      }
      if (body.password !== undefined && (typeof body.password !== 'string' || body.password.length < 8)) {
        return reply.status(422).send({ error: 'password must be at least 8 characters' });
      }
      if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
        return reply.status(422).send({ error: 'is_active must be a boolean' });
      }

      const db = getDatabase();

      // Fetch existing staff (must belong to same branch)
      const existing = await db.query(
        'SELECT id, branch_id, email, name, role, is_active, password_hash FROM staff WHERE id = $1 AND branch_id = $2',
        [staffId, branchId]
      );

      if (existing.rowCount === 0) {
        return reply.status(404).send({ error: 'Staff member not found' });
      }

      const current = existing.rows[0];

      // Build update fields
      const updates: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      const oldSnapshot: Record<string, any> = {};
      const newSnapshot: Record<string, any> = {};

      if (body.name !== undefined) {
        oldSnapshot.name = current.name;
        newSnapshot.name = body.name.trim();
        updates.push(`name = $${paramIdx++}`);
        values.push(body.name.trim());
      }

      if (body.role !== undefined) {
        oldSnapshot.role = current.role;
        newSnapshot.role = body.role;
        updates.push(`role = $${paramIdx++}`);
        values.push(body.role);
      }

      if (body.is_active !== undefined) {
        oldSnapshot.is_active = current.is_active;
        newSnapshot.is_active = body.is_active;
        updates.push(`is_active = $${paramIdx++}`);
        values.push(body.is_active);
      }

      if (body.password !== undefined) {
        // Re-hash with BCrypt cost 12 (Req 12.2)
        const newHash = await bcrypt.hash(body.password, BCRYPT_COST);
        updates.push(`password_hash = $${paramIdx++}`);
        values.push(newHash);
        newSnapshot.password = '[updated]';
      }

      if (updates.length === 0) {
        return reply.status(422).send({ error: 'No fields to update' });
      }

      // Append WHERE clause params
      values.push(staffId, branchId);
      const whereIdx1 = paramIdx++;
      const whereIdx2 = paramIdx++;

      try {
        const result = await db.query(
          `UPDATE staff SET ${updates.join(', ')}
           WHERE id = $${whereIdx1} AND branch_id = $${whereIdx2}
           RETURNING id, branch_id, email, name, role, is_active, failed_logins, locked_at, created_at, created_by`,
          values
        );

        const updated = result.rows[0];

        logger.info(
          { branchId, actorId, staffId, changes: newSnapshot },
          'Staff account updated'
        );

        // Audit log (Req 12.13)
        await AuditService.logUpdate(
          branchId,
          actorId,
          'staff',
          staffId,
          oldSnapshot,
          newSnapshot,
          request.ip
        );

        return reply.send(updated);
      } catch (err: any) {
        logger.error({ err, branchId, actorId, staffId }, 'Failed to update staff account');
        return reply.status(500).send({ error: 'Failed to update staff account' });
      }
    }
  );
}

export default staffRoutes;
