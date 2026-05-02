/**
 * Auth Types
 * 
 * Type definitions for authentication module
 */

/**
 * Challenge types returned by identity resolver
 */
export type ChallengeType = 'PASSWORD' | 'OTP' | 'SIGNUP';

/**
 * Identity resolver request
 */
export interface IdentifyRequest {
  email: string;
}

/**
 * Identity resolver response
 */
export interface IdentifyResponse {
  challenge: ChallengeType;
}

/**
 * OTP request
 */
export interface OtpRequest {
  email: string;
}

/**
 * OTP verify request
 */
export interface OtpVerifyRequest {
  email: string;
  otp: string;
}

/**
 * OTP verify response
 */
export interface OtpVerifyResponse {
  success: boolean;
  message: string;
}

/**
 * Registration request (Type C)
 */
export interface RegisterRequest {
  email: string;
  name: string;
  phone?: string;
  cpaConsent: boolean;
  cpaConsentVersion: string;
  password?: string;
}

/**
 * Registration response
 */
export interface RegisterResponse {
  message: string;
  email: string;
}

/**
 * Customer record from database
 */
export interface CustomerRecord {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  phone: string | null;
  cpa_consent_timestamp: Date | null;
  cpa_consent_version: string | null;
  created_at: Date;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  allowed: boolean;
  retryAfter?: number;
}

/**
 * Login request
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Login response
 */
export interface LoginResponse {
  message: string;
  accessToken: string;
  expiresIn: number; // seconds
}

/**
 * Login failure response
 */
export interface LoginFailureResponse {
  error: string;
  message: string;
  locked?: boolean;
  requiresOtp?: boolean;
}

/**
 * Customer record with lockout fields
 */
export interface CustomerRecordWithLockout extends CustomerRecord {
  failed_logins: number;
  locked_at: Date | null;
}

/**
 * Staff record from database
 */
export interface StaffRecord {
  id: string;
  branch_id: string;
  brand_id: string | null;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  failed_logins: number;
  locked_at: Date | null;
  is_active: boolean;
  employee_id: string | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Staff record with lockout fields
 */
export interface StaffRecordWithLockout extends StaffRecord {
  failed_logins: number;
  locked_at: Date | null;
}

/**
 * Staff login request
 */
export interface StaffLoginRequest {
  email: string;
  password: string;
}

/**
 * Staff login response
 */
export interface StaffLoginResponse {
  message: string;
  accessToken: string;
  expiresIn: number;
  role: string;
  branchId: string;
}

/**
 * Staff login failure response
 */
export interface StaffLoginFailureResponse {
  error: string;
  message: string;
  locked?: boolean;
}