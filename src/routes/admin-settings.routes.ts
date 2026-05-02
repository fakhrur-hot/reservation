/**
 * Admin Settings Routes
 *
 * PATCH /api/admin/v1/branches/:id/settings — update branch settings (Admin only)
 * GET  /api/admin/v1/branches/:id/settings — read branch settings (Admin only)
 *
 * Handles:
 *   - bookingDepositAmt       (Requirements: 16.1, 16.2, 16.12)
 *   - printerType             (Requirements: 12.10)
 *   - noShowGraceMin          (Requirements: 13.6)
 *   - modCutoffHours          (Requirements: 13.7)
 *   - decorationPackagePrice  (Requirements: 24.5, 24.6)
 *
 * Requirements: 12.10, 13.6, 13.7, 15.6, 16.1, 16.12, 24.5, 24.6
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database.js';
import { NotificationService, NotificationType } from '../services/notification.service.js';
import { AuditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchParams {
  id: string;
}

type PrinterType = 'usb' | 'lan' | 'wifi' | 'bluetooth';
const VALID_PRINTER_TYPES: PrinterType[] = ['usb', 'lan', 'wifi', 'bluetooth'];

interface UpdateSettingsBody {
  bookingDepositAmt?: number;
  printerType?: string;
  noShowGraceMin?: number;
  modCutoffHours?: number;
  /** Admin-configurable decoration package price (default RM 50). Requirements: 24.5, 24.6 */
  decorationPackagePrice?: number;
  /** Manual override for operating mode (Requirements: Full Stage building) */
  appOperatingMode?: 'TABLE_ONLY' | 'MENU_READY' | 'FULL';
  /** Deposit for cake order */
  cakeDepositAmt?: number;
  /** Type of cake deposit: fixed or percentage */
  cakeDepositType?: 'fixed' | 'percentage';
}

interface BranchSettings {
  booking_deposit_amt: number;
  printer_type: string | null;
  no_show_grace_min: number;
  mod_cutoff_hours: number;
  decoration_package_price: number;
  app_operating_mode: string;
  cake_deposit_amt: number;
  cake_deposit_type: 'fixed' | 'percentage';
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getBranchSettings(branchId: string): Promise<BranchSettings> {
  const db = getDatabase();
  const result = await db.query<BranchSettings>(
    `SELECT booking_deposit_amt, printer_type, no_show_grace_min, mod_cutoff_hours,
            decoration_package_price, app_operating_mode, cake_deposit_amt, cake_deposit_type
     FROM branches WHERE id = $1`,
    [branchId]
  );
  if (result.rows.length === 0) {
    throw new Error(`Branch ${branchId} not found`);
  }
  const row = result.rows[0];
  return {
    booking_deposit_amt: Number(row.booking_deposit_amt),
    printer_type: row.printer_type ?? null,
    no_show_grace_min: Number(row.no_show_grace_min),
    mod_cutoff_hours: Number(row.mod_cutoff_hours),
    decoration_package_price: Number(row.decoration_package_price),
    app_operating_mode: row.app_operating_mode || 'TABLE_ONLY',
    cake_deposit_amt: Number(row.cake_deposit_amt || 0),
    cake_deposit_type: (row.cake_deposit_type as 'fixed' | 'percentage') || 'fixed',
  };
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function adminSettingsRoutes(fastify: FastifyInstance) {
  // ── PATCH /api/admin/v1/branches/:id/settings ─────────────────────────────
  fastify.patch<{ Params: BranchParams; Body: UpdateSettingsBody }>(
    '/api/admin/v1/branches/:id/settings',
    async (
      request: FastifyRequest<{ Params: BranchParams; Body: UpdateSettingsBody }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const actorId = request.staffContext?.staffId;
      if (!actorId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const body = request.body as UpdateSettingsBody;

      // At least one field must be provided
      const hasAnyField =
        body?.bookingDepositAmt !== undefined ||
        body?.printerType !== undefined ||
        body?.noShowGraceMin !== undefined ||
        body?.modCutoffHours !== undefined ||
        body?.decorationPackagePrice !== undefined ||
        body?.appOperatingMode !== undefined ||
        body?.cakeDepositAmt !== undefined ||
        body?.cakeDepositType !== undefined;

      if (!hasAnyField) {
        return reply.status(422).send({
          error: 'At least one of bookingDepositAmt, printerType, noShowGraceMin, modCutoffHours, decorationPackagePrice, appOperatingMode, cakeDepositAmt, or cakeDepositType is required',
        });
      }

      // ── Validate individual fields ─────────────────────────────────────────

      if (body.bookingDepositAmt !== undefined) {
        if (typeof body.bookingDepositAmt !== 'number' || isNaN(body.bookingDepositAmt)) {
          return reply.status(422).send({ error: 'bookingDepositAmt must be a number' });
        }
        if (body.bookingDepositAmt < 0) {
          return reply.status(422).send({
            error: 'bookingDepositAmt must be non-negative (0 disables the deposit requirement)',
          });
        }
      }

      if (body.printerType !== undefined) {
        if (!VALID_PRINTER_TYPES.includes(body.printerType as PrinterType)) {
          return reply.status(422).send({
            error: `printerType must be one of: ${VALID_PRINTER_TYPES.join(', ')}`,
          });
        }
      }

      if (body.noShowGraceMin !== undefined) {
        if (!Number.isInteger(body.noShowGraceMin) || body.noShowGraceMin <= 0) {
          return reply.status(422).send({ error: 'noShowGraceMin must be a positive integer' });
        }
      }

      if (body.modCutoffHours !== undefined) {
        if (!Number.isInteger(body.modCutoffHours) || body.modCutoffHours < 0) {
          return reply.status(422).send({ error: 'modCutoffHours must be a non-negative integer' });
        }
      }

      if (body.decorationPackagePrice !== undefined) {
        if (typeof body.decorationPackagePrice !== 'number' || isNaN(body.decorationPackagePrice)) {
          return reply.status(422).send({ error: 'decorationPackagePrice must be a number' });
        }
        if (body.decorationPackagePrice < 0) {
          return reply.status(422).send({
            error: 'decorationPackagePrice must be non-negative',
          });
        }
      }

      if (body.appOperatingMode !== undefined) {
        const validModes = ['TABLE_ONLY', 'MENU_READY', 'FULL'];
        if (!validModes.includes(body.appOperatingMode)) {
          return reply.status(422).send({
            error: `appOperatingMode must be one of: ${validModes.join(', ')}`,
          });
        }
      }

      if (body.cakeDepositAmt !== undefined) {
        if (typeof body.cakeDepositAmt !== 'number' || isNaN(body.cakeDepositAmt)) {
          return reply.status(422).send({ error: 'cakeDepositAmt must be a number' });
        }
        if (body.cakeDepositAmt < 0) {
          return reply.status(422).send({
            error: 'cakeDepositAmt must be non-negative',
          });
        }
      }

      if (body.cakeDepositType !== undefined) {
        if (!['fixed', 'percentage'].includes(body.cakeDepositType)) {
          return reply.status(422).send({ error: 'cakeDepositType must be fixed or percentage' });
        }
      }

      try {
        // Fetch current settings for audit
        const oldSettings = await getBranchSettings(branchId);

        // Build dynamic UPDATE
        const setClauses: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (body.bookingDepositAmt !== undefined) {
          setClauses.push('booking_deposit_amt = $' + paramIdx++);
          params.push(body.bookingDepositAmt);
        }
        if (body.printerType !== undefined) {
          setClauses.push('printer_type = $' + paramIdx++);
          params.push(body.printerType);
        }
        if (body.noShowGraceMin !== undefined) {
          setClauses.push('no_show_grace_min = $' + paramIdx++);
          params.push(body.noShowGraceMin);
        }
        if (body.modCutoffHours !== undefined) {
          setClauses.push('mod_cutoff_hours = $' + paramIdx++);
          params.push(body.modCutoffHours);
        }
        if (body.decorationPackagePrice !== undefined) {
          setClauses.push('decoration_package_price = $' + paramIdx++);
          params.push(body.decorationPackagePrice);
        }
        if (body.appOperatingMode !== undefined) {
          setClauses.push('app_operating_mode = $' + paramIdx++);
          params.push(body.appOperatingMode);
        }
        if (body.cakeDepositAmt !== undefined) {
          setClauses.push('cake_deposit_amt = $' + paramIdx++);
          params.push(body.cakeDepositAmt);
        }
        if (body.cakeDepositType !== undefined) {
          setClauses.push('cake_deposit_type = $' + paramIdx++);
          params.push(body.cakeDepositType);
        }

        // Always bump updated_at
        setClauses.push('updated_at = NOW()');
        params.push(branchId);

        const db = getDatabase();
        const result = await db.query<BranchSettings>(
          `UPDATE branches
           SET ${setClauses.join(', ')}
           WHERE id = $${paramIdx}
           RETURNING booking_deposit_amt, printer_type, no_show_grace_min, mod_cutoff_hours,
                     decoration_package_price, app_operating_mode, cake_deposit_amt, cake_deposit_type`,
          params
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Branch not found' });
        }

        const row = result.rows[0];
        const newSettings: BranchSettings = {
          booking_deposit_amt: Number(row.booking_deposit_amt),
          printer_type: row.printer_type ?? null,
          no_show_grace_min: Number(row.no_show_grace_min),
          mod_cutoff_hours: Number(row.mod_cutoff_hours),
          decoration_package_price: Number(row.decoration_package_price),
          app_operating_mode: row.app_operating_mode,
          cake_deposit_amt: Number(row.cake_deposit_amt || 0),
          cake_deposit_type: (row.cake_deposit_type as 'fixed' | 'percentage') || 'fixed',
        };

        // Audit log
        await AuditService.logUpdate(
          branchId,
          actorId,
          'branch_settings',
          branchId,
          oldSettings as unknown as Record<string, unknown>,
          newSettings as unknown as Record<string, unknown>,
          request.ip
        );

        logger.info(
          { branchId, actorId, changes: body },
          'Branch settings updated'
        );

        return reply.send({
          branchId,
          bookingDepositAmt: newSettings.booking_deposit_amt,
          printerType: newSettings.printer_type,
          noShowGraceMin: newSettings.no_show_grace_min,
          modCutoffHours: newSettings.mod_cutoff_hours,
          decorationPackagePrice: newSettings.decoration_package_price,
          appOperatingMode: newSettings.app_operating_mode,
          cakeDepositAmt: newSettings.cake_deposit_amt,
          cakeDepositType: newSettings.cake_deposit_type,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message?.includes('not found')) {
          return reply.status(404).send({ error: 'Branch not found' });
        }
        logger.error({ err, branchId }, 'Failed to update branch settings');
        return reply.status(500).send({ error: 'Failed to update branch settings' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id/settings ───────────────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/settings',
    async (
      request: FastifyRequest<{ Params: BranchParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const settings = await getBranchSettings(branchId);
        return reply.send({
          branchId,
          bookingDepositAmt: settings.booking_deposit_amt,
          printerType: settings.printer_type,
          noShowGraceMin: settings.no_show_grace_min,
          modCutoffHours: settings.mod_cutoff_hours,
          decorationPackagePrice: settings.decoration_package_price,
          appOperatingMode: settings.app_operating_mode,
          cakeDepositAmt: settings.cake_deposit_amt,
          cakeDepositType: settings.cake_deposit_type,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message?.includes('not found')) {
          return reply.status(404).send({ error: 'Branch not found' });
        }
        logger.error({ err, branchId }, 'Failed to get branch settings');
        return reply.status(500).send({ error: 'Failed to get branch settings' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id ────────────────────────────────────────
  // This route is called by AdminSettingsApiSettings.tsx to get basic info
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      try {
        const db = getDatabase();
        const result = await db.query(
          'SELECT id, name, code, app_operating_mode FROM branches WHERE id = $1',
          [branchId]
        );
        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Branch not found' });
        }
        const row = result.rows[0];
        return reply.send({
          id: row.id,
          name: row.name,
          code: row.code,
          app_operating_mode: row.app_operating_mode,
        });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to get branch info');
        return reply.status(500).send({ error: 'Failed to get branch info' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id/profile ────────────────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/profile',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      try {
        const db = getDatabase();
        const result = await db.query(
          `SELECT name, code, address, phone, website_url,
                  timezone, currency, no_show_grace_min, mod_cutoff_hours
           FROM branches WHERE id = $1`,
          [branchId]
        );
        if (result.rows.length === 0) return reply.status(404).send({ error: 'Branch not found' });
        const row = result.rows[0];
        // Split address back into parts (best-effort)
        const addressParts = (row.address || '').split(',').map((p: string) => p.trim());
        return reply.send({
          branchId,
          restaurantName: row.name,
          branchCode: row.code,
          address: row.address,
          street: addressParts[0] || '',
          city: addressParts[1] || '',
          state: addressParts[2]?.replace(/\s\d+/, '').trim() || '',
          postcode: (addressParts[2]?.match(/\d+/) || [''])[0],
          country: addressParts[3] || '',
          phone: row.phone,
          website: row.website_url || '',
          timezone: row.timezone,
          currency: row.currency,
        });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to get branch profile');
        return reply.status(500).send({ error: 'Failed to get branch profile' });
      }
    }
  );

  // ── PATCH /api/admin/v1/branches/:id/profile ──────────────────────────────
  fastify.patch<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/profile',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const actorId = request.staffContext?.staffId;
      if (!actorId) return reply.status(401).send({ error: 'Authentication required' });

      const body = request.body as {
        restaurantName?: string; branchCode?: string; address?: string;
        phone?: string; website?: string; timezone?: string; currency?: string;
      };
      try {
        const db = getDatabase();
        await db.query(
          `UPDATE branches SET
            name = COALESCE($1, name),
            code = COALESCE($2, code),
            address = COALESCE($3, address),
            phone = COALESCE($4, phone),
            website_url = COALESCE($5, website_url),
            timezone = COALESCE($6, timezone),
            currency = COALESCE($7, currency),
            updated_at = NOW()
           WHERE id = $8`,
          [body.restaurantName, body.branchCode, body.address, body.phone,
           body.website, body.timezone, body.currency, branchId]
        );
        return reply.send({ success: true });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to update branch profile');
        return reply.status(500).send({ error: 'Failed to update branch profile' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id/operating-hours ────────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/operating-hours',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      try {
        const db = getDatabase();
        const [hoursResult, branchResult] = await Promise.all([
          db.query(
            `SELECT day_of_week, open_time, close_time, is_open
             FROM business_hours WHERE branch_id = $1 ORDER BY day_of_week`,
            [branchId]
          ),
          db.query(
            `SELECT no_show_grace_min, mod_cutoff_hours FROM branches WHERE id = $1`,
            [branchId]
          ),
        ]);
        const branch = branchResult.rows[0] || {};
        return reply.send({
          branchId,
          schedule: hoursResult.rows.map(r => ({
            dayOfWeek: r.day_of_week,
            isOpen: r.is_open,
            openTime: r.open_time?.slice(0, 5) || '09:00',
            closeTime: r.close_time?.slice(0, 5) || '22:00',
          })),
          noShowGraceMinutes: Number(branch.no_show_grace_min) || 15,
          modificationCutoffHours: Number(branch.mod_cutoff_hours) || 2,
        });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to get operating hours');
        return reply.status(500).send({ error: 'Failed to get operating hours' });
      }
    }
  );

  // ── PATCH /api/admin/v1/branches/:id/operating-hours ─────────────────────
  fastify.patch<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/operating-hours',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const actorId = request.staffContext?.staffId;
      if (!actorId) return reply.status(401).send({ error: 'Authentication required' });

      const body = request.body as {
        schedule?: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>;
        noShowGraceMinutes?: number;
        modificationCutoffHours?: number;
      };
      try {
        const db = getDatabase();
        if (body.schedule) {
          for (const day of body.schedule) {
            await db.query(
              `INSERT INTO business_hours (branch_id, day_of_week, open_time, close_time, is_open)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (branch_id, day_of_week) DO UPDATE
               SET open_time = $3, close_time = $4, is_open = $5, updated_at = NOW()`,
              [branchId, day.dayOfWeek,
               day.isOpen ? day.openTime : '00:00',
               day.isOpen ? day.closeTime : '00:00',
               day.isOpen]
            );
          }
        }
        if (body.noShowGraceMinutes !== undefined || body.modificationCutoffHours !== undefined) {
          await db.query(
            `UPDATE branches SET
              no_show_grace_min = COALESCE($1, no_show_grace_min),
              mod_cutoff_hours = COALESCE($2, mod_cutoff_hours),
              updated_at = NOW()
             WHERE id = $3`,
            [body.noShowGraceMinutes, body.modificationCutoffHours, branchId]
          );
        }
        return reply.send({ success: true });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to update operating hours');
        return reply.status(500).send({ error: 'Failed to update operating hours' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id/smtp ───────────────────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/smtp',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      try {
        const db = getDatabase();
        const result = await db.query(
          `SELECT key, value FROM app_config WHERE key IN
           ('smtp_host','smtp_port','smtp_username','smtp_from_name','smtp_from_email','smtp_tls')`,
        );
        const cfg: Record<string, string> = {};
        for (const row of result.rows) cfg[row.key] = row.value;
        return reply.send({
          host: cfg['smtp_host'] || '',
          port: Number(cfg['smtp_port']) || 587,
          username: cfg['smtp_username'] || '',
          fromName: cfg['smtp_from_name'] || '',
          fromEmail: cfg['smtp_from_email'] || '',
          tls: cfg['smtp_tls'] === 'true',
        });
      } catch (err) {
        logger.error({ err }, 'Failed to get SMTP settings');
        return reply.status(500).send({ error: 'Failed to get SMTP settings' });
      }
    }
  );

  // ── PATCH /api/admin/v1/branches/:id/smtp ────────────────────────────────
  fastify.patch<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/smtp',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const actorId = request.staffContext?.staffId;
      if (!actorId) return reply.status(401).send({ error: 'Authentication required' });

      const body = request.body as {
        host?: string; port?: number; username?: string; password?: string;
        fromName?: string; fromEmail?: string; tls?: boolean;
      };
      try {
        const db = getDatabase();
        const upsert = async (key: string, value: string) => {
          await db.query(
            `INSERT INTO app_config (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2`,
            [key, value]
          );
        };
        if (body.host !== undefined) await upsert('smtp_host', body.host);
        if (body.port !== undefined) await upsert('smtp_port', String(body.port));
        if (body.username !== undefined) await upsert('smtp_username', body.username);
        if (body.password !== undefined) await upsert('smtp_password', Buffer.from(body.password).toString('base64'));
        if (body.fromName !== undefined) await upsert('smtp_from_name', body.fromName);
        if (body.fromEmail !== undefined) await upsert('smtp_from_email', body.fromEmail);
        if (body.tls !== undefined) await upsert('smtp_tls', String(body.tls));
        return reply.send({ success: true });
      } catch (err) {
        logger.error({ err }, 'Failed to update SMTP settings');
        return reply.status(500).send({ error: 'Failed to update SMTP settings' });
      }
    }
  );

  // NOTE: GET /api/admin/v1/branches/:id/staff is defined in staff.routes.ts
  // Do not duplicate here to avoid route conflicts

  // ── GET /api/admin/v1/branches/:id/deposit-settings ──────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/deposit-settings',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      try {
        const db = getDatabase();
        const [branchResult, configResult] = await Promise.all([
          db.query(`SELECT booking_deposit_amt, cake_deposit_amt, cake_deposit_type, decoration_package_price FROM branches WHERE id = $1`, [branchId]),
          db.query(
            `SELECT key, value FROM app_config WHERE key IN
             ('deposit_required','refund_tier1_percent','refund_tier2_percent','refund_tier3_percent')`
          ),
        ]);
        const cfg: Record<string, string> = {};
        for (const row of configResult.rows) cfg[row.key] = row.value;
        return reply.send({
          depositAmount: Number(branchResult.rows[0]?.booking_deposit_amt) || 50,
          cakeDepositAmt: Number(branchResult.rows[0]?.cake_deposit_amt) || 0,
          cakeDepositType: branchResult.rows[0]?.cake_deposit_type || 'fixed',
          decorationPackagePrice: Number(branchResult.rows[0]?.decoration_package_price) || 50,
          depositRequired: cfg['deposit_required'] !== 'false',
          refundTier1Percent: Number(cfg['refund_tier1_percent'] ?? 100),
          refundTier2Percent: Number(cfg['refund_tier2_percent'] ?? 50),
          refundTier3Percent: Number(cfg['refund_tier3_percent'] ?? 0),
        });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to get deposit settings');
        return reply.status(500).send({ error: 'Failed to get deposit settings' });
      }
    }
  );

  // ── PATCH /api/admin/v1/branches/:id/deposit-settings ────────────────────
  fastify.patch<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/deposit-settings',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const actorId = request.staffContext?.staffId;
      if (!actorId) return reply.status(401).send({ error: 'Authentication required' });

      const body = request.body as {
        depositAmount?: number; cakeDepositAmt?: number; cakeDepositType?: 'fixed' | 'percentage'; 
        decorationPackagePrice?: number;
        depositRequired?: boolean;
        refundTier1Percent?: number; refundTier2Percent?: number; refundTier3Percent?: number;
      };
      try {
        const db = getDatabase();
        if (body.depositAmount !== undefined || body.cakeDepositAmt !== undefined) {
          const setClauses: string[] = [];
          const params: unknown[] = [];
          let idx = 1;
          if (body.depositAmount !== undefined) {
            setClauses.push(`booking_deposit_amt = $${idx++}`);
            params.push(body.depositAmount);
          }
          if (body.cakeDepositAmt !== undefined) {
            setClauses.push(`cake_deposit_amt = $${idx++}`);
            params.push(body.cakeDepositAmt);
          }
          if (body.cakeDepositType !== undefined) {
            setClauses.push(`cake_deposit_type = $${idx++}`);
            params.push(body.cakeDepositType);
          }
          if (body.decorationPackagePrice !== undefined) {
            setClauses.push(`decoration_package_price = $${idx++}`);
            params.push(body.decorationPackagePrice);
          }
          params.push(branchId);
          await db.query(
            `UPDATE branches SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
            params
          );
        }
        const upsert = async (key: string, value: string) => {
          await db.query(
            `INSERT INTO app_config (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2`,
            [key, value]
          );
        };
        if (body.depositRequired !== undefined) await upsert('deposit_required', String(body.depositRequired));
        if (body.refundTier1Percent !== undefined) await upsert('refund_tier1_percent', String(body.refundTier1Percent));
        if (body.refundTier2Percent !== undefined) await upsert('refund_tier2_percent', String(body.refundTier2Percent));
        if (body.refundTier3Percent !== undefined) await upsert('refund_tier3_percent', String(body.refundTier3Percent));
        return reply.send({ success: true });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to update deposit settings');
        return reply.status(500).send({ error: 'Failed to update deposit settings' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id/payment-settings ─────────────────────
  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/payment-settings',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const role = request.staffContext?.role;
      if (role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }
      try {
        const db = getDatabase();
        const result = await db.query(
          `SELECT key, value FROM app_config WHERE key IN (
            'payment_gateway_enabled',
            'payment_active_gateway',
            'billplz_collection_id',
            'billplz_api_key',
            'billplz_x_signature_key',
            'billplz_sandbox_mode',
            'ipay88_merchant_code',
            'ipay88_merchant_key',
            'ipay88_sandbox_mode'
          )`
        );
        const cfg: Record<string, string> = {};
        for (const row of result.rows) cfg[row.key] = row.value;
        return reply.send({
          enabled: cfg['payment_gateway_enabled'] === 'true',
          activeGateway: cfg['payment_active_gateway'] || 'billplz',
          billplz: {
            collectionId: cfg['billplz_collection_id'] || '',
            // Mask API key — only return whether it is set, not the value
            apiKeySet: !!(cfg['billplz_api_key']),
            xSignatureKeySet: !!(cfg['billplz_x_signature_key']),
            sandboxMode: cfg['billplz_sandbox_mode'] !== 'false',
          },
          ipay88: {
            merchantCode: cfg['ipay88_merchant_code'] || '',
            merchantKeySet: !!(cfg['ipay88_merchant_key']),
            sandboxMode: cfg['ipay88_sandbox_mode'] !== 'false',
          },
        });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to get payment settings');
        return reply.status(500).send({ error: 'Failed to get payment settings' });
      }
    }
  );

  // ── PATCH /api/admin/v1/branches/:id/payment-settings ────────────────────
  fastify.patch<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/payment-settings',
    async (request: FastifyRequest<{ Params: BranchParams }>, reply: FastifyReply) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const actorId = request.staffContext?.staffId;
      const role = request.staffContext?.role;
      if (!actorId || role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const body = request.body as {
        enabled?: boolean;
        activeGateway?: 'billplz' | 'ipay88';
        billplz?: {
          collectionId?: string;
          apiKey?: string;
          xSignatureKey?: string;
          sandboxMode?: boolean;
        };
        ipay88?: {
          merchantCode?: string;
          merchantKey?: string;
          sandboxMode?: boolean;
        };
      };

      if (body.activeGateway && !['billplz', 'ipay88'].includes(body.activeGateway)) {
        return reply.status(422).send({ error: 'activeGateway must be billplz or ipay88' });
      }

      try {
        const db = getDatabase();
        const upsert = async (key: string, value: string) => {
          await db.query(
            `INSERT INTO app_config (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2`,
            [key, value]
          );
        };

        if (body.enabled !== undefined)       await upsert('payment_gateway_enabled', String(body.enabled));
        if (body.activeGateway !== undefined)  await upsert('payment_active_gateway', body.activeGateway);

        // Billplz fields — encode secrets as base64 at rest
        if (body.billplz?.collectionId !== undefined)  await upsert('billplz_collection_id', body.billplz.collectionId);
        if (body.billplz?.apiKey !== undefined)         await upsert('billplz_api_key', Buffer.from(body.billplz.apiKey).toString('base64'));
        if (body.billplz?.xSignatureKey !== undefined)  await upsert('billplz_x_signature_key', Buffer.from(body.billplz.xSignatureKey).toString('base64'));
        if (body.billplz?.sandboxMode !== undefined)    await upsert('billplz_sandbox_mode', String(body.billplz.sandboxMode));

        // iPay88 fields
        if (body.ipay88?.merchantCode !== undefined)  await upsert('ipay88_merchant_code', body.ipay88.merchantCode);
        if (body.ipay88?.merchantKey !== undefined)   await upsert('ipay88_merchant_key', Buffer.from(body.ipay88.merchantKey).toString('base64'));
        if (body.ipay88?.sandboxMode !== undefined)   await upsert('ipay88_sandbox_mode', String(body.ipay88.sandboxMode));

        await AuditService.logUpdate(
          branchId, actorId, 'payment_settings', branchId,
          {}, { updated: true }, request.ip
        );

        logger.info({ branchId, actorId }, 'Payment gateway settings updated');
        return reply.send({ success: true });
      } catch (err) {
        logger.error({ err, branchId }, 'Failed to update payment settings');
        return reply.status(500).send({ error: 'Failed to update payment settings' });
      }
    }
  );
}

export default adminSettingsRoutes;

// ─── Notification settings endpoint ──────────────────────────────────────────

/**
 * PATCH /api/admin/v1/branches/:id/notification-settings
 * Configure which notification types are enabled per branch.
 * Requirements: 15.6
 */
export async function notificationSettingsRoutes(fastify: FastifyInstance) {
  fastify.patch<{ Params: BranchParams; Body: Partial<Record<NotificationType, boolean>> }>(
    '/api/admin/v1/branches/:id/notification-settings',
    async (
      request: FastifyRequest<{ Params: BranchParams; Body: Partial<Record<NotificationType, boolean>> }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const actorId = request.staffContext?.staffId;
      const role = request.staffContext?.role;
      if (!actorId || role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const body = request.body as Partial<Record<NotificationType, boolean>>;
      const validTypes: NotificationType[] = [
        'reservation_confirmed',
        'reservation_reminder_24h',
        'reservation_reminder_2h',
        'reservation_cancelled',
        'reservation_modified',
      ];

      for (const key of Object.keys(body)) {
        if (!validTypes.includes(key as NotificationType)) {
          return reply.status(422).send({ error: `Unknown notification type: ${key}` });
        }
        if (typeof (body as Record<string, unknown>)[key] !== 'boolean') {
          return reply.status(422).send({ error: `Value for ${key} must be a boolean` });
        }
      }

      try {
        await NotificationService.updateBranchSettings(branchId, body);
        return reply.send({ branchId, notificationSettings: body });
      } catch (err: unknown) {
        logger.error({ err, branchId }, 'Failed to update notification settings');
        return reply.status(500).send({ error: 'Failed to update notification settings' });
      }
    }
  );

  fastify.get<{ Params: BranchParams }>(
    '/api/admin/v1/branches/:id/notification-settings',
    async (
      request: FastifyRequest<{ Params: BranchParams }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }

      const validTypes: NotificationType[] = [
        'reservation_confirmed',
        'reservation_reminder_24h',
        'reservation_reminder_2h',
        'reservation_cancelled',
        'reservation_modified',
      ];

      const settings: Record<string, boolean> = {};
      for (const type of validTypes) {
        settings[type] = await NotificationService.isTypeEnabled(branchId, type);
      }

      return reply.send({ branchId, notificationSettings: settings });
    }
  );

  // NOTE: Deposit settings endpoints are defined in adminSettingsRoutes
  // Do not duplicate them here to avoid route conflicts
}
