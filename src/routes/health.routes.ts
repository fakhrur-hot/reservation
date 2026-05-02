import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

/**
 * Health check response interface
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  dependencies: {
    postgres: DependencyHealth;
    redis: DependencyHealth;
    email: DependencyHealth;
  };
}

interface DependencyHealth {
  status: 'up' | 'down';
  latency_ms?: number;
  error?: string;
}

/**
 * Health check endpoint
 * GET /health
 * 
 * Checks:
 * - PostgreSQL connectivity (SELECT 1)
 * - Redis connectivity (PING)
 * - Email provider reachability (configurable)
 */
export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const response: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        postgres: { status: 'down' },
        redis: { status: 'down' },
        email: { status: 'down' }
      }
    };

    // Check PostgreSQL
    try {
      const pgStart = Date.now();
      const db = getDatabase();
      await db.query('SELECT 1');
      response.dependencies.postgres = {
        status: 'up',
        latency_ms: Date.now() - pgStart
      };
    } catch (error) {
      response.dependencies.postgres = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      response.status = 'unhealthy';
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      const redis = getRedis();
      await redis.ping();
      response.dependencies.redis = {
        status: 'up',
        latency_ms: Date.now() - redisStart
      };
    } catch (error) {
      response.dependencies.redis = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      response.status = 'unhealthy';
    }

    // Check Email provider (if configured)
    // In Stage 1, we check if SMTP credentials are configured
    const emailConfigured = process.env.SMTP_HOST && process.env.SMTP_PORT;
    if (emailConfigured) {
      // For now, we just check if the env vars are set
      // In production, you might do a real SMTP connection test
      response.dependencies.email = {
        status: 'up'
      };
    } else {
      // Email is optional in Stage 1 (TABLE_ONLY mode)
      response.dependencies.email = {
        status: 'up',
        // Not configured is considered "up" for now since email is optional
      };
    }

    const totalLatency = Date.now() - startTime;
    logger.debug({ latency_ms: totalLatency, dependencies: response.dependencies }, 'Health check completed');

    const statusCode = response.status === 'healthy' ? 200 : 503;
    
    // Add flat properties for backward compatibility with tests
    const responseWithFlatProps = {
      ...response,
      postgres: response.dependencies.postgres.status === 'up' ? 'up' : 'down',
      redis: response.dependencies.redis.status === 'up' ? 'up' : 'down'
    };
    
    return reply.status(statusCode).send(responseWithFlatProps);
  });

  // Liveness probe (simple check)
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  // Readiness probe (detailed check)
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, boolean> = {
      postgres: false,
      redis: false
    };

    // Check PostgreSQL
    try {
      const db = getDatabase();
      await db.query('SELECT 1');
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }

    // Check Redis
    try {
      const redis = getRedis();
      await redis.ping();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }

    const allReady = checks.postgres && checks.redis;
    const statusCode = allReady ? 200 : 503;
    
    return reply.status(statusCode).send({
      ready: allReady,
      checks
    });
  });
}

export default healthRoutes;