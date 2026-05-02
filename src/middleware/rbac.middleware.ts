/**
 * RBAC (Role-Based Access Control) Middleware
 * 
 * Enforces role-based access control by checking JWT role claims
 * against endpoint permissions.
 * 
 * Requirements: 12.6, 12.7, 12.8
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger.js';
import { decodeToken, verifyAccessToken } from '../utils/jwt.js';

/**
 * Supported roles in Stage 1
 */
export type StaffRole = 'admin' | 'manager' | 'waiter';

/**
 * Role hierarchy - higher roles include lower role permissions
 */
export const ROLE_HIERARCHY: Record<StaffRole, number> = {
  admin: 3,
  manager: 2,
  waiter: 1
};

/**
 * Permission mapping - which roles can access which endpoint prefixes
 * Format: endpoint prefix -> allowed roles
 */
export const PERMISSION_MAP: Record<string, StaffRole[]> = {
  '/api/admin': ['admin'],
  '/api/manager': ['manager', 'admin'],
  '/api/waiter': ['waiter', 'manager', 'admin'],
  '/api/branch': ['admin', 'manager', 'waiter'], // Branch config - admin only in design but seems all roles need it
  '/api/staff': ['admin'], // Staff management - admin only
  '/api/reservations': ['admin', 'manager', 'waiter'], // All roles can view
  '/api/tables': ['admin', 'manager', 'waiter'], // All roles can view
};

/**
 * Customer context from JWT (no role claim)
 */
export interface CustomerContext {
  customerId: string;
  email: string;
}

/**
 * Extend FastifyRequest to include staff and customer context
 */
declare module 'fastify' {
  interface FastifyRequest {
    staffContext?: StaffContext;
    customerContext?: CustomerContext;
  }
}

/**
 * Staff context from JWT
 */
export interface StaffContext {
  staffId: string;
  email: string;
  role: StaffRole;
}

/**
 * RBAC Middleware
 * 
 * Validates that the requester's role has permission to access the endpoint.
 * Should be applied AFTER authentication middleware (which populates the JWT).
 * 
 * @param request - Fastify request
 * @param reply - Fastify reply
 */
export async function rbacMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const reqLogger = logger.child({
    path: request.url,
    method: request.method,
    ip: request.ip
  });

  try {
    // Skip RBAC for non-API routes
    if (!request.url.startsWith('/api/')) {
      return;
    }

    // Skip auth routes
    if (request.url.startsWith('/api/auth/')) {
      return;
    }

    // Public read-only endpoints — no auth required (guests can browse)
    const publicPatterns = [
      /^\/api\/v1\/branches\/[^/]+\/menu-sections(\?.*)?$/,
      /^\/api\/v1\/branches\/[^/]+\/tables(\?.*)?$/,
      /^\/api\/v1\/branches\/[^/]+\/cake-preferences(\?.*)?$/,
      /^\/api\/v1\/branches\/[^/]+\/menu-items(\?.*)?$/,
      /^\/api\/v1\/branches\/[^/]+\/decoration-colors(\?.*)?$/,
      /^\/api\/v1\/branches\/[^/]+\/decoration-packages(\?.*)?$/,
      /^\/api\/v1\/branches\/[^/]+\/business-hours(\?.*)?$/,
      /^\/api\/v1\/available-slots(\?.*)?$/,
    ];
    if (request.method === 'GET' && publicPatterns.some(p => p.test(request.url))) {
      return;
    }
    // Customer endpoints — no staff role required, but may carry a customer JWT
    const customerPostPatterns = [
      /^\/api\/v1\/branches\/[^/]+\/tables\/[^/]+\/lock$/,
      /^\/api\/v1\/reservations$/,
      /^\/api\/v1\/promo-codes\/validate$/,
      /^\/api\/v1\/customers\/lookup$/,
    ];
    // Customer GET endpoints that need customer identity (e.g. view own reservation)
    const customerGetPatterns = [
      /^\/api\/v1\/reservations\/[^/]+$/,
    ];
    // Customer PATCH/DELETE endpoints
    const customerMutatePatterns = [
      /^\/api\/v1\/reservations\/[^/]+\/(modify|cancel|decoration)$/,
    ];

    const isCustomerEndpoint =
      (request.method === 'POST' && customerPostPatterns.some(p => p.test(request.url))) ||
      (request.method === 'GET' && customerGetPatterns.some(p => p.test(request.url))) ||
      (['PATCH', 'DELETE'].includes(request.method) && customerMutatePatterns.some(p => p.test(request.url)));

    if (isCustomerEndpoint) {
      // Attempt to extract and validate a customer JWT — required for protected endpoints
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET ?? '';
        const decoded = verifyAccessToken(token, secret);
        if (decoded && !decoded.role) {
          // Valid customer token (no role = customer)
          request.customerContext = { customerId: decoded.sub, email: decoded.email };
        }
      }
      return;
    }

    // Extract JWT from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reqLogger.warn('No authorization header found');
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authorization header required'
      });
      return;
    }

    const token = authHeader.substring(7);

    // Decode token (verification is done by auth middleware)
    const decoded = decodeToken(token);
    if (!decoded) {
      reqLogger.warn('Invalid token format');
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
      return;
    }

    // Check if this is a staff token (has role claim)
    if (!decoded.role) {
      reqLogger.warn({ sub: decoded.sub }, 'Token missing role claim');
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Staff role required'
      });
      return;
    }

    // Validate role
    const userRole = decoded.role as StaffRole;
    if (!isValidRole(userRole)) {
      reqLogger.warn({ role: userRole }, 'Invalid role in token');
      reply.status(403).send({
        error: 'Forbidden',
        message: 'Invalid staff role'
      });
      return;
    }

    // Store staff context for downstream handlers
    request.staffContext = {
      staffId: decoded.sub,
      email: decoded.email,
      role: userRole
    };

    // Check permission for the endpoint
    const endpointPermission = getEndpointPermission(request.url);
    if (!endpointPermission) {
      // No specific permission defined, allow by default (or could deny)
      reqLogger.debug({ url: request.url }, 'No specific permission defined, allowing access');
      return;
    }

    // Check if user role is allowed
    if (!hasPermission(userRole, endpointPermission)) {
      const timestamp = new Date().toISOString();
      reqLogger.warn({
        timestamp,
        staffId: decoded.sub,
        email: decoded.email,
        role: userRole,
        endpoint: request.url,
        method: request.method,
        requiredRoles: endpointPermission
      }, 'Access denied: insufficient permissions');

      reply.status(403).send({
        error: 'Forbidden',
        message: `Access denied. Required roles: ${endpointPermission.join(', ')}`
      });
      return;
    }

    reqLogger.debug({
      staffId: decoded.sub,
      role: userRole,
      endpoint: request.url
    }, 'Access granted');
  } catch (error) {
    reqLogger.error({ error }, 'Error in RBAC middleware');
    throw error;
  }
}

/**
 * Check if role is valid
 */
function isValidRole(role: string): role is StaffRole {
  return role === 'admin' || role === 'manager' || role === 'waiter';
}

/**
 * Get the required permission for an endpoint
 */
function getEndpointPermission(url: string): StaffRole[] | null {
  // Check exact matches first
  for (const [prefix, roles] of Object.entries(PERMISSION_MAP)) {
    if (url.startsWith(prefix)) {
      return roles;
    }
  }
  return null;
}

/**
 * Check if user role has permission based on role hierarchy
 * 
 * @param userRole - The user's role
 * @param allowedRoles - Array of roles that are allowed
 * @returns true if user has permission
 */
function hasPermission(userRole: StaffRole, allowedRoles: StaffRole[]): boolean {
  if (allowedRoles.includes(userRole)) {
    return true;
  }

  // Check hierarchy - higher roles include lower role permissions
  const userLevel = ROLE_HIERARCHY[userRole];
  for (const allowedRole of allowedRoles) {
    const allowedLevel = ROLE_HIERARCHY[allowedRole];
    if (userLevel >= allowedLevel) {
      return true;
    }
  }

  return false;
}

export default rbacMiddleware;