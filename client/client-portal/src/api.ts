/**
 * API client for Sejiwa Portal.
 * Proxied to backend at localhost:3001 via Vite proxy.
 */

const BASE = '/api';

function getHeaders(): HeadersInit {
  // Token stored in localStorage by TopNav after login
  const token = localStorage.getItem('customer_token');
  // Branch ID stored in sessionStorage by useSetupStatus hook
  const branchId = sessionStorage.getItem('branch_id');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(branchId ? { 'X-Branch-ID': branchId } : {}),
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const getSections = (branchId: string) =>
  request<import('./types').Section[]>(`/v1/branches/${branchId}/sections`);

export const getActiveTables = (branchId: string) =>
  request<import('./types').Table[]>(`/v1/branches/${branchId}/tables`);

export const acquireLock = (branchId: string, tableId: string, sessionId: string) =>
  request<import('./types').LockResult>(`/v1/branches/${branchId}/tables/${tableId}/lock`, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });

export const createReservation = (branchId: string, data: import('./types').CreateReservationPayload) =>
  request<import('./types').ReservationResult>(`/v1/reservations`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getCakePreferences = (branchId: string) =>
  request<import('./types').CakePreference[]>(`/v1/branches/${branchId}/cake-preferences`);

export const getMenuItems = (branchId: string, category?: string) =>
  request<import('./types').MenuItem[]>(
    `/v1/branches/${branchId}/menu-items${category ? `?category=${encodeURIComponent(category)}` : ''}`
  );

export const getMenuItem = (branchId: string, itemId: string) =>
  request<import('./types').MenuItem>(`/v1/branches/${branchId}/menu-items/${itemId}`);

export const getReservationsForDate = (branchId: string, date: string) =>
  request<import('./types').TimelineReservation[]>(
    `/manager/v1/branches/${branchId}/reservations?date=${encodeURIComponent(date)}`
  );

export const getBusinessHours = (branchId: string) =>
  request<import('./types').BusinessHours[]>(`/v1/branches/${branchId}/business-hours`);

export const getDecorationColors = (branchId: string) =>
  request<import('./types').DecorationColor[]>(`/v1/branches/${branchId}/decoration-colors`);

export const getDecorationPackages = (branchId: string) =>
  request<import('./types').DecorationPackage[]>(`/v1/branches/${branchId}/decoration-packages`);

export const createWalkInReservation = (branchId: string, data: import('./types').CreateWalkInPayload) =>
  request<{ walkIn: import('./types').ReservationResult['reservation'] }>(
    `/waiter/v1/branches/${branchId}/walk-ins`,
    { method: 'POST', body: JSON.stringify(data) }
  );

export interface PromoCodeValidationResult {
  valid: boolean;
  code?: string;
  type?: string;
  benefits?: string;
  error?: string;
  warning?: string;
  overrideLeadTime?: number;
  discountValue?: number;
  discountType?: 'percentage' | 'fixed';
  sessionDurationMinutes?: number;
}

export const validatePromoCode = (
  branchId: string,
  code: string,
  bookingType: 'standard' | 'decorated',
  partySize?: number
) =>
  request<PromoCodeValidationResult>('/v1/promo-codes/validate', {
    method: 'POST',
    body: JSON.stringify({ code, branchId, bookingType, partySize }),
  });

// Available slot from GET /available-slots
export interface AvailableSlot {
  startTime: string;
  endTime: string;
  duration: number;
  available: boolean;
  reason?: string;
}

export interface GetAvailableSlotsParams {
  branchId: string;
  date: string;
  partySize: number;
  isDecorated: boolean;
  promoCode?: string;
}

export const getAvailableSlots = async (params: GetAvailableSlotsParams): Promise<AvailableSlot[]> => {
  const searchParams = new URLSearchParams({
    branchId: params.branchId,
    date: params.date,
    partySize: String(params.partySize),
    isDecorated: String(params.isDecorated),
  });
  if (params.promoCode) searchParams.append('promoCode', params.promoCode);
  const response = await request<{ slots: AvailableSlot[] } | AvailableSlot[]>(
    `/v1/available-slots?${searchParams.toString()}`
  );
  return Array.isArray(response) ? response : (response as any).slots ?? [];
};

// ─── Customer Lookup (Returning Guest Recognition) ───────────────────────────

export interface LookupCustomerResponse {
  isReturningGuest: boolean;
  customer?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    preferredLanguage?: string;
    dietaryRestrictions?: string;
    allergies?: string;
    communicationPreference?: string;
  };
  error?: string;
}

export const lookupCustomer = (branchId: string, phoneNumber: string) =>
  request<LookupCustomerResponse>(`/v1/customers/lookup`, {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, branchId }),
  });
