/**
 * Promo Code Service Tests
 *
 * Tests for promo code validation across all 6 promo code types:
 * - Priority_Code: Overrides Lead_Time to 1 hour
 * - Turnover_Code: Restricts usage to specific time windows
 * - VIP_Code: Forces 3-hour Session_Duration
 * - Affiliate_Code: Tracks booking sources
 * - Group_Code: Validates minimum Party_Size
 * - Discount_Code: Applies percentage or fixed-amount discount
 */

import { describe, test, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { PromoCodeService, PromoCodeType, PromoValidationResult } from './promo-code.service.js';
import { getDatabase } from '../config/database.js';
import { getRedis } from '../config/redis.js';

// Mock database and Redis
const mockDb = {
  query: vi.fn(),
};

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
};

// Mock config modules
vi.mock('../config/database.js', () => ({
  getDatabase: () => mockDb,
}));

vi.mock('../config/redis.js', () => ({
  getRedis: () => mockRedis,
}));

vi.mock('../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('PromoCodeService', () => {
  const branchId = 'test-branch-uuid';
  const bookingType: 'standard' | 'decorated' = 'standard';
  const partySize = 4;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validate()', () => {
    // ── Priority Code Tests ───────────────────────────────────────────────────

    test('should validate a Priority code successfully', async () => {
      const code = 'LASTMIN24';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'LASTMIN24',
        type: 'priority',
        description: 'Last-minute booking discount',
        override_lead_time: true,
        is_active: true,
        valid_from: null,
        valid_to: null,
        max_uses: 100,
        current_uses: 50,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details?.type).toBe('priority');
      expect(result.details?.overrideLeadTime).toBe(true);
      expect(result.details?.minLeadTimeMinutes).toBe(60);
      expect(result.error).toBeUndefined();
    });

    test('should reject inactive Priority code', async () => {
      const code = 'INACTIVE';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'INACTIVE',
        type: 'priority',
        is_active: false,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code is inactive');
      expect(result.errorCode).toBe('INACTIVE');
    });

    test('should reject expired Priority code', async () => {
      const code = 'EXPIRED';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'EXPIRED',
        type: 'priority',
        is_active: true,
        valid_to: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code has expired');
      expect(result.errorCode).toBe('EXPIRED');
    });

    test('should reject Priority code with usage limit reached', async () => {
      const code = 'FULL';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'FULL',
        type: 'priority',
        is_active: true,
        max_uses: 100,
        current_uses: 100,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code usage limit reached');
      expect(result.errorCode).toBe('USAGE_LIMIT');
    });

    // ── Turnover Code Tests ───────────────────────────────────────────────────

    test('should validate a Turnover code within time window', async () => {
      const code = 'TEATIME';
      const selectedTime = '15:30'; // Within 15:00-17:00 window
      const mockPromo = {
        id: 'promo-uuid',
        code: 'TEATIME',
        type: 'turnover',
        description: 'Tea time special',
        valid_from_time: '15:00:00',
        valid_to_time: '17:00:00',
        valid_days_of_week: 'MON,TUE,WED,THU,FRI',
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      // Use a weekday (e.g., Monday = 1)
      const monday = new Date('2026-04-06'); // This is a Monday
      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize,
        selectedTime,
        monday
      );

      expect(result.valid).toBe(true);
      expect(result.details?.type).toBe('turnover');
      expect(result.details?.validFromTime).toBe('15:00');
      expect(result.details?.validToTime).toBe('17:00');
    });

    test('should reject Turnover code outside time window', async () => {
      const code = 'TEATIME';
      const selectedTime = '18:00'; // Outside 15:00-17:00 window
      const mockPromo = {
        id: 'promo-uuid',
        code: 'TEATIME',
        type: 'turnover',
        valid_from_time: '15:00:00',
        valid_to_time: '17:00:00',
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize,
        selectedTime
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('only valid between');
      expect(result.errorCode).toBe('TIME_RESTRICTION');
    });

    test('should reject Turnover code on invalid day', async () => {
      const code = 'WEEKDAYSPECIAL';
      const selectedTime = '14:00';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'WEEKDAYSPECIAL',
        type: 'turnover',
        valid_from_time: '15:00:00',
        valid_to_time: '17:00:00',
        valid_days_of_week: 'MON,TUE,WED,THU,FRI', // Weekdays only
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      // Sunday (day 0)
      const sunday = new Date('2026-04-05'); // This is a Sunday
      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize,
        selectedTime,
        sunday
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('only valid on');
      expect(result.errorCode).toBe('DAY_RESTRICTION');
    });

    // ── VIP Code Tests ───────────────────────────────────────────────────────

    test('should validate a VIP code successfully', async () => {
      const code = 'VIP2024';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'VIP2024',
        type: 'vip',
        description: 'VIP members discount',
        force_session_duration: 180,
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(true);
      expect(result.details?.type).toBe('vip');
      expect(result.details?.sessionDurationMinutes).toBe(180);
    });

    test('should use default 3-hour duration for VIP code if not configured', async () => {
      const code = 'VIPNODURATION';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'VIPNODURATION',
        type: 'vip',
        force_session_duration: null,
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(true);
      expect(result.details?.sessionDurationMinutes).toBe(180);
    });

    // ── Affiliate Code Tests ─────────────────────────────────────────────────

    test('should validate an Affiliate code successfully', async () => {
      const code = 'INFLUENCER_SARAH';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'INFLUENCER_SARAH',
        type: 'affiliate',
        description: 'Influencer Sarah partnership',
        affiliate_id: 'influencer_sarah_001',
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(true);
      expect(result.details?.type).toBe('affiliate');
      expect(result.details?.affiliateId).toBe('influencer_sarah_001');
    });

    // ── Group Code Tests ─────────────────────────────────────────────────────

    test('should validate a Group code with sufficient party size', async () => {
      const code = 'GROUP6PLUS';
      const partySize = 8;
      const mockPromo = {
        id: 'promo-uuid',
        code: 'GROUP6PLUS',
        type: 'group',
        description: 'Group booking discount',
        min_party_size: 6,
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(true);
      expect(result.details?.type).toBe('group');
      expect(result.details?.minPartySize).toBe(6);
    });

    test('should reject Group code with insufficient party size', async () => {
      const code = 'GROUP6PLUS';
      const partySize = 4; // Less than minimum of 6
      const mockPromo = {
        id: 'promo-uuid',
        code: 'GROUP6PLUS',
        type: 'group',
        min_party_size: 6,
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Minimum party size is 6 guests');
      expect(result.errorCode).toBe('PARTY_SIZE_TOO_SMALL');
    });

    test('should use default min party size of 6 if not configured', async () => {
      const code = 'GROUPDEFAULT';
      const partySize = 5; // Below default of 6
      const mockPromo = {
        id: 'promo-uuid',
        code: 'GROUPDEFAULT',
        type: 'group',
        min_party_size: null, // Not configured
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Minimum party size is 6 guests');
    });

    // ── Discount Code Tests ──────────────────────────────────────────────────

    test('should validate a percentage Discount code successfully', async () => {
      const code = 'SPRING20';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'SPRING20',
        type: 'discount',
        description: 'Spring promotion',
        discount_type: 'percentage',
        discount_value: 20,
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(true);
      expect(result.details?.type).toBe('discount');
      expect(result.details?.discountType).toBe('percentage');
      expect(result.details?.discountValue).toBe(20);
    });

    test('should validate a fixed-amount Discount code successfully', async () => {
      const code = 'FLAT50';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'FLAT50',
        type: 'discount',
        discount_type: 'fixed',
        discount_value: 50,
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(true);
      expect(result.details?.discountType).toBe('fixed');
      expect(result.details?.discountValue).toBe(50);
    });

    test('should reject Discount code with no discount configured', async () => {
      const code = 'NODISCOUNT';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'NODISCOUNT',
        type: 'discount',
        discount_type: null,
        discount_value: null,
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Discount code has no discount configured');
      expect(result.errorCode).toBe('INVALID_CONFIGURATION');
    });

    // ── General Validation Tests ────────────────────────────────────────────

    test('should return error for non-existent promo code', async () => {
      const code = 'NOTEXIST';
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code not found');
      expect(result.errorCode).toBe('NOT_FOUND');
    });

    test('should return error for not-yet-valid promo code', async () => {
      const code = 'FUTURE';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'FUTURE',
        type: 'discount',
        is_active: true,
        valid_from: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code is not yet valid');
      expect(result.errorCode).toBe('NOT_YET_VALID');
    });

    test('should return error for missing promo code', async () => {
      const result = await PromoCodeService.validate(
        '',
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Promo code is required');
      expect(result.errorCode).toBe('MISSING_CODE');
    });

    test('should return error for missing branchId', async () => {
      const result = await PromoCodeService.validate(
        'TEST',
        '',
        bookingType,
        partySize
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('branchId is required');
      expect(result.errorCode).toBe('MISSING_BRANCH_ID');
    });

    test('should return error for invalid partySize', async () => {
      const result = await PromoCodeService.validate(
        'TEST',
        branchId,
        bookingType,
        0
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe('partySize must be a positive integer');
      expect(result.errorCode).toBe('INVALID_PARTY_SIZE');
    });

    test('should return cached result on cache hit', async () => {
      const code = 'CACHED';
      const cachedResult: PromoValidationResult = {
        valid: true,
        details: {
          id: 'cached-uuid',
          code: 'CACHED',
          type: 'priority' as PromoCodeType,
          overrideLeadTime: true,
          minLeadTimeMinutes: 60,
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(result.valid).toBe(true);
      expect(result.details?.type).toBe('priority');
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('should normalize code to uppercase', async () => {
      const code = 'lowercase';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'LOWERCASE',
        type: 'priority',
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        ['LOWERCASE', branchId]
      );
    });

    test('should trim whitespace from code', async () => {
      const code = '  spaced  ';
      const mockPromo = {
        id: 'promo-uuid',
        code: 'SPACED',
        type: 'priority',
        is_active: true,
      };

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockDb.query.mockResolvedValue({ rows: [mockPromo] });

      await PromoCodeService.validate(
        code,
        branchId,
        bookingType,
        partySize
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        ['SPACED', branchId]
      );
    });
  });

  describe('incrementUsage()', () => {
    test('should increment usage count for promo code', async () => {
      const codeId = 'promo-uuid';
      mockDb.query.mockResolvedValue({ rows: [] });

      await PromoCodeService.incrementUsage(codeId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE promo_codes'),
        [codeId]
      );
    });

    test('should throw error on database failure', async () => {
      const codeId = 'promo-uuid';
      mockDb.query.mockRejectedValue(new Error('Database error'));

      await expect(PromoCodeService.incrementUsage(codeId)).rejects.toThrow('Database error');
    });
  });

  describe('invalidateCache()', () => {
    test('should delete cache key for promo code', async () => {
      const code = 'TESTCODE';
      mockRedis.del.mockResolvedValue(1);

      await PromoCodeService.invalidateCache(code, branchId);

      expect(mockRedis.del).toHaveBeenCalledWith(`promo:TESTCODE:${branchId}`);
    });

    test('should handle cache deletion failure gracefully', async () => {
      const code = 'TESTCODE';
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await PromoCodeService.invalidateCache(code, branchId);
    });
  });

  describe('getPerformanceMetrics()', () => {
    test('should return metrics for all promo codes in branch', async () => {
      const mockMetrics = [
        {
          id: 'promo-1',
          code: 'CODE1',
          type: 'priority',
          usageCount: 10,
          maxUses: 100,
          isActive: true,
          bookingCount: 8,
          totalDiscountGiven: 50,
        },
        {
          id: 'promo-2',
          code: 'CODE2',
          type: 'discount',
          usageCount: 25,
          maxUses: 50,
          isActive: true,
          bookingCount: 22,
          totalDiscountGiven: 150,
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockMetrics });

      const result = await PromoCodeService.getPerformanceMetrics(branchId);

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('CODE1');
      expect(result[1].code).toBe('CODE2');
    });

    test('should filter by codeId when provided', async () => {
      const codeId = 'specific-promo';
      mockDb.query.mockResolvedValue({ rows: [] });

      await PromoCodeService.getPerformanceMetrics(branchId, codeId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('p.id = $2'),
        expect.arrayContaining([codeId])
      );
    });
  });
});