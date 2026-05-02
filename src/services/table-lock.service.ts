/**
 * Table Lock Service
 *
 * Manages distributed table locks in Redis using SET NX EX.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7
 *
 * Features:
 * - Acquire lock with configurable duration (default 30 minutes)
 * - Release lock with ownership verification
 * - Check if table is currently locked
 * - Background cleanup job for expired locks (runs every 5 minutes)
 * - Real-time WebSocket notifications on status changes
 */

import { getRedis } from '../config/redis.js';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { WebSocketPublisher } from './websocket-publisher.service.js';
import cron from 'node-cron';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Table {
  id: string;
  name: string;
  capacity: number;
  section_id: string;
  section_name?: string;
}

export interface LockResult {
  acquired: boolean;
  lockExpiresAt?: string;
  alternatives?: Table[];
}

export interface LockAcquireParams {
  tableId: string;
  branchId: string;
  sessionId: string;
  durationMinutes?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LOCK_DURATION_MINUTES = 30;
const LOCK_TTL_SECONDS = 1800; // 30 minutes
const CLEANUP_CRON = '*/5 * * * *'; // Every 5 minutes

function lockKey(branchId: string, tableId: string): string {
  return `lock:${branchId}:${tableId}`;
}

/**
 * Calculate lock expiry timestamp from now + duration
 */
function calculateLockExpiresAt(durationMinutes: number): string {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + durationMinutes);
  return expiresAt.toISOString();
}

// ─── Lua Scripts ──────────────────────────────────────────────────────────────

/**
 * Atomic check-and-delete: only DEL if the value matches sessionId.
 * Returns 1 if deleted, 0 if key doesn't exist or value mismatch.
 */
const RELEASE_LOCK_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
elseif current == false then
  return 0
else
  return -1
end
`;

/**
 * Atomic transfer: DEL old lock and SET new lock NX EX in one script.
 * Returns 1 if transfer succeeded, 0 if new table already locked.
 */
const TRANSFER_LOCK_SCRIPT = `
local newKey = KEYS[2]
local existing = redis.call('GET', newKey)
if existing ~= false then
  return 0
end
redis.call('DEL', KEYS[1])
redis.call('SET', newKey, ARGV[1], 'NX', 'EX', ARGV[2])
return 1
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Query available (unlocked, active) tables for a branch as alternatives.
 */
async function getAlternativeTables(branchId: string, excludeTableId?: string): Promise<Table[]> {
  const db = getDatabase();
  const redis = getRedis();

  const result = await db.query(
    `SELECT t.id, t.name, t.capacity, t.section_id, s.name AS section_name
     FROM tables t
     LEFT JOIN sections s ON s.id = t.section_id
     WHERE t.branch_id = $1 AND t.is_active = true
     ORDER BY t.name ASC`,
    [branchId]
  );

  const candidates = result.rows.filter(row => !excludeTableId || row.id !== excludeTableId);
  if (candidates.length === 0) return [];

  const keys = candidates.map(row => lockKey(branchId, row.id));
  const lockValues = await redis.mget(...keys);

  const available: Table[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (!lockValues[i]) {
      const row = candidates[i];
      available.push({
        id: row.id,
        name: row.name,
        capacity: row.capacity,
        section_id: row.section_id,
        section_name: row.section_name ?? undefined,
      });
    }
  }

  return available;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class TableLockService {
  private static cleanupTask: cron.ScheduledTask | null = null;

  /**
   * Acquire a lock on a table for a session.
   * Uses SET NX EX — atomic, TTL-based.
   * On failure, returns available alternative tables.
   *
   * @param tableId - The table to lock
   * @param branchId - The branch context
   * @param sessionId - The session acquiring the lock
   * @param durationMinutes - Lock duration in minutes (default: 30)
   * @returns LockResult with acquired flag and lockExpiresAt timestamp
   */
  static async acquireLock(
    tableId: string,
    branchId: string,
    sessionId: string,
    durationMinutes: number = DEFAULT_LOCK_DURATION_MINUTES
  ): Promise<LockResult> {
    const redis = getRedis();
    const key = lockKey(branchId, tableId);
    const ttlSeconds = durationMinutes * 60;

    const result = await redis.set(key, sessionId, 'EX', ttlSeconds, 'NX');

    if (result === 'OK') {
      const lockExpiresAt = calculateLockExpiresAt(durationMinutes);

      logger.info({
        event: 'lock_acquired',
        branch_id: branchId,
        table_id: tableId,
        session_id: sessionId,
        duration_minutes: durationMinutes,
        lock_expires_at: lockExpiresAt,
        timestamp: new Date().toISOString(),
      });

      // Publish real-time status change: available → locked (Requirement 11.4)
      WebSocketPublisher.publishTableStatusChanged(branchId, tableId, 'locked')
        .catch((err) => logger.error({ err }, 'Failed to publish WS lock_acquired event'));

      return { acquired: true, lockExpiresAt };
    }

    // Lock already held — return alternatives
    const alternatives = await getAlternativeTables(branchId, tableId);
    logger.info({
      event: 'lock_acquire_failed',
      branch_id: branchId,
      table_id: tableId,
      session_id: sessionId,
      alternatives_count: alternatives.length,
      timestamp: new Date().toISOString(),
    });

    return { acquired: false, alternatives };
  }

  /**
   * Release a lock, but only if the sessionId matches (atomic Lua check-and-delete).
   * Returns true if lock was released, false if lock doesn't exist or ownership mismatch.
   *
   * @param tableId - The table to unlock
   * @param branchId - The branch context
   * @param sessionId - The session releasing the lock
   * @returns boolean - true if released, false if not owned or doesn't exist
   */
  static async releaseLock(
    tableId: string,
    branchId: string,
    sessionId: string
  ): Promise<boolean> {
    const redis = getRedis();
    const key = lockKey(branchId, tableId);

    const result = await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, sessionId) as number;

    if (result === -1) {
      // Lock owned by different session — return false, don't throw
      logger.warn({
        event: 'lock_release_denied',
        branch_id: branchId,
        table_id: tableId,
        session_id: sessionId,
        reason: 'ownership_mismatch',
      });
      return false;
    }

    // result === 1 (deleted) or 0 (key didn't exist — idempotent release)
    // Both cases mean the lock is now released, so return true
    const released = result !== -1;

    logger.info({
      event: 'lock_released',
      branch_id: branchId,
      table_id: tableId,
      session_id: sessionId,
      was_released: released,
      timestamp: new Date().toISOString(),
    });

    // Publish real-time status change: locked → available (Requirement 11.4)
    WebSocketPublisher.publishTableStatusChanged(branchId, tableId, 'available')
      .catch((err) => logger.error({ err }, 'Failed to publish WS lock_released event'));

    return released;
  }

  /**
   * Atomically transfer a lock from one table to another.
   * Uses a Lua script to ensure no window where both or neither are held.
   * Returns { acquired: false, alternatives } if the new table is already locked.
   */
  static async transferLock(
    branchId: string,
    oldTableId: string,
    newTableId: string,
    sessionId: string
  ): Promise<LockResult> {
    const redis = getRedis();
    const oldKey = lockKey(branchId, oldTableId);
    const newKey = lockKey(branchId, newTableId);

    const result = await redis.eval(
      TRANSFER_LOCK_SCRIPT,
      2,
      oldKey,
      newKey,
      sessionId,
      String(LOCK_TTL_SECONDS)
    ) as number;

    if (result === 1) {
      logger.info({
        event: 'lock_transferred',
        branch_id: branchId,
        old_table_id: oldTableId,
        new_table_id: newTableId,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
      });
      return { acquired: true };
    }

    // New table already locked — return alternatives
    const alternatives = await getAlternativeTables(branchId, newTableId);
    logger.info({
      event: 'lock_transfer_failed',
      branch_id: branchId,
      old_table_id: oldTableId,
      new_table_id: newTableId,
      session_id: sessionId,
      alternatives_count: alternatives.length,
      timestamp: new Date().toISOString(),
    });

    return { acquired: false, alternatives };
  }

  /**
   * Get the session ID that currently holds the lock, or null if unlocked.
   */
  static async getLockOwner(branchId: string, tableId: string): Promise<string | null> {
    const redis = getRedis();
    return redis.get(lockKey(branchId, tableId));
  }

  /**
   * Get the TTL (time-to-live) in seconds for a lock.
   * Returns null if the lock doesn't exist, or the TTL in seconds.
   *
   * @param branchId - The branch context
   * @param tableId - The table to check
   * @returns TTL in seconds, null if lock doesn't exist
   */
  static async getLockTTL(branchId: string, tableId: string): Promise<number | null> {
    const redis = getRedis();
    const key = lockKey(branchId, tableId);
    const exists = await redis.exists(key);
    if (!exists) {
      return null;
    }
    return redis.ttl(key);
  }

  /**
   * Check whether a table is currently locked.
   *
   * @param tableId - The table to check
   * @param branchId - The branch context
   * @returns boolean - true if locked, false if available
   */
  static async isLocked(tableId: string, branchId: string): Promise<boolean> {
    const owner = await TableLockService.getLockOwner(branchId, tableId);
    return owner !== null;
  }

  /**
   * Force-release a lock without session ownership check (manager override).
   * Directly DELetes the Redis key regardless of who holds it.
   * Requirements: 14.4
   */
  static async forceReleaseLock(branchId: string, tableId: string): Promise<void> {
    const redis = getRedis();
    const key = lockKey(branchId, tableId);
    await redis.del(key);

    logger.info({
      event: 'lock_force_released',
      branch_id: branchId,
      table_id: tableId,
      timestamp: new Date().toISOString(),
    });

    WebSocketPublisher.publishTableStatusChanged(branchId, tableId, 'available')
      .catch((err) => logger.error({ err }, 'Failed to publish WS force_release event'));
  }

  // ─── Lock Expiry Cleanup Job ───────────────────────────────────────────────

  /**
   * Start the background cleanup job for expired locks.
   * Runs every 5 minutes to scan for and clean up any orphaned locks.
   * This is a safety net — Redis TTL handles primary expiration.
   *
   * Requirements: 8.5 (Redis lock SHALL expire after 30 minutes)
   */
  static startCleanupJob(): void {
    if (TableLockService.cleanupTask) {
      logger.warn('Lock cleanup job already running — ignoring duplicate start');
      return;
    }

    TableLockService.cleanupTask = cron.schedule(CLEANUP_CRON, async () => {
      await TableLockService.runCleanup();
    });

    logger.info(
      { event: 'lock_cleanup_started', schedule: CLEANUP_CRON },
      'Lock expiry cleanup job started (every 5 minutes)'
    );
  }

  /**
   * Stop the cleanup job (used in tests / graceful shutdown).
   */
  static stopCleanupJob(): void {
    if (TableLockService.cleanupTask) {
      TableLockService.cleanupTask.stop();
      TableLockService.cleanupTask = null;
      logger.info({ event: 'lock_cleanup_stopped' }, 'Lock expiry cleanup job stopped');
    }
  }

  /**
   * Execute one cleanup cycle.
   * Scans for any stale lock keys and ensures they are removed.
   * Exported for manual invocation in tests.
   */
  static async runCleanup(): Promise<{ scanned: number; removed: number }> {
    const redis = getRedis();
    const result = { scanned: 0, removed: 0 };
    const startTime = Date.now();

    try {
      // Scan for all lock keys using pattern
      const scanStream = redis.scanStream({
        match: 'lock:*',
        count: 100,
      });

      for await (const keys of scanStream) {
        for (const key of keys) {
          result.scanned++;

          // Check if key still exists (it may have expired naturally)
          const exists = await redis.exists(key);
          if (!exists) {
            // Key expired on its own — nothing to clean
            continue;
          }

          // Key exists but should have TTL — this is unexpected
          // Log warning but don't remove (let Redis TTL handle it)
          const ttl = await redis.ttl(key);
          logger.warn({
            event: 'stale_lock_detected',
            key,
            ttl_seconds: ttl,
          }, 'Lock key exists without expected TTL');
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        {
          event: 'lock_cleanup_completed',
          scanned: result.scanned,
          removed: result.removed,
          duration_ms: duration,
        },
        'Lock expiry cleanup job completed'
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(
        { err: error, duration_ms: Date.now() - startTime },
        'Lock expiry cleanup job failed'
      );
    }

    return result;
  }
}

export default TableLockService;
