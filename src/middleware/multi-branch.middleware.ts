import { FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

/**
 * Request context interface for branch-scoped requests
 */
export interface BranchContext {
  branchId: string;
  brandId?: string;
  appOperatingMode: string;
  timezone: string;
}

/**
 * Extend FastifyRequest to include branch context
 */
declare module 'fastify' {
  interface FastifyRequest {
    branchContext?: BranchContext;
  }
}

/**
 * Multi-Branch Middleware
 * 
 * Extracts branch_id from:
 * 1. X-Branch-ID header
 * 2. Subdomain fallback
 * 
 * Validates UUID exists in branches table
 * Injects branchId into request context for all downstream handlers
 * For authenticated staff: asserts staff.branch_id === context.branchId
 */
export async function multiBranchMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const reqLogger = logger.child({ 
    path: request.url, 
    method: request.method,
    ip: request.ip
  });

  try {
    // Step 1: Extract branch_id from header or subdomain
    const branchId = extractBranchId(request);
    
    if (!branchId) {
      reqLogger.warn('Branch context is required - no branch_id found');
      reply.status(400).send({
        error: 'Branch context is required',
        message: 'X-Branch-ID header or subdomain must be provided'
      });
      return;
    }

    // Step 2: Validate UUID format
    if (!isValidUUID(branchId)) {
      reqLogger.warn({ branchId }, 'Invalid branch_id format');
      reply.status(400).send({
        error: 'Invalid branch_id',
        message: 'Branch ID must be a valid UUID'
      });
      return;
    }

    // Step 3: Validate branch exists in database
    const branch = await validateBranchExists(branchId);
    
    if (!branch) {
      reqLogger.warn({ branchId }, 'Branch not found');
      reply.status(404).send({
        error: 'Branch not found',
        message: 'The specified branch does not exist'
      });
      return;
    }

    // Step 4: Inject branch context into request
    request.branchContext = {
      branchId: branch.id,
      brandId: branch.brand_id || undefined,
      appOperatingMode: branch.app_operating_mode || 'TABLE_ONLY',
      timezone: branch.timezone || 'Asia/Kuala_Lumpur',
    };

    reqLogger.debug({ branchId: branch.id, brandId: branch.brand_id }, 'Branch context set');

    // Step 5: For authenticated staff requests, check branch isolation
    // This will be called after auth middleware, so we check if staff is attached
    const staff = (request as any).staff;
    if (staff && staff.branch_id && staff.branch_id !== branch.id) {
      reqLogger.error({
        staffId: staff.id,
        staffBranchId: staff.branch_id,
        requestBranchId: branch.id
      }, 'Staff cross-branch access denied');
      
      reply.status(403).send({
        error: 'Access denied',
        message: 'You do not have access to this branch'
      });
      return;
    }
  } catch (error) {
    reqLogger.error({ error }, 'Error in multi-branch middleware');
    throw error;
  }
}

/**
 * Extract branch_id from request
 * Priority: X-Branch-ID header > subdomain
 */
function extractBranchId(request: FastifyRequest): string | null {
  // First try X-Branch-ID header
  const headerBranchId = request.headers['x-branch-id'] as string;
  if (headerBranchId) {
    return headerBranchId;
  }

  // Fallback to subdomain
  const hostname = request.hostname;
  const subdomain = extractSubdomain(hostname);
  if (subdomain) {
    return subdomain;
  }

  return null;
}

/**
 * Extract subdomain from hostname
 * e.g., "kl01.example.com" -> "kl01" or UUID
 */
function extractSubdomain(hostname: string): string | null {
  // Skip localhost and IP addresses
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
    return null;
  }

  const parts = hostname.split('.');
  if (parts.length >= 3) {
    // Return first part as potential branch identifier
    return parts[0];
  }

  return null;
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate branch exists in database
 */
async function validateBranchExists(branchId: string): Promise<{ id: string; brand_id: string | null; app_operating_mode: string; timezone: string } | null> {
  try {
    const db = getDatabase();
    const result = await db.query(
      'SELECT id, brand_id, app_operating_mode, timezone FROM branches WHERE id = $1 AND is_active = true',
      [branchId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (error) {
    logger.error({ error, branchId }, 'Error validating branch');
    throw error;
  }
}

export default multiBranchMiddleware;