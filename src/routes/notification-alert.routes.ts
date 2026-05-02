/**
 * Notification Alert Routes
 *
 * GET  /api/admin/v1/branches/:id/notification-alerts/settings  - Read alert settings (Admin only)
 * PATCH /api/admin/v1/branches/:id/notification-alerts/settings  - Update alert settings (Admin only)
 *
 * Allows admins to customize which notification alerts are enabled
 * and configure the lead time for upcoming seat alerts.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database.js';
import { NotificationAlertService, NotificationAlertSettings } from '../services/notification-alert.service.js';
import { AuditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchParams {
  id: string;
}

interface UpdateAlertSettingsBody {
  reservation_created_enabled?: boolean;
  reservation_cancelled_enabled?: boolean;
  reservation_no_show_enabled?: boolean;
  reservation_upcoming_15min_enabled?: boolean;
  upcoming_seat_lead_time_minutes?: number;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function notificationAlertRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/v1/branches/:id/notification-alerts/settings
   * Read current alert settings
   */
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/notification-alerts/settings',
    async (
      request: FastifyRequest<{ Params: BranchParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      // Only Admin can access
      const role = (request as any).staffContext?.role;
      if (role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      try {
        const db = getDatabase();
        const settings = await NotificationAlertService.getAlertSettings(
          db,
          branchId
        );

        return reply.send({
          branchId,
          notificationAlertSettings: settings,
        });
      } catch (error) {
        logger.error(
          { error, branchId },
          'Failed to get notification alert settings'
        );
        return reply.status(500).send({
          error: 'Failed to get notification alert settings',
        });
      }
    }
  );

  /**
   * PATCH /api/admin/v1/branches/:id/notification-alerts/settings
   * Update alert settings
   */
  fastify.patch<{ Params: BranchParams; Body: UpdateAlertSettingsBody }>(
    '/api/admin/v1/branches/:id/notification-alerts/settings',
    async (
      request: FastifyRequest<{ Params: BranchParams; Body: UpdateAlertSettingsBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      // Only Admin can update
      const role = (request as any).staffContext?.role;
      const staffId = (request as any).staffContext?.staffId;
      if (role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      if (!staffId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const body = request.body as UpdateAlertSettingsBody;

      // Validate incoming fields
      if (body.upcoming_seat_lead_time_minutes !== undefined) {
        if (
          !Number.isInteger(body.upcoming_seat_lead_time_minutes) ||
          body.upcoming_seat_lead_time_minutes < 1 ||
          body.upcoming_seat_lead_time_minutes > 120
        ) {
          return reply.status(422).send({
            error:
              'upcoming_seat_lead_time_minutes must be an integer between 1 and 120',
          });
        }
      }

      // Validate boolean fields
      const boolFields = [
        'reservation_created_enabled',
        'reservation_cancelled_enabled',
        'reservation_no_show_enabled',
        'reservation_upcoming_15min_enabled',
      ];
      for (const field of boolFields) {
        if ((body as Record<string, unknown>)[field] !== undefined) {
          if (
            typeof (body as Record<string, unknown>)[field] !== 'boolean'
          ) {
            return reply.status(422).send({
              error: `${field} must be a boolean`,
            });
          }
        }
      }

      try {
        const db = getDatabase();

        // Get old settings for audit
        const oldSettings = await NotificationAlertService.getAlertSettings(
          db,
          branchId
        );

        // Update settings
        const newSettings = await NotificationAlertService.updateAlertSettings(
          db,
          branchId,
          body
        );

        // Audit log
        await AuditService.logUpdate(
          branchId,
          staffId,
          'notification_alert_settings',
          branchId,
          oldSettings,
          newSettings,
          request.ip
        );

        return reply.send({
          branchId,
          notificationAlertSettings: newSettings,
        });
      } catch (error: any) {
        logger.error(
          { error, branchId, body },
          'Failed to update notification alert settings'
        );
        return reply.status(500).send({
          error: error.message || 'Failed to update notification alert settings',
        });
      }
    }
  );
}
