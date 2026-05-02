import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MenuService, CreateMenuSectionData, CreateMenuItemData, UpdateMenuItemData } from '../services/menu.service.js';
import { logger } from '../config/logger.js';

interface BranchParams {
  id: string;
}

interface SectionParams extends BranchParams {
  sectionId: string;
}

interface ItemParams extends BranchParams {
  itemId: string;
}

export async function menuRoutes(fastify: FastifyInstance) {
  // ── PUBLIC / STAFF ROUTES ──────────────────────────────────────────────────

  // GET /api/v1/branches/:id/menu-sections
  fastify.get<{ Params: BranchParams }>(
    '/api/v1/branches/:id/menu-sections',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.params.id;
      try {
        const sections = await MenuService.getSections(branchId);
        return reply.send(sections);
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to get menu sections');
        return reply.status(500).send({ error: 'Failed to get menu' });
      }
    }
  );

  // ── ADMIN ROUTES ────────────────────────────────────────────────────────────

  // POST /api/admin/v1/branches/:id/menu-sections
  fastify.post<{ Params: BranchParams; Body: CreateMenuSectionData }>(
    '/api/admin/v1/branches/:id/menu-sections',
    async (request: FastifyRequest<{ Params: BranchParams; Body: CreateMenuSectionData }>, reply: FastifyReply) => {
      const branchId = request.params.id;
      const body = request.body;

      if (!body.name) {
        return reply.status(422).send({ error: 'Name is required' });
      }

      try {
        const section = await MenuService.createSection(branchId, body);
        return reply.status(201).send(section);
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to create menu section');
        return reply.status(500).send({ error: 'Failed to create section' });
      }
    }
  );

  // PATCH /api/admin/v1/branches/:id/menu-sections/:sectionId
  fastify.patch<{ Params: SectionParams; Body: any }>(
    '/api/admin/v1/branches/:id/menu-sections/:sectionId',
    async (request: FastifyRequest<{ Params: SectionParams; Body: any }>, reply: FastifyReply) => {
      const { id: branchId, sectionId } = request.params;
      try {
        const section = await MenuService.updateSection(branchId, sectionId, request.body);
        if (!section) return reply.status(404).send({ error: 'Section not found' });
        return reply.send(section);
      } catch (err: any) {
        logger.error({ err, branchId, sectionId }, 'Failed to update menu section');
        return reply.status(500).send({ error: 'Failed to update section' });
      }
    }
  );

  // DELETE /api/admin/v1/branches/:id/menu-sections/:sectionId
  fastify.delete<{ Params: SectionParams }>(
    '/api/admin/v1/branches/:id/menu-sections/:sectionId',
    async (request: FastifyRequest<{ Params: SectionParams }>, reply: FastifyReply) => {
      const { id: branchId, sectionId } = request.params;
      try {
        await MenuService.deleteSection(branchId, sectionId);
        return reply.status(204).send();
      } catch (err: any) {
        logger.error({ err, branchId, sectionId }, 'Failed to delete menu section');
        return reply.status(500).send({ error: 'Failed to delete section' });
      }
    }
  );

  // POST /api/admin/v1/branches/:id/menu-items
  fastify.post<{ Params: BranchParams; Body: CreateMenuItemData }>(
    '/api/admin/v1/branches/:id/menu-items',
    async (request: FastifyRequest<{ Params: BranchParams; Body: CreateMenuItemData }>, reply: FastifyReply) => {
      const branchId = request.params.id;
      const body = request.body;

      if (!body.section_id || !body.name || body.price == null) {
        return reply.status(422).send({ error: 'section_id, name, and price are required' });
      }

      try {
        const item = await MenuService.createItem(branchId, body);
        return reply.status(201).send(item);
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to create menu item');
        return reply.status(500).send({ error: err.message || 'Failed to create item' });
      }
    }
  );

  // PATCH /api/admin/v1/branches/:id/menu-items/:itemId
  fastify.patch<{ Params: ItemParams; Body: UpdateMenuItemData }>(
    '/api/admin/v1/branches/:id/menu-items/:itemId',
    async (request: FastifyRequest<{ Params: ItemParams; Body: UpdateMenuItemData }>, reply: FastifyReply) => {
      const { id: branchId, itemId } = request.params;
      try {
        const item = await MenuService.updateItem(branchId, itemId, request.body);
        if (!item) return reply.status(404).send({ error: 'Item not found' });
        return reply.send(item);
      } catch (err: any) {
        logger.error({ err, branchId, itemId }, 'Failed to update menu item');
        return reply.status(500).send({ error: err.message || 'Failed to update item' });
      }
    }
  );

  // DELETE /api/admin/v1/branches/:id/menu-items/:itemId
  fastify.delete<{ Params: ItemParams }>(
    '/api/admin/v1/branches/:id/menu-items/:itemId',
    async (request: FastifyRequest<{ Params: ItemParams }>, reply: FastifyReply) => {
      const { id: branchId, itemId } = request.params;
      try {
        await MenuService.deleteItem(branchId, itemId);
        return reply.status(204).send();
      } catch (err: any) {
        logger.error({ err, branchId, itemId }, 'Failed to delete menu item');
        return reply.status(500).send({ error: err.message || 'Failed to delete item' });
      }
    }
  );
  // POST /api/admin/v1/branches/:id/menu/initialize-defaults
  fastify.post<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/menu/initialize-defaults',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.params.id;
      logger.info({ branchId, url: request.url }, 'Initializing default menu');
      try {
        await MenuService.initializeDefaultMenu(branchId);
        return reply.status(200).send({ success: true });
      } catch (err: any) {
        logger.error({ err, branchId }, 'Failed to initialize default menu');
        return reply.status(500).send({ error: 'Failed to initialize default menu', message: err.message });
      }
    }
  );
}
