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
  depositIdempotencyKey?: string;
  depositMethod?: 'fpx' | 'card';
  isDecorated?: boolean;
  has_decoration?: boolean;
  occasion_type?: string;
  decoration_color?: string;
  decoration_notes?: string;
  decoration_amount?: number;
  cake_choice?: string;
  cake_menu_id?: string;
  cake_custom_notes?: string;
  promoCode?: string;
  promoCodeDiscount?: number;
  tableLockId?: string;
  sessionDurationMinutes?: number;
  endTime?: string;
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
    promo_code?: string;
    promo_code_discount?: number;
  };
  depositRequired: boolean;
  depositAmount: number;
}

export interface CakePreference {
  id: string;
  cake_name: string;
  description: string;
  sort_order: number;
}

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

export interface CakeSelection {
  type: 'preference' | 'menu_item';
  id: string;
  name: string;
  customNotes?: string;
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

export interface BusinessHours {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_open: boolean;
}

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

export interface CreateWalkInPayload {
  branch_id: string;
  table_id: string;
  party_size: number;
  reservation_time: string;
  staff_member_id?: string;
  customer_name?: string;
  customer_phone?: string;
}
