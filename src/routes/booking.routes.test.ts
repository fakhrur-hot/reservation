/**
 * Unit tests for Booking Routes
 * Requirements: 1.6, 1.7, 2.6, 2.7, 2.8, 3.6, 3.7
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { bookingRoutes } from './booking.routes.js';
import { promoCodeRoutes } from './promo-code.routes.js';

// ─── Mock Database ────────────────────────────────────────────────────────────

const mockDb = {
  query: vi.fn(),
};

vi.mock('../config/database.js', () => ({
  getDatabase: () => mockDb,
}));

// ─── Mock Redis ───────────────────────────────────────────────────────────────

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
};

vi.mock('../config/redis.js', () => ({
  getRedis: () => mockRedis,
}));

// ─── Mock Logger ──────────────────────────────────────────────────────────────

vi.mock('../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Test Server Setup ───────────────────────────────────────────────────────

let fastify: FastifyInstance;

beforeAll(async () => {
  fastify = Fastify({ logger: false });
  await fastify.register(bookingRoutes);
  await fastify.register(promoCodeRoutes);
  await fastify.ready();
});

afterAll(async () => {
  await fastify.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── GET /api/v1/available-slots Tests ───────────────────────────────────────

describe('GET /api/v1/available-slots', () => {
  const VALID_QUERY = {
    branchId: 'branch-1',
    date: '2026-04-25',
    partySize: 4,
    isDecorated: false,
  };

  describe('parameter validation', () => {
    it('returns 400 when branchId is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          date: '2026-04-25',
          partySize: '4',
          isDecorated: 'false',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('MISSING_BRANCH_ID');
    });

    it('returns 400 when date is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          branchId: 'branch-1',
          partySize: '4',
          isDecorated: 'false',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('MISSING_DATE');
    });

    it('returns 400 when partySize is invalid', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          branchId: 'branch-1',
          date: '2026-04-25',
          partySize: '0',
          isDecorated: 'false',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_PARTY_SIZE');
    });

    it('returns 400 when isDecorated is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          branchId: 'branch-1',
          date: '2026-04-25',
          partySize: '4',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('MISSING_IS_DECORATED');
    });

    it('returns 400 when date is invalid', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          branchId: 'branch-1',
          date: 'invalid-date',
          partySize: '4',
          isDecorated: 'false',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_DATE');
    });
  });

  describe('promo code validation', () => {
    it('returns 400 when promo code is invalid', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // Promo code not found

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          ...VALID_QUERY,
          promoCode: 'INVALID123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_PROMO_CODE');
    });

    it('returns 400 when promo code is expired', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'code-expired-1',
          code: 'EXPIRED',
          type: 'discount',
          description: 'Test expired code',
          is_active: true,
          valid_from: new Date('2026-01-01'),
          valid_to: new Date('2026-02-01'), // Past date - code is expired
          max_uses: 100,
          current_uses: 50,
          discount_type: 'percentage',
          discount_value: 10,
          override_lead_time: false,
        }],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          ...VALID_QUERY,
          promoCode: 'EXPIRED',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('expired');
    });

    it('returns 400 when promo code usage limit reached', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'code-limit-1',
          code: 'FULLY_USED',
          type: 'discount',
          description: 'Test limit code',
          is_active: true,
          valid_from: new Date('2026-01-01'),
          valid_to: new Date('2026-12-31'),
          max_uses: 100,
          current_uses: 100,
          discount_type: 'percentage',
          discount_value: 10,
          override_lead_time: false,
        }],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          ...VALID_QUERY,
          promoCode: 'FULLY_USED',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('limit');
    });
  });

  describe('lead-time validation', () => {
    it('returns 400 when booking is too early for standard booking', async () => {
      // Mock promo code validation (no promo code)
      mockDb.query.mockResolvedValue({ rows: [] });

      // Mock business hours override check
      mockDb.query.mockResolvedValueOnce({
        rows: [{ is_closed: false, open_time: '09:00:00', close_time: '22:00:00' }],
      });

      // Mock tables query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'table-1', name: 'Table 1', capacity: 4 }],
      });

      // Mock no conflicting reservations
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      // Mock Redis for table lock check
      mockRedis.get.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          branchId: 'branch-1',
          date: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString().slice(0, 10), // 10 hours from now
          partySize: '4',
          isDecorated: 'false',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('LEAD_TIME_VIOLATION');
    });
  });

  describe('branch operating hours', () => {
    it('returns 400 when branch is closed on selected date', async () => {
      // Mock promo code validation (no promo code)
      mockDb.query.mockResolvedValue({ rows: [] });

      // Mock business hours override - closed
      mockDb.query.mockResolvedValueOnce({
        rows: [{ is_closed: true, open_time: null, close_time: null }],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: VALID_QUERY,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('BRANCH_CLOSED');
    });

    it('returns 400 when no tables available for party size', async () => {
      // Mock promo code validation (no promo code)
      mockDb.query.mockResolvedValue({ rows: [] });

      // Mock business hours
      mockDb.query.mockResolvedValueOnce({
        rows: [{ is_closed: false, open_time: '09:00:00', close_time: '22:00:00' }],
      });

      // Mock no tables with sufficient capacity
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: {
          ...VALID_QUERY,
          partySize: 20, // Large party
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('NO_TABLES');
    });
  });

  describe('successful slot generation', () => {
    it('returns available slots for valid request', async () => {
      // Mock promo code validation (no promo code)
      mockDb.query.mockResolvedValue({ rows: [] });

      // Mock business hours override check
      mockDb.query.mockResolvedValueOnce({
        rows: [],
      });

      // Mock business hours schedule
      mockDb.query.mockResolvedValueOnce({
        rows: [{ is_closed: false, open_time: '09:00:00', close_time: '22:00:00' }],
      });

      // Mock tables
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'table-1', name: 'Table 1', capacity: 4 },
          { id: 'table-2', name: 'Table 2', capacity: 6 },
        ],
      });

      // Mock no conflicting reservations for all slots
      mockDb.query.mockResolvedValue({ rows: [{ count: '0' }] });

      // Mock Redis for table lock check
      mockRedis.get.mockResolvedValue(null);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v1/available-slots',
        query: VALID_QUERY,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.slots).toBeDefined();
      expect(Array.isArray(body.slots)).toBe(true);
      expect(body.slots.length).toBeGreaterThan(0);

      // Check slot structure
      const slot = body.slots[0];
      expect(slot).toHaveProperty('startTime');
      expect(slot).toHaveProperty('endTime');
      expect(slot).toHaveProperty('duration');
      expect(slot).toHaveProperty('available');
      expect(slot.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(slot.endTime).toMatch(/^\d{2}:\d{2}$/);
      expect(typeof slot.duration).toBe('number');
      expect(typeof slot.available).toBe('boolean');

      expect(body.leadTimeApplied).toBe(24);
      expect(body.promoCodeValid).toBeNull();
      expect(body.date).toBe(VALID_QUERY.date);
      expect(body.partySize).toBe(VALID_QUERY.partySize);
      expect(body.isDecorated).toBe(VALID_QUERY.isDecorated);
    });
  });
});

// ─── POST /api/v1/promo-codes/validate Tests ─────────────────────────────────

describe('POST /api/v1/promo-codes/validate', () => {
  const VALID_BODY = {
    code: 'SPRING20',
    branchId: 'branch-1',
    bookingType: 'standard' as const,
    partySize: 4,
  };

  describe('parameter validation', () => {
    it('returns 400 when code is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/promo-codes/validate',
        payload: {
          branchId: 'branch-1',
          bookingType: 'standard',
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('MISSING_CODE');
    });

    it('returns 400 when branchId is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/promo-codes/validate',
        payload: {
          code: 'SPRING20',
          bookingType: 'standard',
          partySize: 4,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('MISSING_BRANCH_ID');
    });

    it('returns 400 when partySize is invalid', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/promo-codes/validate',
        payload: {
          code: 'SPRING20',
          branchId: 'branch-1',
          bookingType: 'standard',
          partySize: 0,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_PARTY_SIZE');
    });
  });

  describe('promo code validation', () => {
    it('returns valid=false for non-existent code', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/promo-codes/validate',
        payload: {
          ...VALID_BODY,
          code: 'INVALID123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.error).toContain('not found');
    });

    it('returns valid=true for active discount code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          code: 'SPRING20',
          type: 'discount',
          description: 'Spring promotion - 20% off',
          discount_type: 'percentage',
          discount_value: 20,
          is_active: true,
          valid_from: new Date('2026-01-01'),
          valid_to: new Date('2026-12-31'),
          max_uses: 300,
          current_uses: 50,
        }],
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/promo-codes/validate',
        payload: VALID_BODY,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
      expect(body.details.code).toBe('SPRING20');
      expect(body.details.type).toBe('discount');
      expect(body.details.discountType).toBe('percentage');
      expect(body.details.discountValue).toBe(20);
    });

    it('returns leadTimeOverride for priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          code: 'LASTMIN24',
          type: 'priority',
          description: 'Last-minute booking',
          is_active: true,
          valid_from: new Date('2026-01-01'),
          valid_to: new Date('2026-12-31'),
          max_uses: 100,
          current_uses: 10,
        }],
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/promo-codes/validate',
        payload: {
          ...VALID_BODY,
          code: 'LASTMIN24',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
      expect(body.details.type).toBe('priority');
      expect(body.details.leadTimeOverride).toBe(true);
      expect(body.details.minLeadTimeMinutes).toBe(60);
    });

    it('returns minPartySize for group code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          code: 'GROUP6PLUS',
          type: 'group',
          description: 'Group bookings',
          min_party_size: 6,
          is_active: true,
          valid_from: new Date('2026-01-01'),
          valid_to: new Date('2026-12-31'),
          max_uses: 50,
          current_uses: 5,
        }],
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/promo-codes/validate',
        payload: {
          ...VALID_BODY,
          code: 'GROUP6PLUS',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
      expect(body.details.type).toBe('group');
      expect(body.details.minPartySize).toBe(6);
    });

    it('returns time window for turnover code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          code: 'TEATIME',
          type: 'turnover',
          description: 'Tea time special',
          valid_from_time: '15:00:00',
          valid_to_time: '17:00:00',
          valid_days_of_week: 'MON,TUE,WED,THU,FRI',
          is_active: true,
          valid_from: new Date('2026-01-01'),
          valid_to: new Date('2026-12-31'),
          max_uses: 200,
          current_uses: 50,
        }],
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/promo-codes/validate',
        payload: {
          ...VALID_BODY,
          code: 'TEATIME',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
      expect(body.details.type).toBe('turnover');
      expect(body.details.validFromTime).toBe('15:00:00');
      expect(body.details.validToTime).toBe('17:00:00');
      expect(body.details.validDaysOfWeek).toBe('MON,TUE,WED,THU,FRI');
    });

    it('returns sessionDurationMinutes for VIP code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          code: 'VIP2024',
          type: 'vip',
          description: 'VIP members',
          force_session_duration: 180,
          is_active: true,
          valid_from: new Date('2026-01-01'),
          valid_to: new Date('2026-12-31'),
          max_uses: 500,
          current_uses: 100,
        }],
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v1/promo-codes/validate',
        payload: {
          ...VALID_BODY,
          code: 'VIP2024',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
      expect(body.details.type).toBe('vip');
      expect(body.details.sessionDurationMinutes).toBe(180);
    });
  });
});

// ─── Integration Scenarios ───────────────────────────────────────────────────

describe('Integration scenarios', () => {
  it('complete flow: standard booking without promo code', async () => {
    // Mock promo code validation (no promo code)
    mockDb.query.mockResolvedValue({ rows: [] });

    // Mock business hours override check
    mockDb.query.mockResolvedValueOnce({
      rows: [],
    });

    // Mock business hours schedule
    mockDb.query.mockResolvedValueOnce({
      rows: [{ is_closed: false, open_time: '09:00:00', close_time: '22:00:00' }],
    });

    // Mock tables
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'table-1', name: 'Table 1', capacity: 4 }],
    });

    // Mock no conflicting reservations
    mockDb.query.mockResolvedValue({ rows: [{ count: '0' }] });

    // Mock Redis for table lock check
    mockRedis.get.mockResolvedValue(null);

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/v1/available-slots',
      query: {
        branchId: 'branch-1',
        date: '2026-04-25',
        partySize: '4',
        isDecorated: 'false',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Verify slots are generated
    expect(body.slots.length).toBeGreaterThan(0);

    // Verify daytime slots have 90-minute duration
    const daytimeSlots = body.slots.filter(s => {
      const hour = parseInt(s.startTime.split(':')[0], 10);
      return hour >= 9 && hour < 19;
    });
    expect(daytimeSlots.length).toBeGreaterThan(0);
    expect(daytimeSlots[0].duration).toBe(90);

    // Verify evening slots have 180-minute duration
    const eveningSlots = body.slots.filter(s => {
      const hour = parseInt(s.startTime.split(':')[0], 10);
      return hour >= 19;
    });
    expect(eveningSlots.length).toBeGreaterThan(0);
    expect(eveningSlots[0].duration).toBe(180);
  });
});