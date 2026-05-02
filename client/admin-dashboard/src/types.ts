export interface Section {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
  tables?: Table[];
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
  supports_decoration?: boolean;
  is_active: boolean;
  status?: 'available' | 'locked' | 'reserved' | 'occupied';
  created_at: string;
  // Decoration fields from active reservation
  has_decoration?: boolean;
  occasion_type?: string | null;
  decoration_color?: string | null;
  cake_choice?: string | null;
  decoration_notes?: string | null;
  reservation_ref?: string | null;
  // Cake menu fields
  cake_menu_id?: string | null;
  cake_menu_name?: string | null;
  cake_menu_price?: number | null;
  cake_custom_notes?: string | null;
}

export interface CreateSectionPayload {
  name: string;
  description?: string;
  sort_order?: number;
}

export interface CreateTablePayload {
  section_id: string;
  name: string;
  capacity: number;
  table_type?: string;
  has_window_view?: boolean;
  is_wheelchair_accessible?: boolean;
  supports_decoration?: boolean;
}

export interface UpdateTablePayload {
  name?: string;
  capacity?: number;
  section_id?: string;
  table_type?: string;
  has_window_view?: boolean;
  is_wheelchair_accessible?: boolean;
  supports_decoration?: boolean;
  is_active?: boolean;
}

// ── Commission ────────────────────────────────────────────────────────────────

export interface CommissionSetting {
  category: string;
  commissionType: 'percentage' | 'fixed';
  commissionValue: number;
  isEnabled: boolean;
}

export interface CommissionBreakdown {
  category: string;
  charged: number;
  refunded: number;
  net: number;
}

export interface CommissionStatistics {
  branchId: string;
  totalCharged: number;
  totalRefunded: number;
  net: number;
  breakdown: CommissionBreakdown[];
}

export interface UpdateCommissionPayload {
  commission_type?: 'percentage' | 'fixed';
  commission_value?: number;
  is_enabled?: boolean;
}

export interface BranchSettings {
  branchId: string;
  bookingDepositAmt: number;
  printerType: string | null;
  printerIpAddress?: string | null;
  printerPort?: number | null;
  printerName?: string | null;
  printerQueueName?: string | null;
  noShowGraceMin: number;
  modCutoffHours: number;
  decorationPackagePrice: number;
}

export interface TimelineReservation {
  id: string;
  reference_number: string;
  table_id: string;
  reservation_time: string;
  party_size: number;
  status: 'confirmed' | 'seated' | 'closed' | 'cancelled' | 'no_show';
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  table_name?: string | null;
  duration_minutes?: number;
  // Decoration
  has_decoration?: boolean;
  occasion_type?: string | null;
  decoration_color?: string | null;
  decoration_notes?: string | null;
  // Cake
  cake_choice?: string | null;
  cake_custom_notes?: string | null;
  // Promo
  promo_code?: string | null;
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

// ── Order Management ──────────────────────────────────────────────────────────

export type OrderStatus = 'open' | 'submitted' | 'completed' | 'cancelled';
export type OrderItemStatus = 'pending' | 'in-progress' | 'ready' | 'served' | 'cancelled';

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  item_price: number;
  quantity: number;
  customization: string | null;
  status: OrderItemStatus;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  branch_id: string;
  reservation_id: string | null;
  table_id: string;
  status: OrderStatus;
  total_price: number;
  special_instructions: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface CreateOrderItemPayload {
  menu_item_id?: string;
  item_name: string;
  item_price: number;
  quantity?: number;
  customization?: string;
}

export interface UpdateOrderItemPayload {
  quantity?: number;
  customization?: string;
  status?: OrderItemStatus;
}

// ── Promo Codes ───────────────────────────────────────────────────────────────

export type PromoCodeType = 'priority' | 'turnover' | 'vip' | 'affiliate' | 'group' | 'discount';

export interface PromoCode {
  id: string;
  code: string;
  type: PromoCodeType;
  description: string | null;
  overrideLeadTime?: boolean;
  validFromTime?: string;
  validToTime?: string;
  validDaysOfWeek?: string;
  forceSessionDuration?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  minPartySize?: number;
  affiliateId?: string;
  validFrom?: string;
  validTo?: string;
  maxUses?: number;
  currentUses?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromoCodePayload {
  code: string;
  type: PromoCodeType;
  description?: string;
  overrideLeadTime?: boolean;
  validFromTime?: string;
  validToTime?: string;
  validDaysOfWeek?: string;
  forceSessionDuration?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  minPartySize?: number;
  affiliateId?: string;
  validFrom?: string;
  validTo?: string;
  maxUses?: number;
}

export interface UpdatePromoCodePayload {
  description?: string;
  validFromTime?: string;
  validToTime?: string;
  validDaysOfWeek?: string;
  forceSessionDuration?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  minPartySize?: number;
  affiliateId?: string;
  validFrom?: string;
  validTo?: string;
  maxUses?: number;
  isActive?: boolean;
}

export interface PromoCodeMetrics {
  id: string;
  code: string;
  usageCount: number;
  maxUses?: number;
  bookingCount: number;
  totalDiscountGiven: number;
  conversionRate: number;
  avgDiscountPerBooking: number;
}

export interface PromoCodesListResponse {
  data: PromoCode[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ── Table Reservation Detail (Floor Plan Modal) ───────────────────────────────

export interface TableReservationDetail {
  id: string;
  referenceNumber: string;
  reservationTime: string;
  partySize: number;
  status: 'confirmed' | 'seated';
  depositPaid: number;
  tcAcknowledgedAt: string | null;
  specialRequests: string | null;
  seatedAt: string | null;
  isVip: boolean;
  createdAt: string;
  sessionDurationMinutes: number | null;
  endTime: string | null;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  hasDecoration: boolean;
  decorationAmount: number;
  occasionType: 'birthday' | 'anniversary' | 'bachelorette' | null;
  decorationColor: string | null;
  decorationNotes: string | null;
  cakeChoice: string | null;
  cakeMenuId: string | null;
  cakeMenuName: string | null;
  cakeMenuPrice: number | null;
  cakeCustomNotes: string | null;
  promoCode: string | null;
  promoCodeDiscount: number | null;
  promoType: string | null;
  promoDescription: string | null;
  bookingType: 'normal' | 'promo';
}

export interface WaitlistEntry {
  id: string;
  branch_id: string;
  guest_name: string;
  party_size: number;
  phone_number?: string;
  notes?: string;
  priority: number;
  status: 'waiting' | 'assigned' | 'removed';
  wait_time_minutes?: number;
  created_at: string;
}

// ── Menu Management ────────────────────────────────────────────────────────────

export interface MenuSection {
  id: string;
  branch_id: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  section_type: string;
  items?: MenuItem[];
}

export interface MenuItem {
  id: string;
  section_id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  special_tag?: string;
  is_available: boolean;
  sort_order: number;
}

export interface CreateMenuSectionPayload {
  name: string;
  description?: string;
  sort_order?: number;
  section_type?: string;
}

export interface CreateMenuItemPayload {
  section_id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  special_tag?: string;
  sort_order?: number;
}

export interface UpdateMenuItemPayload {
  name?: string;
  description?: string;
  price?: number;
  image_url?: string;
  is_available?: boolean;
  special_tag?: string;
  sort_order?: number;
}
