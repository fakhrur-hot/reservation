/**
 * Unit tests for Table Lock Routes
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 11.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mock TableLockService ───────────────────────────────────────────────────

const mockAcquireLock = vi.fn();
const mockReleaseLock = vi.fn();
const mockIsLocked = vi.fn();
const mockGetLockOwner = vi.fn();

vi.mock('../services/table-lock.service.js', () => ({
  TableLockService: {
    acquireLock: (...args: unknown[]) => mockAcquireLock(...args),
    releaseLock: (...args: unknown[]) => mockReleaseLock(...args),
    isLocked: (...args: unknown[]) => mockIsLocked(...args),
    getLockOwner: (...args: unknown[]) => mockGetLockOwner(...args),
  },
}));

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
const TABLE_ID = 'table-1';
const SESSION_ID = 'session-abc';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(import('./table-lock.routes.js'));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

// ─── POST /api/v1/tables/:tableId/lock Tests ─────────────────────────────────

describe('POST /api/v1/tables/:tableId/lock', () => {
  it('returns 200 with lock details when lock is acquired', async () => {
    const lockExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    mockAcquireLock.mockResolvedValue({ acquired: true, lockExpiresAt });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/lock`,
      payload: { sessionId: SESSION_ID, branchId: BRANCH_ID },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.acquired).toBe(true);
    expect(body.tableId).toBe(TABLE_ID);
    expect(body.lockExpiresAt).toBe(lockExpiresAt);
  });

  it('returns 200 with lockExpiresAt when custom duration is provided', async () => {
    const lockExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    mockAcquireLock.mockResolvedValue({ acquired: true, lockExpiresAt });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/lock`,
      payload: { sessionId: SESSION_ID, branchId: BRANCH_ID, durationMinutes: 15 },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.acquired).toBe(true);
    expect(mockAcquireLock).toHaveBeenCalledWith(TABLE_ID, BRANCH_ID, SESSION_ID, 15);
  });

  it('returns 409 with alternatives when table is already locked', async () => {
    const alternatives = [
      { id: 'table-2', name: 'T2', capacity: 4, section_id: 's1' },
    ];
    mockAcquireLock.mockResolvedValue({ acquired: false, alternatives });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/lock`,
      payload: { sessionId: SESSION_ID, branchId: BRANCH_ID },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.acquired).toBe(false);
    expect(body.error).toBe('table_already_locked');
    expect(body.alternatives).toEqual(alternatives);
  });

  it('returns 422 when sessionId is missing', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/lock`,
      payload: { branchId: BRANCH_ID },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('validation_error');
    expect(body.message).toBe('sessionId is required');
  });

  it('returns 422 when branchId is missing', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/lock`,
      payload: { sessionId: SESSION_ID },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('validation_error');
    expect(body.message).toBe('branchId is required');
  });

  it('returns 503 when lock service throws an error', async () => {
    mockAcquireLock.mockRejectedValue(new Error('Redis connection failed'));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/lock`,
      payload: { sessionId: SESSION_ID, branchId: BRANCH_ID },
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('service_unavailable');
  });
});

// ─── POST /api/v1/tables/:tableId/unlock Tests ───────────────────────────────

describe('POST /api/v1/tables/:tableId/unlock', () => {
  it('returns 200 with released=true when lock is released', async () => {
    mockReleaseLock.mockResolvedValue(true);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/unlock`,
      payload: { sessionId: SESSION_ID, branchId: BRANCH_ID },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.released).toBe(true);
    expect(body.tableId).toBe(TABLE_ID);
    expect(body.message).toBe('Table lock has been released');
  });

  it('returns 200 when lock does not exist (idempotent release)', async () => {
    mockReleaseLock.mockResolvedValue(true); // Lua returns 0, but we treat as released

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/unlock`,
      payload: { sessionId: SESSION_ID, branchId: BRANCH_ID },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.released).toBe(true);
  });

  it('returns 403 when ownership mismatch', async () => {
    mockReleaseLock.mockResolvedValue(false); // Lua returns -1

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/unlock`,
      payload: { sessionId: SESSION_ID, branchId: BRANCH_ID },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.released).toBe(false);
    expect(body.error).toBe('ownership_mismatch');
    expect(body.message).toBe('You do not own this lock');
  });

  it('returns 422 when sessionId is missing', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/unlock`,
      payload: { branchId: BRANCH_ID },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('validation_error');
    expect(body.message).toBe('sessionId is required');
  });

  it('returns 422 when branchId is missing', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/unlock`,
      payload: { sessionId: SESSION_ID },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('validation_error');
    expect(body.message).toBe('branchId is required');
  });

  it('returns 503 when unlock service throws an error', async () => {
    mockReleaseLock.mockRejectedValue(new Error('Redis connection failed'));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tables/${TABLE_ID}/unlock`,
      payload: { sessionId: SESSION_ID, branchId: BRANCH_ID },
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('service_unavailable');
  });
});

// ─── GET /api/v1/tables/:tableId/lock-status Tests ───────────────────────────

describe('GET /api/v1/tables/:tableId/lock-status', () => {
  it('returns isLocked=false when table is available', async () => {
    mockIsLocked.mockResolvedValue(false);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/tables/${TABLE_ID}/lock-status?branchId=${BRANCH_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.tableId).toBe(TABLE_ID);
    expect(body.isLocked).toBe(false);
    expect(body.owner).toBeNull();
  });

  it('returns isLocked=true with owner when table is locked', async () => {
    mockIsLocked.mockResolvedValue(true);
    mockGetLockOwner.mockResolvedValue(SESSION_ID);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/tables/${TABLE_ID}/lock-status?branchId=${BRANCH_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.tableId).toBe(TABLE_ID);
    expect(body.isLocked).toBe(true);
    expect(body.owner).toBe(SESSION_ID);
  });

  it('returns 422 when branchId query param is missing', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/tables/${TABLE_ID}/lock-status`,
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('validation_error');
  });

  it('returns 503 when service throws an error', async () => {
    mockIsLocked.mockRejectedValue(new Error('Redis connection failed'));

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/tables/${TABLE_ID}/lock-status?branchId=${BRANCH_ID}`,
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('service_unavailable');
  });
});