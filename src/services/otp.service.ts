/**
 * OTP Service
 * 
 * Handles OTP generation, storage, and verification
 * Used by Type B (Returning Guest) and Type C (Registration) flows
 */

import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

/**
 * OTP configuration
 */
const OTP_CONFIG = {
  length: 6,
  ttlSeconds: 600, // 10 minutes
  keyPrefix: 'otp',
  rateLimitKeyPrefix: 'otp_rate',
  maxRequestsPerWindow: 3,
  rateLimitWindowSeconds: 600 // 10 minutes
};

/**
 * OTP generation result
 */
export interface OtpGenerationResult {
  success: boolean;
  otp?: string; // Only returned in development/test
  error?: string;
  retryAfter?: number;
}

/**
 * OTP verification result
 */
export interface OtpVerificationResult {
  success: boolean;
  error?: string;
}

/**
 * OTP Service
 * 
 * Generates 6-digit CSPRNG OTPs
 * Stores bcrypt hash in Redis with 10-minute TTL
 * Rate limits OTP requests per email
 */
export class OtpService {
  /**
   * Generate a 6-digit OTP using CSPRNG
   * 
   * @returns 6-digit OTP string
   */
  private static generateOtp(): string {
    // Generate cryptographically secure random 6-digit number
    const buffer = crypto.randomBytes(4);
    const randomNumber = buffer.readUInt32BE(0);
    const otp = (randomNumber % 1000000).toString().padStart(6, '0');
    return otp;
  }

  /**
   * Check rate limit for OTP requests
   * 
   * @param email - Email address
   * @returns Rate limit result
   */
  static async checkRateLimit(email: string): Promise<{ allowed: boolean; retryAfter: number }> {
    const redis = getRedis();
    const key = `${OTP_CONFIG.rateLimitKeyPrefix}:${email}`;

    try {
      const currentCount = await redis.get(key);
      const count = currentCount ? parseInt(currentCount) : 0;

      if (count >= OTP_CONFIG.maxRequestsPerWindow) {
        const ttl = await redis.ttl(key);
        logger.warn({
          email,
          count,
          maxRequests: OTP_CONFIG.maxRequestsPerWindow,
          ttl
        }, 'OTP rate limit exceeded');

        return {
          allowed: false,
          retryAfter: Math.max(1, ttl)
        };
      }

      return {
        allowed: true,
        retryAfter: 0
      };
    } catch (error) {
      logger.error({ error, email }, 'OTP rate limit check error');
      // Fail open - allow the request
      return {
        allowed: true,
        retryAfter: 0
      };
    }
  }

  /**
   * Increment rate limit counter for OTP requests
   * 
   * @param email - Email address
   */
  private static async incrementRateLimit(email: string): Promise<void> {
    const redis = getRedis();
    const key = `${OTP_CONFIG.rateLimitKeyPrefix}:${email}`;

    try {
      const newCount = await redis.incr(key);
      
      if (newCount === 1) {
        await redis.expire(key, OTP_CONFIG.rateLimitWindowSeconds);
      }

      logger.debug({ email, count: newCount }, 'OTP rate limit incremented');
    } catch (error) {
      logger.error({ error, email }, 'Failed to increment OTP rate limit');
    }
  }

  /**
   * Generate and store OTP for an email
   * 
   * @param email - Email address
   * @returns OTP generation result
   */
  static async generateAndStore(email: string): Promise<OtpGenerationResult> {
    // Check rate limit first
    const rateLimit = await this.checkRateLimit(email);
    
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: 'Too many OTP requests. Please try again later.',
        retryAfter: rateLimit.retryAfter
      };
    }

    const redis = getRedis();
    const key = `${OTP_CONFIG.keyPrefix}:${email}`;

    try {
      // Generate OTP
      const otp = this.generateOtp();

      // Hash OTP with bcrypt (cost factor 10 for reasonable performance)
      const hashedOtp = await bcrypt.hash(otp, 10);

      // Store hash in Redis with TTL
      await redis.setex(key, OTP_CONFIG.ttlSeconds, hashedOtp);

      // Increment rate limit counter
      await this.incrementRateLimit(email);

      logger.info({ email }, 'OTP generated and stored');

      // In development/test, return the OTP for testing
      const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
      
      return {
        success: true,
        otp: isDev ? otp : undefined
      };
    } catch (error) {
      logger.error({ error, email }, 'Failed to generate OTP');
      return {
        success: false,
        error: 'Failed to generate OTP. Please try again.'
      };
    }
  }

  /**
   * Verify OTP for an email
   * 
   * @param email - Email address
   * @param otp - OTP to verify
   * @returns Verification result
   */
  static async verify(email: string, otp: string): Promise<OtpVerificationResult> {
    const redis = getRedis();
    const key = `${OTP_CONFIG.keyPrefix}:${email}`;

    try {
      // Get stored hash
      const storedHash = await redis.get(key);

      if (!storedHash) {
        logger.warn({ email }, 'OTP not found or expired');
        return {
          success: false,
          error: 'OTP not found or has expired. Please request a new OTP.'
        };
      }

      // Verify OTP against hash
      const isValid = await bcrypt.compare(otp, storedHash);

      if (!isValid) {
        logger.warn({ email }, 'Invalid OTP');
        return {
          success: false,
          error: 'Invalid OTP. Please try again.'
        };
      }

      // Invalidate OTP immediately on success (single-use)
      await redis.del(key);

      logger.info({ email }, 'OTP verified successfully');

      return {
        success: true
      };
    } catch (error) {
      logger.error({ error, email }, 'OTP verification error');
      return {
        success: false,
        error: 'Verification failed. Please try again.'
      };
    }
  }

  /**
   * Delete OTP for an email (cleanup)
   * 
   * @param email - Email address
   */
  static async delete(email: string): Promise<void> {
    const redis = getRedis();
    const key = `${OTP_CONFIG.keyPrefix}:${email}`;

    try {
      await redis.del(key);
      logger.debug({ email }, 'OTP deleted');
    } catch (error) {
      logger.error({ error, email }, 'Failed to delete OTP');
    }
  }

  /**
   * Check if OTP exists for an email
   * 
   * @param email - Email address
   * @returns true if OTP exists
   */
  static async exists(email: string): Promise<boolean> {
    const redis = getRedis();
    const key = `${OTP_CONFIG.keyPrefix}:${email}`;

    try {
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error({ error, email }, 'Failed to check OTP existence');
      return false;
    }
  }
}

export default OtpService;