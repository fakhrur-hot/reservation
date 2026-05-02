import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

/**
 * Initialize Sentry for error tracking and performance monitoring
 * Reads DSN from SENTRY_DSN environment variable
 */
export function initializeSentry() {
  const sentryDsn = process.env.SENTRY_DSN;

  if (!sentryDsn) {
    logger.warn('SENTRY_DSN not configured, Sentry error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],
  });

  logger.info('Sentry initialized with DSN: %s', sentryDsn.split('@')[1]);
}

/**
 * Capture an exception with Sentry
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (context) {
    Sentry.setContext('additional', context);
  }
  Sentry.captureException(error);
}

/**
 * Capture a message with Sentry
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Set user context for Sentry
 */
export function setSentryUser(userId: string, email?: string, username?: string) {
  Sentry.setUser({
    id: userId,
    email,
    username,
  });
}

/**
 * Clear user context
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

export default Sentry;
