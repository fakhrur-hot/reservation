/**
 * Order Routes
 *
 * Order CRUD and workflow endpoints for staff and admin.
 * Allows staff to view, edit, and submit orders from the table detail modal.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OrderService, CreateOrderData, CreateOrderItemData, UpdateOrderItemData } from '../services/order.service.js';
import { logger } from '../config/logger.js';

// ─── Param / Body types ───────────────────────────────────────────────────────

interface BranchParams {
  id: string; // branch_id
}

interface OrderParams {
  id: string;       // branch_id
  orderId: string;
}

interface OrderItemParams {
  id: string;       // branch_id
  orderId: string;
  itemId: string;
}

interface GetTableOrderParams {
  id: string;       // branch_id
  tableId: string;
}

interface CreateOrderBody extends CreateOrderData {}

interface CreateOrderItemBody extends CreateOrderItemData {}

interface UpdateOrderItemBody extends UpdateOrderItemData {}

interface SubmitOrderBody {
  staffId: string;
}

interface CompleteOrderBody {
  staffId: string;
}

interface UpdateOrderInstructionsBody {
  special_instructions: string;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function orderRoutes(fastify: FastifyInstance) {
  // ── GET /api/manager/v1/branches/:id/tables/:tableId/order ─────────────
  // Get current open order for a table (with all items)
  fastify.get<{ Params: GetTableOrderParams }>(
    '/api/manager/v1/branches/:id/tables/:tableId/order',
    async (request: FastifyRequest<{ Params: GetTableOrderParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { tableId } = request.params;

      try {
        const order = await OrderService.getTableOpenOrder(branchId, tableId);
        if (!order) {
          return reply.status(404).send({ error: 'No open order for this table' });
        }
        return reply.send(order);
      } catch (err: any) {
        logger.error({ err, branchId, tableId }, 'Failed to get table order');
        return reply.status(500).send({ error: 'Failed to get table order' });
      }
    }
  );

  // ── POST /api/manager/v1/branches/:id/tables/:tableId/order ────────────
  // Create or get open order for a table
  fastify.post<{ Params: GetTableOrderParams; Body: CreateOrderBody }>(
    '/api/manager/v1/branches/:id/tables/:tableId/order',
    async (
      request: FastifyRequest<{ Params: GetTableOrderParams; Body: CreateOrderBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { tableId } = request.params;
      const body = request.body as CreateOrderBody;

      try {
        const { order, created } = await OrderService.getOrCreateOrder(branchId, tableId, body.reservation_id);
        return reply.status(created ? 201 : 200).send(order);
      } catch (err: any) {
        logger.error({ err, branchId, tableId }, 'Failed to create/get order');
        return reply.status(500).send({ error: 'Failed to create/get order' });
      }
    }
  );

  // ── POST /api/manager/v1/branches/:id/orders/:orderId/items ───────────
  // Add item to order
  fastify.post<{ Params: OrderParams; Body: CreateOrderItemBody }>(
    '/api/manager/v1/branches/:id/orders/:orderId/items',
    async (request: FastifyRequest<{ Params: OrderParams; Body: CreateOrderItemBody }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { orderId } = request.params;
      const body = request.body as CreateOrderItemBody;

      if (!body.item_name || body.item_price == null) {
        return reply.status(422).send({ error: 'item_name and item_price are required' });
      }

      try {
        const item = await OrderService.addOrderItem(branchId, orderId, body);
        return reply.status(201).send(item);
      } catch (err: any) {
        logger.error({ err, branchId, orderId }, 'Failed to add order item');
        return reply.status(500).send({ error: err.message || 'Failed to add order item' });
      }
    }
  );

  // ── PATCH /api/manager/v1/branches/:id/orders/:orderId/items/:itemId ──
  // Update order item (quantity, customization, status)
  fastify.patch<{ Params: OrderItemParams; Body: UpdateOrderItemBody }>(
    '/api/manager/v1/branches/:id/orders/:orderId/items/:itemId',
    async (request: FastifyRequest<{ Params: OrderItemParams; Body: UpdateOrderItemBody }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { orderId, itemId } = request.params;
      const body = request.body as UpdateOrderItemBody;

      try {
        const item = await OrderService.updateOrderItem(branchId, orderId, itemId, body);
        return reply.send(item);
      } catch (err: any) {
        logger.error({ err, branchId, orderId, itemId }, 'Failed to update order item');
        return reply.status(500).send({ error: err.message || 'Failed to update order item' });
      }
    }
  );

  // ── DELETE /api/manager/v1/branches/:id/orders/:orderId/items/:itemId ─
  // Remove item from order
  fastify.delete<{ Params: OrderItemParams }>(
    '/api/manager/v1/branches/:id/orders/:orderId/items/:itemId',
    async (request: FastifyRequest<{ Params: OrderItemParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { orderId, itemId } = request.params;

      try {
        await OrderService.removeOrderItem(branchId, orderId, itemId);
        return reply.status(204).send();
      } catch (err: any) {
        logger.error({ err, branchId, orderId, itemId }, 'Failed to remove order item');
        return reply.status(500).send({ error: err.message || 'Failed to remove order item' });
      }
    }
  );

  // ── PATCH /api/manager/v1/branches/:id/orders/:orderId/submit ─────────
  // Submit order to kitchen
  fastify.patch<{ Params: OrderParams; Body: SubmitOrderBody }>(
    '/api/manager/v1/branches/:id/orders/:orderId/submit',
    async (request: FastifyRequest<{ Params: OrderParams; Body: SubmitOrderBody }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { orderId } = request.params;
      const body = request.body as SubmitOrderBody;

      if (!body.staffId) {
        return reply.status(422).send({ error: 'staffId is required' });
      }

      try {
        const order = await OrderService.submitOrder(branchId, orderId, body.staffId);
        logger.info({ branchId, orderId, staffId: body.staffId }, 'Order submitted to kitchen');
        return reply.send(order);
      } catch (err: any) {
        logger.error({ err, branchId, orderId }, 'Failed to submit order');
        return reply.status(500).send({ error: err.message || 'Failed to submit order' });
      }
    }
  );

  // ── PATCH /api/manager/v1/branches/:id/orders/:orderId/complete ───────
  // Complete order (ready for payment)
  fastify.patch<{ Params: OrderParams; Body: CompleteOrderBody }>(
    '/api/manager/v1/branches/:id/orders/:orderId/complete',
    async (request: FastifyRequest<{ Params: OrderParams; Body: CompleteOrderBody }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { orderId } = request.params;
      const body = request.body as CompleteOrderBody;

      if (!body.staffId) {
        return reply.status(422).send({ error: 'staffId is required' });
      }

      try {
        const order = await OrderService.completeOrder(branchId, orderId, body.staffId);
        logger.info({ branchId, orderId, staffId: body.staffId }, 'Order completed, ready for payment');
        return reply.send(order);
      } catch (err: any) {
        logger.error({ err, branchId, orderId }, 'Failed to complete order');
        return reply.status(500).send({ error: err.message || 'Failed to complete order' });
      }
    }
  );

  // ── PATCH /api/manager/v1/branches/:id/orders/:orderId/instructions ───
  // Update order special instructions
  fastify.patch<{ Params: OrderParams; Body: UpdateOrderInstructionsBody }>(
    '/api/manager/v1/branches/:id/orders/:orderId/instructions',
    async (
      request: FastifyRequest<{ Params: OrderParams; Body: UpdateOrderInstructionsBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { orderId } = request.params;
      const body = request.body as UpdateOrderInstructionsBody;

      try {
        const order = await OrderService.updateOrderInstructions(branchId, orderId, body.special_instructions);
        return reply.send(order);
      } catch (err: any) {
        logger.error({ err, branchId, orderId }, 'Failed to update order instructions');
        return reply.status(500).send({ error: err.message || 'Failed to update order instructions' });
      }
    }
  );
}
