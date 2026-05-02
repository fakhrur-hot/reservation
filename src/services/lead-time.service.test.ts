/**
 * Unit tests for LeadTimeService
 * Requirements: 2.1, 2.2, 2.3, 2.8, 2.9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Database ────────────────────────────────────────────────────────────

const mockDb = {
  query: vi.fn(),
};

vi.mock('../config/database.js', () => ({
  getDatabase: () => mockDb,
}));

// ─── Mock Logger ──────────────────────────────────────────────────────────────

vi.mock('../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { LeadTimeService, BookingType } from './lead-time.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRANCH = 'branch-1';
const PROMO_CODE_PRIORITY = 'LASTMIN24';
const PROMO_CODE_OTHER = 'TEATIME';

// Helper to create a date relative to now (positive = future, negative = past)
function createRelativeDate(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

// Helper to freeze time for consistent testing
function freezeTime(dateString: string = '2026-04-20T12:00:00.000Z') {
  vi.spyOn(Date, 'now').mockImplementation(() => new Date(dateString).getTime());
}

function unfreezeTime() {
  vi.restoreAllMocks();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  unfreezeTime();
});

// ─── getMinLeadTime Tests ─────────────────────────────────────────────────────

describe('getMinLeadTime', () => {
  describe('standard booking (no decoration)', () => {
    it('returns 24 hours when no promo code provided', async () => {
      const result = await LeadTimeService.getMinLeadTime('standard');
      expect(result).toBe(24 * 60); // 1440 minutes
    });

    it('returns 24 hours when promo code is not a priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'turnover' }],
      });

      const result = await LeadTimeService.getMinLeadTime('standard', PROMO_CODE_OTHER);
      expect(result).toBe(24 * 60); // 1440 minutes
    });

    it('returns 1 hour when promo code is a priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const result = await LeadTimeService.getMinLeadTime('standard', PROMO_CODE_PRIORITY);
      expect(result).toBe(60); // 60 minutes
    });

    it('returns 24 hours when promo code does not exist', async () => {
      mockDb.query.mockResolvedValue({
        rows: [],
      });

      const result = await LeadTimeService.getMinLeadTime('standard', 'INVALID123');
      expect(result).toBe(24 * 60); // 1440 minutes
    });

    it('returns 24 hours when promo code is inactive', async () => {
      // Query filters by is_active = true, so inactive codes return no rows
      mockDb.query.mockResolvedValue({
        rows: [],
      });

      const result = await LeadTimeService.getMinLeadTime('standard', PROMO_CODE_PRIORITY);
      expect(result).toBe(24 * 60); // 1440 minutes
    });
  });

  describe('decorated booking (with decoration)', () => {
    it('returns 48 hours when no promo code provided', async () => {
      const result = await LeadTimeService.getMinLeadTime('decorated');
      expect(result).toBe(48 * 60); // 2880 minutes
    });

    it('returns 48 hours when promo code is not a priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'turnover' }],
      });

      const result = await LeadTimeService.getMinLeadTime('decorated', PROMO_CODE_OTHER);
      expect(result).toBe(48 * 60); // 2880 minutes
    });

    it('returns 1 hour when promo code is a priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const result = await LeadTimeService.getMinLeadTime('decorated', PROMO_CODE_PRIORITY);
      expect(result).toBe(60); // 60 minutes
    });
  });

  describe('promo code type variations', () => {
    it('returns 24 hours for turnover code on standard booking', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'turnover' }],
      });

      const result = await LeadTimeService.getMinLeadTime('standard', 'TEATIME');
      expect(result).toBe(24 * 60);
    });

    it('returns 24 hours for VIP code on standard booking', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'vip' }],
      });

      const result = await LeadTimeService.getMinLeadTime('standard', 'VIP2024');
      expect(result).toBe(24 * 60);
    });

    it('returns 24 hours for discount code on standard booking', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'discount' }],
      });

      const result = await LeadTimeService.getMinLeadTime('standard', 'SPRING20');
      expect(result).toBe(24 * 60);
    });

    it('returns 24 hours for group code on standard booking', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'group' }],
      });

      const result = await LeadTimeService.getMinLeadTime('standard', 'GROUP6PLUS');
      expect(result).toBe(24 * 60);
    });

    it('returns 24 hours for affiliate code on standard booking', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'affiliate' }],
      });

      const result = await LeadTimeService.getMinLeadTime('standard', 'INFLUENCER');
      expect(result).toBe(24 * 60);
    });
  });
});

// ─── validateLeadTime Tests ───────────────────────────────────────────────────

describe('validateLeadTime', () => {
  describe('standard booking (24h minimum)', () => {
    beforeEach(() => {
      freezeTime('2026-04-20T12:00:00.000Z');
    });

    it('returns valid=true when booking is 24+ hours in advance', async () => {
      const selectedTime = createRelativeDate(25); // 25 hours from now
      const result = await LeadTimeService.validateLeadTime('standard', selectedTime);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.minLeadTimeMinutes).toBe(24 * 60);
    });

    it('returns valid=true when booking is exactly 24 hours in advance', async () => {
      const selectedTime = createRelativeDate(24); // Exactly 24 hours
      const result = await LeadTimeService.validateLeadTime('standard', selectedTime);

      expect(result.valid).toBe(true);
      expect(result.minLeadTimeMinutes).toBe(24 * 60);
    });

    it('returns valid=false when booking is less than 24 hours in advance', async () => {
      const selectedTime = createRelativeDate(23); // 23 hours from now
      const result = await LeadTimeService.validateLeadTime('standard', selectedTime);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('24 hours');
      expect(result.minLeadTimeMinutes).toBe(24 * 60);
    });

    it('returns valid=false when booking is same day', async () => {
      const today = new Date('2026-04-20T18:00:00.000Z'); // Same day, 6 PM
      const result = await LeadTimeService.validateLeadTime('standard', today);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('24 hours');
    });

    it('returns valid=false when booking is in the past', async () => {
      const pastTime = new Date('2026-04-19T12:00:00.000Z'); // Yesterday
      const result = await LeadTimeService.validateLeadTime('standard', pastTime);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('24 hours');
    });
  });

  describe('decorated booking (48h minimum)', () => {
    beforeEach(() => {
      freezeTime('2026-04-20T12:00:00.000Z');
    });

    it('returns valid=true when booking is 48+ hours in advance', async () => {
      const selectedTime = createRelativeDate(49); // 49 hours from now
      const result = await LeadTimeService.validateLeadTime('decorated', selectedTime);

      expect(result.valid).toBe(true);
      expect(result.minLeadTimeMinutes).toBe(48 * 60);
    });

    it('returns valid=true when booking is exactly 48 hours in advance', async () => {
      const selectedTime = createRelativeDate(48); // Exactly 48 hours
      const result = await LeadTimeService.validateLeadTime('decorated', selectedTime);

      expect(result.valid).toBe(true);
      expect(result.minLeadTimeMinutes).toBe(48 * 60);
    });

    it('returns valid=false when booking is less than 48 hours in advance', async () => {
      const selectedTime = createRelativeDate(47); // 47 hours from now
      const result = await LeadTimeService.validateLeadTime('decorated', selectedTime);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('48 hours');
      expect(result.minLeadTimeMinutes).toBe(48 * 60);
    });

    it('returns valid=false when booking is 24 hours in advance', async () => {
      const selectedTime = createRelativeDate(24); // 24 hours from now
      const result = await LeadTimeService.validateLeadTime('decorated', selectedTime);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('48 hours');
    });
  });

  describe('priority code override (1h minimum)', () => {
    beforeEach(() => {
      freezeTime('2026-04-20T12:00:00.000Z');
    });

    it('returns valid=true when booking is 1+ hour in advance with priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const selectedTime = createRelativeDate(2); // 2 hours from now
      const result = await LeadTimeService.validateLeadTime(
        'standard',
        selectedTime,
        PROMO_CODE_PRIORITY
      );

      expect(result.valid).toBe(true);
      expect(result.minLeadTimeMinutes).toBe(60);
    });

    it('returns valid=true when booking is exactly 1 hour in advance with priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const selectedTime = createRelativeDate(1); // Exactly 1 hour
      const result = await LeadTimeService.validateLeadTime(
        'standard',
        selectedTime,
        PROMO_CODE_PRIORITY
      );

      expect(result.valid).toBe(true);
      expect(result.minLeadTimeMinutes).toBe(60);
    });

    it('returns valid=false when booking is less than 1 hour in advance with priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const selectedTime = createRelativeDate(0.5); // 30 minutes from now
      const result = await LeadTimeService.validateLeadTime(
        'standard',
        selectedTime,
        PROMO_CODE_PRIORITY
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('1 hour');
      expect(result.minLeadTimeMinutes).toBe(60);
    });

    it('returns valid=false when booking is same hour with priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const today = new Date('2026-04-20T12:30:00.000Z'); // Same hour
      const result = await LeadTimeService.validateLeadTime(
        'standard',
        today,
        PROMO_CODE_PRIORITY
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('1 hour');
    });

    it('returns valid=true for decorated booking with priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const selectedTime = createRelativeDate(2); // 2 hours from now
      const result = await LeadTimeService.validateLeadTime(
        'decorated',
        selectedTime,
        PROMO_CODE_PRIORITY
      );

      expect(result.valid).toBe(true);
      expect(result.minLeadTimeMinutes).toBe(60);
    });
  });

  describe('non-promo code scenarios', () => {
    beforeEach(() => {
      freezeTime('2026-04-20T12:00:00.000Z');
    });

    it('returns valid=true for valid future booking without promo code', async () => {
      const selectedTime = createRelativeDate(30); // 30 hours from now
      const result = await LeadTimeService.validateLeadTime('standard', selectedTime);

      expect(result.valid).toBe(true);
    });

    it('returns valid=false for invalid booking without promo code', async () => {
      const selectedTime = createRelativeDate(10); // 10 hours from now
      const result = await LeadTimeService.validateLeadTime('standard', selectedTime);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('24 hours');
    });

    it('returns valid=true when promo code is provided but not priority type', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'turnover' }],
      });

      const selectedTime = createRelativeDate(30); // 30 hours from now
      const result = await LeadTimeService.validateLeadTime(
        'standard',
        selectedTime,
        PROMO_CODE_OTHER
      );

      expect(result.valid).toBe(true);
      expect(result.minLeadTimeMinutes).toBe(24 * 60);
    });
  });

  describe('error message content', () => {
    beforeEach(() => {
      freezeTime('2026-04-20T12:00:00.000Z');
    });

    it('includes booking type in error message for standard booking', async () => {
      const selectedTime = createRelativeDate(10);
      const result = await LeadTimeService.validateLeadTime('standard', selectedTime);

      expect(result.reason).toContain('Reservations');
    });

    it('includes booking type in error message for decorated booking', async () => {
      const selectedTime = createRelativeDate(30);
      const result = await LeadTimeService.validateLeadTime('decorated', selectedTime);

      expect(result.reason).toContain('Special Occasion');
    });

    it('includes specific hours required in error message', async () => {
      const selectedTime = createRelativeDate(10);
      const result = await LeadTimeService.validateLeadTime('standard', selectedTime);

      expect(result.reason).toContain('24 hours');
    });

    it('includes how early the booking attempt is in error message', async () => {
      const selectedTime = createRelativeDate(10);
      const result = await LeadTimeService.validateLeadTime('standard', selectedTime);

      expect(result.reason).toContain('too early');
    });
  });
});

// ─── getAvailableDateRange Tests ─────────────────────────────────────────────

describe('getAvailableDateRange', () => {
  beforeEach(() => {
    freezeTime('2026-04-20T12:00:00.000Z');
  });

  describe('standard booking (24h minimum)', () => {
    it('returns minDate 24 hours from now', async () => {
      const result = await LeadTimeService.getAvailableDateRange('standard');

      const expectedMinDate = new Date('2026-04-21T12:00:00.000Z');
      expect(result.minDate.toISOString()).toBe(expectedMinDate.toISOString());
    });

    it('returns maxDate 90 days from now', async () => {
      const result = await LeadTimeService.getAvailableDateRange('standard');

      const expectedMaxDate = new Date('2026-07-19T12:00:00.000Z');
      expect(result.maxDate.toISOString()).toBe(expectedMaxDate.toISOString());
    });

    it('minDate is before maxDate', async () => {
      const result = await LeadTimeService.getAvailableDateRange('standard');
      expect(result.minDate < result.maxDate).toBe(true);
    });
  });

  describe('decorated booking (48h minimum)', () => {
    it('returns minDate 48 hours from now', async () => {
      const result = await LeadTimeService.getAvailableDateRange('decorated');

      const expectedMinDate = new Date('2026-04-22T12:00:00.000Z');
      expect(result.minDate.toISOString()).toBe(expectedMinDate.toISOString());
    });

    it('returns maxDate 90 days from now', async () => {
      const result = await LeadTimeService.getAvailableDateRange('decorated');

      const expectedMaxDate = new Date('2026-07-19T12:00:00.000Z');
      expect(result.maxDate.toISOString()).toBe(expectedMaxDate.toISOString());
    });
  });

  describe('priority code override (1h minimum)', () => {
    it('returns minDate 1 hour from now when priority code is provided', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const result = await LeadTimeService.getAvailableDateRange(
        'standard',
        PROMO_CODE_PRIORITY
      );

      const expectedMinDate = new Date('2026-04-20T13:00:00.000Z');
      expect(result.minDate.toISOString()).toBe(expectedMinDate.toISOString());
    });

    it('returns minDate 1 hour from now for decorated booking with priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const result = await LeadTimeService.getAvailableDateRange(
        'decorated',
        PROMO_CODE_PRIORITY
      );

      const expectedMinDate = new Date('2026-04-20T13:00:00.000Z');
      expect(result.minDate.toISOString()).toBe(expectedMinDate.toISOString());
    });
  });

  describe('non-priority promo code', () => {
    it('returns 24h minDate for standard booking with non-priority code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'turnover' }],
      });

      const result = await LeadTimeService.getAvailableDateRange(
        'standard',
        PROMO_CODE_OTHER
      );

      const expectedMinDate = new Date('2026-04-21T12:00:00.000Z');
      expect(result.minDate.toISOString()).toBe(expectedMinDate.toISOString());
    });
  });

  describe('edge cases', () => {
    it('handles undefined promo code gracefully', async () => {
      const result = await LeadTimeService.getAvailableDateRange('standard', undefined);

      expect(result.minDate).toBeInstanceOf(Date);
      expect(result.maxDate).toBeInstanceOf(Date);
    });

    it('handles empty string promo code gracefully', async () => {
      const result = await LeadTimeService.getAvailableDateRange('standard', '');

      expect(result.minDate).toBeInstanceOf(Date);
      expect(result.maxDate).toBeInstanceOf(Date);
    });
  });
});

// ─── Integration Scenarios ───────────────────────────────────────────────────

describe('Integration scenarios', () => {
  beforeEach(() => {
    freezeTime('2026-04-20T12:00:00.000Z');
  });

  it('complete flow: standard booking without promo - valid case', async () => {
    const selectedTime = createRelativeDate(25);
    const validation = await LeadTimeService.validateLeadTime('standard', selectedTime);
    const minLeadTime = await LeadTimeService.getMinLeadTime('standard');
    const dateRange = await LeadTimeService.getAvailableDateRange('standard');

    expect(validation.valid).toBe(true);
    expect(minLeadTime).toBe(24 * 60);
    expect(dateRange.minDate < selectedTime).toBe(true);
  });

  it('complete flow: standard booking without promo - invalid case', async () => {
    const selectedTime = createRelativeDate(20);
    const validation = await LeadTimeService.validateLeadTime('standard', selectedTime);
    const minLeadTime = await LeadTimeService.getMinLeadTime('standard');

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBeDefined();
    expect(minLeadTime).toBe(24 * 60);
  });

  it('complete flow: decorated booking with priority code - valid case', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ type: 'priority' }],
    });

    const selectedTime = createRelativeDate(2);
    const validation = await LeadTimeService.validateLeadTime(
      'decorated',
      selectedTime,
      PROMO_CODE_PRIORITY
    );
    const minLeadTime = await LeadTimeService.getMinLeadTime(
      'decorated',
      PROMO_CODE_PRIORITY
    );

    expect(validation.valid).toBe(true);
    expect(minLeadTime).toBe(60);
  });

  it('complete flow: decorated booking with priority code - invalid case', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ type: 'priority' }],
    });

    const selectedTime = createRelativeDate(0.5); // 30 minutes
    const validation = await LeadTimeService.validateLeadTime(
      'decorated',
      selectedTime,
      PROMO_CODE_PRIORITY
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('1 hour');
  });

  it('complete flow: turnover code does not override lead-time', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ type: 'turnover' }],
    });

    const selectedTime = createRelativeDate(25);
    const validation = await LeadTimeService.validateLeadTime(
      'standard',
      selectedTime,
      PROMO_CODE_OTHER
    );
    const minLeadTime = await LeadTimeService.getMinLeadTime(
      'standard',
      PROMO_CODE_OTHER
    );

    expect(validation.valid).toBe(true);
    expect(minLeadTime).toBe(24 * 60);
  });

  it('complete flow: database error handling', async () => {
    mockDb.query.mockRejectedValue(new Error('Database connection failed'));

    // Should not throw, should return default lead-time
    const minLeadTime = await LeadTimeService.getMinLeadTime('standard', PROMO_CODE_PRIORITY);
    expect(minLeadTime).toBe(24 * 60);
  });
});