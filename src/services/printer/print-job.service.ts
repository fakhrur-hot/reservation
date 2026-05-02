/**
 * Print Job Service
 *
 * Dispatches ESC/POS print jobs through the branch-configured PrinterAdapter.
 * Retry policy: attempt once, retry once on failure. On second failure:
 *   - Emit in-dashboard alert via WebSocket
 *   - Log failure with Pino (branch_id, type, timestamp, error)
 *
 * All print jobs are logged with branch_id, type, timestamp, and outcome.
 *
 * Requirements: 10.3, 10.4, 10.5, 10.6
 */

import { getDatabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { WebSocketPublisher } from '../websocket-publisher.service.js';
import { createPrinterAdapter } from './printer-adapter.factory.js';
import { renderReservationSlip } from './escpos.renderer.js';
import type { PrinterAdapterConfig } from './printer-adapter.interface.js';
import type { ReservationSlipPayload } from './escpos.renderer.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrintJobType = 'reservation_slip';

export interface PrintJobResult {
  success: boolean;
  attempts: number;
  error?: string;
}

// ─── Branch printer config lookup ─────────────────────────────────────────────

/**
 * Fetch the active printer adapter config for a branch from the database.
 * The `branches` table stores `printer_config JSONB` (set by Admin via settings).
 * Returns null if no printer is configured.
 */
async function getBranchPrinterConfig(
  branchId: string
): Promise<PrinterAdapterConfig | null> {
  const db = getDatabase();
  const result = await db.query<{ printer_config: PrinterAdapterConfig | null }>(
    `SELECT printer_config FROM branches WHERE id = $1`,
    [branchId]
  );
  return result.rows[0]?.printer_config ?? null;
}

// ─── Core dispatcher ──────────────────────────────────────────────────────────

/**
 * Attempt to send a Buffer to the printer once.
 * Returns true on success, throws on failure.
 */
async function attemptPrint(
  config: PrinterAdapterConfig,
  commands: Buffer
): Promise<void> {
  const adapter = createPrinterAdapter(config);
  await adapter.connect();
  try {
    await adapter.print(commands);
  } finally {
    await adapter.disconnect();
  }
}

/**
 * Dispatch a print job with one automatic retry.
 * On second failure: emits WS alert and logs with Pino.
 *
 * Requirements: 10.4, 10.5, 10.6
 */
async function dispatchPrintJob(
  branchId: string,
  type: PrintJobType,
  commands: Buffer
): Promise<PrintJobResult> {
  const config = await getBranchPrinterConfig(branchId);

  if (!config) {
    logger.warn(
      { branch_id: branchId, type },
      'No printer configured for branch — skipping print job'
    );
    return { success: false, attempts: 0, error: 'No printer configured' };
  }

  const timestamp = new Date().toISOString();
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await attemptPrint(config, commands);

      logger.info(
        { event: 'print_job_success', branch_id: branchId, type, timestamp, attempt },
        'Print job completed successfully'
      );

      return { success: true, attempts: attempt };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn(
        { event: 'print_job_attempt_failed', branch_id: branchId, type, timestamp, attempt, error: lastError },
        `Print job attempt ${attempt} failed`
      );
    }
  }

  // Both attempts failed — log error and emit in-dashboard alert
  logger.error(
    { event: 'print_job_failed', branch_id: branchId, type, timestamp, attempts: 2, error: lastError },
    'Print job failed after 2 attempts — in-dashboard alert emitted'
  );

  // Emit a WebSocket alert to the branch dashboard (best-effort)
  try {
    await WebSocketPublisher.publishPrintJobAlert(branchId, type, lastError ?? 'Unknown error');
  } catch (wsErr) {
    logger.error({ err: wsErr, branch_id: branchId }, 'Failed to emit print job alert via WebSocket');
  }

  return { success: false, attempts: 2, error: lastError };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Trigger a Reservation Slip print job asynchronously.
 * Called after reservation confirmation — does not block the HTTP response.
 *
 * Requirements: 10.3, 10.4, 10.5, 10.6
 */
export function triggerReservationSlipPrint(
  branchId: string,
  payload: ReservationSlipPayload
): void {
  // Fire-and-forget — async, does not block reservation confirmation
  setImmediate(async () => {
    try {
      const commands = renderReservationSlip(payload);
      await dispatchPrintJob(branchId, 'reservation_slip', commands);
    } catch (err) {
      logger.error(
        { err, branch_id: branchId, event: 'print_job_unhandled_error' },
        'Unhandled error in async print job'
      );
    }
  });
}

/**
 * Synchronous variant — awaitable, used for reprints triggered by staff.
 * Requirements: 10.3, 10.4, 10.5, 10.6
 */
export async function printReservationSlip(
  branchId: string,
  payload: ReservationSlipPayload
): Promise<PrintJobResult> {
  const commands = renderReservationSlip(payload);
  return dispatchPrintJob(branchId, 'reservation_slip', commands);
}
