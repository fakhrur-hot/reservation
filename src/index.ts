import 'dotenv/config';
import { createServer } from 'http';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { initializeSentry } from './config/sentry.js';
import { logger } from './config/logger.js';
import { initializeDatabase, getDatabase } from './config/database.js';
import { initializeRedis } from './config/redis.js';
import { multiBranchMiddleware } from './middleware/multi-branch.middleware.js';
import { rbacMiddleware } from './middleware/rbac.middleware.js';
import { operatingModeGuard } from './middleware/operating-mode.middleware.js';
import { createSetupGuardMiddleware } from './middleware/setup-guard.middleware.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import { setupRoutes } from './routes/setup.routes.js';
import { tableRoutes } from './routes/tables.routes.js';
import { tableLockRoutes } from './routes/table-lock.routes.js';
import { orderRoutes } from './routes/order.routes.js';
import { businessHoursRoutes } from './routes/business-hours.routes.js';
import { reservationRoutes } from './routes/reservations.routes.js';
import { adminSettingsRoutes } from './routes/admin-settings.routes.js';
import { notificationSettingsRoutes } from './routes/admin-settings.routes.js';
import { notificationAlertRoutes } from './routes/notification-alert.routes.js';
import { walkInRoutes } from './routes/walk-in.routes.js';
import { serialKeyRoutes } from './routes/admin/serial-key.routes.js';
import { staffRoutes } from './routes/admin/staff.routes.js';
import { registerAdminCustomerRoutes } from './routes/admin/customers.routes.js';
import { decorationRoutes } from './routes/decoration.routes.js';
import { cakeRoutes } from './routes/cake.routes.js';
import { commissionRoutes } from './routes/commission.routes.js';
import { commissionReportRoutes } from './routes/commission-report.routes.js';
import { bookingRoutes } from './routes/booking.routes.js';
import { promoCodeRoutes } from './routes/promo-code.routes.js';
import { paymentRoutes } from './routes/payment.routes.js';
import { menuRoutes } from './routes/menu.routes.js';
import { malaysiaHolidaysRoutes } from './routes/malaysia-holidays.routes.js';
import { initializeWebSocketGateway } from './services/websocket.service.js';
import { SchedulerService } from './services/scheduler.service.js';

/**
 * Initialize application
 */
async function main() {
  try {
    // Initialize Sentry for error tracking
    initializeSentry();

    logger.info('Starting Stage 1 Table Booking Core application');
    logger.info('Environment: %s', process.env.NODE_ENV || 'development');
    logger.info('Node version: %s', process.version);

    // Initialize database connection
    await initializeDatabase();
    logger.info('Database initialized');

    // Initialize Redis connection
    initializeRedis();
    logger.info('Redis initialized');

    // Create underlying HTTP server so WebSocket can share it
    const httpServer = createServer();

    // Initialize WebSocket gateway (attaches to httpServer)
    const wsGateway = initializeWebSocketGateway(httpServer);
    logger.info('WebSocket gateway initialized');

    // Explicitly forward HTTP upgrade requests to the WS server.
    // Fastify's serverFactory only registers a 'request' listener, which means
    // WebSocket upgrade events are not automatically handled by the ws library
    // when Fastify is bound to the same httpServer. We must wire it manually.
    httpServer.on('upgrade', (req, socket, head) => {
      wsGateway.handleUpgrade(req, socket, head);
    });

    // Initialize Fastify server bound to the shared HTTP server
    const fastify = Fastify({
      logger: false, // We use our own logger
      serverFactory: (handler) => {
        httpServer.on('request', handler);
        return httpServer;
      },
    });

    // Register cookie plugin for refresh token HTTP-only cookie
    await fastify.register(cookie);

    // Register health check routes (no auth required)
    await fastify.register(healthRoutes);

    // Register auth routes (no branch context required for identify/otp/register)
    await fastify.register(authRoutes);

    // Register setup routes (no branch context required)
    const pool = getDatabase();
    await fastify.register((fastify) => setupRoutes(fastify, pool));

    // Register setup guard middleware (blocks routes until setup is complete)
    // This must run BEFORE multi-branch middleware
    const setupGuard = createSetupGuardMiddleware(pool);
    await fastify.addHook('preHandler', async (request, reply) => {
      // Skip health check routes
      if (request.url === '/health' || request.url.startsWith('/health/')) {
        return;
      }
      // Skip setup routes
      if (request.url.startsWith('/setup')) {
        return;
      }
      // Skip auth routes entirely for setup guard
      if (request.url.startsWith('/auth/')) {
        return;
      }
      await setupGuard(request, reply);
    });

    // Register multi-branch middleware (global)
    // This runs AFTER setup guard
    await fastify.addHook('preHandler', async (request, reply) => {
      // Skip health check routes
      if (request.url === '/health' || request.url.startsWith('/health/')) {
        return;
      }
      // Skip setup routes
      if (request.url.startsWith('/setup')) {
        return;
      }
      // Skip auth routes entirely for branch context resolution
      if (request.url.startsWith('/auth/')) {
        return;
      }
      await multiBranchMiddleware(request, reply);
    });

    // Register RBAC middleware (after auth)
    await fastify.addHook('preHandler', async (request, reply) => {
      // Skip health check and auth routes
      if (request.url === '/health' || request.url.startsWith('/health/')) {
        return;
      }
      if (request.url.startsWith('/auth/')) {
        return;
      }
      // Skip setup routes
      if (request.url.startsWith('/setup')) {
        return;
      }
      await rbacMiddleware(request, reply);
    });

    // Register operating mode guard (after branch context is set)
    await fastify.addHook('preHandler', async (request, reply) => {
      // Skip health check and auth routes
      if (request.url === '/health' || request.url.startsWith('/health/')) {
        return;
      }
      if (request.url.startsWith('/auth/')) {
        return;
      }
      // Skip setup routes
      if (request.url.startsWith('/setup')) {
        return;
      }
      await operatingModeGuard(request, reply);
    });

    // Register table routes (sections + tables CRUD)
    await fastify.register(tableRoutes);

    // Register table lock routes (customer-facing lock/unlock for booking flow)
    await fastify.register(tableLockRoutes);

    // Register order routes (order management for table service)
    await fastify.register(orderRoutes);

    // Register business hours routes (schedule + overrides + timing config)
    await fastify.register(businessHoursRoutes);

    // Register reservation routes (create, read, list)
    await fastify.register(reservationRoutes);

    // Register admin settings routes (deposit config, etc.)
    await fastify.register(adminSettingsRoutes);

    // Register notification settings routes (admin configures enabled types per branch)
    await fastify.register(notificationSettingsRoutes);

    // Register notification alert routes (real-time WebSocket alerts for staff/admin)
    await fastify.register(notificationAlertRoutes);

    // Register walk-in routes (waiter/manager/admin)
    await fastify.register(walkInRoutes);

    // Register serial key routes (admin only — unlock operating modes)
    await fastify.register(serialKeyRoutes);

    // Register staff routes (admin only — create/edit staff accounts)
    await fastify.register(staffRoutes);

    // Register customer management routes (admin only — registered and one-time customers)
    await fastify.register(registerAdminCustomerRoutes);

    // Register decoration routes (public — colors and packages per branch)
    await fastify.register(decorationRoutes);

    // Register cake routes (public — cake preferences and menu items per branch)
    await fastify.register(cakeRoutes);

    // Register commission routes (admin only — commission settings and statistics)
    await fastify.register(commissionRoutes);

    // Register commission report routes (admin only — reporting, filtering, export, audit)
    await fastify.register(commissionReportRoutes);

    // Register booking routes (available-slots, promo-code validation)
    await fastify.register(bookingRoutes);

    // Register promo code routes (admin CRUD + validation)
    await fastify.register(promoCodeRoutes);

    // Register payment gateway routes (initiate payment + webhook callbacks)
    await fastify.register(paymentRoutes);

    // Register menu routes (sections + items management)
    await fastify.register(menuRoutes);

    // Malaysia holidays proxy (scrapes officeholidays.com)
    await fastify.register(malaysiaHolidaysRoutes);

    // Start background scheduler (no-show detection + reminder emails)
    SchedulerService.start();
    logger.info('Background scheduler started');

    // Start server
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    logger.info(`Server listening on http://${host}:${port}`);

    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error(error, 'Failed to initialize application');
    process.exit(1);
  }
}

// Handle unhandled exceptions
process.on('uncaughtException', (error) => {
  logger.error(error, 'Uncaught exception');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection');
  process.exit(1);
});

// Start the application
main();
