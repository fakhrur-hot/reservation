/**
 * Business Hours Routes
 *
 * Admin endpoints for configuring weekly schedules, date overrides,
 * no-show grace period, and modification cutoff per branch.
 * Requirements: 13.1, 13.2, 13.3, 13.5, 13.6, 13.7, 13.8
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BusinessHoursService, UpsertBusinessHoursData, UpsertOverrideData } from '../services/business-hours.service.js';
import { AuditService } from '../services/audit.service.js';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// ─── Param / Body types ───────────────────────────────────────────────────────

interface BranchParams {
  id: string;
}

interface OverrideDateParams {
  id: string;
  date: string; // 'YYYY-MM-DD'
}

/** POST/PATCH /api/admin/v1/branches/:id/business-hours */
interface UpsertScheduleBody {
  /** Array of day configs to upsert */
  schedule: Array<{
    day_of_week: number;
    open_time?: string | null;
    close_time?: string | null;
    is_open?: boolean;
  }>;
}

/** POST/PATCH /api/admin/v1/branches/:id/business-hours/overrides */
interface UpsertOverrideBody {
  override_date: string;
  is_open?: boolean;
  open_time?: string | null;
  close_time?: string | null;
  override_until?: string | null;
}

/** PATCH /api/admin/v1/branches/:id/settings/timing */
interface TimingConfigBody {
  no_show_grace_min?: number;
  mod_cutoff_hours?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidTime(t: unknown): t is string {
  return typeof t === 'string' && TIME_RE.test(t);
}

function isValidDate(d: unknown): d is string {
  return typeof d === 'string' && DATE_RE.test(d);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function businessHoursRoutes(fastify: FastifyInstance) {
  // ── GET /api/admin/v1/branches/:id/business-hours ─────────────────────────
  // Returns the full weekly schedule for a branch.
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/business-hours',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const schedule = await BusinessHoursService.getSchedule(branchId);
        return reply.send({ schedule });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to get business hours schedule');
        return reply.status(500).send({ error: 'Failed to get business hours' });
      }
    }
  );

  // ── POST /api/admin/v1/branches/:id/business-hours ────────────────────────
  // ── PATCH /api/admin/v1/branches/:id/business-hours ───────────────────────
  // Upsert the weekly schedule. Accepts an array of day configs.
  const upsertScheduleHandler = async (
    request: FastifyRequest<{ Params: BranchParams; Body: UpsertScheduleBody }>,
    reply: FastifyReply
  ) => {
    const branchId = request.branchContext?.branchId;
    if (!branchId || branchId !== request.params.id) {
      return reply.status(403).send({ error: 'Branch context mismatch' });
    }

    const body = request.body as UpsertScheduleBody;
    if (!Array.isArray(body?.schedule) || body.schedule.length === 0) {
      return reply.status(422).send({ error: 'schedule array is required and must not be empty' });
    }

    // Validate each day entry
    for (const day of body.schedule) {
      if (typeof day.day_of_week !== 'number' || day.day_of_week < 0 || day.day_of_week > 6) {
        return reply.status(422).send({ error: 'day_of_week must be an integer 0–6 (0=Sunday)' });
      }
      if (day.open_time != null && !isValidTime(day.open_time)) {
        return reply.status(422).send({ error: `Invalid open_time format for day ${day.day_of_week}. Use HH:MM or HH:MM:SS` });
      }
      if (day.close_time != null && !isValidTime(day.close_time)) {
        return reply.status(422).send({ error: `Invalid close_time format for day ${day.day_of_week}. Use HH:MM or HH:MM:SS` });
      }
      if (day.is_open && (!day.open_time || !day.close_time)) {
        return reply.status(422).send({
          error: `Day ${day.day_of_week}: open_time and close_time are required when is_open is true`,
        });
      }
    }

    try {
      // Fetch old schedule for audit
      const oldSchedule = await BusinessHoursService.getSchedule(branchId);

      const days: UpsertBusinessHoursData[] = body.schedule.map((d) => ({
        day_of_week: d.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        open_time: d.open_time,
        close_time: d.close_time,
        is_open: d.is_open ?? false,
      }));

      const updated = await BusinessHoursService.upsertSchedule(branchId, days);

      await AuditService.logUpdate(
        branchId,
        request.staffContext?.staffId,
        'business_hours',
        branchId,
        { schedule: oldSchedule },
        { schedule: updated },
        request.ip
      );

      logger.info(
        { branchId, actorId: request.staffContext?.staffId, daysUpdated: updated.length },
        'Business hours schedule updated'
      );

      return reply.send({ schedule: updated });
    } catch (err) {
      logger.error({ err, branchId }, 'Failed to upsert business hours schedule');
      return reply.status(500).send({ error: 'Failed to update business hours' });
    }
  };

  fastify.post<{ Params: BranchParams; Body: UpsertScheduleBody }>(
    '/api/admin/v1/branches/:id/business-hours',
    upsertScheduleHandler
  );

  fastify.patch<{ Params: BranchParams; Body: UpsertScheduleBody }>(
    '/api/admin/v1/branches/:id/business-hours',
    upsertScheduleHandler
  );

  // ── GET /api/admin/v1/branches/:id/business-hours/overrides ──────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/business-hours/overrides',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const overrides = await BusinessHoursService.listOverrides(branchId);
        return reply.send({ overrides });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to list business hours overrides');
        return reply.status(500).send({ error: 'Failed to get overrides' });
      }
    }
  );

  // ── POST /api/admin/v1/branches/:id/business-hours/overrides ─────────────
  // ── PATCH /api/admin/v1/branches/:id/business-hours/overrides ────────────
  // Upsert a date-specific override (holiday or manual open/close).
  const upsertOverrideHandler = async (
    request: FastifyRequest<{ Params: BranchParams; Body: UpsertOverrideBody }>,
    reply: FastifyReply
  ) => {
    const branchId = request.branchContext?.branchId;
    if (!branchId || branchId !== request.params.id) {
      return reply.status(403).send({ error: 'Branch context mismatch' });
    }

    const body = request.body as UpsertOverrideBody;

    if (!isValidDate(body?.override_date)) {
      return reply.status(422).send({ error: 'override_date is required in YYYY-MM-DD format' });
    }
    if (body.open_time != null && !isValidTime(body.open_time)) {
      return reply.status(422).send({ error: 'Invalid open_time format. Use HH:MM or HH:MM:SS' });
    }
    if (body.close_time != null && !isValidTime(body.close_time)) {
      return reply.status(422).send({ error: 'Invalid close_time format. Use HH:MM or HH:MM:SS' });
    }
    if (body.is_open === true && (!body.open_time || !body.close_time)) {
      return reply.status(422).send({ error: 'open_time and close_time are required when is_open is true' });
    }

    try {
      const data: UpsertOverrideData = {
        override_date: body.override_date,
        is_open: body.is_open ?? false,
        open_time: body.open_time ?? null,
        close_time: body.close_time ?? null,
        override_until: body.override_until ?? null,
      };

      const override = await BusinessHoursService.upsertOverride(branchId, data);

      await AuditService.logCreate(
        branchId,
        request.staffContext?.staffId,
        'business_hours_override',
        override.id,
        override,
        request.ip
      );

      logger.info(
        { branchId, actorId: request.staffContext?.staffId, override_date: body.override_date },
        'Business hours override upserted'
      );

      return reply.send(override);
    } catch (err) {
      logger.error({ err, branchId }, 'Failed to upsert business hours override');
      return reply.status(500).send({ error: 'Failed to update override' });
    }
  };

  fastify.post<{ Params: BranchParams; Body: UpsertOverrideBody }>(
    '/api/admin/v1/branches/:id/business-hours/overrides',
    upsertOverrideHandler
  );

  fastify.patch<{ Params: BranchParams; Body: UpsertOverrideBody }>(
    '/api/admin/v1/branches/:id/business-hours/overrides',
    upsertOverrideHandler
  );

  // ── DELETE /api/admin/v1/branches/:id/business-hours/overrides/:date ──────
  fastify.delete<{ Params: OverrideDateParams }>(
    '/api/admin/v1/branches/:id/business-hours/overrides/:date',
    async (request: FastifyRequest<{ Params: OverrideDateParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const { date } = request.params;
      if (!isValidDate(date)) {
        return reply.status(422).send({ error: 'date param must be in YYYY-MM-DD format' });
      }

      try {
        const deleted = await BusinessHoursService.deleteOverride(branchId, date);
        if (!deleted) {
          return reply.status(404).send({ error: 'Override not found' });
        }

        await AuditService.logDelete(
          branchId,
          request.staffContext?.staffId,
          'business_hours_override',
          `${branchId}:${date}`,
          { override_date: date },
          request.ip
        );

        logger.info(
          { branchId, actorId: request.staffContext?.staffId, date },
          'Business hours override deleted'
        );

        return reply.status(204).send();
      } catch (err) {
        logger.error({ err, branchId, date }, 'Failed to delete business hours override');
        return reply.status(500).send({ error: 'Failed to delete override' });
      }
    }
  );

  // ── GET /api/v1/branches/:id/open-status ─────────────────────────────────
  // Public endpoint: derive current Open_Status (override wins over schedule).
  fastify.get<{ Params: BranchParams }>(
    '/api/v1/branches/:id/open-status',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const status = await BusinessHoursService.getOpenStatus(branchId);
        return reply.send(status);
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to derive open status');
        return reply.status(500).send({ error: 'Failed to get open status' });
      }
    }
  );

  // ── GET /api/v1/branches/:id/business-hours ───────────────────────────────
  // Public endpoint for customer portal to get schedule + overrides
  fastify.get<{ Params: BranchParams }>(
    '/api/v1/branches/:id/business-hours',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const db = getDatabase();
        const [schedule, overrides, settingsResult] = await Promise.all([
          BusinessHoursService.getSchedule(branchId),
          BusinessHoursService.listOverrides(branchId),
          db.query(
            `SELECT booking_deposit_amt, decoration_package_price, cake_deposit_amt, cake_deposit_type
             FROM branches WHERE id = $1`,
            [branchId]
          ),
        ]);

        const settings = settingsResult.rows[0] || {};

        return reply.send({
          schedule,
          overrides,
          settings: {
            bookingDepositAmt: Number(settings.booking_deposit_amt || 0),
            decorationPackagePrice: Number(settings.decoration_package_price || 0),
            cakeDepositAmt: Number(settings.cake_deposit_amt || 0),
            cakeDepositType: settings.cake_deposit_type || 'fixed',
          },
        });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to get public business hours');
        return reply.status(500).send({ error: 'Failed to get business hours' });
      }
    }
  );

  // ── PATCH /api/admin/v1/branches/:id/settings/timing ─────────────────────
  // Configure no-show grace period and modification cutoff per branch.
  fastify.patch<{ Params: BranchParams; Body: TimingConfigBody }>(
    '/api/admin/v1/branches/:id/settings/timing',
    async (request: FastifyRequest<{ Params: BranchParams; Body: TimingConfigBody }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const body = request.body as TimingConfigBody;

      if (body.no_show_grace_min !== undefined) {
        if (typeof body.no_show_grace_min !== 'number' || body.no_show_grace_min < 0) {
          return reply.status(422).send({ error: 'no_show_grace_min must be a non-negative integer' });
        }
      }
      if (body.mod_cutoff_hours !== undefined) {
        if (typeof body.mod_cutoff_hours !== 'number' || body.mod_cutoff_hours < 0) {
          return reply.status(422).send({ error: 'mod_cutoff_hours must be a non-negative integer' });
        }
      }
      if (body.no_show_grace_min === undefined && body.mod_cutoff_hours === undefined) {
        return reply.status(422).send({ error: 'At least one of no_show_grace_min or mod_cutoff_hours is required' });
      }

      try {
        const oldConfig = await BusinessHoursService.getTimingConfig(branchId);
        const updated = await BusinessHoursService.updateTimingConfig(branchId, {
          no_show_grace_min: body.no_show_grace_min,
          mod_cutoff_hours: body.mod_cutoff_hours,
        });

        await AuditService.logUpdate(
          branchId,
          request.staffContext?.staffId,
          'branch_timing_config',
          branchId,
          oldConfig,
          updated,
          request.ip
        );

        logger.info(
          { branchId, actorId: request.staffContext?.staffId, updated },
          'Branch timing config updated'
        );

        return reply.send(updated);
      } catch (err: any) {
        if (err.message?.includes('not found')) {
          return reply.status(404).send({ error: 'Branch not found' });
        }
        logger.error({ err, branchId }, 'Failed to update timing config');
        return reply.status(500).send({ error: 'Failed to update timing config' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id/settings/timing ───────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/settings/timing',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const config = await BusinessHoursService.getTimingConfig(branchId);
        return reply.send(config);
      } catch (err: any) {
        if (err.message?.includes('not found')) {
          return reply.status(404).send({ error: 'Branch not found' });
        }
        logger.error({ err, branchId }, 'Failed to get timing config');
        return reply.status(500).send({ error: 'Failed to get timing config' });
      }
    }
  );
  // ── GET /api/admin/v1/branches/:id/holiday-settings ─────────────────────────
  // Returns saved country/region preference and all public-holiday overrides.
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/holiday-settings',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      try {
        const db = getDatabase();
        const [branchRow, overrides] = await Promise.all([
          db.query<{ holiday_country_code: string | null; holiday_region_code: string | null }>(
            `SELECT holiday_country_code, holiday_region_code FROM branches WHERE id = $1`,
            [branchId]
          ),
          db.query<{ override_date: string; is_open: boolean; holiday_name: string | null }>(
            `SELECT override_date, is_open, holiday_name
             FROM business_hours_overrides
             WHERE branch_id = $1 AND is_public_holiday = true
             ORDER BY override_date ASC`,
            [branchId]
          ),
        ]);
        return reply.send({
          countryCode: branchRow.rows[0]?.holiday_country_code ?? null,
          regionCode: branchRow.rows[0]?.holiday_region_code ?? null,
          savedHolidays: overrides.rows,
        });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to get holiday settings');
        return reply.status(500).send({ error: 'Failed to get holiday settings' });
      }
    }
  );

  // ── POST /api/admin/v1/branches/:id/holiday-settings ────────────────────────
  // Bulk-save public holiday open/closed overrides and store country/region preference.
  fastify.post<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/holiday-settings',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      if (!request.staffContext?.staffId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const body = request.body as {
        countryCode?: string;
        regionCode?: string | null;
        holidays: Array<{ date: string; is_open: boolean; name: string }>;
      };

      if (!Array.isArray(body?.holidays)) {
        return reply.status(422).send({ error: 'holidays array is required' });
      }

      const db = getDatabase();
      try {
        // Persist country/region preference on the branch
        await db.query(
          `UPDATE branches
           SET holiday_country_code = $1, holiday_region_code = $2, updated_at = NOW()
           WHERE id = $3`,
          [body.countryCode ?? null, body.regionCode ?? null, branchId]
        );

        // Bulk upsert each holiday as a business-hours override
        for (const h of body.holidays) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date)) continue;
          await db.query(
            `INSERT INTO business_hours_overrides
               (branch_id, override_date, is_open, is_public_holiday, holiday_name)
             VALUES ($1, $2, $3, true, $4)
             ON CONFLICT (branch_id, override_date)
             DO UPDATE SET is_open = $3, is_public_holiday = true, holiday_name = $4, updated_at = NOW()`,
            [branchId, h.date, h.is_open, h.name]
          );
        }

        logger.info(
          { branchId, staffId: request.staffContext.staffId, count: body.holidays.length },
          'Holiday schedule saved'
        );

        return reply.send({ saved: body.holidays.length });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to save holiday settings');
        return reply.status(500).send({ error: 'Failed to save holiday settings' });
      }
    }
  );
}

export default businessHoursRoutes;
