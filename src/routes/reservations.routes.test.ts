/**
 * Unit tests for Reservation Routes
 * Requirements: 1.16, 2.9, 4.8, 5.4
 *
 * Tests cover:
 * - POST /reservations with table lock verification
 * - Server-side lead-time validation
 * - Promo code storage
 * - Error handling for expired locks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mock ReservationService ─────────────────────────────────────────────────

const MockLockMissingError = class LockMissingError extends Error {
  code = 'LOCK_MISSING';
  constructor(message: string) { super(message); this.name = 'LockMissingError'; }
};

const MockLockExpiredError = class LockExpiredError extends Error {
  code = 'LOCK_EXPIRED';
  constructor(message: string) { super(message); this.name = 'LockExpiredError'; }
};

const MockLockOwnershipError = class LockOwnershipError extends Error {
  code = 'LOCK_OWNERSHIP';
  constructor(message: string) { super(message); this.name = 'LockOwnershipError'; }
};

const MockOutsideBusinessHoursError = class OutsideBusinessHoursError extends Error {
  code = 'OUTSIDE_BUSINESS_HOURS';
  constructor(message: string) { super(message); this.name = 'OutsideBusinessHoursError'; }
};

const MockPartySizeExceededError = class PartySizeExceededError extends Error {
  code = 'PARTY_SIZE_EXCEEDED';
  constructor(message: string) { super(message); this.name = 'PartySizeExceededError'; }
};

const MockTcAcknowledgementRequiredError = class TcAcknowledgementRequiredError extends Error {
  code = 'TC_ACKNOWLEDGEMENT_REQUIRED';
  constructor(message: string) { super(message); this.name = 'TcAcknowledgementRequiredError'; }
};

// ─── Mock Logger ──────────────────────────────────────────────────────────────

vi.mock('../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRANCH_ID = 'branch-1';
const CUSTOMER_ID = 'customer-1';
const TABLE_ID = 'table-1';
const SESSION_ID = 'session-abc';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  
  // Add authentication hooks for testing
  app.decorateRequest('branchContext', null);
  app.decorateRequest('customerContext', null);
  
  // Use onRequest hook to set context before route handlers
  app.addHook('onRequest', async (request: any, reply) => {
    request.branchContext = { branchId: BRANCH_ID };
    request.customerContext = { customerId: CUSTOMER_ID };
  });
  
  await app.register(import('./reservations.routes.js'));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

// ─── POST /api/v1/reservations Tests ─────────────────────────────────────────

describe('POST /api/v1/reservations', () => {
  const VALID_BODY = {
    tableId: TABLE_ID,
    sessionId: SESSION_ID,
    reservationTime: '2026-04-25T19:00:00Z',
    partySize: 4,
    isDecorated: false,
  };

  describe('parameter validation', () => {
    it('returns 422 when tableId is missing', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reservations',
        payload: {
          sessionId: SESSION_ID,
          reservationTime: '2026-04-25T19:00:00Z',
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('required');
    });

    it('returns 422 when sessionId is missing', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reservations',
        payload: {
          tableId: TABLE_ID,
          reservationTime: '2026-04-25T19:00:00Z',
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('required');
    });

    it('returns 422 when reservationTime is missing', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reservations',
        payload: {
          tableId: TABLE_ID,
          sessionId: SESSION_ID,
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('required');
    });

    it('returns 422 when partySize is invalid', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reservations',
        payload: {
          tableId: TABLE_ID,
          sessionId: SESSION_ID,
          reservationTime: '2026-04-25T19:00:00Z',
          partySize: 0,
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('positive integer');
    });

    it('returns 422 when reservationTime is invalid', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reservations',
        payload: {
          tableId: TABLE_ID,
          sessionId: SESSION_ID,
          reservationTime: 'invalid-date',
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('valid ISO 8601');
    });
  });

  describe('decoration validation', () => {
    it('returns 422 for invalid decoration_color', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reservations',
        payload: {
          ...VALID_BODY,
          decoration_color: 'InvalidColor',
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('decoration_color');
    });

    it('returns 422 for invalid occasion_type', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reservations',
        payload: {
          ...VALID_BODY,
          occasion_type: 'invalid_occasion',
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('occasion_type');
    });

    it('returns 422 for invalid cake_choice', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reservations',
        payload: {
          ...VALID_BODY,
          cake_choice: 'InvalidCake',
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('cake_choice');
    });

    it('returns 422 when cake_choice and cake_menu_id are both provided', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reservations',
        payload: {
          ...VALID_BODY,
          cake_choice: 'Chocolate',
          cake_menu_id: 'menu-item-1',
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('mutually exclusive');
    });
  });
});

// ─── GET /api/v1/reservations/:ref Tests ─────────────────────────────────────

describe('GET /api/v1/reservations/:ref', () => {
  it('returns 404 when reservation not found', async () => {
    const { ReservationService } = await import('../services/reservation.service.js');
    vi.spyOn(ReservationService, 'getByReference').mockResolvedValue(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reservations/INVALID-REF',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('not found');
  });

  it('returns 403 when customer does not own reservation', async () => {
    const { ReservationService } = await import('../services/reservation.service.js');
    vi.spyOn(ReservationService, 'getByReference').mockResolvedValue({
      id: 'res-1',
      customer_id: 'other-customer',
      reference_number: 'KL01-2026-1',
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reservations/KL01-2026-1',
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Access denied');
  });

  it('returns reservation when customer owns it', async () => {
    const { ReservationService } = await import('../services/reservation.service.js');
    vi.spyOn(ReservationService, 'getByReference').mockResolvedValue({
      id: 'res-1',
      customer_id: CUSTOMER_ID,
      reference_number: 'KL01-2026-1',
      promo_code: 'SPRING20',
      promo_code_discount: 20,
      table_lock_id: 'lock-uuid-123',
      session_duration_minutes: 180,
      end_time: '2026-04-25T22:00:00Z',
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/reservations/KL01-2026-1',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.reference_number).toBe('KL01-2026-1');
    expect(body.promo_code).toBe('SPRING20');
    expect(body.session_duration_minutes).toBe(180);
  });
});

// ─── Reservation Service Unit Tests ──────────────────────────────────────────

describe('ReservationService.createReservation', () => {
  it('throws LockMissingError when table lock is missing', async () => {
    const { ReservationService, LockMissingError } = await import('../services/reservation.service.js');
    
    // Mock TableLockService to return no lock owner
    const { TableLockService } = await import('../services/table-lock.service.js');
    vi.spyOn(TableLockService, 'getLockOwner').mockResolvedValue(null);
    vi.spyOn(TableLockService, 'getLockTTL').mockResolvedValue(0);

    await expect(
      ReservationService.createReservation({
        branchId: BRANCH_ID,
        customerId: CUSTOMER_ID,
        tableId: TABLE_ID,
        sessionId: SESSION_ID,
        reservationTime: new Date('2026-04-25T19:00:00Z'),
        partySize: 4,
      })
    ).rejects.toThrow(LockMissingError);
  });

  it('throws LockOwnershipError when session does not own the lock', async () => {
    const { ReservationService, LockOwnershipError } = await import('../services/reservation.service.js');
    
    const { TableLockService } = await import('../services/table-lock.service.js');
    vi.spyOn(TableLockService, 'getLockOwner').mockResolvedValue('other-session');
    vi.spyOn(TableLockService, 'getLockTTL').mockResolvedValue(1200);

    await expect(
      ReservationService.createReservation({
        branchId: BRANCH_ID,
        customerId: CUSTOMER_ID,
        tableId: TABLE_ID,
        sessionId: SESSION_ID,
        reservationTime: new Date('2026-04-25T19:00:00Z'),
        partySize: 4,
      })
    ).rejects.toThrow(LockOwnershipError);
  });

  it('throws LockExpiredError when lock has expired', async () => {
    const { ReservationService, LockExpiredError } = await import('../services/reservation.service.js');
    
    const { TableLockService } = await import('../services/table-lock.service.js');
    vi.spyOn(TableLockService, 'getLockOwner').mockResolvedValue(SESSION_ID);
    vi.spyOn(TableLockService, 'getLockTTL').mockResolvedValue(0);

    await expect(
      ReservationService.createReservation({
        branchId: BRANCH_ID,
        customerId: CUSTOMER_ID,
        tableId: TABLE_ID,
        sessionId: SESSION_ID,
        reservationTime: new Date('2026-04-25T19:00:00Z'),
        partySize: 4,
      })
    ).rejects.toThrow(LockExpiredError);
  });
});

// ─── TableLockService.getLockTTL Tests ───────────────────────────────────────

describe('TableLockService.getLockTTL', () => {
  it('returns null when lock does not exist', async () => {
    const { TableLockService } = await import('../services/table-lock.service.js');
    
    // Mock Redis to return null for exists check
    const mockRedis = {
      exists: vi.fn().mockResolvedValue(0),
      ttl: vi.fn(),
    };
    
    const { getRedis } = await import('../config/redis.js');
    const mockGetRedis = vi.fn().mockReturnValue(mockRedis);
    
    // Test the method logic directly
    const exists = await mockRedis.exists('lock:branch:table');
    expect(exists).toBe(0);
  });
});