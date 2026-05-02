/**
 * Validation Utilities
 * 
 * Common validation functions for input validation
 */

/**
 * Validate RFC 5321 email format
 * 
 * @param email - Email address to validate
 * @returns true if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  // RFC 5321 compliant email regex
  // This is a practical implementation that covers most valid email formats
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Check basic format
  if (!emailRegex.test(email)) {
    return false;
  }
  
  // Check length constraints (RFC 5321)
  // Local part max 64 chars, domain max 255 chars, total max 254 chars
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return false;
  }
  
  if (localPart.length > 64) {
    return false;
  }
  
  if (domain.length > 255) {
    return false;
  }
  
  if (email.length > 254) {
    return false;
  }
  
  return true;
}

/**
 * Validate Malaysian E.164 phone format
 * Format: +601[0-9]{8,9}
 * 
 * @param phone - Phone number to validate
 * @returns true if valid, false otherwise
 */
export function isValidMalaysianPhone(phone: string): boolean {
  // Malaysian E.164 format: +601 followed by 8-9 digits
  // Examples: +60123456789, +601234567890
  const phoneRegex = /^\+601[0-9]{8,9}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate UUID format
 * 
 * @param uuid - UUID string to validate
 * @returns true if valid, false otherwise
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitize email address
 * - Trims whitespace
 * - Converts to lowercase
 * 
 * @param email - Email address to sanitize
 * @returns Sanitized email
 */
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Sanitize phone number
 * - Removes spaces, dashes, parentheses
 * 
 * @param phone - Phone number to sanitize
 * @returns Sanitized phone
 */
export function sanitizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '');
}