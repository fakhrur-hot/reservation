/**
 * Default roles for the system.
 * These are the core roles used throughout the application.
 */
export const ROLES = ['admin', 'manager', 'waiter'] as const;

export type Role = (typeof ROLES)[number];
