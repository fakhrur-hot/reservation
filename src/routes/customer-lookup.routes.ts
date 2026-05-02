/**
 * Customer Lookup Routes
 *
 * POST /api/v1/customers/lookup  — lookup customer by phone number
 *
 * Requirements: 3.13, 3.12
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LookupCustomerBody {
  phoneNumber: string;
  branchId: string;
}

interface CustomerProfile {
  id: string;
  branch_id: string;
  name: string;
  email: string;
  phone: string;
  preferred_language?: string;
  dietary_restrictions?: string;
  allergies?: string;
  communication_preference?: string;
  created_at: string;
  updated_at: string;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

export async function registerCustomerLookupRoutes(fastify: FastifyInstance) {
  // ── POST /api/v1/customers/lookup ──────────────────────────────────────────
  /**
   * Lookup customer by phone number.
   * Returns customer profile if found, 404 if not.
   * Used for returning guest recognition in Sejiwa Portal.
   *
   * Requirements: 3.13, 3.12
   */
  fastify.post<{ Body: LookupCustomerBody }>(
    '/api/v1/customers/lookup',
    async (
      request: FastifyRequest<{ Body: LookupCustomerBody }>,
      reply: FastifyReply
    ) => {
      const { phoneNumber, branchId } = request.body;

      // Validate input
      if (!phoneNumber || phoneNumber.trim().length === 0) {
        return reply.status(400).send({ error: 'phoneNumber is required' });
      }

      if (!branchId) {
        return reply.status(400).send({ error: 'branchId is required' });
      }

      try {
        const db = await getDatabase();

        // Lookup customer by phone number
        const result = await db.query(
          `
          SELECT
            id,
            branch_id,
            name,
            email,
            phone,
            preferred_language,
            dietary_restrictions,
            allergies,
            communication_preference,
            created_at,
            updated_at
          FROM customers
          WHERE branch_id = $1 AND phone = $2
          LIMIT 1
          `,
          [branchId, phoneNumber.trim()]
        );

        if (result.rows.length === 0) {
          logger.info(
            { phoneNumber: phoneNumber.trim(), branchId },
            'Customer not found for lookup'
          );
          return reply.status(404).send({
            error: 'Customer not found',
            isReturningGuest: false,
          });
        }

        const customer = result.rows[0] as CustomerProfile;

        logger.info(
          { customerId: customer.id, branchId },
          'Customer found for lookup'
        );

        return reply.status(200).send({
          isReturningGuest: true,
          customer: {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            preferredLanguage: customer.preferred_language,
            dietaryRestrictions: customer.dietary_restrictions,
            allergies: customer.allergies,
            communicationPreference: customer.communication_preference,
          },
        });
      } catch (err: any) {
        logger.error(
          { err, phoneNumber: phoneNumber.trim(), branchId },
          'Failed to lookup customer'
        );
        return reply.status(500).send({ error: 'Failed to lookup customer' });
      }
    }
  );
}
