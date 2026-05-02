/**
 * Unit tests for SessionDurationService
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7
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

import { SessionDurationService } from './session-duration.service.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROMO_CODE_VIP = 'VIP2024';
const PROMO_CODE_OTHER = 'TEATIME';

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── getSessionDuration Tests ─────────────────────────────────────────────────

describe('getSessionDuration', () => {
  describe('daytime slots (9:00 AM - 6:59 PM)', () => {
    it('returns 90 minutes for 9:00 AM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('09:00');
      expect(result).toBe(90); // 1.5 hours
    });

    it('returns 90 minutes for 12:00 PM (noon) start time', async () => {
      const result = await SessionDurationService.getSessionDuration('12:00');
      expect(result).toBe(90); // 1.5 hours
    });

    it('returns 90 minutes for 3:30 PM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('15:30');
      expect(result).toBe(90); // 1.5 hours
    });

    it('returns 90 minutes for 6:00 PM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('18:00');
      expect(result).toBe(90); // 1.5 hours
    });

    it('returns 90 minutes for 6:30 PM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('18:30');
      expect(result).toBe(90); // 1.5 hours
    });

    it('returns 90 minutes for 6:59 PM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('18:59');
      expect(result).toBe(90); // 1.5 hours
    });

    it('returns 90 minutes for daytime with non-VIP promo code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'turnover' }],
      });

      const result = await SessionDurationService.getSessionDuration('12:00', PROMO_CODE_OTHER);
      expect(result).toBe(90); // 1.5 hours
    });

    it('returns 90 minutes for daytime without promo code', async () => {
      const result = await SessionDurationService.getSessionDuration('12:00', undefined);
      expect(result).toBe(90); // 1.5 hours
    });
  });

  describe('evening slots (7:00 PM - 10:00 PM)', () => {
    it('returns 180 minutes for 7:00 PM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('19:00');
      expect(result).toBe(180); // 3 hours
    });

    it('returns 180 minutes for 8:00 PM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('20:00');
      expect(result).toBe(180); // 3 hours
    });

    it('returns 180 minutes for 9:00 PM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('21:00');
      expect(result).toBe(180); // 3 hours
    });

    it('returns 180 minutes for 9:30 PM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('21:30');
      expect(result).toBe(180); // 3 hours
    });

    it('returns 180 minutes for 10:00 PM start time', async () => {
      const result = await SessionDurationService.getSessionDuration('22:00');
      expect(result).toBe(180); // 3 hours
    });

    it('returns 180 minutes for evening with VIP promo code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'vip' }],
      });

      const result = await SessionDurationService.getSessionDuration('19:00', PROMO_CODE_VIP);
      expect(result).toBe(180); // 3 hours
    });

    it('returns 180 minutes for evening without promo code', async () => {
      const result = await SessionDurationService.getSessionDuration('19:00', undefined);
      expect(result).toBe(180); // 3 hours
    });
  });

  describe('VIP code override', () => {
    it('returns 180 minutes for daytime with VIP code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'vip', is_active: true }],
      });

      const result = await SessionDurationService.getSessionDuration('12:00', PROMO_CODE_VIP);
      expect(result).toBe(180); // VIP forces 3 hours even for daytime
    });

    it('returns 180 minutes for 9:00 AM with VIP code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'vip', is_active: true }],
      });

      const result = await SessionDurationService.getSessionDuration('09:00', PROMO_CODE_VIP);
      expect(result).toBe(180); // VIP forces 3 hours
    });

    it('returns 180 minutes for 6:30 PM with VIP code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'vip', is_active: true }],
      });

      const result = await SessionDurationService.getSessionDuration('18:30', PROMO_CODE_VIP);
      expect(result).toBe(180); // VIP forces 3 hours
    });

    it('returns 90 minutes for VIP code that does not exist', async () => {
      mockDb.query.mockResolvedValue({
        rows: [],
      });

      const result = await SessionDurationService.getSessionDuration('12:00', 'INVALID123');
      expect(result).toBe(90); // Falls back to standard daytime duration
    });

    it('returns 90 minutes for inactive VIP code', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'vip', is_active: false }],
      });

      const result = await SessionDurationService.getSessionDuration('12:00', PROMO_CODE_VIP);
      expect(result).toBe(90); // Inactive VIP code doesn't apply
    });

    it('returns 90 minutes for VIP code with is_active explicitly false', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'vip', is_active: false }],
      });

      const result = await SessionDurationService.getSessionDuration('12:00', PROMO_CODE_VIP);
      expect(result).toBe(90); // Inactive VIP code doesn't apply
    });

    it('returns 90 minutes for VIP code with database error', async () => {
      mockDb.query.mockRejectedValue(new Error('Database connection failed'));

      const result = await SessionDurationService.getSessionDuration('12:00', PROMO_CODE_VIP);
      expect(result).toBe(90); // Falls back to standard duration on error
    });
  });

  describe('promo code type variations', () => {
    it('returns 90 minutes for turnover code on daytime', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'turnover' }],
      });

      const result = await SessionDurationService.getSessionDuration('14:00', 'TEATIME');
      expect(result).toBe(90);
    });

    it('returns 180 minutes for turnover code on evening', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'turnover' }],
      });

      const result = await SessionDurationService.getSessionDuration('19:00', 'TEATIME');
      expect(result).toBe(180);
    });

    it('returns 90 minutes for discount code on daytime', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'discount' }],
      });

      const result = await SessionDurationService.getSessionDuration('12:00', 'SPRING20');
      expect(result).toBe(90);
    });

    it('returns 90 minutes for group code on daytime', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'group' }],
      });

      const result = await SessionDurationService.getSessionDuration('12:00', 'GROUP6PLUS');
      expect(result).toBe(90);
    });

    it('returns 90 minutes for affiliate code on daytime', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'affiliate' }],
      });

      const result = await SessionDurationService.getSessionDuration('12:00', 'INFLUENCER');
      expect(result).toBe(90);
    });

    it('returns 90 minutes for priority code on daytime', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'priority' }],
      });

      const result = await SessionDurationService.getSessionDuration('12:00', 'LASTMIN24');
      expect(result).toBe(90);
    });
  });
});

// ─── calculateEndTime Tests ───────────────────────────────────────────────────

describe('calculateEndTime', () => {
  describe('daytime duration (90 minutes)', () => {
    it('calculates correct end time for 9:00 AM start', () => {
      const result = SessionDurationService.calculateEndTime('09:00', 90);
      expect(result).toBe('10:30');
    });

    it('calculates correct end time for 12:00 PM start', () => {
      const result = SessionDurationService.calculateEndTime('12:00', 90);
      expect(result).toBe('13:30');
    });

    it('calculates correct end time for 3:30 PM start', () => {
      const result = SessionDurationService.calculateEndTime('15:30', 90);
      expect(result).toBe('17:00');
    });

    it('calculates correct end time for 6:00 PM start', () => {
      const result = SessionDurationService.calculateEndTime('18:00', 90);
      expect(result).toBe('19:30');
    });
  });

  describe('evening duration (180 minutes)', () => {
    it('calculates correct end time for 7:00 PM start', () => {
      const result = SessionDurationService.calculateEndTime('19:00', 180);
      expect(result).toBe('22:00');
    });

    it('calculates correct end time for 8:00 PM start', () => {
      const result = SessionDurationService.calculateEndTime('20:00', 180);
      expect(result).toBe('23:00');
    });

    it('calculates correct end time for 9:00 PM start', () => {
      const result = SessionDurationService.calculateEndTime('21:00', 180);
      expect(result).toBe('00:00');
    });

    it('calculates correct end time for 9:30 PM start', () => {
      const result = SessionDurationService.calculateEndTime('21:30', 180);
      expect(result).toBe('00:30');
    });
  });

  describe('edge cases', () => {
    it('handles midnight wrap-around correctly', () => {
      const result = SessionDurationService.calculateEndTime('22:30', 180);
      expect(result).toBe('01:30');
    });

    it('handles 30-minute duration', () => {
      const result = SessionDurationService.calculateEndTime('12:00', 30);
      expect(result).toBe('12:30');
    });

    it('handles 60-minute duration', () => {
      const result = SessionDurationService.calculateEndTime('12:00', 60);
      expect(result).toBe('13:00');
    });

    it('handles 120-minute duration', () => {
      const result = SessionDurationService.calculateEndTime('12:00', 120);
      expect(result).toBe('14:00');
    });

    it('handles 240-minute duration', () => {
      const result = SessionDurationService.calculateEndTime('12:00', 240);
      expect(result).toBe('16:00');
    });
  });
});

// ─── isTimeSlotAvailable Tests ───────────────────────────────────────────────

describe('isTimeSlotAvailable', () => {
  const TABLE_ID = 'table-1';
  const DATE = new Date('2026-04-20');

  it('returns available=true when no conflicts exist', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ count: '0' }],
    });

    const result = await SessionDurationService.isTimeSlotAvailable(
      '12:00',
      '13:30',
      TABLE_ID,
      DATE
    );

    expect(result.available).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns available=false when conflict exists', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ count: '1' }],
    });

    const result = await SessionDurationService.isTimeSlotAvailable(
      '12:00',
      '13:30',
      TABLE_ID,
      DATE
    );

    expect(result.available).toBe(false);
    expect(result.reason).toContain('conflicts with existing reservation');
  });

  it('returns available=false when multiple conflicts exist', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ count: '2' }],
    });

    const result = await SessionDurationService.isTimeSlotAvailable(
      '12:00',
      '13:30',
      TABLE_ID,
      DATE
    );

    expect(result.available).toBe(false);
  });

  it('queries with correct parameters', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ count: '0' }],
    });

    await SessionDurationService.isTimeSlotAvailable(
      '19:00',
      '22:00',
      TABLE_ID,
      DATE
    );

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('table_id'),
      [TABLE_ID, DATE, '19:00', '22:00']
    );
  });

  it('returns unavailable on database error', async () => {
    mockDb.query.mockRejectedValue(new Error('Database connection failed'));

    const result = await SessionDurationService.isTimeSlotAvailable(
      '12:00',
      '13:30',
      TABLE_ID,
      DATE
    );

    expect(result.available).toBe(false);
    expect(result.reason).toContain('Unable to verify availability');
  });
});

// ─── getTimeSlot Tests ───────────────────────────────────────────────────────

describe('getTimeSlot', () => {
  const DATE = new Date('2026-04-20');
  const TABLE_ID = 'table-1';

  it('returns complete time slot for daytime without availability check', async () => {
    const result = await SessionDurationService.getTimeSlot('12:00');

    expect(result).toEqual({
      startTime: '12:00',
      endTime: '13:30',
      duration: 90,
    });
  });

  it('returns complete time slot for evening without availability check', async () => {
    const result = await SessionDurationService.getTimeSlot('19:00');

    expect(result).toEqual({
      startTime: '19:00',
      endTime: '22:00',
      duration: 180,
    });
  });

  it('returns complete time slot with VIP code', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ type: 'vip', is_active: true }],
    });

    const result = await SessionDurationService.getTimeSlot('12:00', PROMO_CODE_VIP);

    expect(result).toEqual({
      startTime: '12:00',
      endTime: '15:00',
      duration: 180,
    });
  });

  it('returns time slot when available', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ count: '0' }],
    });

    const result = await SessionDurationService.getTimeSlot('12:00', undefined, DATE, TABLE_ID);

    expect(result).toEqual({
      startTime: '12:00',
      endTime: '13:30',
      duration: 90,
    });
  });

  it('returns null when slot is not available', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ count: '1' }],
    });

    const result = await SessionDurationService.getTimeSlot('12:00', undefined, DATE, TABLE_ID);

    expect(result).toBeNull();
  });
});

// ─── Integration Scenarios ───────────────────────────────────────────────────

describe('Integration scenarios', () => {
  describe('complete daytime flow', () => {
    it('calculates 1.5h session for 12:00 PM booking', async () => {
      const duration = await SessionDurationService.getSessionDuration('12:00');
      const endTime = SessionDurationService.calculateEndTime('12:00', duration);

      expect(duration).toBe(90);
      expect(endTime).toBe('13:30');
    });

    it('calculates 1.5h session for 3:00 PM booking', async () => {
      const duration = await SessionDurationService.getSessionDuration('15:00');
      const endTime = SessionDurationService.calculateEndTime('15:00', duration);

      expect(duration).toBe(90);
      expect(endTime).toBe('16:30');
    });
  });

  describe('complete evening flow', () => {
    it('calculates 3h session for 7:00 PM booking', async () => {
      const duration = await SessionDurationService.getSessionDuration('19:00');
      const endTime = SessionDurationService.calculateEndTime('19:00', duration);

      expect(duration).toBe(180);
      expect(endTime).toBe('22:00');
    });

    it('calculates 3h session for 8:30 PM booking', async () => {
      const duration = await SessionDurationService.getSessionDuration('20:30');
      const endTime = SessionDurationService.calculateEndTime('20:30', duration);

      expect(duration).toBe(180);
      expect(endTime).toBe('23:30');
    });
  });

  describe('VIP code override flow', () => {
    it('forces 3h session for daytime VIP booking', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'vip', is_active: true }],
      });

      const duration = await SessionDurationService.getSessionDuration('12:00', PROMO_CODE_VIP);
      const endTime = SessionDurationService.calculateEndTime('12:00', duration);

      expect(duration).toBe(180);
      expect(endTime).toBe('15:00');
    });

    it('forces 3h session for early morning VIP booking', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ type: 'vip', is_active: true }],
      });

      const duration = await SessionDurationService.getSessionDuration('09:00', PROMO_CODE_VIP);
      const endTime = SessionDurationService.calculateEndTime('09:00', duration);

      expect(duration).toBe(180);
      expect(endTime).toBe('12:00');
    });
  });

  describe('availability check flow', () => {
    it('returns time slot when table is available', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ count: '0' }],
      });

      const slot = await SessionDurationService.getTimeSlot(
        '12:00',
        undefined,
        new Date('2026-04-20'),
        'table-1'
      );

      expect(slot).not.toBeNull();
      expect(slot?.duration).toBe(90);
      expect(slot?.endTime).toBe('13:30');
    });

    it('returns null when table is booked', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ count: '1' }],
      });

      const slot = await SessionDurationService.getTimeSlot(
        '12:00',
        undefined,
        new Date('2026-04-20'),
        'table-1'
      );

      expect(slot).toBeNull();
    });
  });
});