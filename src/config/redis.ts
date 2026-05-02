import Redis from 'ioredis';
import { logger } from './logger.js';

let redis: Redis | null = null;

/**
 * Initialize Redis connection
 */
export function initializeRedis() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redis = new Redis(redisUrl, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: null,
  });

  redis.on('connect', () => {
    logger.info('Redis connected');
  });

  redis.on('error', (err) => {
    logger.error({ err }, 'Redis error');
  });

  redis.on('close', () => {
    logger.info('Redis connection closed');
  });

  return redis;
}

/**
 * Get the Redis client
 */
export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redis;
}

/**
 * Close the Redis connection
 */
export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis connection closed');
  }
}

export default { initializeRedis, getRedis, closeRedis };
