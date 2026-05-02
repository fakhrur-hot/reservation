/**
 * Rate Limit Service
 * 
 * Redis-based sliding window rate limiting
 */

import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  keyPrefix: string;
  maxRequests: number;
  windowSeconds: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  retryAfter: number;
}

/**
 * Rate Limit Service
 * 
 * Implements sliding window rate limiting using Redis
 */
export class RateLimitService {
  /**
   * Check rate limit using sliding window algorithm
   * 
   * @param identifier - Unique identifier (IP, email, etc.)
   * @param config - Rate limit configuration
   * @returns Rate limit result
   */
  static async checkRateLimit(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const redis = getRedis();
    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);

    try {
      // Use Redis transaction for atomicity
      const results = await redis
        .multi()
        // Remove old entries outside the window
        .zremrangebyscore(key, '-inf', windowStart)
        // Count current entries
        .zcard(key)
        // Add current request with timestamp as score
        .zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`)
        // Set expiry on the key
        .pexpire(key, config.windowSeconds * 1000)
        .exec();

      if (!results) {
        logger.error('Rate limit check failed - no results from Redis');
        // Fail open - allow the request
        return {
          allowed: true,
          currentCount: 0,
          retryAfter: 0
        };
      }

      // Get the count after removing old entries (second command result)
      const currentCount = results[1][1] as number;

      if (currentCount >= config.maxRequests) {
        // Calculate retry after based on oldest entry
        const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
        let retryAfter = config.windowSeconds;
        
        if (oldestEntry && oldestEntry.length >= 2) {
          const oldestTimestamp = parseInt(oldestEntry[1]);
          retryAfter = Math.ceil((oldestTimestamp + (config.windowSeconds * 1000) - now) / 1000);
        }

        logger.warn({
          identifier,
          key,
          currentCount,
          maxRequests: config.maxRequests,
          retryAfter
        }, 'Rate limit exceeded');

        return {
          allowed: false,
          currentCount,
          retryAfter: Math.max(1, retryAfter)
        };
      }

      return {
        allowed: true,
        currentCount: currentCount + 1,
        retryAfter: 0
      };
    } catch (error) {
      logger.error({ error, identifier, key: config.keyPrefix }, 'Rate limit check error');
      // Fail open - allow the request
      return {
        allowed: true,
        currentCount: 0,
        retryAfter: 0
      };
    }
  }

  /**
   * Check simple counter rate limit
   * Used for OTP rate limiting (3 per 10 minutes per email)
   * 
   * @param identifier - Unique identifier
   * @param config - Rate limit configuration
   * @returns Rate limit result
   */
  static async checkCounterRateLimit(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const redis = getRedis();
    const key = `${config.keyPrefix}:${identifier}`;

    try {
      const currentCount = await redis.get(key);
      const count = currentCount ? parseInt(currentCount) : 0;

      if (count >= config.maxRequests) {
        // Get TTL for retry after
        const ttl = await redis.ttl(key);
        
        logger.warn({
          identifier,
          key,
          count,
          maxRequests: config.maxRequests,
          ttl
        }, 'Counter rate limit exceeded');

        return {
          allowed: false,
          currentCount: count,
          retryAfter: Math.max(1, ttl)
        };
      }

      // Increment counter
      const newCount = await redis.incr(key);
      
      // Set expiry on first increment
      if (newCount === 1) {
        await redis.expire(key, config.windowSeconds);
      }

      return {
        allowed: true,
        currentCount: newCount,
        retryAfter: 0
      };
    } catch (error) {
      logger.error({ error, identifier, key: config.keyPrefix }, 'Counter rate limit check error');
      // Fail open - allow the request
      return {
        allowed: true,
        currentCount: 0,
        retryAfter: 0
      };
    }
  }

  /**
   * Reset rate limit for an identifier
   * 
   * @param identifier - Unique identifier
   * @param keyPrefix - Key prefix
   */
  static async resetRateLimit(identifier: string, keyPrefix: string): Promise<void> {
    const redis = getRedis();
    const key = `${keyPrefix}:${identifier}`;
    
    try {
      await redis.del(key);
      logger.debug({ identifier, keyPrefix }, 'Rate limit reset');
    } catch (error) {
      logger.error({ error, identifier, keyPrefix }, 'Failed to reset rate limit');
    }
  }
}

export default RateLimitService;