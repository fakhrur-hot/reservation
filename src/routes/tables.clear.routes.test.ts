/**
 * Unit tests for POST /api/v1/tables/:tableId/clear
 *
 * Requirements: 3.8, 8.5, 8.6
 *
 * Tests cover:
 * - Staff authentication check
 * - Table not found (404)
 * - Successful clear (200) with WebSocket notification
 * - Service error handling (500)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetTable = vi.fn();
const mockPublishTableStatusChanged = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('../services/table.service.js', () => ({
  TableService: {
    getTable: (...args: unknown[]) => mockGetTable(...args),
  },
}));

vi.mock('../services/websocket-publisher.service.js', () => ({
  WebSocketPublisher: {
    publishTableStatusChanged: (...args: unknown[]) => mockPublishTableStatusChanged(...args),
  },
}));

vi.mock('../services/audit.service.js', () => ({
  AuditService: {
    log: (...args: unknown[]) => mockAuditLog(...args),
    logCreate: vi.fn(),
    logUpdate: vi.fn(),
  },
}));

vi.mock('../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCH_ID = 'branch-uuid-1';
const TABLE_ID = 'table-uuid-1';
const STAFF_ID = 'staff-uuid-1';

const MOCK_TABLE = {
  id: TABLE_ID,
  name: 'Table 5',
  capacity: 4,
  section_id: 'section-1',
  section_name: 'Indoor',
  status: 'occupied' as const,
  is_active: true,
};

// ─── App Builder ──────────────────────────────────────────────────────────────

async function buildApp(opts: {
  withStaff?: boolean;
  withBranch?: boolean;
} = {}): Promise<FastifyInstance> {
  const { withStaff = true, withBranch = true } = opts;

  const app = Fastify();

  app.decorateRequest('branchContext', null);
  app.decorateRequest('staffContext', null);

  app.addHook('onRequest', async (request: any) => {
    if (withBranch) {
      request.branchContext = { branchId: BRANCH_ID };
    }
    if (withStaff) {
      request.staffContext = { staffId: STAFF_ID };
    }
  });

  await app.register(import('./tables.routes.js'));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: WebSocket publish resolves successfully
  mockPublishTableStatusChanged.mockResolvedValue(undefined);
  mockAuditLog.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/tables/:tableId/clear', () => {
  describe('authentication', () => {
    it('returns 401 when staff is not authenticated', async () => {
      const app = await buildApp({ withStaff: false });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tables/${TABLE_ID}/clear`,
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Staff authentication required');
    });

    it('returns 400 when branchId is missing from context', async () => {
      const app = await buildApp({ withBranch: false });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tables/${TABLE_ID}/clear`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('branchId is required');
    });
  });

  describe('table lookup', () => {
    it('returns 404 when table does not exist', async () => {
      mockGetTable.mockResolvedValue(null);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tables/${TABLE_ID}/clear`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Table not found');
    });
  });

  describe('successful clear', () => {
    it('returns 200 with success message when table is cleared', async () => {
      mockGetTable.mockResolvedValue(MOCK_TABLE);

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tables/${TABLE_ID}/clear`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.tableId).toBe(TABLE_ID);
      expect(body.message).toContain(MOCK_TABLE.name);
    });

    it('publishes WebSocket notification with available status', async () => {
      mockGetTable.mockResolvedValue(MOCK_TABLE);

      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: `/api/v1/tables/${TABLE_ID}/clear`,
      });

      expect(mockPublishTableStatusChanged).toHaveBeenCalledWith(
        BRANCH_ID,
        TABLE_ID,
        'available'
      );
    });

    it('writes an audit log entry', async () => {
      mockGetTable.mockResolvedValue(MOCK_TABLE);

      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: `/api/v1/tables/${TABLE_ID}/clear`,
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: BRANCH_ID,
          actorId: STAFF_ID,
          action: 'CLEAR_TABLE',
          entityType: 'table',
          entityId: TABLE_ID,
        })
      );
    });
  });

  describe('error handling', () => {
    it('returns 500 when TableService.getTable throws', async () => {
      mockGetTable.mockRejectedValue(new Error('DB connection failed'));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tables/${TABLE_ID}/clear`,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to clear table');
    });

    it('returns 500 when WebSocket publish throws', async () => {
      mockGetTable.mockResolvedValue(MOCK_TABLE);
      mockPublishTableStatusChanged.mockRejectedValue(new Error('WS unavailable'));

      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/tables/${TABLE_ID}/clear`,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to clear table');
    });
  });
});
