import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VendorService } from '../services/vendor.service.js';
import pino from 'pino';

const logger = pino();

export async function vendorRoutes(fastify: FastifyInstance, vendorService: VendorService) {
  /**
   * GET /api/admin/v1/branches/:branchId/vendors
   * Get all vendors for a branch
   */
  fastify.get<{ Params: { branchId: string } }>(
    '/api/admin/v1/branches/:branchId/vendors',
    async (request: FastifyRequest<{ Params: { branchId: string } }>, reply: FastifyReply) => {
      const { branchId } = request.params;

      try {
        const vendors = await vendorService.getVendorsByBranch(branchId);
        return reply.send(vendors);
      } catch (error: any) {
        logger.error({ error, branchId }, 'Failed to fetch vendors');
        return reply.status(500).send({ error: 'Failed to fetch vendors' });
      }
    }
  );

  /**
   * POST /api/admin/v1/branches/:branchId/vendors
   * Create a new vendor
   */
  fastify.post<{ Params: { branchId: string }; Body: any }>(
    '/api/admin/v1/branches/:branchId/vendors',
    async (request: FastifyRequest<{ Params: { branchId: string }; Body: any }>, reply: FastifyReply) => {
      const { branchId } = request.params;
      const body = request.body as any;

      try {
        // Validate required fields
        if (!body.vendorName || !body.merchantId || !body.commissionType || body.commissionValue === undefined) {
          return reply.status(422).send({
            error: 'Missing required fields: vendorName, merchantId, commissionType, commissionValue'
          });
        }

        const vendor = await vendorService.createVendor(branchId, body);
        return reply.status(201).send(vendor);
      } catch (error: any) {
        logger.error({ error, branchId }, 'Failed to create vendor');
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/admin/v1/branches/:branchId/vendors/:vendorId
   * Get vendor profile with menu items
   */
  fastify.get<{ Params: { branchId: string; vendorId: string } }>(
    '/api/admin/v1/branches/:branchId/vendors/:vendorId',
    async (request: FastifyRequest<{ Params: { branchId: string; vendorId: string } }>, reply: FastifyReply) => {
      const { vendorId } = request.params;

      try {
        const profile = await vendorService.getVendorProfile(vendorId);
        return reply.send(profile);
      } catch (error: any) {
        logger.error({ error, vendorId }, 'Failed to fetch vendor profile');
        return reply.status(404).send({ error: 'Vendor not found' });
      }
    }
  );

  /**
   * PATCH /api/admin/v1/branches/:branchId/vendors/:vendorId
   * Update vendor details
   */
  fastify.patch<{ Params: { branchId: string; vendorId: string }; Body: any }>(
    '/api/admin/v1/branches/:branchId/vendors/:vendorId',
    async (request: FastifyRequest<{ Params: { branchId: string; vendorId: string }; Body: any }>, reply: FastifyReply) => {
      const { vendorId } = request.params;
      const body = request.body as any;

      try {
        const vendor = await vendorService.updateVendor(vendorId, body);
        return reply.send(vendor);
      } catch (error: any) {
        logger.error({ error, vendorId }, 'Failed to update vendor');
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * DELETE /api/admin/v1/branches/:branchId/vendors/:vendorId
   * Deactivate a vendor
   */
  fastify.delete<{ Params: { branchId: string; vendorId: string } }>(
    '/api/admin/v1/branches/:branchId/vendors/:vendorId',
    async (request: FastifyRequest<{ Params: { branchId: string; vendorId: string } }>, reply: FastifyReply) => {
      const { vendorId } = request.params;

      try {
        await vendorService.deleteVendor(vendorId);
        return reply.status(204).send();
      } catch (error: any) {
        logger.error({ error, vendorId }, 'Failed to delete vendor');
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * POST /api/admin/v1/branches/:branchId/vendors/:vendorId/menu-items
   * Add a menu item to a vendor
   */
  fastify.post<{ Params: { branchId: string; vendorId: string }; Body: any }>(
    '/api/admin/v1/branches/:branchId/vendors/:vendorId/menu-items',
    async (request: FastifyRequest<{ Params: { branchId: string; vendorId: string }; Body: any }>, reply: FastifyReply) => {
      const { branchId, vendorId } = request.params;
      const body = request.body as any;

      try {
        // Validate required fields
        if (!body.itemName || !body.category || body.cost === undefined) {
          return reply.status(422).send({
            error: 'Missing required fields: itemName, category, cost'
          });
        }

        const menuItem = await vendorService.addMenuItem(vendorId, branchId, body);
        return reply.status(201).send(menuItem);
      } catch (error: any) {
        logger.error({ error, vendorId }, 'Failed to add menu item');
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/admin/v1/branches/:branchId/vendors/:vendorId/menu-items
   * Get all menu items for a vendor
   */
  fastify.get<{ Params: { branchId: string; vendorId: string } }>(
    '/api/admin/v1/branches/:branchId/vendors/:vendorId/menu-items',
    async (request: FastifyRequest<{ Params: { branchId: string; vendorId: string } }>, reply: FastifyReply) => {
      const { vendorId } = request.params;

      try {
        const menuItems = await vendorService.getMenuItemsByVendor(vendorId);
        return reply.send(menuItems);
      } catch (error: any) {
        logger.error({ error, vendorId }, 'Failed to fetch menu items');
        return reply.status(500).send({ error: 'Failed to fetch menu items' });
      }
    }
  );

  /**
   * PATCH /api/admin/v1/branches/:branchId/vendors/:vendorId/menu-items/:itemId
   * Update a menu item
   */
  fastify.patch<{ Params: { branchId: string; vendorId: string; itemId: string }; Body: any }>(
    '/api/admin/v1/branches/:branchId/vendors/:vendorId/menu-items/:itemId',
    async (request: FastifyRequest<{ Params: { branchId: string; vendorId: string; itemId: string }; Body: any }>, reply: FastifyReply) => {
      const { itemId } = request.params;
      const body = request.body as any;

      try {
        const menuItem = await vendorService.updateMenuItem(itemId, body);
        return reply.send(menuItem);
      } catch (error: any) {
        logger.error({ error, itemId }, 'Failed to update menu item');
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * DELETE /api/admin/v1/branches/:branchId/vendors/:vendorId/menu-items/:itemId
   * Delete a menu item
   */
  fastify.delete<{ Params: { branchId: string; vendorId: string; itemId: string } }>(
    '/api/admin/v1/branches/:branchId/vendors/:vendorId/menu-items/:itemId',
    async (request: FastifyRequest<{ Params: { branchId: string; vendorId: string; itemId: string } }>, reply: FastifyReply) => {
      const { itemId } = request.params;

      try {
        await vendorService.deleteMenuItem(itemId);
        return reply.status(204).send();
      } catch (error: any) {
        logger.error({ error, itemId }, 'Failed to delete menu item');
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/admin/v1/branches/:branchId/vendors/:vendorId/commission-history
   * Get commission history for a vendor
   */
  fastify.get<{ Params: { branchId: string; vendorId: string }; Querystring: { limit?: string } }>(
    '/api/admin/v1/branches/:branchId/vendors/:vendorId/commission-history',
    async (request: FastifyRequest<{ Params: { branchId: string; vendorId: string }; Querystring: { limit?: string } }>, reply: FastifyReply) => {
      const { vendorId } = request.params;
      const limit = request.query.limit ? parseInt(request.query.limit) : 100;

      try {
        const history = await vendorService.getCommissionHistory(vendorId, limit);
        return reply.send(history);
      } catch (error: any) {
        logger.error({ error, vendorId }, 'Failed to fetch commission history');
        return reply.status(500).send({ error: 'Failed to fetch commission history' });
      }
    }
  );
}
