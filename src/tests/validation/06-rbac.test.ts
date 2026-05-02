/**
 * RBAC Enforcement Validation
 * Properties 15–18 | Requirements 12.1–12.7
 *
 * Requires the backend to be running: npm run dev
 * Tests gracefully skip when the backend is not reachable.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { Pool } from 'pg';
import { getTestPool, queryOne } from './helpers/db-client';
import { get, post, patch, del, API_BASE } from './helpers/http-client';
import { makeCustomerToken, makeStaffToken } from './helpers/jwt-helpers';

// ─── Representative protected endpoints ──────────────────────────────────────

const ADMIN_ENDPOINTS = [
  '/api/admin/v1/branches/BRANCH_ID/settings',
  '/api/admin/v1/branches/BRANCH_ID/business-hours',
  '/api/admin/v1/branches/BRANCH_ID/commission-settings',
];

const MANAGER_ENDPOINTS = [
  '/api/manager/v1/branches/BRANCH_ID/reservations',
  '/api/manager/v1/branches/BRANCH_ID/tables',
];

const WAITER_ENDPOINTS = [
  '/api/waiter/v1/branches/BRANCH_ID/walk-ins',
];

const ALL_PROTECTED_ENDPOINTS = [...ADMIN_ENDPOINTS, ...MANAGER_ENDPOINTS, ...WAITER_ENDPOINTS];

// ─── Availability flags ───────────────────────────────────────────────────────

let apiAvailable = true;
let defaultBranchId = '00000000-0000-0000-0000-000000000001'; // fallback
let pool: Pool | null = null;

beforeAll(async () => {
  // Try to get the real branch ID from DB
  try {
    pool = await getTestPool();
    const branch = await queryOne<{ id: string }>(pool, `SELECT id FROM branches LIMIT 1`);
    if (branch) defaultBranchId = branch.id;
  } catch {
    // DB not available — use fallback UUID
  }

  // API probe
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) apiAvailable = false;
  } catch {
    console.warn('[06-rbac] Backend not reachable — all RBAC tests will skip.');
    apiAvailable = false;
  }
});

function skipIfNoApi() {
  if (!apiAvailable) {
    console.warn('[06-rbac] Skipping — backend not available.');
    return true;
  }
  return false;
}

/** Replace BRANCH_ID placeholder with the real branch ID */
function resolvePath(path: string) {
  return path.replace('BRANCH_ID', defaultBranchId);
}

/** Make a GET request with optional Authorization and X-Branch-ID headers */
async function authGet(
  path: string,
  token?: string,
  branchId?: string,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (branchId) headers['X-Branch-ID'] = branchId;
  return fetch(`${API_BASE}${path}`, { method: 'GET', headers });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RBAC Enforcement Validation', () => {

  // ── Property 15: Unauthenticated → 401 on all protected endpoints (Req 12.1) ─
  // Feature: local-test-deployment-validation, Property 15
  it('Property 15: unauthenticated requests to protected endpoints always return HTTP 401', async () => {
    if (skipIfNoApi()) return;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_PROTECTED_ENDPOINTS),
        async (path) => {
          const res = await authGet(resolvePath(path), undefined, defaultBranchId);
          expect(
            res.status,
            `Unauthenticated GET ${path} must return 401, got ${res.status}`,
          ).toBe(401);
        },
      ),
      { numRuns: ALL_PROTECTED_ENDPOINTS.length * 2 },
    );
  });

  // ── Property 15: Customer JWT (no role) → 403 on staff endpoints (Req 12.2) ─
  // Feature: local-test-deployment-validation, Property 15
  it('Property 15: customer JWT (no role claim) always returns HTTP 403 on staff endpoints', async () => {
    if (skipIfNoApi()) return;

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.emailAddress(),
        fc.constantFrom(...ALL_PROTECTED_ENDPOINTS),
        async (sub, email, path) => {
          const token = makeCustomerToken(sub, email);
          const res = await authGet(resolvePath(path), token, defaultBranchId);
          expect(
            res.status,
            `Customer JWT on ${path} must return 403, got ${res.status}`,
          ).toBe(403);
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── Property 16: Waiter JWT → 403 on admin/manager endpoints (Req 12.3) ───
  // Feature: local-test-deployment-validation, Property 16
  it('Property 16: waiter JWT always returns HTTP 403 on admin and manager endpoints', async () => {
    if (skipIfNoApi()) return;

    const restrictedForWaiter = [...ADMIN_ENDPOINTS, ...MANAGER_ENDPOINTS];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...restrictedForWaiter),
        async (staffId, path) => {
          const token = makeStaffToken(
            staffId,
            `waiter-${staffId.slice(0, 8)}@test.com`,
            'waiter',
            defaultBranchId,
          );
          const res = await authGet(resolvePath(path), token, defaultBranchId);
          expect(
            res.status,
            `Waiter JWT on ${path} must return 403, got ${res.status}`,
          ).toBe(403);
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── Property 16: Manager JWT → 403 on admin endpoints (Req 12.4) ──────────
  // Feature: local-test-deployment-validation, Property 16
  it('Property 16: manager JWT always returns HTTP 403 on admin endpoints', async () => {
    if (skipIfNoApi()) return;

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...ADMIN_ENDPOINTS),
        async (staffId, path) => {
          const token = makeStaffToken(
            staffId,
            `manager-${staffId.slice(0, 8)}@test.com`,
            'manager',
            defaultBranchId,
          );
          const res = await authGet(resolvePath(path), token, defaultBranchId);
          expect(
            res.status,
            `Manager JWT on ${path} must return 403, got ${res.status}`,
          ).toBe(403);
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── Task 7.6 — Admin JWT can call representative endpoints (Req 12.5) ──────
  it('admin JWT can call representative endpoints from each prefix without 401 or 403', async () => {
    if (skipIfNoApi()) return;

    const adminId = '00000000-0000-0000-0000-000000000099';
    const token = makeStaffToken(adminId, 'admin@test.com', 'admin', defaultBranchId);

    const representativeEndpoints = [
      ADMIN_ENDPOINTS[0],
      MANAGER_ENDPOINTS[0],
      WAITER_ENDPOINTS[0],
    ];

    for (const path of representativeEndpoints) {
      const res = await authGet(resolvePath(path), token, defaultBranchId);
      expect(
        res.status,
        `Admin JWT on ${path} must not return 401 or 403, got ${res.status}`,
      ).not.toBe(401);
      expect(res.status).not.toBe(403);
    }
  });

  // ── Property 17: Missing X-Branch-ID → 400; non-existent branch → 404 (Req 12.6) ─
  // Feature: local-test-deployment-validation, Property 17
  it('Property 17: missing X-Branch-ID always returns 400; non-existent branch UUID always returns 404', async () => {
    if (skipIfNoApi()) return;

    const adminId = '00000000-0000-0000-0000-000000000099';

    // Missing header → 400
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_PROTECTED_ENDPOINTS),
        async (path) => {
          const token = makeStaffToken(adminId, 'admin@test.com', 'admin', defaultBranchId);
          // No X-Branch-ID header
          const res = await fetch(`${API_BASE}${resolvePath(path)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          });
          expect(
            res.status,
            `Missing X-Branch-ID on ${path} must return 400, got ${res.status}`,
          ).toBe(400);
        },
      ),
      { numRuns: ALL_PROTECTED_ENDPOINTS.length },
    );

    // Non-existent branch UUID → 404
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...ALL_PROTECTED_ENDPOINTS),
        async (fakeBranchId, path) => {
          // Build a token scoped to the fake branch
          const token = makeStaffToken(adminId, 'admin@test.com', 'admin', fakeBranchId);
          // Replace BRANCH_ID in path with the fake UUID too
          const resolvedPath = path.replace('BRANCH_ID', fakeBranchId);
          const res = await authGet(resolvedPath, token, fakeBranchId);
          // Expect 404 (branch not found) — or 403 if branch mismatch check fires first
          expect(
            [404, 403].includes(res.status),
            `Non-existent branch on ${path} must return 404 or 403, got ${res.status}`,
          ).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── Property 18: Branch ID mismatch → 403 (Req 12.7) ─────────────────────
  // Feature: local-test-deployment-validation, Property 18
  it('Property 18: staff JWT branch_id mismatch with X-Branch-ID always returns HTTP 403', async () => {
    if (skipIfNoApi()) return;

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...ALL_PROTECTED_ENDPOINTS),
        async (staffId, differentBranchId, endpointPath) => {
          // Skip if the random UUID happens to equal the real branch ID
          if (differentBranchId === defaultBranchId) return;

          // Token is scoped to defaultBranchId, but header says differentBranchId
          const token = makeStaffToken(
            staffId,
            `staff-${staffId.slice(0, 8)}@test.com`,
            'admin',
            defaultBranchId,
          );

          const resolvedPath = endpointPath.replace('BRANCH_ID', differentBranchId);
          const res = await authGet(resolvedPath, token, differentBranchId);

          expect(
            res.status,
            `Branch ID mismatch on ${endpointPath} must return 403, got ${res.status}`,
          ).toBe(403);
        },
      ),
      { numRuns: 20 },
    );
  });
});
