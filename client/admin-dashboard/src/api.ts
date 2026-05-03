/**
 * API client for Sneat Dashboard.
 * All requests include X-Branch-ID header and Bearer token.
 * Automatically refreshes the access token on 401 using the HTTP-only refresh
 * token cookie, then retries the original request once.
 */

const BASE = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('staff_token');
  const branchId = localStorage.getItem('branch_id');
  const headers: Record<string, string> = {};

  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (branchId && branchId.trim()) {
    headers['X-Branch-ID'] = branchId.trim();
  }

  return headers;
}

/** Attempt a silent token refresh. Returns the new access token or null. */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.accessToken) {
      localStorage.setItem('staff_token', data.accessToken);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

/** Redirect to login and clear all session data. */
function forceLogout() {
  localStorage.removeItem('staff_token');
  localStorage.removeItem('staff_role');
  localStorage.removeItem('branch_id');
  localStorage.removeItem('branch_name');
  window.location.href = '/';
}

async function request<T>(path: string, options?: RequestInit, _isRetry = false): Promise<T> {
  const finalHeaders = { ...getHeaders(), ...(options?.headers ?? {}) } as Record<string, string>;
  
  // Only add Content-Type if there's a body and it's not already set
  if (options?.body && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include', // needed so the refresh_token cookie is sent
    headers: finalHeaders,
  });

  if (!res.ok) {
    // On 401: try a silent token refresh once, then retry the original request
    if (res.status === 401 && !_isRetry) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return request<T>(path, options, true);
      }
      // Refresh failed — session is truly expired
      forceLogout();
      throw new Error('Session expired. Please log in again.');
    }

    // On 404 with a branch path: the stored branch_id is stale — force re-login
    if (res.status === 404 && path.includes('/branches/')) {
      const body = await res.json().catch(() => ({}));
      const msg: string = body.error ?? '';
      if (msg.toLowerCase().includes('branch')) {
        forceLogout();
        throw new Error('Branch not found. Please log in again.');
      }
    }

    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  
  if (res.status === 204) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

// ── Customers ─────────────────────────────────────────────────────────────────

export const deleteCustomer = (branchId: string, customerId: string) =>
  request<void>(`/admin/v1/branches/${branchId}/customers/${customerId}`, {
    method: 'DELETE',
  });

// ── Sections ──────────────────────────────────────────────────────────────────

export const getSections = (branchId: string) =>
  request<import('./types').Section[]>(`/v1/branches/${branchId}/sections`);

export const createSection = (branchId: string, data: import('./types').CreateSectionPayload) =>
  request<import('./types').Section>(`/admin/v1/branches/${branchId}/sections`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

// ── Tables ────────────────────────────────────────────────────────────────────

/**
 * Enrich tables with cake menu item name and price.
 * For each unique cake_menu_id, fetches the menu item from the API and maps
 * name/price back onto the table objects. Best-effort — errors are silently ignored.
 */
async function enrichTablesWithCakeMenuDetails(
  branchId: string,
  tables: import('./types').Table[]
): Promise<import('./types').Table[]> {
  const uniqueIds = [...new Set(tables.map(t => t.cake_menu_id).filter(Boolean))] as string[];
  if (uniqueIds.length === 0) return tables;

  const menuItemMap = new Map<string, { name: string; price: number | null }>();

  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const item = await request<{ id: string; name: string; price: number | null }>(
          `/v1/branches/${branchId}/menu-items/${id}`
        );
        menuItemMap.set(id, { name: item.name, price: item.price });
      } catch {
        // best-effort — ignore 404 or network errors
      }
    })
  );

  return tables.map(t => {
    if (t.cake_menu_id && menuItemMap.has(t.cake_menu_id)) {
      const item = menuItemMap.get(t.cake_menu_id)!;
      return { ...t, cake_menu_name: item.name, cake_menu_price: item.price };
    }
    return t;
  });
}

export const getAllTables = async (branchId: string): Promise<import('./types').Table[]> => {
  const tables = await request<import('./types').Table[]>(`/manager/v1/branches/${branchId}/tables`);
  return enrichTablesWithCakeMenuDetails(branchId, tables);
};

export const createTable = (branchId: string, data: import('./types').CreateTablePayload) =>
  request<import('./types').Table>(`/admin/v1/branches/${branchId}/tables`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateTable = (
  branchId: string,
  tableId: string,
  data: import('./types').UpdateTablePayload
) =>
  request<import('./types').Table>(`/admin/v1/branches/${branchId}/tables/${tableId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// ── Commission ────────────────────────────────────────────────────────────────

export const getCommissionSettings = (branchId: string) =>
  request<{ branchId: string; commissionSettings: import('./types').CommissionSetting[] }>(
    `/admin/v1/branches/${branchId}/commission-settings`
  );

export const updateCommissionSetting = (
  branchId: string,
  category: string,
  data: import('./types').UpdateCommissionPayload
) =>
  request<import('./types').CommissionSetting>(
    `/admin/v1/branches/${branchId}/commission-settings/${category}`,
    { method: 'PATCH', body: JSON.stringify(data) }
  );

export const resetCommissionSettings = (branchId: string) =>
  request<{ branchId: string; reset: boolean }>(
    `/admin/v1/branches/${branchId}/commission-settings/reset`,
    { method: 'POST' }
  );

export const getBranchSettings = (branchId: string) =>
  request<import('./types').BranchSettings>(`/admin/v1/branches/${branchId}/settings`);

export const updateBranchSettings = (
  branchId: string,
  data: Partial<import('./types').BranchSettings>
) =>
  request<import('./types').BranchSettings>(`/admin/v1/branches/${branchId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const getCommissionStatistics = (branchId: string) =>
  request<import('./types').CommissionStatistics>(
    `/admin/v1/branches/${branchId}/commission-statistics`
  );

export const getReservationsForDate = (branchId: string, date: string, tableId?: string) => {
  const params = new URLSearchParams({ date });
  if (tableId) params.append('tableId', tableId);
  return request<import('./types').TimelineReservation[]>(
    `/manager/v1/branches/${branchId}/reservations?${params.toString()}`
  );
};

export const getAllActiveTables = (branchId: string) =>
  request<import('./types').Table[]>(`/manager/v1/branches/${branchId}/tables`);

export const getDecorationColors = (branchId: string) =>
  request<import('./types').DecorationColor[]>(`/v1/branches/${branchId}/decoration-colors`);

export const getDecorationPackages = (branchId: string) =>
  request<import('./types').DecorationPackage[]>(`/v1/branches/${branchId}/decoration-packages`);

export const createWalkInReservation = (branchId: string, data: import('./types').CreateWalkInPayload) =>
  request<import('./types').WalkInResult>(`/waiter/v1/branches/${branchId}/walk-ins`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const createWalkIn = (branchId: string, data: { table_id: string; party_size: number; notes?: string }) =>
  request<{ walkIn: { id: string; table_id: string; status: string } }>(`/waiter/v1/branches/${branchId}/walk-ins`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const closeWalkIn = (walkInId: string) =>
  request<{ walkIn: { id: string; status: string } }>(`/waiter/v1/walk-ins/${walkInId}/close`, {
    method: 'PATCH',
  });

export const getNotificationSettings = (branchId: string) =>
  request<import('./types').NotificationSettings>(`/admin/v1/branches/${branchId}/notification-settings`);

export const updateNotificationSettings = (branchId: string, data: Partial<import('./types').NotificationSettings>) =>
  request<import('./types').NotificationSettings>(`/admin/v1/branches/${branchId}/notification-settings`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// ── Orders ────────────────────────────────────────────────────────────────────

export const getTableOrder = (branchId: string, tableId: string) =>
  request<import('./types').Order>(`/manager/v1/branches/${branchId}/tables/${tableId}/order`);

export const createOrGetOrder = (branchId: string, tableId: string, data?: { reservation_id?: string }) =>
  request<import('./types').Order>(`/manager/v1/branches/${branchId}/tables/${tableId}/order`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });

export const addOrderItem = (branchId: string, orderId: string, data: import('./types').CreateOrderItemPayload) =>
  request<import('./types').OrderItem>(`/manager/v1/branches/${branchId}/orders/${orderId}/items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateOrderItem = (
  branchId: string,
  orderId: string,
  itemId: string,
  data: import('./types').UpdateOrderItemPayload
) =>
  request<import('./types').OrderItem>(`/manager/v1/branches/${branchId}/orders/${orderId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const removeOrderItem = (branchId: string, orderId: string, itemId: string) =>
  request<void>(`/manager/v1/branches/${branchId}/orders/${orderId}/items/${itemId}`, {
    method: 'DELETE',
  });

export const submitOrder = (branchId: string, orderId: string, staffId: string) =>
  request<import('./types').Order>(`/manager/v1/branches/${branchId}/orders/${orderId}/submit`, {
    method: 'PATCH',
    body: JSON.stringify({ staffId }),
  });

export const completeOrder = (branchId: string, orderId: string, staffId: string) =>
  request<import('./types').Order>(`/manager/v1/branches/${branchId}/orders/${orderId}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({ staffId }),
  });

export const updateOrderInstructions = (branchId: string, orderId: string, special_instructions: string) =>
  request<import('./types').Order>(`/manager/v1/branches/${branchId}/orders/${orderId}/instructions`, {
    method: 'PATCH',
    body: JSON.stringify({ special_instructions }),
  });

// ── Promo Codes ───────────────────────────────────────────────────────────────

export const listPromoCodesForBranch = (
  branchId: string,
  options?: { type?: string; isActive?: boolean; limit?: number; offset?: number }
) => {
  const params = new URLSearchParams();
  if (options?.type) params.append('type', options.type);
  if (options?.isActive !== undefined) params.append('isActive', String(options.isActive));
  if (options?.limit) params.append('limit', String(options.limit));
  if (options?.offset) params.append('offset', String(options.offset));

  const query = params.size > 0 ? `?${params.toString()}` : '';
  return request<import('./types').PromoCodesListResponse>(`/admin/v1/promo-codes${query}`);
};

export const getPromoCode = (codeId: string) =>
  request<import('./types').PromoCode>(`/admin/v1/promo-codes/${codeId}`);

export const createPromoCode = (data: import('./types').CreatePromoCodePayload) =>
  request<import('./types').PromoCode>(`/admin/v1/promo-codes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updatePromoCode = (codeId: string, data: import('./types').UpdatePromoCodePayload) =>
  request<import('./types').PromoCode>(`/admin/v1/promo-codes/${codeId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deletePromoCode = (codeId: string) =>
  request<void>(`/admin/v1/promo-codes/${codeId}`, {
    method: 'DELETE',
  });

export const getPromoCodeMetrics = (codeId: string) =>
  request<import('./types').PromoCodeMetrics>(`/admin/v1/promo-codes/${codeId}/performance`);


// ── Table Operations ──────────────────────────────────────────────────────────

/** Clear a table — marks it as available and publishes a WebSocket notification */
export const clearTable = (branchId: string, tableId: string) =>
  request<{ success: boolean; message: string; tableId: string }>(
    `/v1/tables/${tableId}/clear`,
    { method: 'POST' }
  );

/** Get the active reservation for a table with full customer + booking details */
export const getTableReservation = (branchId: string, tableId: string) =>
  request<import('./types').TableReservationDetail>(
    `/manager/v1/branches/${branchId}/tables/${tableId}/reservation`
  );

export const getWaitlist = (branchId: string, status?: string) => {
  const query = status ? `?status=${status}` : '';
  return request<import('./types').WaitlistEntry[]>(`/manager/v1/branches/${branchId}/waitlist${query}`);
};

// ── Menu Management ────────────────────────────────────────────────────────────

export const getMenuSections = (branchId: string) =>
  request<import('./types').MenuSection[]>(`/v1/branches/${branchId}/menu-sections`);

export const createMenuSection = (branchId: string, data: import('./types').CreateMenuSectionPayload) =>
  request<import('./types').MenuSection>(`/admin/v1/branches/${branchId}/menu-sections`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateMenuSection = (branchId: string, sectionId: string, data: Partial<import('./types').MenuSection>) =>
  request<import('./types').MenuSection>(`/admin/v1/branches/${branchId}/menu-sections/${sectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteMenuSection = (branchId: string, sectionId: string) =>
  request<void>(`/admin/v1/branches/${branchId}/menu-sections/${sectionId}`, {
    method: 'DELETE',
  });

export const getMenuItemsByCategory = (branchId: string, sectionId: string) =>
  request<import('./types').MenuItem[]>(`/v1/branches/${branchId}/menu-sections/${sectionId}/items`);

export const createMenuItem = (branchId: string, data: import('./types').CreateMenuItemPayload) =>
  request<import('./types').MenuItem>(`/admin/v1/branches/${branchId}/menu-items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateMenuItem = (branchId: string, itemId: string, data: import('./types').UpdateMenuItemPayload) =>
  request<import('./types').MenuItem>(`/admin/v1/branches/${branchId}/menu-items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteMenuItem = (branchId: string, itemId: string) =>
  request<void>(`/admin/v1/branches/${branchId}/menu-items/${itemId}`, {
    method: 'DELETE',
  });

export const initializeDefaultMenu = (branchId: string) =>
  request<{ success: boolean }>(`/admin/v1/branches/${branchId}/menu/initialize-defaults`, {
    method: 'POST',
  });
