import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  branchId: string;
  brandId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  ipAddress?: string;
  requestId?: string;
  statusCode?: number;
}

/**
 * Audit Service
 * 
 * Writes audit_log records for every mutating operation
 * Mirrors each audit entry to Pino structured log
 */
export class AuditService {
  /**
   * Write an audit log entry
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    const { branchId, brandId, actorId, action, entityType, entityId, oldValue, newValue, ipAddress, requestId, statusCode } = entry;

    try {
      const db = getDatabase();
      
      // Write to database
      await db.query(
        `INSERT INTO audit_log 
         (branch_id, brand_id, actor_id, action, entity_type, entity_id, old_value, new_value, ip_address, request_id, status_code) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          branchId,
          brandId || null,
          actorId || null,
          action,
          entityType,
          entityId,
          oldValue ? JSON.stringify(oldValue) : null,
          newValue ? JSON.stringify(newValue) : null,
          ipAddress || null,
          requestId || null,
          statusCode || null
        ]
      );

      // Mirror to Pino structured log
      logger.info({
        audit: {
          branchId,
          brandId,
          actorId,
          action,
          entityType,
          entityId,
          oldValue,
          newValue,
          ipAddress,
          requestId,
          statusCode
        }
      }, `Audit: ${action} on ${entityType}`);
    } catch (error) {
      // Log error but don't fail the main operation
      logger.error({ error, entry }, 'Failed to write audit log');
    }
  }

  /**
   * Log a create action
   */
  static async logCreate(
    branchId: string,
    actorId: string | undefined,
    entityType: string,
    entityId: string,
    newValue: Record<string, any>,
    ipAddress?: string,
    requestId?: string
  ): Promise<void> {
    await this.log({
      branchId,
      actorId,
      action: 'create',
      entityType,
      entityId,
      newValue,
      ipAddress,
      requestId
    });
  }

  /**
   * Log an update action
   */
  static async logUpdate(
    branchId: string,
    actorId: string | undefined,
    entityType: string,
    entityId: string,
    oldValue: Record<string, any>,
    newValue: Record<string, any>,
    ipAddress?: string,
    requestId?: string
  ): Promise<void> {
    await this.log({
      branchId,
      actorId,
      action: 'update',
      entityType,
      entityId,
      oldValue,
      newValue,
      ipAddress,
      requestId
    });
  }

  /**
   * Log a delete action
   */
  static async logDelete(
    branchId: string,
    actorId: string | undefined,
    entityType: string,
    entityId: string,
    oldValue: Record<string, any>,
    ipAddress?: string,
    requestId?: string
  ): Promise<void> {
    await this.log({
      branchId,
      actorId,
      action: 'delete',
      entityType,
      entityId,
      oldValue,
      ipAddress,
      requestId
    });
  }

  /**
   * Log an access/read action
   */
  static async logAccess(
    branchId: string,
    actorId: string | undefined,
    entityType: string,
    entityId: string,
    ipAddress?: string,
    requestId?: string,
    statusCode?: number
  ): Promise<void> {
    await this.log({
      branchId,
      actorId,
      action: 'access',
      entityType,
      entityId,
      ipAddress,
      requestId,
      statusCode
    });
  }

  /**
   * Log an authentication action
   */
  static async logAuth(
    branchId: string,
    actorId: string | undefined,
    action: 'login' | 'logout' | 'refresh' | 'failed_login' | 'account_locked' | 'staff_login' | 'staff_logout' | 'staff_failed_login' | 'staff_account_locked',
    email: string,
    ipAddress?: string,
    requestId?: string,
    statusCode?: number
  ): Promise<void> {
    await this.log({
      branchId,
      actorId,
      action,
      entityType: 'auth',
      entityId: email, // Using email as entity ID for auth actions
      newValue: { email },
      ipAddress,
      requestId,
      statusCode
    });
  }
}

export default AuditService;