/**
 * Admin Customer Management Routes
 *
 * GET    /api/admin/v1/branches/:id/customers/registered          — list registered customers
 * GET    /api/admin/v1/branches/:id/customers/one-time            — list one-time customers
 * POST   /api/admin/v1/branches/:id/customers/one-time            — create one-time customer
 * DELETE /api/admin/v1/branches/:id/customers/:customerId         — delete customer (admin only)
 *
 * Handles customer management for both registered and one-time (instant booking) customers.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../../config/database.js';
import { AuditService } from '../../services/audit.service.js';
import { logger } from '../../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchParams {
  id: string;
}

interface CustomerParams {
  id: string;
  customerId: string;
}

interface CreateOneTimeCustomerBody {
  name: string;
  email: string;
  phone: string;
}

interface RegisteredCustomer {
  id: string;
  email: string;
  name: string;
  phone: string;
  loyalty_points: number;
  total_reservations: number;
  created_at: string;
}

interface OneTimeCustomer {
  id: string;
  email: string;
  name: string;
  phone: string;
  last_booking_date: string | null;
  booking_count: number;
  created_at: string;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerAdminCustomerRoutes(fastify: FastifyInstance) {
  // ── GET /api/admin/v1/branches/:id/customers/registered ────────────────────
  /**
   * List all registered customers for a branch.
   * Returns customer profiles with reservation count.
   */
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/customers/registered',
    async (
      request: FastifyRequest<{ Params: BranchParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId ?? request.params.id;
      if (!branchId) {
        return reply.status(400).send({ error: 'Branch context missing' });
      }
      const db = getDatabase();

      try {
        // Get registered customers (those with email)
        const result = await db.query<RegisteredCustomer>(
          `SELECT
            c.id,
            c.email,
            c.name,
            c.phone,
            0 as loyalty_points,
            COUNT(r.id) as total_reservations,
            c.created_at
          FROM customers c
          LEFT JOIN reservations r ON r.customer_id = c.id AND r.branch_id = $1
          WHERE c.branch_id = $1 AND c.email IS NOT NULL
          GROUP BY c.id, c.email, c.name, c.phone, c.created_at
          ORDER BY c.email ASC`,
          [branchId]
        );

        return reply.status(200).send({
          customers: result.rows.map((row) => ({
            id: row.id,
            email: row.email,
            name: row.name,
            phone: row.phone,
            loyalty_points: 0,
            total_reservations: Number(row.total_reservations),
            created_at: row.created_at,
          })),
        });
      } catch (err) {
        logger.error(err, 'Failed to list registered customers');
        return reply.status(500).send({ error: 'Failed to list customers' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id/customers/one-time ──────────────────────
  /**
   * List all one-time customers (instant booking without registration).
   * Email is the primary key for one-time customers.
   */
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/customers/one-time',
    async (
      request: FastifyRequest<{ Params: BranchParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId ?? request.params.id;
      if (!branchId) {
        return reply.status(400).send({ error: 'Branch context missing' });
      }
      const db = getDatabase();

      try {
        // Get one-time customers (marked or inferred from booking pattern)
        // For now, we query customers without a registered account or with guest flag
        const result = await db.query<OneTimeCustomer>(
          `SELECT
            c.id,
            c.email,
            c.name,
            c.phone,
            MAX(r.reservation_time) as last_booking_date,
            COUNT(r.id) as booking_count,
            c.created_at
          FROM customers c
          LEFT JOIN reservations r ON r.customer_id = c.id AND r.branch_id = $1
          WHERE c.branch_id = $1
          GROUP BY c.id, c.email, c.name, c.phone, c.created_at
          ORDER BY c.email ASC`,
          [branchId]
        );

        return reply.status(200).send({
          customers: result.rows.map((row) => ({
            id: row.id,
            email: row.email,
            name: row.name,
            phone: row.phone,
            last_booking_date: row.last_booking_date,
            booking_count: Number(row.booking_count),
            created_at: row.created_at,
          })),
        });
      } catch (err) {
        logger.error(err, 'Failed to list one-time customers');
        return reply.status(500).send({ error: 'Failed to list customers' });
      }
    }
  );

  // ── POST /api/admin/v1/branches/:id/customers/one-time ───────────────────────
  /**
   * Create a one-time customer for instant booking without registration.
   * Email is the primary key - if customer with same email exists, update it.
   */
  fastify.post<{ Params: BranchParams; Body: CreateOneTimeCustomerBody }>(
    '/api/admin/v1/branches/:id/customers/one-time',
    async (
      request: FastifyRequest<{ Params: BranchParams; Body: CreateOneTimeCustomerBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId ?? request.params.id;
      if (!branchId) {
        return reply.status(400).send({ error: 'Branch context missing' });
      }
      const { name, email, phone } = request.body;

      // Validate input
      if (!name || !name.trim()) {
        return reply.status(400).send({ error: 'Name is required' });
      }
      if (!email || !email.trim()) {
        return reply.status(400).send({ error: 'Email is required' });
      }
      if (!phone || !phone.trim()) {
        return reply.status(400).send({ error: 'Phone is required' });
      }

      const db = getDatabase();

      try {
        // Check if customer with this email already exists
        const existingResult = await db.query(
          'SELECT id FROM customers WHERE branch_id = $1 AND email = $2',
          [branchId, email.trim().toLowerCase()]
        );

        if (existingResult.rows.length > 0) {
          // Update existing customer
          const customerId = existingResult.rows[0].id;
          await db.query(
            `UPDATE customers
            SET name = $1, phone = $2, updated_at = NOW()
            WHERE id = $3 AND branch_id = $4`,
            [name.trim(), phone.trim(), customerId, branchId]
          );

          logger.info('Updated one-time customer', { customerId, branchId });
          return reply.status(200).send({
            id: customerId,
            message: 'Customer updated',
          });
        }

        // Create new customer
        const insertResult = await db.query(
          `INSERT INTO customers (branch_id, name, email, phone, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          RETURNING id`,
          [branchId, name.trim(), email.trim().toLowerCase(), phone.trim()]
        );

        const customerId = insertResult.rows[0].id;
        logger.info('Created one-time customer', { customerId, branchId });

        return reply.status(201).send({
          id: customerId,
          name,
          email: email.trim().toLowerCase(),
          phone,
          message: 'Customer created',
        });
      } catch (err) {
        logger.error(err, 'Failed to create one-time customer');
        if ((err as any).code === '23505') {
          // Unique constraint violation
          return reply.status(400).send({ error: 'Customer with this email already exists' });
        }
        return reply.status(500).send({ error: 'Failed to create customer' });
      }
    }
  );

  // ── DELETE /api/admin/v1/branches/:id/customers/:customerId ──────────────────
  /**
   * Permanently delete a customer (admin only).
   * Blocked if the customer has active (confirmed/seated) reservations.
   * All other linked records are removed via ON DELETE CASCADE.
   */
  fastify.delete<{ Params: CustomerParams }>(
    '/api/admin/v1/branches/:id/customers/:customerId',
    async (
      request: FastifyRequest<{ Params: CustomerParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId ?? request.params.id;
      if (!branchId) {
        return reply.status(400).send({ error: 'Branch context missing' });
      }

      const role = (request as any).staffContext?.role;
      const staffId = (request as any).staffContext?.staffId;
      if (!staffId || role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const { customerId } = request.params;
      const db = getDatabase();

      try {
        // Verify customer exists and belongs to this branch
        const customerResult = await db.query<{ id: string; name: string; email: string }>(
          `SELECT id, name, email FROM customers WHERE id = $1 AND branch_id = $2`,
          [customerId, branchId]
        );
        if (customerResult.rows.length === 0) {
          return reply.status(404).send({ error: 'Customer not found' });
        }
        const customer = customerResult.rows[0];

        // Block deletion if there are active reservations
        const activeResult = await db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM reservations
           WHERE customer_id = $1 AND branch_id = $2 AND status IN ('confirmed', 'seated')`,
          [customerId, branchId]
        );
        const activeCount = Number(activeResult.rows[0].count);
        if (activeCount > 0) {
          return reply.status(409).send({
            error: `Cannot delete customer with ${activeCount} active reservation${activeCount !== 1 ? 's' : ''}. Cancel or complete them first.`,
            code: 'CUSTOMER_HAS_ACTIVE_RESERVATIONS',
            active_reservations: activeCount,
          });
        }

        // Delete customer — ON DELETE CASCADE removes reservations, orders, invoices
        await db.query(`DELETE FROM customers WHERE id = $1 AND branch_id = $2`, [customerId, branchId]);

        await AuditService.log({
          branchId,
          actorId: staffId,
          action: 'DELETE_CUSTOMER',
          entityType: 'customer',
          entityId: customerId,
          newValue: { name: customer.name, email: customer.email },
          ipAddress: request.ip,
        });

        logger.info({ branchId, customerId, staffId }, 'Customer deleted by admin');

        return reply.status(204).send();
      } catch (err) {
        logger.error(err, 'Failed to delete customer');
        return reply.status(500).send({ error: 'Failed to delete customer' });
      }
    }
  );
}
