/**
 * Shared TypeScript Types for Reservation System
 * 
 * This file documents the core types that should be consistent across all React apps.
 * Each portal should import these types from their local types.ts file to maintain
 * consistency with the backend API.
 * 
 * All types defined here are already in:
 * - client/qitchen-portal/src/types.ts
 * - client/sejiwa-portal/src/types.ts
 * - client/sneat-dashboard/src/types.ts
 */

// ─────────────────────────────────────────────────────────────────────────────
// Common Section & Table Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Section {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
}

export interface Table {
  id: string;
  branch_id: string;
  section_id: string;
  section_name?: string;
  name: string;
  capacity: number;
  table_type?: string;
  has_window_view?: boolean;
  is_wheelchair_accessible?: boolean;
  is_active: boolean;
  status: 'available' | 'locked' | 'reserved' | 'occupied';
}

// ─────────────────────────────────────────────────────────────────────────────
// Locking & Reservation Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LockResult {
  acquired: boolean;
  alternatives?: Table[];
}

export interface CreateReservationPayload {
  tableId: string;
  sessionId: string;
  reservationTime: string;
  partySize: number;
  tcAcknowledged?: boolean;
  specialRequests?: string;
  cakePreferenceId?: string;
  cakeMenuItemId?: string;
  cakeNotes?: string;
  hasDecoration?: boolean;
  decorationColor?: string;
  decorationNotes?: string;
  occasionType?: string;
}

export interface ReservationResult {
  reservation: {
    id: string;
    reference_number: string;
    table_id: string;
    reservation_time: string;
    party_size: number;
    status: string;
    deposit_paid: number;
    cake_name?: string;
    cake_notes?: string;
  };
  depositRequired: boolean;
  depositAmount: number;
}

export interface TimelineReservation {
  id: string;
  reference_number: string;
  table_id: string;
  reservation_time: string;
  party_size: number;
  status: 'confirmed' | 'seated' | 'closed' | 'cancelled' | 'no_show';
  customer_name?: string;
  duration_minutes?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu & Food Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url?: string;
  ingredients?: string;
  allergens?: string;
  category: string;
}

export interface CakePreference {
  id: string;
  cake_name: string;
  description: string;
  sort_order: number;
}

export interface CakeSelection {
  type: 'preference' | 'menu_item';
  id: string;
  name: string;
  customNotes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decoration Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DecorationColor {
  id: string;
  name: string;
  hex_code: string;
  sort_order: number;
}

export interface DecorationPackage {
  id: string;
  name: string;
  price: number;
  description?: string;
  includes?: string;
  sort_order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Walk-In Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateWalkInPayload {
  branch_id: string;
  table_id: string;
  party_size: number;
  reservation_time: string;
  staff_member_id?: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface WalkInResult {
  reservation: {
    id: string;
    reference_number: string;
    table_id: string;
    reservation_time: string;
    party_size: number;
    status: string;
  };
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Business Hours
// ─────────────────────────────────────────────────────────────────────────────

export interface BusinessHours {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_open: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BranchSettings {
  branchId: string;
  bookingDepositAmt: number;
  printerType?: string | null;
  printerIpAddress?: string | null;
  printerPort?: number | null;
  printerName?: string | null;
  printerQueueName?: string | null;
  noShowGraceMin: number;
  modCutoffHours: number;
  decorationPackagePrice: number;
}

export interface NotificationSettings {
  branch_id: string;
  reservation_confirmation_email: boolean;
  reservation_confirmation_sms: boolean;
  reservation_modification_email: boolean;
  reservation_modification_sms: boolean;
  cancellation_email: boolean;
  cancellation_sms: boolean;
  no_show_reminder_email: boolean;
  no_show_reminder_sms: boolean;
  send_reminder_before_minutes?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CommissionSetting {
  category: string;
  commissionType: 'percentage' | 'fixed';
  commissionValue: number;
  isEnabled: boolean;
}

export interface CommissionStatistics {
  branchId: string;
  totalCharged: number;
  totalRefunded: number;
  net: number;
  breakdown: CommissionBreakdown[];
}

export interface CommissionBreakdown {
  category: string;
  charged: number;
  refunded: number;
  net: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Synchronization Notes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * To maintain consistency across all React apps:
 * 
 * 1. Always import from the local types.ts file in each app
 * 2. Do NOT duplicate type definitions across apps
 * 3. When the backend API changes, update types.ts in ALL apps
 * 4. Consider using code generation tools (OpenAPI, tRPC) to keep types in sync
 * 
 * Current Files with Type Definitions:
 * - client/qitchen-portal/src/types.ts
 * - client/sejiwa-portal/src/types.ts
 * - client/sneat-dashboard/src/types.ts (dashboard has extended types for admin features)
 * 
 * API Response Types Matching:
 * - GET /api/v1/branches/:id/sections → Section[]
 * - GET /api/v1/branches/:id/tables → Table[]
 * - POST /api/v1/reservations → ReservationResult
 * - GET /api/v1/branches/:id/cake-preferences → CakePreference[]
 * - GET /api/v1/branches/:id/menu-items → MenuItem[]
 * - GET /api/v1/branches/:id/decoration-colors → DecorationColor[]
 * - GET /api/v1/branches/:id/decoration-packages → DecorationPackage[]
 * - POST /api/walk-in → WalkInResult
 * - GET /api/admin/v1/branches/:id/notification-settings → NotificationSettings
 */
