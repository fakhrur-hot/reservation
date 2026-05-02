/**
 * Commission Report Routes
 *
 * GET  /api/admin/v1/branches/:id/commission-report  — full report with filtering
 * GET  /api/admin/v1/branches/:id/commission-report/export  — export as JSON/CSV/PDF
 *
 * Requirements: 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.7
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database.js';
import { AuditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchParams {
  id: string;
}

interface ReportQuerystring {
  start_date?: string;
  end_date?: string;
  category?: string;
  commission_type?: string;
  status?: string;
}

interface ExportQuerystring extends ReportQuerystring {
  format?: 'json' | 'csv' | 'pdf';
}

interface CommissionReportRow {
  transaction_id: string;
  reservation_id: string;
  reservation_ref: string | null;
  category: string;
  commission_type: string;
  commission_value: string;
  amount_charged: string;
  refund_amount: string | null;
  net_commission: string;
  status: string;
  created_at: string;
}

interface SummaryRow {
  total_charged: string;
  total_refunded: string;
  transaction_count: string;
}

interface CategoryBreakdownRow {
  category: string;
  total_charged: string;
  total_refunded: string;
  net: string;
  count: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateDateRange(startDate?: string, endDate?: string): string | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 'Invalid date format. Use YYYY-MM-DD.';
  }
  if (start > end) return 'start_date must be before end_date';
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 1) return 'Date range must be at least 1 day';
  if (diffDays > 90) return 'Date range cannot exceed 90 days';
  return null;
}

function buildWhereClause(
  branchId: string,
  query: ReportQuerystring
): { where: string; params: unknown[] } {
  const conditions: string[] = ['ct.branch_id = $1'];
  const params: unknown[] = [branchId];
  let p = 2;

  if (query.start_date) {
    conditions.push(`ct.created_at >= $${p++}`);
    params.push(query.start_date + 'T00:00:00Z');
  }
  if (query.end_date) {
    conditions.push(`ct.created_at <= $${p++}`);
    params.push(query.end_date + 'T23:59:59Z');
  }
  if (query.category) {
    conditions.push(`ct.category = $${p++}`);
    params.push(query.category);
  }
  if (query.commission_type) {
    conditions.push(`ct.commission_type = $${p++}`);
    params.push(query.commission_type);
  }
  if (query.status) {
    conditions.push(`ct.status = $${p++}`);
    params.push(query.status);
  }

  return { where: conditions.join(' AND '), params };
}

function rowsToCsv(rows: CommissionReportRow[]): string {
  const headers = [
    'transaction_id', 'reservation_id', 'reservation_ref', 'category',
    'commission_type', 'commission_value', 'amount_charged', 'refund_amount',
    'net_commission', 'status', 'created_at',
  ];
  const escape = (v: string | null) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      escape(row.transaction_id), escape(row.reservation_id),
      escape(row.reservation_ref), escape(row.category),
      escape(row.commission_type), escape(row.commission_value),
      escape(row.amount_charged), escape(row.refund_amount),
      escape(row.net_commission), escape(row.status), escape(row.created_at),
    ].join(','));
  }
  return lines.join('\n');
}

function buildPdfText(
  branchId: string,
  summary: { totalCharged: number; totalRefunded: number; netCommission: number; transactionCount: number },
  categoryBreakdown: CategoryBreakdownRow[],
  rows: CommissionReportRow[],
  query: ReportQuerystring
): string {
  const lines: string[] = [
    'COMMISSION REPORT',
    `Branch: ${branchId}`,
    `Generated: ${new Date().toISOString()}`,
    query.start_date ? `Period: ${query.start_date} to ${query.end_date}` : 'Period: All time',
    '',
    '--- SUMMARY ---',
    `Total Charged:   RM ${summary.totalCharged.toFixed(2)}`,
    `Total Refunded:  RM ${summary.totalRefunded.toFixed(2)}`,
    `Net Commission:  RM ${summary.netCommission.toFixed(2)}`,
    `Transactions:    ${summary.transactionCount}`,
    '',
    '--- CATEGORY BREAKDOWN ---',
  ];
  for (const cat of categoryBreakdown) {
    lines.push(
      `${cat.category}: charged RM ${Number(cat.total_charged).toFixed(2)}, ` +
      `refunded RM ${Number(cat.total_refunded).toFixed(2)}, ` +
      `net RM ${Number(cat.net).toFixed(2)} (${cat.count} txns)`
    );
  }
  lines.push('', '--- TRANSACTIONS ---');
  for (const row of rows) {
    lines.push(
      `[${row.created_at}] ${row.reservation_ref ?? row.reservation_id} | ` +
      `${row.category} | ${row.commission_type} | ` +
      `charged RM ${Number(row.amount_charged).toFixed(2)} | ` +
      `refunded RM ${Number(row.refund_amount ?? 0).toFixed(2)} | ` +
      `net RM ${Number(row.net_commission).toFixed(2)} | ${row.status}`
    );
  }
  return lines.join('\n');
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function commissionReportRoutes(fastify: FastifyInstance) {
  // ── GET /api/admin/v1/branches/:id/commission-report ──────────────────────
  // Requirements: 39.1, 39.2, 39.3, 39.4, 39.6, 39.7
  fastify.get<{ Params: BranchParams; Querystring: ReportQuerystring }>(
    '/api/admin/v1/branches/:id/commission-report',
    async (
      request: FastifyRequest<{ Params: BranchParams; Querystring: ReportQuerystring }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const role = request.staffContext?.role;
      const actorId = request.staffContext?.staffId;
      if (role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const query = request.query as ReportQuerystring;
      const dateError = validateDateRange(query.start_date, query.end_date);
      if (dateError) return reply.status(422).send({ error: dateError });

      const validCategories = ['decoration', 'cake'];
      if (query.category && !validCategories.includes(query.category)) {
        return reply.status(422).send({ error: 'category must be one of: decoration, cake' });
      }
      const validTypes = ['percentage', 'fixed'];
      if (query.commission_type && !validTypes.includes(query.commission_type)) {
        return reply.status(422).send({ error: 'commission_type must be one of: percentage, fixed' });
      }
      const validStatuses = ['pending', 'completed', 'failed', 'refunded'];
      if (query.status && !validStatuses.includes(query.status)) {
        return reply.status(422).send({ error: 'status must be one of: pending, completed, failed, refunded' });
      }

      try {
        const db = getDatabase();
        const { where, params } = buildWhereClause(branchId, query);

        // Fetch transactions joined with reservation reference and refund amounts
        const txResult = await db.query<CommissionReportRow>(
          `SELECT
             ct.id AS transaction_id,
             ct.reservation_id,
             r.reference_number AS reservation_ref,
             ct.category,
             ct.commission_type,
             ct.commission_value::text,
             ct.amount_charged::text,
             COALESCE(cr.refund_amount, 0)::text AS refund_amount,
             (ct.amount_charged - COALESCE(cr.refund_amount, 0))::text AS net_commission,
             ct.status,
             ct.created_at::text
           FROM commission_transactions ct
           LEFT JOIN reservations r ON r.id = ct.reservation_id
           LEFT JOIN commission_refunds cr
             ON cr.reservation_id = ct.reservation_id
             AND cr.category = ct.category
             AND cr.status = 'completed'
           WHERE ${where}
           ORDER BY ct.created_at DESC`,
          params
        );

        // Summary aggregation
        const summaryResult = await db.query<SummaryRow>(
          `SELECT
             COALESCE(SUM(ct.amount_charged), 0)::text AS total_charged,
             COALESCE(SUM(COALESCE(cr.refund_amount, 0)), 0)::text AS total_refunded,
             COUNT(ct.id)::text AS transaction_count
           FROM commission_transactions ct
           LEFT JOIN commission_refunds cr
             ON cr.reservation_id = ct.reservation_id
             AND cr.category = ct.category
             AND cr.status = 'completed'
           WHERE ${where}`,
          params
        );

        // Category breakdown
        const catResult = await db.query<CategoryBreakdownRow>(
          `SELECT
             ct.category,
             COALESCE(SUM(ct.amount_charged), 0)::text AS total_charged,
             COALESCE(SUM(COALESCE(cr.refund_amount, 0)), 0)::text AS total_refunded,
             (COALESCE(SUM(ct.amount_charged), 0) - COALESCE(SUM(COALESCE(cr.refund_amount, 0)), 0))::text AS net,
             COUNT(ct.id)::text AS count
           FROM commission_transactions ct
           LEFT JOIN commission_refunds cr
             ON cr.reservation_id = ct.reservation_id
             AND cr.category = ct.category
             AND cr.status = 'completed'
           WHERE ${where}
           GROUP BY ct.category
           ORDER BY ct.category`,
          params
        );

        const summary = summaryResult.rows[0];
        const totalCharged = Number(summary?.total_charged ?? 0);
        const totalRefunded = Number(summary?.total_refunded ?? 0);
        const transactionCount = Number(summary?.transaction_count ?? 0);

        // Req 39.6 — log report access
        await AuditService.log({
          branchId,
          actorId,
          action: 'commission_report_access',
          entityType: 'commission_report',
          entityId: branchId,
          newValue: {
            filters: query,
            export_format: 'json',
            result_count: txResult.rows.length,
          },
          ipAddress: request.ip,
        });

        logger.info(
          { branchId, actorId, filters: query, result_count: txResult.rows.length },
          'Commission report accessed'
        );

        return reply.send({
          branchId,
          filters: query,
          summary: {
            totalCharged,
            totalRefunded,
            netCommission: totalCharged - totalRefunded,
            transactionCount,
            averageCommission: transactionCount > 0
              ? Math.round((totalCharged / transactionCount) * 100) / 100
              : 0,
          },
          categoryBreakdown: catResult.rows.map((r) => ({
            category: r.category,
            totalCharged: Number(r.total_charged),
            totalRefunded: Number(r.total_refunded),
            netCommission: Number(r.net),
            transactionCount: Number(r.count),
          })),
          transactions: txResult.rows.map((r) => ({
            transactionId: r.transaction_id,
            reservationId: r.reservation_id,
            reservationRef: r.reservation_ref,
            category: r.category,
            commissionType: r.commission_type,
            commissionValue: Number(r.commission_value),
            amountCharged: Number(r.amount_charged),
            refundAmount: Number(r.refund_amount ?? 0),
            netCommission: Number(r.net_commission),
            status: r.status,
            timestamp: r.created_at,
          })),
        });
      } catch (err: unknown) {
        logger.error({ err, branchId }, 'Failed to generate commission report');
        return reply.status(500).send({ error: 'Failed to generate commission report' });
      }
    }
  );

  // ── GET /api/admin/v1/branches/:id/commission-report/export ───────────────
  // Requirements: 39.5, 39.6
  fastify.get<{ Params: BranchParams; Querystring: ExportQuerystring }>(
    '/api/admin/v1/branches/:id/commission-report/export',
    async (
      request: FastifyRequest<{ Params: BranchParams; Querystring: ExportQuerystring }>,
      reply: FastifyReply
    ) => {
      const branchId = request.branchContext?.branchId;
      if (!branchId || branchId !== request.params.id) {
        return reply.status(403).send({ error: 'Branch context mismatch' });
      }
      const role = request.staffContext?.role;
      const actorId = request.staffContext?.staffId;
      if (role !== 'admin') {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const query = request.query as ExportQuerystring;
      const format = query.format ?? 'json';
      const validFormats = ['json', 'csv', 'pdf'];
      if (!validFormats.includes(format)) {
        return reply.status(422).send({ error: 'format must be one of: json, csv, pdf' });
      }

      const dateError = validateDateRange(query.start_date, query.end_date);
      if (dateError) return reply.status(422).send({ error: dateError });

      try {
        const db = getDatabase();
        const { where, params } = buildWhereClause(branchId, query);

        const txResult = await db.query<CommissionReportRow>(
          `SELECT
             ct.id AS transaction_id,
             ct.reservation_id,
             r.reference_number AS reservation_ref,
             ct.category,
             ct.commission_type,
             ct.commission_value::text,
             ct.amount_charged::text,
             COALESCE(cr.refund_amount, 0)::text AS refund_amount,
             (ct.amount_charged - COALESCE(cr.refund_amount, 0))::text AS net_commission,
             ct.status,
             ct.created_at::text
           FROM commission_transactions ct
           LEFT JOIN reservations r ON r.id = ct.reservation_id
           LEFT JOIN commission_refunds cr
             ON cr.reservation_id = ct.reservation_id
             AND cr.category = ct.category
             AND cr.status = 'completed'
           WHERE ${where}
           ORDER BY ct.created_at DESC`,
          params
        );

        const summaryResult = await db.query<SummaryRow>(
          `SELECT
             COALESCE(SUM(ct.amount_charged), 0)::text AS total_charged,
             COALESCE(SUM(COALESCE(cr.refund_amount, 0)), 0)::text AS total_refunded,
             COUNT(ct.id)::text AS transaction_count
           FROM commission_transactions ct
           LEFT JOIN commission_refunds cr
             ON cr.reservation_id = ct.reservation_id
             AND cr.category = ct.category
             AND cr.status = 'completed'
           WHERE ${where}`,
          params
        );

        const catResult = await db.query<CategoryBreakdownRow>(
          `SELECT
             ct.category,
             COALESCE(SUM(ct.amount_charged), 0)::text AS total_charged,
             COALESCE(SUM(COALESCE(cr.refund_amount, 0)), 0)::text AS total_refunded,
             (COALESCE(SUM(ct.amount_charged), 0) - COALESCE(SUM(COALESCE(cr.refund_amount, 0)), 0))::text AS net,
             COUNT(ct.id)::text AS count
           FROM commission_transactions ct
           LEFT JOIN commission_refunds cr
             ON cr.reservation_id = ct.reservation_id
             AND cr.category = ct.category
             AND cr.status = 'completed'
           WHERE ${where}
           GROUP BY ct.category
           ORDER BY ct.category`,
          params
        );

        const summary = summaryResult.rows[0];
        const totalCharged = Number(summary?.total_charged ?? 0);
        const totalRefunded = Number(summary?.total_refunded ?? 0);
        const transactionCount = Number(summary?.transaction_count ?? 0);
        const rows = txResult.rows;

        // Req 39.6 — log export access
        await AuditService.log({
          branchId,
          actorId,
          action: 'commission_report_export',
          entityType: 'commission_report',
          entityId: branchId,
          newValue: {
            filters: query,
            export_format: format,
            result_count: rows.length,
          },
          ipAddress: request.ip,
        });

        logger.info(
          { branchId, actorId, format, filters: query, result_count: rows.length },
          'Commission report exported'
        );

        if (format === 'csv') {
          const csv = rowsToCsv(rows);
          reply.header('Content-Type', 'text/csv');
          reply.header(
            'Content-Disposition',
            `attachment; filename="commission-report-${branchId}-${Date.now()}.csv"`
          );
          return reply.send(csv);
        }

        if (format === 'pdf') {
          const summaryObj = {
            totalCharged,
            totalRefunded,
            netCommission: totalCharged - totalRefunded,
            transactionCount,
          };
          const text = buildPdfText(branchId, summaryObj, catResult.rows, rows, query);
          reply.header('Content-Type', 'text/plain');
          reply.header(
            'Content-Disposition',
            `attachment; filename="commission-report-${branchId}-${Date.now()}.txt"`
          );
          return reply.send(text);
        }

        // Default: JSON
        return reply.send({
          exportMetadata: {
            exportTimestamp: new Date().toISOString(),
            exportedBy: actorId,
            branchId,
            reportType: 'commission_report',
            format: 'json',
            filters: query,
          },
          summary: {
            totalCharged,
            totalRefunded,
            netCommission: totalCharged - totalRefunded,
            transactionCount,
            averageCommission: transactionCount > 0
              ? Math.round((totalCharged / transactionCount) * 100) / 100
              : 0,
          },
          categoryBreakdown: catResult.rows.map((r) => ({
            category: r.category,
            totalCharged: Number(r.total_charged),
            totalRefunded: Number(r.total_refunded),
            netCommission: Number(r.net),
            transactionCount: Number(r.count),
          })),
          transactions: rows.map((r) => ({
            transactionId: r.transaction_id,
            reservationId: r.reservation_id,
            reservationRef: r.reservation_ref,
            category: r.category,
            commissionType: r.commission_type,
            commissionValue: Number(r.commission_value),
            amountCharged: Number(r.amount_charged),
            refundAmount: Number(r.refund_amount ?? 0),
            netCommission: Number(r.net_commission),
            status: r.status,
            timestamp: r.created_at,
          })),
        });
      } catch (err: unknown) {
        logger.error({ err, branchId }, 'Failed to export commission report');
        return reply.status(500).send({ error: 'Failed to export commission report' });
      }
    }
  );
}
