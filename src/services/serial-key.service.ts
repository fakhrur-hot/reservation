/**
 * Serial Key Service
 *
 * Pure functions for validating HMAC-SHA256 serial keys and decoding
 * feature bitmasks to App_Operating_Mode strings.
 *
 * Key format: `{branch_id}:{expiry_epoch}:{feature_bitmask}:{hmac_hex}`
 * HMAC message: `{branch_id}:{expiry_epoch}:{feature_bitmask}`
 *
 * Feature bitmask mapping:
 *   0b001 (1) = TABLE_ONLY
 *   0b011 (3) = MENU_READY  (Stage 2)
 *   0b111 (7) = FULL        (Stage 3)
 *
 * Requirements: 20.6, 20.7
 */

import { createHmac, timingSafeEqual } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppOperatingMode = 'TABLE_ONLY' | 'MENU_READY' | 'FULL';

export interface SerialKeyPayload {
  branchId: string;
  expiryEpoch: number;
  featureBitmask: number;
}

export interface SerialKeyValidationResult {
  valid: boolean;
  payload?: SerialKeyPayload;
  error?: string;
}

// ─── Bitmask → Mode mapping ───────────────────────────────────────────────────

const BITMASK_TO_MODE: Record<number, AppOperatingMode> = {
  0b001: 'TABLE_ONLY',
  0b011: 'MENU_READY',
  0b111: 'FULL',
};

/**
 * Decode a feature bitmask to an App_Operating_Mode string.
 * Returns null if the bitmask is not recognised.
 */
export function decodeBitmask(bitmask: number): AppOperatingMode | null {
  return BITMASK_TO_MODE[bitmask] ?? null;
}

/**
 * Validate an HMAC-SHA256 serial key for a given branch.
 *
 * Expected key format: `{branch_id}:{expiry_epoch}:{feature_bitmask}:{hmac_hex}`
 *
 * Validation steps:
 *  1. Parse the four colon-separated segments.
 *  2. Verify the branch_id in the key matches the supplied branchId.
 *  3. Recompute HMAC-SHA256(secret, `{branch_id}:{expiry_epoch}:{feature_bitmask}`)
 *     and compare with the provided signature using a timing-safe comparison.
 *  4. Check that expiry_epoch > Date.now() / 1000 (not expired).
 *  5. Verify the bitmask maps to a known operating mode.
 */
export function validateSerialKey(
  key: string,
  branchId: string
): SerialKeyValidationResult {
  const secret = process.env.SERIAL_KEY_SECRET;
  if (!secret) {
    return { valid: false, error: 'SERIAL_KEY_SECRET is not configured' };
  }

  // Parse key segments
  const parts = key.split(':');
  if (parts.length !== 4) {
    return { valid: false, error: 'Invalid key format' };
  }

  const [keyBranchId, expiryStr, bitmaskStr, providedHmac] = parts;

  // Branch ID must match
  if (keyBranchId !== branchId) {
    return { valid: false, error: 'Key does not match branch' };
  }

  const expiryEpoch = parseInt(expiryStr, 10);
  if (isNaN(expiryEpoch)) {
    return { valid: false, error: 'Invalid expiry in key' };
  }

  const featureBitmask = parseInt(bitmaskStr, 10);
  if (isNaN(featureBitmask)) {
    return { valid: false, error: 'Invalid bitmask in key' };
  }

  // Verify HMAC signature (timing-safe)
  const message = `${keyBranchId}:${expiryStr}:${bitmaskStr}`;
  const expectedHmac = createHmac('sha256', secret).update(message).digest('hex');

  let signaturesMatch: boolean;
  try {
    signaturesMatch = timingSafeEqual(
      Buffer.from(providedHmac, 'hex'),
      Buffer.from(expectedHmac, 'hex')
    );
  } catch {
    // Buffer lengths differ → invalid hex or wrong length
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    return { valid: false, error: 'Invalid key signature' };
  }

  // Check expiry
  const nowEpoch = Math.floor(Date.now() / 1000);
  if (expiryEpoch <= nowEpoch) {
    return { valid: false, error: 'Key has expired' };
  }

  // Validate bitmask
  if (decodeBitmask(featureBitmask) === null) {
    return { valid: false, error: 'Unknown feature bitmask' };
  }

  return {
    valid: true,
    payload: { branchId: keyBranchId, expiryEpoch, featureBitmask },
  };
}
