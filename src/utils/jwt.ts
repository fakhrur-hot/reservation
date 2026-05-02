/**
 * JWT Utility
 * 
 * Handles JWT token generation and verification
 */

import jwt, { Algorithm, SignOptions, VerifyOptions } from 'jsonwebtoken';
import { logger } from '../config/logger.js';

/**
 * JWT configuration
 */
const JWT_CONFIG = {
  accessTokenExpiry: '8h', // 8 hours — covers a full staff shift
  refreshTokenExpiry: '7d', // 7 days
  algorithm: 'HS256' as Algorithm
};

/**
 * JWT payload interface
 */
export interface JwtPayload {
  sub: string; // Customer ID
  email: string;
  type: 'access' | 'refresh';
  role?: string; // Staff role (Admin, Manager, Staff)
  iat?: number;
  exp?: number;
}

/**
 * Token pair result
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate access and refresh tokens
 * 
 * @param customerId - Customer ID
 * @param email - Customer email
 * @param secret - JWT secret
 * @returns Token pair
 */
export function generateTokens(customerId: string, email: string, secret: string): TokenPair {
  const now = Math.floor(Date.now() / 1000);

  // Access token
  const accessPayload: JwtPayload = {
    sub: customerId,
    email,
    type: 'access',
    iat: now
  };

  const accessToken = jwt.sign(
    accessPayload,
    secret,
    {
      algorithm: JWT_CONFIG.algorithm,
      expiresIn: JWT_CONFIG.accessTokenExpiry
    } as SignOptions
  );

  // Refresh token
  const refreshPayload: JwtPayload = {
    sub: customerId,
    email,
    type: 'refresh',
    iat: now
  };

  const refreshToken = jwt.sign(
    refreshPayload,
    secret,
    {
      algorithm: JWT_CONFIG.algorithm,
      expiresIn: JWT_CONFIG.refreshTokenExpiry
    } as SignOptions
  );

  logger.debug({ customerId, email }, 'Tokens generated');

  return {
    accessToken,
    refreshToken
  };
}

/**
 * Generate access and refresh tokens for staff
 * 
 * @param staffId - Staff ID
 * @param email - Staff email
 * @param role - Staff role
 * @param secret - JWT secret
 * @returns Token pair
 */
export function generateStaffTokens(staffId: string, email: string, role: string, secret: string): TokenPair {
  const now = Math.floor(Date.now() / 1000);

  // Access token with role claim
  const accessPayload: JwtPayload = {
    sub: staffId,
    email,
    type: 'access',
    role,
    iat: now
  };

  const accessToken = jwt.sign(
    accessPayload,
    secret,
    {
      algorithm: JWT_CONFIG.algorithm,
      expiresIn: JWT_CONFIG.accessTokenExpiry
    } as SignOptions
  );

  // Refresh token with role claim
  const refreshPayload: JwtPayload = {
    sub: staffId,
    email,
    type: 'refresh',
    role,
    iat: now
  };

  const refreshToken = jwt.sign(
    refreshPayload,
    secret,
    {
      algorithm: JWT_CONFIG.algorithm,
      expiresIn: JWT_CONFIG.refreshTokenExpiry
    } as SignOptions
  );

  logger.debug({ staffId, email, role }, 'Staff tokens generated');

  return {
    accessToken,
    refreshToken
  };
}

/**
 * Verify access token
 * 
 * @param token - Access token
 * @param secret - JWT secret
 * @returns Decoded payload or null if invalid
 */
export function verifyAccessToken(token: string, secret: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: [JWT_CONFIG.algorithm]
    } as VerifyOptions) as JwtPayload;

    if (decoded.type !== 'access') {
      logger.warn({ type: decoded.type }, 'Invalid token type for access');
      return null;
    }

    return decoded;
  } catch (error) {
    logger.error({ error }, 'Access token verification failed');
    return null;
  }
}

/**
 * Verify refresh token
 * 
 * @param token - Refresh token
 * @param secret - JWT secret
 * @returns Decoded payload or null if invalid
 */
export function verifyRefreshToken(token: string, secret: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: [JWT_CONFIG.algorithm]
    } as VerifyOptions) as JwtPayload;

    if (decoded.type !== 'refresh') {
      logger.warn({ type: decoded.type }, 'Invalid token type for refresh');
      return null;
    }

    return decoded;
  } catch (error) {
    logger.error({ error }, 'Refresh token verification failed');
    return null;
  }
}

/**
 * Decode token without verification (for debugging)
 * 
 * @param token - JWT token
 * @returns Decoded payload or null
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload | null;
  } catch {
    return null;
  }
}

export default {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken
};