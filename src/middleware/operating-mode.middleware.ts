/**
 * OperatingModeGuard Middleware
 *
 * Enforces branch App_Operating_Mode restrictions.
 * In TABLE_ONLY mode, blocks access to Stage 2/3 endpoints (menu, cart, orders,
 * invoices, cashier, KOT, kitchen) while keeping deposit, KPDN T&C, and refund
 * endpoints accessible.
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger.js';

/**
 * Supported operating modes
 */
export const APP_OPERATING_MODES = {
  TABLE_ONLY: 'TABLE_ONLY',
  FULL: 'FULL',
} as const;

export type AppOperatingMode = keyof typeof APP_OPERATING_MODES;

/**
 * Path segments that are blocked in TABLE_ONLY mode (Stage 2/3 features).
 * Matched as substrings of the request URL path.
 *
 * NOTE: `/menu-items` is explicitly listed so that the Stage 2 menu endpoint
 * returns 403 in TABLE_ONLY mode (Requirement 27.10).  The predefined cake
 * endpoint (`/cake-preferences`) is NOT listed here and therefore remains
 * accessible in all modes.
 */
const TABLE_ONLY_BLOCKED_SEGMENTS = [
  '/menu-items',
  '/menu',
  '/cart',
  '/orders',
  '/invoices',
  '/cashier',
  '/kot',
  '/kitchen',
];

/**
 * Path segments that are always allowed in TABLE_ONLY mode.
 * These take precedence over blocked segments.
 */
const TABLE_ONLY_ALLOWED_SEGMENTS = [
  '/deposit',
  '/tc',
  '/refund',
  '/settings',
  '/menu-sections',
];

/**
 * Check whether a URL path is blocked in TABLE_ONLY mode.
 *
 * Allow-list is checked first so that e.g. `/deposit` is never blocked
 * even if a future blocked segment were to overlap.
 */
export function isBlockedInTableOnlyMode(urlPath: string): boolean {
  const lowerPath = urlPath.toLowerCase();

  // Always allow deposit, T&C, refund, and settings paths
  for (const allowed of TABLE_ONLY_ALLOWED_SEGMENTS) {
    if (lowerPath.includes(allowed)) {
      return false;
    }
  }

  // Block Stage 2/3 feature paths
  for (const blocked of TABLE_ONLY_BLOCKED_SEGMENTS) {
    if (lowerPath.includes(blocked)) {
      return true;
    }
  }

  return false;
}

/**
 * OperatingModeGuard middleware factory.
 *
 * Reads `branch.app_operating_mode` from the request context injected by
 * MultiBranchMiddleware and enforces feature gating rules.
 *
 * Must be registered AFTER MultiBranchMiddleware so that `branchContext` is
 * already populated on the request.
 */
export async function operatingModeGuard(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const branchContext = request.branchContext;

  // If no branch context, MultiBranchMiddleware already handled the error
  if (!branchContext) {
    return;
  }

  const { branchId, appOperatingMode } = branchContext;
  const mode = (appOperatingMode || APP_OPERATING_MODES.TABLE_ONLY).toUpperCase();

  // Only enforce restrictions in TABLE_ONLY mode
  if (mode !== APP_OPERATING_MODES.TABLE_ONLY) {
    return;
  }

  // Allow staff with admin or manager roles to bypass mode restrictions (for setup/management)
  const staffRole = request.staffContext?.role;
  if (staffRole === 'admin' || staffRole === 'manager') {
    return;
  }

  if (isBlockedInTableOnlyMode(request.url)) {
    const feature = extractFeatureName(request.url);

    logger.warn({
      branch_id: branchId,
      mode,
      feature,
      url: request.url,
      method: request.method,
    }, 'Operating mode violation: TABLE_ONLY branch attempted to access restricted feature');

    reply.status(403).send({
      error: 'Feature not available',
      message: `The feature "${feature}" is not available in TABLE_ONLY mode`,
      mode,
      feature,
    });
  }
}

/**
 * Extract a human-readable feature name from the URL path for logging/error messages.
 */
function extractFeatureName(url: string): string {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('/menu-items')) return 'menu-items';
  if (lowerUrl.includes('/menu')) return 'menu';
  if (lowerUrl.includes('/cart')) return 'cart';
  if (lowerUrl.includes('/orders')) return 'orders';
  if (lowerUrl.includes('/invoices')) return 'invoices';
  if (lowerUrl.includes('/cashier')) return 'cashier';
  if (lowerUrl.includes('/kot')) return 'kot';
  if (lowerUrl.includes('/kitchen')) return 'kitchen';

  // Fallback: extract last meaningful path segment
  const parts = url.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'unknown';
}

export default operatingModeGuard;
