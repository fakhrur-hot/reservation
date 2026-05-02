import pino from 'pino';

/**
 * Create a Pino logger instance with branch_id and request_id as default fields
 * These fields will be included in every log entry for better traceability
 */
export function createLogger(branchId?: string, requestId?: string) {
  const defaultFields: Record<string, any> = {};

  if (branchId) {
    defaultFields.branch_id = branchId;
  }

  if (requestId) {
    defaultFields.request_id = requestId;
  }

  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: defaultFields,
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  });

  return logger;
}

/**
 * Create a child logger with additional context fields
 */
export function createChildLogger(
  parentLogger: pino.Logger,
  context: Record<string, any>
) {
  return parentLogger.child(context);
}

// Export a default logger instance
export const logger = createLogger();
