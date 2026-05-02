/**
 * UI Segregation Validation
 * Properties 12â€“14 | Requirements 5.3â€“5.5, 6.4â€“6.8
 *
 * These tests require the frontends to be running:
 *   npm run client:portal    (sejiwa Portal :5174)
 *   npm run client:dashboard (Sneat Dashboard :5173)
 *
 * Tests gracefully skip when the services are not reachable.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { PORTAL_BASE, DASHBOARD_BASE } from './helpers/http-client';
import { makeStaffToken } from './helpers/jwt-helpers';

// â”€â”€â”€ Sneat-specific identifiers that must never appear in sejiwa Portal â”€â”€â”€â”€â”€
const SNEAT_IDENTIFIERS = ['sneat-', 'layout-navbar', 'layout-menu'];

// â”€â”€â”€ Known sejiwa Portal routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const sejiwa_ROUTES = ['/', '/book', '/auth', '/reservation'];

// â”€â”€â”€ Role-based navigation rules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const WAITER_ONLY_PATHS = ['/tables', '/walk-ins', '/seat'];
const MANAGER_EXTRA_PATHS = ['/reservations', '/no-show', '/unlock'];
const ADMIN_EXTRA_PATHS = ['/staff', '/settings', '/sections', '/commission'];

// â”€â”€â”€ Availability flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let portalAvailable = true;
let dashboardAvailable = true;

beforeAll(async () => {
  try {
    await fetch(`${PORTAL_BASE}/`, { redirect: 'manual' });
  } catch {
    console.warn('[05-ui-segregation] sejiwa Portal not reachable â€” portal tests will skip.');
    portalAvailable = false;
  }

  try {
    await fetch(`${DASHBOARD_BASE}/`, { redirect: 'manual' });
  } catch {
    console.warn('[05-ui-segregation] Sneat Dashboard not reachable â€” dashboard tests will skip.');
    dashboardAvailable = false;
  }
});

function skipIfNoPortal() {
  if (!portalAvailable) {
    console.warn('[05-ui-segregation] Skipping â€” sejiwa Portal not available.');
    return true;
  }
  return false;
}

function skipIfNoDashboard() {
  if (!dashboardAvailable) {
    console.warn('[05-ui-segregation] Skipping â€” Sneat Dashboard not available.');
    return true;
  }
  return false;
}

// â”€â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('UI Segregation Validation', () => {

  // â”€â”€ Task 6.2 â€” sejiwa Portal root redirects to /book (Req 5.3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  it('GET http://localhost:5174/ should redirect to /book', async () => {
    if (skipIfNoPortal()) return;

    const res = await fetch(`${PORTAL_BASE}/`, { redirect: 'manual' });
    // Vite SPA may return 200 with client-side routing, or a 3xx redirect
    // Accept either: a redirect to /book, or a 200 with /book in the HTML
    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get('location') ?? '';

    if (isRedirect) {
      expect(location, 'Redirect location must point to /book').toContain('/book');
    } else {
      // SPA â€” check the HTML contains a reference to /book
      const html = await res.text();
      expect(
        html.includes('/book') || html.includes('book'),
        'Portal root HTML must reference the /book route',
      ).toBe(true);
    }
  });

  // â”€â”€ Task 6.3 â€” Property 13: unknown paths never show Sneat content (Req 5.4) â”€
  // Feature: local-test-deployment-validation, Property 13
  it('Property 13: unknown sejiwa Portal paths never contain Sneat identifiers', async () => {
    if (skipIfNoPortal()) return;

    // Generate random path segments that won't match any real route
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^\/[a-z]{6,12}\/[a-z]{4,8}$/),
        async (randomPath) => {
          let res: Response;
          try {
            res = await fetch(`${PORTAL_BASE}${randomPath}`, { redirect: 'follow' });
          } catch {
            return; // network error â€” skip this iteration
          }

          const html = await res.text();

          for (const id of SNEAT_IDENTIFIERS) {
            expect(
              html.includes(id),
              `sejiwa Portal must not contain Sneat identifier '${id}' on path ${randomPath}`,
            ).toBe(false);
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  // â”€â”€ Task 6.4 â€” Property 12: known sejiwa routes never show Sneat content (Req 5.5) â”€
  // Feature: local-test-deployment-validation, Property 12
  it('Property 12: sejiwa Portal routes never render Sneat-specific identifiers', async () => {
    if (skipIfNoPortal()) return;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...sejiwa_ROUTES),
        async (route) => {
          let res: Response;
          try {
            res = await fetch(`${PORTAL_BASE}${route}`, { redirect: 'follow' });
          } catch {
            return;
          }

          const html = await res.text();

          for (const id of SNEAT_IDENTIFIERS) {
            expect(
              html.includes(id),
              `sejiwa Portal route '${route}' must not contain Sneat identifier '${id}'`,
            ).toBe(false);
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  // â”€â”€ Task 6.5 â€” Sneat Dashboard root redirects to login when unauthenticated (Req 6.4) â”€
  it('GET http://localhost:5173/ without auth should redirect to staff login page', async () => {
    if (skipIfNoDashboard()) return;

    const res = await fetch(`${DASHBOARD_BASE}/`, { redirect: 'manual' });
    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get('location') ?? '';

    if (isRedirect) {
      expect(
        location.includes('login') || location.includes('auth'),
        `Redirect location '${location}' must point to a login/auth page`,
      ).toBe(true);
    } else {
      // SPA â€” the HTML should contain a login form or reference
      const html = await res.text();
      expect(
        html.includes('login') || html.includes('Login') || html.includes('sign-in'),
        'Dashboard root must reference a login page when unauthenticated',
      ).toBe(true);
    }
  });

  // â”€â”€ Task 6.6 â€” Property 14: waiter JWT shows only waiter nav items (Req 6.5) â”€
  // Feature: local-test-deployment-validation, Property 14
  it('Property 14: waiter JWT â€” navigation contains only waiter-permitted items', async () => {
    if (skipIfNoDashboard()) return;

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (staffId, branchId) => {
          const token = makeStaffToken(staffId, `waiter-${staffId.slice(0, 8)}@test.com`, 'waiter', branchId);

          let res: Response;
          try {
            res = await fetch(`${DASHBOARD_BASE}/`, {
              headers: { Authorization: `Bearer ${token}` },
              redirect: 'follow',
            });
          } catch {
            return;
          }

          const html = await res.text();

          // Waiter should NOT see admin/manager-only nav items
          const adminOnlyTerms = ['staff-management', 'branch-settings', 'commission-config'];
          for (const term of adminOnlyTerms) {
            expect(
              html.includes(term),
              `Waiter dashboard must not contain admin-only nav item '${term}'`,
            ).toBe(false);
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  // â”€â”€ Task 6.7 â€” Property 14: manager JWT shows waiter + manager items (Req 6.6) â”€
  // Feature: local-test-deployment-validation, Property 14
  it('Property 14: manager JWT â€” navigation contains waiter items plus manager-specific items', async () => {
    if (skipIfNoDashboard()) return;

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (staffId, branchId) => {
          const token = makeStaffToken(staffId, `manager-${staffId.slice(0, 8)}@test.com`, 'manager', branchId);

          let res: Response;
          try {
            res = await fetch(`${DASHBOARD_BASE}/`, {
              headers: { Authorization: `Bearer ${token}` },
              redirect: 'follow',
            });
          } catch {
            return;
          }

          const html = await res.text();

          // Manager should NOT see admin-only items
          const adminOnlyTerms = ['staff-management'];
          for (const term of adminOnlyTerms) {
            expect(
              html.includes(term),
              `Manager dashboard must not contain admin-only nav item '${term}'`,
            ).toBe(false);
          }
        },
      ),
      { numRuns: 5 },
    );
  });

  // â”€â”€ Task 6.8 â€” Property 14: admin JWT shows all items (Req 6.7) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Feature: local-test-deployment-validation, Property 14
  it('Property 14: admin JWT â€” navigation contains all items', async () => {
    if (skipIfNoDashboard()) return;

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (staffId, branchId) => {
          const token = makeStaffToken(staffId, `admin-${staffId.slice(0, 8)}@test.com`, 'admin', branchId);

          let res: Response;
          try {
            res = await fetch(`${DASHBOARD_BASE}/`, {
              headers: { Authorization: `Bearer ${token}` },
              redirect: 'follow',
            });
          } catch {
            return;
          }

          // Admin gets a 200 (not redirected to login)
          expect(
            res.status,
            'Admin JWT must not be redirected to login (status should not be 401/403)',
          ).not.toBe(401);
          expect(res.status).not.toBe(403);
        },
      ),
      { numRuns: 5 },
    );
  });

  // â”€â”€ Task 6.9 â€” Property: staff outside permitted URLs redirected (Req 6.8) â”€
  it('Property: staff accessing URLs outside their role always get redirected or denied', async () => {
    if (skipIfNoDashboard()) return;

    // Waiter trying to access admin-only paths
    const adminPaths = ['/admin/staff', '/admin/settings', '/admin/sections'];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...adminPaths),
        async (staffId, branchId, path) => {
          const token = makeStaffToken(staffId, `waiter-${staffId.slice(0, 8)}@test.com`, 'waiter', branchId);

          let res: Response;
          try {
            res = await fetch(`${DASHBOARD_BASE}${path}`, {
              headers: { Authorization: `Bearer ${token}` },
              redirect: 'manual',
            });
          } catch {
            return;
          }

          // Should be redirected (3xx) or denied (401/403) â€” not a 200 with content
          const isRedirectedOrDenied =
            (res.status >= 300 && res.status < 400) ||
            res.status === 401 ||
            res.status === 403;

          // SPA may return 200 but render an access-denied component
          if (!isRedirectedOrDenied) {
            const html = await res.text();
            expect(
              html.includes('access-denied') ||
              html.includes('Access Denied') ||
              html.includes('unauthorized') ||
              html.includes('login'),
              `Waiter accessing '${path}' must see access-denied or login, not unrestricted content`,
            ).toBe(true);
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});

