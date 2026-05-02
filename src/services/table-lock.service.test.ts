/**
 * Unit tests for TableLockService
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Redis ───────────────────────────────────────────────────────────────

const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  eval: vi.fn(),
  scanStream: vi.fn(),
  exists: vi.fn(),
  ttl: vi.fn(),
  publish: vi.fn(),
};

vi.mock('../config/redis.js', () => ({
  getRedis: () => mockRedis,
}));

// ─── Mock Database ────────────────────────────────────────────────────────────

const mockDb = {
  query: vi.fn(),
};

vi.mock('../config/database.js', () => ({
  getDatabase: () => mockDb,
}));

// ─── Mock Logger ──────────────────────────────────────────────────────────────

vi.mock('../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Mock WebSocket Publisher ─────────────────────────────────────────────────

vi.mock('../services/websocket-publisher.service.js', () => ({
  WebSocketPublisher: {
    publishTableStatusChanged: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { TableLockService } from './table-lock.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRANCH = 'branch-1';
const TABLE = 'table-1';
const SESSION = 'session-abc';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up any scheduled cleanup job
  TableLockService.stopCleanupJob();
});

// ─── acquireLock ──────────────────────────────────────────────────────────────

describe('acquireLock', () => {
  it('returns acquired=true with lockExpiresAt when SET NX succeeds', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await TableLockService.acquireLock(TABLE, BRANCH, SESSION);

    expect(result.acquired).toBe(true);
    expect(result.lockExpiresAt).toBeDefined();
    expect(result.lockExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(result.alternatives).toBeUndefined();
    expect(mockRedis.set).toHaveBeenCalledWith(
      `lock:${BRANCH}:${TABLE}`,
      SESSION,
      'EX',
      1800,
      'NX'
    );
  });

  it('uses custom duration when provided', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await TableLockService.acquireLock(TABLE, BRANCH, SESSION, 15);

    expect(result.acquired).toBe(true);
    expect(result.lockExpiresAt).toBeDefined();
    // Verify TTL is 15 minutes = 900 seconds
    expect(mockRedis.set).toHaveBeenCalledWith(
      `lock:${BRANCH}:${TABLE}`,
      SESSION,
      'EX',
      900,
      'NX'
    );
  });

  it('returns acquired=false with alternatives when SET NX fails', async () => {
    mockRedis.set.mockResolvedValue(null); // NX failed — key exists

    // DB returns two active tables
    mockDb.query.mockResolvedValue({
      rows: [
        { id: 'table-2', name: 'T2', capacity: 4, section_id: 's1', section_name: 'Main' },
        { id: 'table-3', name: 'T3', capacity: 2, section_id: 's1', section_name: 'Main' },
      ],
    });

    // Neither alternative is locked
    mockRedis.get.mockResolvedValue(null);

    const result = await TableLockService.acquireLock(TABLE, BRANCH, SESSION);

    expect(result.acquired).toBe(false);
    expect(result.lockExpiresAt).toBeUndefined();
    expect(result.alternatives).toHaveLength(2);
    expect(result.alternatives![0].id).toBe('table-2');
  });

  it('excludes the target table from alternatives', async () => {
    mockRedis.set.mockResolvedValue(null);

    mockDb.query.mockResolvedValue({
      rows: [
        { id: TABLE, name: 'T1', capacity: 4, section_id: 's1', section_name: null },
        { id: 'table-2', name: 'T2', capacity: 4, section_id: 's1', section_name: null },
      ],
    });

    mockRedis.get.mockResolvedValue(null);

    const result = await TableLockService.acquireLock(TABLE, BRANCH, SESSION);

    expect(result.alternatives!.every((t) => t.id !== TABLE)).toBe(true);
  });

  it('excludes already-locked tables from alternatives', async () => {
    mockRedis.set.mockResolvedValue(null);

    mockDb.query.mockResolvedValue({
      rows: [
        { id: 'table-2', name: 'T2', capacity: 4, section_id: 's1', section_name: null },
        { id: 'table-3', name: 'T3', capacity: 2, section_id: 's1', section_name: null },
      ],
    });

    // table-2 is locked, table-3 is free
    mockRedis.get
      .mockResolvedValueOnce('other-session') // table-2 locked
      .mockResolvedValueOnce(null);           // table-3 free

    const result = await TableLockService.acquireLock(TABLE, BRANCH, SESSION);

    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives![0].id).toBe('table-3');
  });
});

// ─── releaseLock ──────────────────────────────────────────────────────────────

describe('releaseLock', () => {
  it('returns true when lock is released (Lua returns 1)', async () => {
    mockRedis.eval.mockResolvedValue(1);

    const result = await TableLockService.releaseLock(TABLE, BRANCH, SESSION);

    expect(result).toBe(true);
  });

  it('returns true when lock does not exist (idempotent release, Lua returns 0)', async () => {
    mockRedis.eval.mockResolvedValue(0);

    const result = await TableLockService.releaseLock(TABLE, BRANCH, SESSION);

    expect(result).toBe(true);
  });

  it('returns false when ownership mismatch (Lua returns -1)', async () => {
    mockRedis.eval.mockResolvedValue(-1);

    const result = await TableLockService.releaseLock(TABLE, BRANCH, SESSION);

    expect(result).toBe(false);
  });
});

// ─── transferLock ─────────────────────────────────────────────────────────────

describe('transferLock', () => {
  const NEW_TABLE = 'table-2';

  it('returns acquired=true when Lua transfer succeeds', async () => {
    mockRedis.eval.mockResolvedValue(1);

    const result = await TableLockService.transferLock(BRANCH, TABLE, NEW_TABLE, SESSION);

    expect(result.acquired).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      `lock:${BRANCH}:${TABLE}`,
      `lock:${BRANCH}:${NEW_TABLE}`,
      SESSION,
      '1800'
    );
  });

  it('returns acquired=false with alternatives when new table is already locked', async () => {
    mockRedis.eval.mockResolvedValue(0);

    mockDb.query.mockResolvedValue({
      rows: [
        { id: 'table-3', name: 'T3', capacity: 4, section_id: 's1', section_name: 'Main' },
      ],
    });
    mockRedis.get.mockResolvedValue(null);

    const result = await TableLockService.transferLock(BRANCH, TABLE, NEW_TABLE, SESSION);

    expect(result.acquired).toBe(false);
    expect(result.alternatives).toHaveLength(1);
  });
});

// ─── getLockOwner / isLocked ──────────────────────────────────────────────────

describe('getLockOwner', () => {
  it('returns sessionId when lock exists', async () => {
    mockRedis.get.mockResolvedValue(SESSION);
    const owner = await TableLockService.getLockOwner(BRANCH, TABLE);
    expect(owner).toBe(SESSION);
    expect(mockRedis.get).toHaveBeenCalledWith(`lock:${BRANCH}:${TABLE}`);
  });

  it('returns null when no lock', async () => {
    mockRedis.get.mockResolvedValue(null);
    const owner = await TableLockService.getLockOwner(BRANCH, TABLE);
    expect(owner).toBeNull();
  });
});

describe('isLocked', () => {
  it('returns true when lock exists', async () => {
    mockRedis.get.mockResolvedValue(SESSION);
    expect(await TableLockService.isLocked(TABLE, BRANCH)).toBe(true);
  });

  it('returns false when no lock', async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await TableLockService.isLocked(TABLE, BRANCH)).toBe(false);
  });
});

// ─── Cleanup Job ──────────────────────────────────────────────────────────────

describe('cleanup job', () => {
  it('starts cleanup job successfully', () => {
    TableLockService.startCleanupJob();
    // Verify no error thrown
  });

  it('stops cleanup job successfully', () => {
    TableLockService.startCleanupJob();
    TableLockService.stopCleanupJob();
    // Verify no error thrown
  });

  it('runCleanup scans for lock keys and reports stats', async () => {
    // Mock scan stream
    const mockScanStream = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true }),
      }),
    };
    mockRedis.scanStream.mockReturnValue(mockScanStream);

    const result = await TableLockService.runCleanup();

    expect(result).toHaveProperty('scanned');
    expect(result).toHaveProperty('removed');
    expect(mockRedis.scanStream).toHaveBeenCalledWith({
      match: 'lock:*',
      count: 100,
    });
  });

  it('runCleanup handles keys with unexpected TTL', async () => {
    // Mock scan stream that returns one key
    const keys = ['lock:branch-1:table-1'];
    const mockScanStream = {
      [Symbol.asyncIterator]: async function* () {
        yield keys;
      },
    };
    mockRedis.scanStream.mockReturnValue(mockScanStream);
    mockRedis.exists.mockResolvedValue(1); // Key exists
    mockRedis.ttl.mockResolvedValue(100);  // Has unexpected TTL

    const result = await TableLockService.runCleanup();

    expect(result.scanned).toBe(1);
    expect(mockRedis.exists).toHaveBeenCalled();
    expect(mockRedis.ttl).toHaveBeenCalled();
  });
});