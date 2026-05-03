import { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';

/**
 * SetupGuardMiddleware blocks routes until setup is complete.
 * Exempt URLs: /health, /setup, /auth/login, /auth/identify, /auth/otp/, /auth/register
 * Caches result in-process after first true read.
 */

let setupCompleteCache: boolean | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

export function createSetupGuardMiddleware(pool: Pool) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const url = request.url;

    // Check exempt URLs
    const exemptPrefixes = ['/health', '/setup', '/auth/login', '/auth/identify', '/auth/otp/', '/auth/register'];
    const isExempt = exemptPrefixes.some((prefix) => url.startsWith(prefix));

    if (isExempt) {
      return; // Pass through
    }

    // Check cache
    const now = Date.now();
    if (setupCompleteCache !== null && now - cacheTimestamp < CACHE_TTL) {
      if (!setupCompleteCache) {
        return reply.status(503).send({
          error: 'setup_required',
          redirect: '/setup',
        });
      }
      return; // Setup complete, pass through
    }

    // Query database
    try {
      const result = await pool.query(
        "SELECT value FROM app_config WHERE key = 'setup_completed'"
      );

      const appConfigComplete = result.rows.length > 0 && result.rows[0].value === 'true';

      // Also verify at least one real branch has setup_complete = true.
      // app_config can be set to 'true' even when the branch row was never
      // fully committed (e.g. wizard crashed mid-flight), which lets the
      // dashboard open against an incomplete database.
      let branchSetupComplete = false;
      if (appConfigComplete) {
        const branchResult = await pool.query(
          `SELECT 1 FROM branches
           WHERE setup_complete = true
             AND is_active = true
             AND name != '[Restaurant_Name]'
             AND code != '[BRANCH_CODE]'
           LIMIT 1`
        );
        branchSetupComplete = branchResult.rows.length > 0;
      }

      const isComplete = appConfigComplete && branchSetupComplete;

      // Update cache
      setupCompleteCache = isComplete;
      cacheTimestamp = now;

      if (!isComplete) {
        // Get branch name for personalized message
        let branchName = 'Restaurant';
        try {
          const branchResult = await pool.query(
            `SELECT name FROM branches 
             WHERE is_active = true 
             AND name != '[Restaurant_Name]' 
             AND code != '[BRANCH_CODE]'
             ORDER BY created_at DESC LIMIT 1`
          );
          if (branchResult.rows.length > 0) {
            branchName = branchResult.rows[0].name;
          }
        } catch {
          // Use default if query fails
        }

        return reply.status(503).send({
          error: 'setup_required',
          redirect: '/setup',
          branchName: branchName,
        });
      }
    } catch (error) {
      // If database query fails, assume setup is not complete
      return reply.status(503).send({
        error: 'setup_required',
        redirect: '/setup',
      });
    }
  };
}

/**
 * Clear the setup cache (useful for testing).
 */
export function clearSetupCache(): void {
  setupCompleteCache = null;
  cacheTimestamp = 0;
}
