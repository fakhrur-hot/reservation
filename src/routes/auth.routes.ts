/**
 * Auth Routes
 * 
 * Authentication endpoints for identity resolution, OTP, and registration
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { OtpService } from '../services/otp.service.js';
import { RateLimitService } from '../services/rate-limit.service.js';
import { AuditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';
import { generateTokens, generateStaffTokens, verifyRefreshToken, decodeToken, JwtPayload } from '../utils/jwt.js';
import { getRedis } from '../config/redis.js';
import jwt from 'jsonwebtoken';
import {
  IdentifyRequest,
  IdentifyResponse,
  OtpRequest,
  OtpVerifyRequest,
  OtpVerifyResponse,
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  LoginFailureResponse,
  StaffLoginRequest,
  StaffLoginResponse,
  StaffLoginFailureResponse
} from '../types/auth.types.js';
import { isValidEmail, isValidMalaysianPhone, sanitizeEmail, sanitizePhone } from '../utils/validation.js';

/**
 * Rate limit configurations
 */
const IDENTIFY_RATE_LIMIT = {
  keyPrefix: 'identify',
  maxRequests: 10,
  windowSeconds: 60 // 10 requests per minute per IP
};

const OTP_RATE_LIMIT = {
  keyPrefix: 'otp_rate',
  maxRequests: 3,
  windowSeconds: 600 // 3 requests per 10 minutes per email
};

/**
 * Constant time delay for identity resolution (prevents email enumeration)
 */
const CONSTANT_TIME_DELAY_MS = 100;

/**
 * Add constant time delay to prevent timing attacks
 */
async function constantTimeDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, CONSTANT_TIME_DELAY_MS));
}

/**
 * Auth Routes
 */
export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/identify
   * 
   * Identity resolver endpoint
   * Determines authentication challenge type based on email
   * 
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
   */
  fastify.post<{ Body: IdentifyRequest }>(
    '/auth/identify',
    async (request: FastifyRequest<{ Body: IdentifyRequest }>, reply: FastifyReply) => {
      const { email } = request.body;
      const sanitizedEmail = sanitizeEmail(email);
      const clientIp = request.ip;

      // Validate email format (Requirement 3.6)
      if (!isValidEmail(sanitizedEmail)) {
        logger.warn({ email: sanitizedEmail, ip: clientIp }, 'Invalid email format');
        return reply.status(422).send({
          error: 'Invalid email format',
          message: 'Please provide a valid email address'
        });
      }

      // Check rate limit (Requirement 3.7)
      const rateLimit = await RateLimitService.checkRateLimit(clientIp, IDENTIFY_RATE_LIMIT);
      
      if (!rateLimit.allowed) {
        logger.warn({ ip: clientIp, retryAfter: rateLimit.retryAfter }, 'Identify rate limit exceeded');
        return reply.status(429).header('Retry-After', rateLimit.retryAfter.toString()).send({
          error: 'Too many requests',
          message: 'Please try again later',
          retryAfter: rateLimit.retryAfter
        });
      }

      try {
        // Start constant time delay to prevent enumeration (Requirement 3.5)
        const [lookupResult] = await Promise.all([
          AuthService.lookupIdentity(sanitizedEmail),
          constantTimeDelay()
        ]);

        // Determine challenge type
        const challenge = AuthService.determineChallenge(lookupResult);

        const response: IdentifyResponse = { challenge };

        logger.info({
          email: sanitizedEmail,
          challenge,
          ip: clientIp
        }, 'Identity resolved');

        return reply.status(200).send(response);
      } catch (error) {
        logger.error({ error, email: sanitizedEmail }, 'Identity resolution failed');
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Please try again later'
        });
      }
    }
  );

  /**
   * POST /auth/otp/request
   * 
   * Request OTP for email verification
   * Used by Type B (Returning Guest) and Type C (Registration) flows
   * 
   * Requirements: 5.1, 5.2, 5.5
   */
  fastify.post<{ Body: OtpRequest }>(
    '/auth/otp/request',
    async (request: FastifyRequest<{ Body: OtpRequest }>, reply: FastifyReply) => {
      const { email } = request.body;
      const sanitizedEmail = sanitizeEmail(email);
      const clientIp = request.ip;

      // Validate email format
      if (!isValidEmail(sanitizedEmail)) {
        return reply.status(422).send({
          error: 'Invalid email format',
          message: 'Please provide a valid email address'
        });
      }

      // Check rate limit (Requirement 5.5)
      const rateLimit = await RateLimitService.checkCounterRateLimit(sanitizedEmail, OTP_RATE_LIMIT);
      
      if (!rateLimit.allowed) {
        logger.warn({ email: sanitizedEmail, retryAfter: rateLimit.retryAfter }, 'OTP rate limit exceeded');
        return reply.status(429).header('Retry-After', rateLimit.retryAfter.toString()).send({
          error: 'Too many OTP requests',
          message: 'Please try again later',
          retryAfter: rateLimit.retryAfter
        });
      }

      try {
        // Generate and store OTP
        const result = await OtpService.generateAndStore(sanitizedEmail);

        if (!result.success) {
          if (result.retryAfter) {
            return reply.status(429).header('Retry-After', result.retryAfter.toString()).send({
              error: 'Too many OTP requests',
              message: result.error,
              retryAfter: result.retryAfter
            });
          }
          return reply.status(500).send({
            error: 'Failed to send OTP',
            message: result.error
          });
        }

        logger.info({
          email: sanitizedEmail,
          ip: clientIp
        }, 'OTP requested');

        // In development/test, return the OTP for testing
        const responseData: any = {
          message: 'OTP sent to your email address'
        };
        
        if (result.otp) {
          responseData.otp = result.otp; // Only in dev/test
        }

        return reply.status(200).send(responseData);
      } catch (error) {
        logger.error({ error, email: sanitizedEmail }, 'OTP request failed');
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Please try again later'
        });
      }
    }
  );

  /**
   * POST /auth/otp/verify
   * 
   * Verify OTP for email verification
   * 
   * Requirements: 5.3, 5.4, 5.6, 5.7
   */
  fastify.post<{ Body: OtpVerifyRequest }>(
    '/auth/otp/verify',
    async (request: FastifyRequest<{ Body: OtpVerifyRequest }>, reply: FastifyReply) => {
      const { email, otp } = request.body;
      const sanitizedEmail = sanitizeEmail(email);
      const clientIp = request.ip;

      // Validate email format
      if (!isValidEmail(sanitizedEmail)) {
        return reply.status(422).send({
          error: 'Invalid email format',
          message: 'Please provide a valid email address'
        });
      }

      // Validate OTP format (6 digits)
      if (!otp || !/^\d{6}$/.test(otp)) {
        return reply.status(422).send({
          error: 'Invalid OTP format',
          message: 'OTP must be 6 digits'
        });
      }

      try {
        // Verify OTP
        const result = await OtpService.verify(sanitizedEmail, otp);

        if (!result.success) {
          logger.warn({
            email: sanitizedEmail,
            ip: clientIp
          }, 'OTP verification failed');

          return reply.status(400).send({
            success: false,
            error: result.error
          });
        }

        logger.info({
          email: sanitizedEmail,
          ip: clientIp
        }, 'OTP verified successfully');

        const response: OtpVerifyResponse = {
          success: true,
          message: 'Email verified successfully'
        };

        return reply.status(200).send(response);
      } catch (error) {
        logger.error({ error, email: sanitizedEmail }, 'OTP verification failed');
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
          message: 'Please try again later'
        });
      }
    }
  );

  /**
   * POST /auth/register
   * 
   * Type C registration endpoint
   * Creates new customer after email verification
   * 
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
   */
  fastify.post<{ Body: RegisterRequest & { otp: string } }>(
    '/auth/register',
    async (request: FastifyRequest<{ Body: RegisterRequest & { otp: string } }>, reply: FastifyReply) => {
      const { email, name, phone, cpaConsent, cpaConsentVersion, password, otp } = request.body;
      const sanitizedEmail = sanitizeEmail(email);
      const sanitizedPhone = phone ? sanitizePhone(phone) : undefined;
      const clientIp = request.ip;
      const branchId = request.branchContext?.branchId;

      // Validate email format (Requirement 6.1)
      if (!isValidEmail(sanitizedEmail)) {
        return reply.status(422).send({
          error: 'Invalid email format',
          message: 'Please provide a valid email address'
        });
      }

      // Validate name (Requirement 6.1)
      if (!name || name.trim().length === 0) {
        return reply.status(422).send({
          error: 'Name required',
          message: 'Please provide your name'
        });
      }

      // Validate phone format if provided (Requirement 6.7)
      if (sanitizedPhone && !isValidMalaysianPhone(sanitizedPhone)) {
        return reply.status(422).send({
          error: 'Invalid phone format',
          message: 'Phone number must be in Malaysian E.164 format (+601XXXXXXXX)'
        });
      }

      // Validate CPA consent (Requirement 6.2)
      if (cpaConsent !== true) {
        return reply.status(422).send({
          error: 'CPA consent required',
          message: 'You must accept the terms and conditions to register'
        });
      }

      // Validate CPA consent version
      if (!cpaConsentVersion || cpaConsentVersion.trim().length === 0) {
        return reply.status(422).send({
          error: 'CPA consent version required',
          message: 'Consent version is required'
        });
      }

      // Validate OTP format
      if (!otp || !/^\d{6}$/.test(otp)) {
        return reply.status(422).send({
          error: 'Invalid OTP format',
          message: 'OTP must be 6 digits'
        });
      }

      // Validate password if provided (Requirement 6.6)
      if (password) {
        if (password.length < 8) {
          return reply.status(422).send({
            error: 'Password too short',
            message: 'Password must be at least 8 characters'
          });
        }
      }

      try {
        // Check if email already exists
        const emailExists = await AuthService.emailExists(sanitizedEmail);
        if (emailExists) {
          return reply.status(409).send({
            error: 'Email already registered',
            message: 'This email is already associated with an account'
          });
        }

        // Verify OTP (Requirement 6.3)
        const otpResult = await OtpService.verify(sanitizedEmail, otp);
        if (!otpResult.success) {
          return reply.status(400).send({
            error: 'OTP verification failed',
            message: otpResult.error
          });
        }

        // Create customer record (Requirements 6.4, 6.5, 6.6, 6.8)
        const customer = await AuthService.createCustomer({
          email: sanitizedEmail,
          name: name.trim(),
          phone: sanitizedPhone,
          cpaConsent,
          cpaConsentVersion,
          password
        });

        // Audit log
        if (branchId) {
          await AuditService.logCreate(
            branchId,
            customer.id,
            'customer',
            customer.id,
            {
              email: customer.email,
              name: customer.name,
              phone: customer.phone,
              cpa_consent_timestamp: customer.cpa_consent_timestamp,
              cpa_consent_version: customer.cpa_consent_version
            },
            clientIp
          );
        }

        logger.info({
          customerId: customer.id,
          email: customer.email,
          ip: clientIp
        }, 'Customer registered successfully');

        const response: RegisterResponse = {
          message: 'Registration successful',
          email: customer.email
        };

        return reply.status(201).send(response);
      } catch (error) {
        logger.error({ error, email: sanitizedEmail }, 'Registration failed');
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Please try again later'
        });
      }
    }
  );

  /**
   * POST /auth/login
   * 
   * Type A customer password authentication endpoint
   * Verifies password with Argon2, issues JWT + refresh token cookie
   * 
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  fastify.post<{ Body: LoginRequest }>(
    '/auth/login',
    async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
      const { email, password } = request.body;
      const sanitizedEmail = sanitizeEmail(email);
      const clientIp = request.ip;
      const branchId = request.branchContext?.branchId;

      // Validate email format
      if (!isValidEmail(sanitizedEmail)) {
        return reply.status(422).send({
          error: 'Invalid email format',
          message: 'Please provide a valid email address'
        } as LoginFailureResponse);
      }

      // Validate password is provided
      if (!password || password.length === 0) {
        return reply.status(422).send({
          error: 'Password required',
          message: 'Please provide your password'
        } as LoginFailureResponse);
      }

      try {
        // Get customer with lockout info
        const customer = await AuthService.getCustomerWithLockout(sanitizedEmail);

        // If customer not found, return generic error (Requirement 4.4)
        if (!customer) {
          // Add constant time delay to prevent timing attacks
          await new Promise(resolve => setTimeout(resolve, 100));
          
          logger.warn({ email: sanitizedEmail, ip: clientIp }, 'Login attempt for non-existent account');
          
          return reply.status(401).send({
            error: 'Invalid credentials',
            message: 'Invalid email or password'
          } as LoginFailureResponse);
        }

        // Check if account is locked (Requirement 4.5)
        if (customer.locked_at) {
          logger.warn({
            email: sanitizedEmail,
            customerId: customer.id,
            lockedAt: customer.locked_at,
            ip: clientIp
          }, 'Login attempt on locked account');

          // Audit log for locked account
          if (branchId) {
            await AuditService.logAuth(
              branchId,
              customer.id,
              'account_locked',
              sanitizedEmail,
              clientIp
            );
          }

          return reply.status(423).send({
            error: 'Account locked',
            message: 'Your account has been locked due to too many failed login attempts. Please verify your identity with OTP to unlock.',
            locked: true,
            requiresOtp: true
          } as LoginFailureResponse);
        }

        // Verify password with Argon2 (Requirement 4.2)
        const isPasswordValid = await AuthService.verifyPassword(
          customer.password_hash!,
          password
        );

        if (!isPasswordValid) {
          // Increment failed login count
          const newFailedLogins = await AuthService.incrementFailedLogins(customer.id);

          logger.warn({
            email: sanitizedEmail,
            customerId: customer.id,
            failedLogins: newFailedLogins,
            ip: clientIp
          }, 'Invalid password');

          // Audit log for failed login
          if (branchId) {
            await AuditService.logAuth(
              branchId,
              customer.id,
              'failed_login',
              sanitizedEmail,
              clientIp
            );
          }

          // Check if account should be locked now
          if (newFailedLogins >= 5) {
            logger.warn({
              email: sanitizedEmail,
              customerId: customer.id,
              ip: clientIp
            }, 'Account locked due to failed login attempts');

            // Audit log for account lock
            if (branchId) {
              await AuditService.logAuth(
                branchId,
                customer.id,
                'account_locked',
                sanitizedEmail,
                clientIp
              );
            }

            return reply.status(423).send({
              error: 'Account locked',
              message: 'Your account has been locked due to too many failed login attempts. Please verify your identity with OTP to unlock.',
              locked: true,
              requiresOtp: true
            } as LoginFailureResponse);
          }

          // Return generic error (Requirement 4.4)
          return reply.status(401).send({
            error: 'Invalid credentials',
            message: 'Invalid email or password'
          } as LoginFailureResponse);
        }

        // Password is valid - reset failed logins (Requirement 4.3)
        await AuthService.resetFailedLogins(customer.id);

        // Generate JWT and refresh token (Requirement 4.3)
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          logger.error('JWT_SECRET not configured');
          return reply.status(500).send({
            error: 'Internal server error',
            message: 'Please try again later'
          } as LoginFailureResponse);
        }

        const tokens = generateTokens(customer.id, customer.email, jwtSecret);

        // Set refresh token as HTTP-only cookie (Requirement 4.3)
        reply.setCookie('refresh_token', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
          path: '/'
        });

        // Audit log for successful login (Requirement 4.8)
        if (branchId) {
          await AuditService.logAuth(
            branchId,
            customer.id,
            'login',
            sanitizedEmail,
            clientIp
          );
        }

        logger.info({
          customerId: customer.id,
          email: customer.email,
          ip: clientIp
        }, 'Login successful');

        const response: LoginResponse = {
          message: 'Login successful',
          accessToken: tokens.accessToken,
          expiresIn: 15 * 60 // 15 minutes in seconds
        };

        return reply.status(200).send(response);
      } catch (error) {
        logger.error({ error, email: sanitizedEmail }, 'Login failed');
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Please try again later'
        } as LoginFailureResponse);
      }
    }
  );

  /**
   * POST /auth/refresh
   * 
   * Refresh access token using HTTP-only cookie refresh token
   * Validates refresh token is not in blocklist, issues new JWT
   * 
   * Requirements: 4.6
   */
  fastify.post(
    '/auth/refresh',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const clientIp = request.ip;
      const branchId = request.branchContext?.branchId;

      // Get refresh token from HTTP-only cookie
      const refreshToken = request.cookies.refresh_token;

      if (!refreshToken) {
        logger.warn({ ip: clientIp }, 'Refresh token missing');
        return reply.status(401).send({
          error: 'No refresh token',
          message: 'Please log in again'
        });
      }

      // Get JWT secret
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        logger.error('JWT_SECRET not configured');
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Please try again later'
        });
      }

      try {
        // Verify refresh token
        const decoded = verifyRefreshToken(refreshToken, jwtSecret);
        
        if (!decoded) {
          logger.warn({ ip: clientIp }, 'Invalid refresh token');
          return reply.status(401).send({
            error: 'Invalid token',
            message: 'Please log in again'
          });
        }

        // Get token ID from decoded token (using jti if present, otherwise use sub)
        const tokenId = (decoded as any).jti || decoded.sub;

        // Check if token is in blocklist
        const redis = getRedis();
        const blocklistKey = `refresh_blocklist:${tokenId}`;
        const isBlocked = await redis.get(blocklistKey);

        if (isBlocked) {
          logger.warn({
            tokenId,
            ip: clientIp
          }, 'Refresh token is blocked');

          return reply.status(401).send({
            error: 'Token revoked',
            message: 'Please log in again'
          });
        }

        // Generate new access token
        const newAccessToken = jwt.sign(
          {
            sub: decoded.sub,
            email: decoded.email,
            type: 'access'
          },
          jwtSecret,
          {
            algorithm: 'HS256',
            expiresIn: '15m'
          }
        );

        // Audit log for refresh (Requirement 4.8)
        if (branchId) {
          await AuditService.logAuth(
            branchId,
            decoded.sub,
            'refresh',
            decoded.email,
            clientIp
          );
        }

        logger.info({
          customerId: decoded.sub,
          email: decoded.email,
          ip: clientIp
        }, 'Token refreshed');

        const response = {
          accessToken: newAccessToken,
          expiresIn: 15 * 60 // 15 minutes in seconds
        };

        return reply.status(200).send(response);
      } catch (error) {
        logger.error({ error, ip: clientIp }, 'Token refresh failed');
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Please try again later'
        });
      }
    }
  );

  /**
   * POST /auth/staff/login
   * 
   * Staff authentication endpoint
   * Verifies password with BCrypt (cost >= 12), issues JWT with role claim + refresh token cookie
   * 
   * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
   */
  fastify.post<{ Body: StaffLoginRequest }>(
    '/auth/staff/login',
    async (request: FastifyRequest<{ Body: StaffLoginRequest }>, reply: FastifyReply) => {
      const { email, password } = request.body;
      const sanitizedEmail = sanitizeEmail(email);
      const clientIp = request.ip;
      const branchId = request.branchContext?.branchId;

      // Validate email format (Requirement 12.1)
      if (!isValidEmail(sanitizedEmail)) {
        return reply.status(422).send({
          error: 'Invalid email format',
          message: 'Please provide a valid email address'
        } as StaffLoginFailureResponse);
      }

      // Validate password is provided
      if (!password || password.length === 0) {
        return reply.status(422).send({
          error: 'Password required',
          message: 'Please provide your password'
        } as StaffLoginFailureResponse);
      }

      // Log all staff login attempts (Requirement 12.5)
      logger.info({
        email: sanitizedEmail,
        ip: clientIp,
        endpoint: '/auth/staff/login'
      }, 'Staff login attempt');

      try {
        // Get staff with lockout info
        const staff = await AuthService.getStaffWithLockout(sanitizedEmail);

        // If staff not found, return generic error (Requirement 12.4)
        if (!staff) {
          // Add constant time delay to prevent timing attacks
          await new Promise(resolve => setTimeout(resolve, 100));
          
          logger.warn({ email: sanitizedEmail, ip: clientIp }, 'Staff login attempt for non-existent account');
          
          return reply.status(401).send({
            error: 'Invalid credentials',
            message: 'Invalid email or password'
          } as StaffLoginFailureResponse);
        }

        // Check if staff account is inactive
        if (!staff.is_active) {
          logger.warn({
            email: sanitizedEmail,
            staffId: staff.id,
            ip: clientIp
          }, 'Login attempt on inactive staff account');

          return reply.status(401).send({
            error: 'Invalid credentials',
            message: 'Invalid email or password'
          } as StaffLoginFailureResponse);
        }

        // Check if account is locked (Requirement 12.5)
        if (staff.locked_at) {
          logger.warn({
            email: sanitizedEmail,
            staffId: staff.id,
            lockedAt: staff.locked_at,
            ip: clientIp
          }, 'Login attempt on locked staff account');

          // Audit log for locked account
          if (branchId) {
            await AuditService.logAuth(
              branchId,
              staff.id,
              'staff_account_locked',
              sanitizedEmail,
              clientIp
            );
          }

          return reply.status(423).send({
            error: 'Account locked',
            message: 'Your account has been locked due to too many failed login attempts. Please contact the administrator.',
            locked: true
          } as StaffLoginFailureResponse);
        }

        // Verify password with BCrypt (Requirement 12.2)
        const isPasswordValid = await AuthService.verifyStaffPassword(
          staff.password_hash,
          password
        );

        if (!isPasswordValid) {
          // Increment failed login count
          const newFailedLogins = await AuthService.incrementStaffFailedLogins(staff.id);

          logger.warn({
            email: sanitizedEmail,
            staffId: staff.id,
            failedLogins: newFailedLogins,
            ip: clientIp
          }, 'Staff invalid password');

          // Audit log for failed login
          if (branchId) {
            await AuditService.logAuth(
              branchId,
              staff.id,
              'staff_failed_login',
              sanitizedEmail,
              clientIp
            );
          }

          // Check if account should be locked now (Requirement 12.5)
          if (newFailedLogins >= 5) {
            logger.warn({
              email: sanitizedEmail,
              staffId: staff.id,
              ip: clientIp
            }, 'Staff account locked due to failed login attempts');

            // Audit log for account lock
            if (branchId) {
              await AuditService.logAuth(
                branchId,
                staff.id,
                'staff_account_locked',
                sanitizedEmail,
                clientIp
              );
            }

            // Notify Admin when account is locked (Requirement 12.5)
            logger.error({
              staffId: staff.id,
              email: sanitizedEmail,
              branchId
            }, 'Staff account locked - Admin notification required');

            return reply.status(423).send({
              error: 'Account locked',
              message: 'Your account has been locked due to too many failed login attempts. Please contact the administrator.',
              locked: true
            } as StaffLoginFailureResponse);
          }

          // Return generic error (Requirement 12.4)
          return reply.status(401).send({
            error: 'Invalid credentials',
            message: 'Invalid email or password'
          } as StaffLoginFailureResponse);
        }

        // Password is valid - reset failed logins
        await AuthService.resetStaffFailedLogins(staff.id);

        // Update login info
        await AuthService.updateStaffLoginInfo(staff.id);

        // Generate JWT and refresh token with role claim (Requirement 12.3)
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          logger.error('JWT_SECRET not configured');
          return reply.status(500).send({
            error: 'Internal server error',
            message: 'Please try again later'
          } as StaffLoginFailureResponse);
        }

        const tokens = generateStaffTokens(staff.id, staff.email, staff.role, jwtSecret);

        // Set refresh token as HTTP-only cookie (Requirement 12.3)
        reply.setCookie('refresh_token', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
          path: '/'
        });

        // Audit log for successful login
        if (branchId) {
          await AuditService.logAuth(
            branchId,
            staff.id,
            'staff_login',
            sanitizedEmail,
            clientIp
          );
        }

        logger.info({
          staffId: staff.id,
          email: staff.email,
          role: staff.role,
          ip: clientIp
        }, 'Staff login successful');

        const response: StaffLoginResponse = {
          message: 'Login successful',
          accessToken: tokens.accessToken,
          expiresIn: 15 * 60, // 15 minutes in seconds
          role: staff.role,
          branchId: staff.branch_id
        };

        return reply.status(200).send(response);
      } catch (error) {
        logger.error({ error, email: sanitizedEmail }, 'Staff login failed');
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Please try again later'
        } as StaffLoginFailureResponse);
      }
    }
  );

  /**
   * POST /auth/logout
   * 
   * Invalidate refresh token by adding to blocklist
   * 
   * Requirements: 4.7
   */
  fastify.post(
    '/auth/logout',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const clientIp = request.ip;
      const branchId = request.branchContext?.branchId;

      // Get refresh token from HTTP-only cookie
      const refreshToken = request.cookies.refresh_token;

      if (!refreshToken) {
        // If no refresh token, just return success (already logged out)
        logger.info({ ip: clientIp }, 'Logout with no refresh token');
        return reply.status(200).send({ message: 'Logged out' });
      }

      // Get JWT secret
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        logger.error('JWT_SECRET not configured');
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Please try again later'
        });
      }

      try {
        // Decode token to get token ID (without verification to allow invalidation)
        const decoded = decodeToken(refreshToken);

        if (decoded) {
          // Get token ID from decoded token
          const tokenId = (decoded as any).jti || decoded.sub;

          // Add token to blocklist with 7-day TTL
          const redis = getRedis();
          const blocklistKey = `refresh_blocklist:${tokenId}`;
          const ttlSeconds = 7 * 24 * 60 * 60; // 7 days

          await redis.setex(blocklistKey, ttlSeconds, '1');

          // Audit log for logout (Requirement 4.8)
          if (branchId) {
            await AuditService.logAuth(
              branchId,
              decoded.sub,
              'logout',
              decoded.email,
              clientIp
            );
          }

          logger.info({
            tokenId,
            customerId: decoded.sub,
            email: decoded.email,
            ip: clientIp
          }, 'Token added to blocklist');
        }

        // Clear the refresh token cookie
        reply.clearCookie('refresh_token', {
          path: '/'
        });

        logger.info({ ip: clientIp }, 'Logout successful');

        return reply.status(200).send({ message: 'Logged out' });
      } catch (error) {
        logger.error({ error, ip: clientIp }, 'Logout failed');
        return reply.status(500).send({
          error: 'Internal server error',
          message: 'Please try again later'
        });
      }
    }
  );
}

export default authRoutes;