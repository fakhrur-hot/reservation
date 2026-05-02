/**
 * Auth Service
 * 
 * Handles identity resolution, customer lookup, and registration
 */

import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { ChallengeType, CustomerRecord, RegisterRequest, CustomerRecordWithLockout, StaffRecord, StaffRecordWithLockout } from '../types/auth.types.js';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

/**
 * Identity lookup result
 */
export interface IdentityLookupResult {
  found: boolean;
  hasPassword: boolean;
  customer?: CustomerRecord;
}

/**
 * Auth Service
 * 
 * Handles identity resolution and customer management
 */
export class AuthService {
  /**
   * Lookup email in customers table
   * 
   * @param email - Email address to lookup
   * @returns Identity lookup result
   */
  static async lookupIdentity(email: string): Promise<IdentityLookupResult> {
    const db = getDatabase();

    try {
      const result = await db.query<CustomerRecord>(
        `SELECT id, email, password_hash, name, phone, cpa_consent_timestamp, cpa_consent_version, created_at
         FROM customers
         WHERE email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return {
          found: false,
          hasPassword: false
        };
      }

      const customer = result.rows[0];
      return {
        found: true,
        hasPassword: customer.password_hash !== null,
        customer
      };
    } catch (error) {
      logger.error({ error, email }, 'Failed to lookup identity');
      throw error;
    }
  }

  /**
   * Determine challenge type from identity lookup
   * 
   * @param lookupResult - Identity lookup result
   * @returns Challenge type
   */
  static determineChallenge(lookupResult: IdentityLookupResult): ChallengeType {
    if (!lookupResult.found) {
      return 'SIGNUP';
    }

    if (lookupResult.hasPassword) {
      return 'PASSWORD';
    }

    return 'OTP';
  }

  /**
   * Create a new customer record
   * 
   * @param data - Registration data
   * @returns Created customer record
   */
  static async createCustomer(data: RegisterRequest): Promise<CustomerRecord> {
    const db = getDatabase();

    try {
      // Hash password if provided
      let passwordHash: string | null = null;
      if (data.password) {
        passwordHash = await this.hashPassword(data.password);
      }

      // Get current timestamp for CPA consent
      const cpaConsentTimestamp = new Date();

      const result = await db.query<CustomerRecord>(
        `INSERT INTO customers (email, password_hash, name, phone, cpa_consent_timestamp, cpa_consent_version)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, password_hash, name, phone, cpa_consent_timestamp, cpa_consent_version, created_at`,
        [
          data.email,
          passwordHash,
          data.name,
          data.phone || null,
          cpaConsentTimestamp,
          data.cpaConsentVersion
        ]
      );

      const customer = result.rows[0];
      logger.info({ customerId: customer.id, email: customer.email }, 'Customer created');

      return customer;
    } catch (error) {
      logger.error({ error, email: data.email }, 'Failed to create customer');
      throw error;
    }
  }

  /**
   * Hash password using Argon2
   * 
   * Argon2 configuration:
   * - Memory cost: 64 MB (65536 KB) - minimum recommended
   * - Time cost: 3 iterations
   * - Parallelism: 4 threads
   * 
   * @param password - Plain text password
   * @returns Hashed password
   */
  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
      hashLength: 32
    });
  }

  /**
   * Verify password against Argon2 hash
   * 
   * @param hash - Stored hash
   * @param password - Plain text password to verify
   * @returns true if password matches
   */
  static async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return argon2.verify(hash, password);
    } catch (error) {
      logger.error({ error }, 'Password verification error');
      return false;
    }
  }

  /**
   * Check if email already exists
   * 
   * @param email - Email to check
   * @returns true if email exists
   */
  static async emailExists(email: string): Promise<boolean> {
    const db = getDatabase();

    try {
      const result = await db.query(
        'SELECT 1 FROM customers WHERE email = $1',
        [email]
      );

      return result.rows.length > 0;
    } catch (error) {
      logger.error({ error, email }, 'Failed to check email existence');
      throw error;
    }
  }

  /**
   * Get customer by email
   * 
   * @param email - Email address
   * @returns Customer record or null
   */
  static async getCustomerByEmail(email: string): Promise<CustomerRecord | null> {
    const db = getDatabase();

    try {
      const result = await db.query<CustomerRecord>(
        `SELECT id, email, password_hash, name, phone, cpa_consent_timestamp, cpa_consent_version, created_at
         FROM customers
         WHERE email = $1`,
        [email]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error({ error, email }, 'Failed to get customer by email');
      throw error;
    }
  }

  /**
   * Get customer by ID
   * 
   * @param id - Customer ID
   * @returns Customer record or null
   */
  static async getCustomerById(id: string): Promise<CustomerRecord | null> {
    const db = getDatabase();

    try {
      const result = await db.query<CustomerRecord>(
        `SELECT id, email, password_hash, name, phone, cpa_consent_timestamp, cpa_consent_version, created_at
         FROM customers
         WHERE id = $1`,
        [id]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error({ error, customerId: id }, 'Failed to get customer by ID');
      throw error;
    }
  }

  /**
   * Get customer by email with lockout fields
   * 
   * @param email - Email address
   * @returns Customer record with lockout fields or null
   */
  static async getCustomerWithLockout(email: string): Promise<CustomerRecordWithLockout | null> {
    const db = getDatabase();

    try {
      const result = await db.query<CustomerRecordWithLockout>(
        `SELECT id, email, password_hash, name, phone, cpa_consent_timestamp, cpa_consent_version, created_at,
                failed_logins, locked_at
         FROM customers
         WHERE email = $1`,
        [email]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error({ error, email }, 'Failed to get customer with lockout');
      throw error;
    }
  }

  /**
   * Increment failed login count and optionally lock account
   * 
   * @param customerId - Customer ID
   * @returns Updated failed_logins count
   */
  static async incrementFailedLogins(customerId: string): Promise<number> {
    const db = getDatabase();

    try {
      // First get current count
      const currentResult = await db.query<{ failed_logins: number }>(
        'SELECT failed_logins FROM customers WHERE id = $1',
        [customerId]
      );

      const currentCount = currentResult.rows[0]?.failed_logins || 0;
      const newCount = currentCount + 1;

      // Check if we should lock the account (5 or more failures)
      const shouldLock = newCount >= 5;

      await db.query(
        `UPDATE customers 
         SET failed_logins = $1, locked_at = $2
         WHERE id = $3`,
        [newCount, shouldLock ? new Date() : null, customerId]
      );

      logger.info({ customerId, failedLogins: newCount, locked: shouldLock }, 'Failed login recorded');

      return newCount;
    } catch (error) {
      logger.error({ error, customerId }, 'Failed to increment failed logins');
      throw error;
    }
  }

  /**
   * Reset failed login count and unlock account
   * 
   * @param customerId - Customer ID
   */
  static async resetFailedLogins(customerId: string): Promise<void> {
    const db = getDatabase();

    try {
      await db.query(
        `UPDATE customers 
         SET failed_logins = 0, locked_at = NULL
         WHERE id = $1`,
        [customerId]
      );

      logger.info({ customerId }, 'Failed logins reset and account unlocked');
    } catch (error) {
      logger.error({ error, customerId }, 'Failed to reset failed logins');
      throw error;
    }
  }

  /**
   * Check if customer account is locked
   * 
   * @param customerId - Customer ID
   * @returns true if account is locked
   */
  static async isAccountLocked(customerId: string): Promise<boolean> {
    const db = getDatabase();

    try {
      const result = await db.query<{ locked_at: Date | null }>(
        'SELECT locked_at FROM customers WHERE id = $1',
        [customerId]
      );

      return result.rows[0]?.locked_at !== null;
    } catch (error) {
      logger.error({ error, customerId }, 'Failed to check account lock status');
      throw error;
    }
  }

  // ============================================================================
  // Staff Authentication Methods
  // ============================================================================

  /**
   * Get staff member by email
   * 
   * @param email - Staff email address
   * @returns Staff record or null
   */
  static async getStaffByEmail(email: string): Promise<StaffRecord | null> {
    const db = getDatabase();

    try {
      const result = await db.query<StaffRecord>(
        `SELECT id, branch_id, brand_id, email, password_hash, name, role, 
                failed_logins, locked_at, is_active, employee_id, last_login_at, 
                created_at, updated_at
         FROM staff
         WHERE email = $1`,
        [email]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error({ error, email }, 'Failed to get staff by email');
      throw error;
    }
  }

  /**
   * Get staff member by email with lockout fields
   * 
   * @param email - Staff email address
   * @returns Staff record with lockout fields or null
   */
  static async getStaffWithLockout(email: string): Promise<StaffRecordWithLockout | null> {
    const db = getDatabase();

    try {
      const result = await db.query<StaffRecordWithLockout>(
        `SELECT id, branch_id, email, password_hash, name, role,
                failed_logins, locked_at, is_active, last_login_at,
                created_at, updated_at
         FROM staff
         WHERE email = $1`,
        [email]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error({ error, email }, 'Failed to get staff with lockout');
      throw error;
    }
  }

  /**
   * Verify staff password using BCrypt with cost factor >= 12
   * 
   * @param hash - Stored BCrypt hash
   * @param password - Plain text password to verify
   * @returns true if password matches
   */
  static async verifyStaffPassword(hash: string, password: string): Promise<boolean> {
    try {
      // First verify with bcrypt
      const isValid = await bcrypt.compare(password, hash);
      
      if (!isValid) {
        return false;
      }

      // Extract cost factor from hash (format: $2b$XX$...)
      const costMatch = hash.match(/^\$2[aby]?\$(\d+)\$/);
      if (costMatch) {
        const cost = parseInt(costMatch[1], 10);
        if (cost < 12) {
          logger.warn({ cost }, 'Staff password hash uses cost factor below 12');
        }
      }

      return true;
    } catch (error) {
      logger.error({ error }, 'Staff password verification error');
      return false;
    }
  }

  /**
   * Increment failed login count and optionally lock staff account
   * 
   * @param staffId - Staff ID
   * @returns Updated failed_logins count
   */
  static async incrementStaffFailedLogins(staffId: string): Promise<number> {
    const db = getDatabase();

    try {
      // First get current count
      const currentResult = await db.query<{ failed_logins: number }>(
        'SELECT failed_logins FROM staff WHERE id = $1',
        [staffId]
      );

      const currentCount = currentResult.rows[0]?.failed_logins || 0;
      const newCount = currentCount + 1;

      // Check if we should lock the account (5 or more failures)
      const shouldLock = newCount >= 5;

      await db.query(
        `UPDATE staff 
         SET failed_logins = $1, locked_at = $2
         WHERE id = $3`,
        [newCount, shouldLock ? new Date() : null, staffId]
      );

      logger.info({ staffId, failedLogins: newCount, locked: shouldLock }, 'Staff failed login recorded');

      return newCount;
    } catch (error) {
      logger.error({ error, staffId }, 'Failed to increment staff failed logins');
      throw error;
    }
  }

  /**
   * Reset failed login count and unlock staff account
   * 
   * @param staffId - Staff ID
   */
  static async resetStaffFailedLogins(staffId: string): Promise<void> {
    const db = getDatabase();

    try {
      await db.query(
        `UPDATE staff 
         SET failed_logins = 0, locked_at = NULL
         WHERE id = $1`,
        [staffId]
      );

      logger.info({ staffId }, 'Staff failed logins reset and account unlocked');
    } catch (error) {
      logger.error({ error, staffId }, 'Failed to reset staff failed logins');
      throw error;
    }
  }

  /**
   * Update staff last login timestamp and increment login count
   * 
   * @param staffId - Staff ID
   */
  static async updateStaffLoginInfo(staffId: string): Promise<void> {
    const db = getDatabase();

    try {
      await db.query(
        `UPDATE staff 
         SET last_login_at = NOW(), login_count = login_count + 1
         WHERE id = $1`,
        [staffId]
      );

      logger.debug({ staffId }, 'Staff login info updated');
    } catch (error) {
      logger.error({ error, staffId }, 'Failed to update staff login info');
      throw error;
    }
  }

  /**
   * Check if staff account is locked
   * 
   * @param staffId - Staff ID
   * @returns true if account is locked
   */
  static async isStaffAccountLocked(staffId: string): Promise<boolean> {
    const db = getDatabase();

    try {
      const result = await db.query<{ locked_at: Date | null }>(
        'SELECT locked_at FROM staff WHERE id = $1',
        [staffId]
      );

      return result.rows[0]?.locked_at !== null;
    } catch (error) {
      logger.error({ error, staffId }, 'Failed to check staff account lock status');
      throw error;
    }
  }
}

export default AuthService;