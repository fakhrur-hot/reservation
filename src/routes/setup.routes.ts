import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { SetupService, SetupPayload, SmtpSettingsData } from '../services/setup.service.js';
import { clearSetupCache } from '../middleware/setup-guard.middleware.js';
import { logger } from '../config/logger.js';

export async function setupRoutes(fastify: FastifyInstance, pool: Pool): Promise<void> {
  const setupService = new SetupService(pool);

  /**
   * GET /setup/status
   * Returns current setup status
   */
  fastify.get('/setup/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await setupService.getStatus();
      return reply.send(status);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * POST /setup/progress
   * Save setup progress
   */
  fastify.post('/setup/progress', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { step, partialData } = request.body as { step: number; partialData: any };

      if (typeof step !== 'number' || step < 1 || step > 8) {
        return reply.status(400).send({ error: 'Invalid step number' });
      }

      await setupService.saveProgress(step, partialData);
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * POST /setup/smtp/test
   * Test SMTP connection
   */
  fastify.post('/setup/smtp/test', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = request.body as SmtpSettingsData;

      // Validate required fields
      if (!settings.host || !settings.port || !settings.username || !settings.password) {
        return reply.status(400).send({ error: 'Missing required SMTP fields' });
      }

      const result = await setupService.testSmtp(settings);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * POST /setup/complete
   * Complete setup with full payload.
   * Auto-recovers from duplicate branch code / email by wiping stale data and retrying.
   */
  fastify.post('/setup/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if already fully configured — refuse to overwrite a live installation
      const isComplete = await setupService.isSetupComplete();
      if (isComplete) {
        return reply.status(409).send({ error: 'already_configured' });
      }

      const payload = request.body as SetupPayload;
      const result = await setupService.completeSetup(payload);

      // Clear the setup guard cache immediately so subsequent requests see the updated status
      clearSetupCache();

      return reply.status(200).send(result);
    } catch (error: any) {
      // Log the full error with stack trace for debugging
      logger.error({ error: error.message, code: error.code, stack: error.stack }, 'Setup completion failed');

      // Validation errors — bad input from the wizard
      if (
        error.message.includes('Missing required') ||
        error.message.includes('Invalid') ||
        error.message.includes('required') ||
        error.message.includes('must have') ||
        error.message.includes('Duplicate section')
      ) {
        return reply.status(400).send({ error: error.message });
      }

      // If we get here with a 23505 it means auto-recovery ran and the retry
      // still failed — surface a clear message
      if (error.code === '23505') {
        return reply.status(409).send({
          error: 'A conflict persists after auto-recovery. Please use a different branch code or email address.',
        });
      }

      return reply.status(500).send({ error: error.message, code: error.code });
    }
  });

  /**
   * POST /setup/recover
   * Clean up orphaned rows from a failed previous setup attempt so the wizard
   * can be submitted again without hitting unique constraint errors.
   * Only works when setup is NOT yet complete.
   */
  fastify.post('/setup/recover', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isComplete = await setupService.isSetupComplete();
      if (isComplete) {
        return reply.status(409).send({ error: 'already_configured' });
      }

      const { branchCode, adminEmail } = request.body as { branchCode?: string; adminEmail?: string };
      if (!branchCode || !adminEmail) {
        return reply.status(400).send({ error: 'branchCode and adminEmail are required' });
      }

      await setupService.cleanStaleSetupData(branchCode, adminEmail);
      return reply.send({ success: true, message: 'Stale setup data cleared. You can submit the setup wizard again.' });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}
