/**
 * TableDetailModal
 *
 * Large modal showing complete booking details for a reserved/occupied table:
 * - Customer info (name, email, phone)
 * - Booking info (reference, time, party size, status, deposit)
 * - Decoration (checkbox, occasion, color, notes)
 * - Cake (type/name from dropdown or custom)
 * - Booking type (Normal / Promo with code details)
 * - Special requests
 * - Order management (Stage 2 ready)
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Table, TableReservationDetail, TimelineReservation, MenuItem, MenuSection } from '../types';
import { getTableReservation, getReservationsForDate, createOrGetOrder, addOrderItem, getMenuSections } from '../api';
import './TableDetailModal.css';

interface TableDetailModalProps {
  table: Table;
  branchId: string;
  staffId: string;
  onClose: () => void;
  onTableStatusChanged?: () => void;
}

const OCCASION_LABELS: Record<string, string> = {
  birthday:     '🎂 Birthday',
  anniversary:  '💍 Anniversary',
  bachelorette: '🥂 Bachelorette',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  confirmed: { label: 'Confirmed',  color: '#1d4ed8', bg: '#dbeafe' },
  seated:    { label: 'Seated',     color: '#dc2626', bg: '#fef2f2' },
  closed:    { label: 'Closed',     color: '#374151', bg: '#f3f4f6' },
  cancelled: { label: 'Cancelled',  color: '#991b1b', bg: '#fee2e2' },
  no_show:   { label: 'No Show',    color: '#92400e', bg: '#fef3c7' },
};

function Badge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#374151', bg: '#f3f4f6' };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
      color: cfg.color, background: cfg.bg,
    }}>
      {cfg.label}
    </span>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '8px 0', borderBottom: '1px solid #f1f5f9',
    }}>
      <span style={{ fontSize: 13, color: '#64748b', minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 13, color: highlight ? '#1d4ed8' : '#1e293b',
        fontWeight: highlight ? 600 : 400, textAlign: 'right',
      }}>{value ?? '—'}</span>
    </div>
  );
}

import OrderForm, { SectionTitle, OrderItem } from './OrderForm';

function makeItem(): OrderItem {
  return { id: crypto.randomUUID(), menu_item_id: '', menu: '', qty: 1, price: 0 };
}

function flattenMenuItems(sections: MenuSection[]): (MenuItem & { section_name: string })[] {
  return sections.flatMap(s => (s.items ?? []).filter((i: MenuItem) => i.is_available).map(i => ({ ...i, section_name: s.name })));
}

export default function TableDetailModal({
  table,
  branchId,
  staffId,
  onClose,
  onTableStatusChanged,
}: TableDetailModalProps): React.ReactElement {
  const [reservation, setReservation] = useState<TableReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timeline state
  const [timeline, setTimeline] = useState<TimelineReservation[]>([]);
  const [viewingIndex, setViewingIndex] = useState(-1); // -1 is "Current Status"
  const [viewingDate, setViewingDate] = useState(new Date().toISOString().split('T')[0]);

  // Inline order state (for seated tables)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([makeItem()]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSaved, setOrderSaved] = useState(false);

  useEffect(() => {
    if (!table.id || !branchId) return;
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch current active reservation
        let current: TableReservationDetail | null = null;
        try {
          current = await getTableReservation(branchId, table.id);
        } catch (err: any) {
          if (!err.message?.includes('404') && !err.message?.includes('No active')) {
            throw err;
          }
        }

        // 2. Fetch timeline for current date
        const list = await getReservationsForDate(branchId, viewingDate, table.id);
        
        setReservation(current);
        setTimeline(list);
        setViewingIndex(-1); // Start at "Current"
      } catch (err: any) {
        setError(err.message || 'Failed to load reservation data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [table.id, branchId, viewingDate]);

  // Initialize open order + menu when reservation status becomes 'seated'
  useEffect(() => {
    if (!reservation || reservation.status !== 'seated' || !branchId || !table.id) return;
    setOrderItems([makeItem()]);
    setOrderId(null);
    setOrderError(null);
    setOrderSaved(false);
    Promise.all([
      createOrGetOrder(branchId, table.id),
      getMenuSections(branchId),
    ])
      .then(([order, sections]) => {
        setOrderId(order.id);
        setMenuItems(flattenMenuItems(sections));
      })
      .catch((err: unknown) => setOrderError(err instanceof Error ? err.message : 'Failed to initialise order'));
  }, [reservation?.status, branchId, table.id]);

  const handleOrderAddItem = useCallback(() => setOrderItems((p) => [...p, makeItem()]), []);
  const handleOrderUpdateItem = useCallback((id: string, field: keyof OrderItem, value: string | number) => {
    setOrderItems((p) => p.map((it) => it.id === id ? { ...it, [field]: value } : it));
  }, []);
  const handleOrderRemoveItem = useCallback((id: string) => {
    setOrderItems((p) => p.length > 1 ? p.filter((it) => it.id !== id) : p);
  }, []);

  const handleOrderSave = async () => {
    if (!orderId) return;
    const valid = orderItems.filter((it) => it.menu_item_id !== '');
    if (valid.length === 0) { setOrderError('Select at least one menu item.'); return; }
    setOrderSaving(true);
    setOrderError(null);
    try {
      await Promise.all(valid.map((it) => addOrderItem(branchId, orderId, { menu_item_id: it.menu_item_id, item_name: it.menu, item_price: it.price, quantity: it.qty })));
      setOrderSaved(true);
      setOrderItems([makeItem()]);
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : 'Failed to save order');
    } finally {
      setOrderSaving(false);
    }
  };

  const handleNext = () => {
    if (viewingIndex < timeline.length - 1) {
      setViewingIndex(viewingIndex + 1);
    }
  };

  const handlePrev = () => {
    if (viewingIndex > -1) {
      setViewingIndex(viewingIndex - 1);
    }
  };

  const goToCurrent = () => {
    setViewingIndex(-1);
  };

  const activeDisplay = viewingIndex === -1 ? reservation : (timeline[viewingIndex] as any);
  const isViewingTimeline = viewingIndex !== -1;

  const formatTime = (iso: any) => {
    if (!iso) return '—';
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return '—';
    }
  };

  // Helper to get nested or flat fields
  const getField = (obj: any, path: string, timelinePath?: string) => {
    if (!obj) return '—';
    if (isViewingTimeline && timelinePath) {
      return obj[timelinePath] ?? '—';
    }
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null) return '—';
      current = current[part];
    }
    return current ?? '—';
  };

  const cakeDisplay = () => {
    if (!reservation) return null;
    if (reservation.cakeMenuName) {
      return `${reservation.cakeMenuName}${reservation.cakeMenuPrice ? ` (RM ${reservation.cakeMenuPrice.toFixed(2)})` : ''}`;
    }
    if (reservation.cakeChoice && reservation.cakeChoice !== 'custom_request') {
      return reservation.cakeChoice;
    }
    if (reservation.cakeChoice === 'custom_request') {
      return `Custom${reservation.cakeCustomNotes ? ` — ${reservation.cakeCustomNotes}` : ''}`;
    }
    return null;
  };

  return (
    <div
      className="modal-overlay table-detail-overlay"
      onClick={onClose}
    >
      <div
        className="modal table-detail-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 28px', background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: '#fff', flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                Table {table.name}
              </h2>
              {activeDisplay && <Badge status={activeDisplay.status} />}
              {!loading && !activeDisplay && (
                <span style={{ background: '#d1fae5', color: '#065f46', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                  Available
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              {table.capacity} seats
              {table.table_type ? ` · ${table.table_type.charAt(0).toUpperCase() + table.table_type.slice(1)}` : ''}
              {table.has_window_view ? ' · 🪟 Window View' : ''}
              {table.is_wheelchair_accessible ? ' · ♿ Accessible' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Timeline Navigation ── */}
        <div style={{ 
          padding: '12px 28px', 
          background: '#f1f5f9', 
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button 
                onClick={handlePrev}
                disabled={viewingIndex <= -1}
                style={{ 
                  background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, 
                  width: 32, height: 32, cursor: viewingIndex <= -1 ? 'not-allowed' : 'pointer',
                  opacity: viewingIndex <= -1 ? 0.5 : 1
                }}
              >
                ◀
              </button>
              <div style={{ 
                background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, 
                padding: '0 16px', height: 32, display: 'flex', alignItems: 'center',
                fontSize: 13, fontWeight: 600, color: '#334155', minWidth: 200, justifyContent: 'center'
              }}>
                {viewingIndex === -1 ? 'CURRENT STATUS (NOW)' : `RESERVATION: ${formatTime(timeline[viewingIndex]?.reservation_time)}`}
              </div>
              <button 
                onClick={handleNext}
                disabled={viewingIndex >= timeline.length - 1}
                style={{ 
                  background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, 
                  width: 32, height: 32, cursor: viewingIndex >= timeline.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: viewingIndex >= timeline.length - 1 ? 0.5 : 1
                }}
              >
                ▶
              </button>
            </div>
            
            <input 
              type="date" 
              value={viewingDate}
              onChange={(e) => setViewingDate(e.target.value)}
              style={{ 
                padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1',
                fontSize: 13, color: '#334155', backgroundColor: '#fff'
              }}
            />
          </div>

          <button 
            onClick={goToCurrent}
            style={{ 
              padding: '6px 14px', borderRadius: 6, border: 'none', 
              background: viewingIndex === -1 ? '#1d4ed8' : '#e2e8f0',
              color: viewingIndex === -1 ? '#fff' : '#475569',
              fontSize: 12, fontWeight: 700, cursor: 'pointer'
            }}
          >
            CURRENT
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', background: '#f8fafc' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              Loading reservation details…
            </div>
          )}

          {!loading && error && (
            <div style={{ textAlign: 'center', padding: 48, color: '#dc2626' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              {error}
            </div>
          )}

          {!loading && !error && !activeDisplay && (
            <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🪑</div>
              <h3 style={{ margin: '0 0 8px', color: '#1e293b' }}>
                {isViewingTimeline ? 'No Reservation Found' : 'Table is Available'}
              </h3>
              <p style={{ margin: 0, fontSize: 14 }}>
                {isViewingTimeline ? 'This reservation slot is no longer valid.' : 'No active reservation for this table right now.'}
              </p>
            </div>
          )}

          {!loading && !error && activeDisplay && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── TOP: 3-COLUMN INFO GRID ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>

                {/* COLUMN 1 — Customer */}
                <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <SectionTitle icon="👤" title="Customer" />
                  <InfoRow label="Name" value={getField(activeDisplay, 'customer.name', 'customer_name')} highlight />
                  {!activeDisplay.isWalkIn && (
                    <>
                      <InfoRow label="Email" value={getField(activeDisplay, 'customer.email', 'customer_email')} />
                      <InfoRow label="Phone" value={getField(activeDisplay, 'customer.phone', 'customer_phone')} />
                    </>
                  )}
                  {activeDisplay.isWalkIn && (
                    <InfoRow label="Recorded By" value={activeDisplay.staffName} />
                  )}
                  {(!isViewingTimeline && activeDisplay.isVip) && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                        ⭐ VIP Guest
                      </span>
                    </div>
                  )}
                </div>

                {/* COLUMN 2 — Booking Details */}
                <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <SectionTitle icon="📋" title="Booking Details" />
                  <InfoRow label="Reference" value={
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>
                      {getField(activeDisplay, 'referenceNumber', 'reference_number')}
                    </span>
                  } />
                  <InfoRow label="Status" value={<Badge status={activeDisplay.status} />} />
                  <InfoRow label="Time" value={formatTime(isViewingTimeline ? activeDisplay.reservation_time : activeDisplay.reservationTime)} />
                  {(!isViewingTimeline && activeDisplay.seatedAt) && (
                    <InfoRow label="Seated At" value={formatTime(activeDisplay.seatedAt)} />
                  )}
                  <InfoRow label="Party Size" value={`${getField(activeDisplay, 'partySize', 'party_size')} guests`} />
                  {!activeDisplay.isWalkIn && (
                    <>
                      {(!isViewingTimeline && activeDisplay.sessionDurationMinutes) && (
                        <InfoRow label="Session Duration" value={`${activeDisplay.sessionDurationMinutes} min`} />
                      )}
                      {(!isViewingTimeline && activeDisplay.endTime) && (
                        <InfoRow label="Expected End" value={formatTime(activeDisplay.endTime)} />
                      )}
                      <InfoRow label="Deposit Paid" value={
                        Number(getField(activeDisplay, 'depositPaid', 'deposit_paid')) > 0
                          ? <span style={{ color: '#065f46', fontWeight: 600 }}>RM {Number(getField(activeDisplay, 'depositPaid', 'deposit_paid')).toFixed(2)}</span>
                          : <span style={{ color: '#64748b' }}>None</span>
                      } />
                    </>
                  )}
                  <InfoRow label={activeDisplay.isWalkIn ? 'Created At' : 'Booked On'} value={formatTime(isViewingTimeline ? activeDisplay.created_at : activeDisplay.createdAt)} />
                </div>

                {/* COLUMN 3 — Decoration, Cake & Booking Type (Only for Reservations) */}
                {!activeDisplay.isWalkIn ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <SectionTitle icon="🎉" title="Decoration & Occasion" />
                      <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, color: '#64748b', minWidth: 160 }}>Decoration Requested</span>
                        <span style={{
                          padding: '3px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                          background: (activeDisplay as any).has_decoration || (activeDisplay as any).hasDecoration ? '#d1fae5' : '#f1f5f9',
                          color: (activeDisplay as any).has_decoration || (activeDisplay as any).hasDecoration ? '#065f46' : '#64748b',
                        }}>
                          {(activeDisplay as any).has_decoration || (activeDisplay as any).hasDecoration ? '✅ Yes' : '❌ No'}
                        </span>
                      </div>
                      {((activeDisplay as any).has_decoration || (activeDisplay as any).hasDecoration) && (
                        <>
                          <InfoRow 
                            label="Occasion" 
                            value={OCCASION_LABELS[(activeDisplay as any).occasion_type || (activeDisplay as any).occasionType] || ((activeDisplay as any).occasion_type || (activeDisplay as any).occasionType)} 
                          />
                          <InfoRow 
                            label="Color Theme" 
                            value={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                <span>{(activeDisplay as any).decoration_color || (activeDisplay as any).decorationColor}</span>
                                {((activeDisplay as any).decoration_color || (activeDisplay as any).decorationColor) && (
                                  <div style={{ 
                                    width: 14, height: 14, borderRadius: '50%', 
                                    backgroundColor: (activeDisplay as any).decoration_color || (activeDisplay as any).decorationColor,
                                    border: '1px solid #e2e8f0',
                                    flexShrink: 0,
                                  }} />
                                )}
                              </div>
                            } 
                          />
                        </>
                      )}
                    </div>

                    <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <SectionTitle icon="🎂" title="Cake Selection" />
                      {((activeDisplay as any).cake_choice || (activeDisplay as any).cakeChoice) ? (
                        <div style={{
                          background: '#fef9c3', border: '1px solid #fde68a',
                          borderRadius: 8, padding: '10px 14px',
                          fontSize: 14, fontWeight: 600, color: '#92400e',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          🎂 {(activeDisplay as any).cake_choice || (activeDisplay as any).cakeChoice}
                        </div>
                      ) : (
                        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No cake selected.</p>
                      )}
                    </div>

                    <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <SectionTitle icon="🏷️" title="Booking Type" />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                        <span style={{
                          padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                          background: (activeDisplay.promo_code || activeDisplay.promoCode) ? '#ede9fe' : '#f0fdf4',
                          color: (activeDisplay.promo_code || activeDisplay.promoCode) ? '#6d28d9' : '#166534',
                        }}>
                          {(activeDisplay.promo_code || activeDisplay.promoCode) ? '🎟️ Promo Booking' : '📅 Normal Booking'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <SectionTitle icon="📝" title="Walk-In Notes" />
                    <p style={{ margin: '12px 0 0', fontSize: 13, color: activeDisplay.notes ? '#1e293b' : '#94a3b8' }}>
                      {activeDisplay.notes || 'No notes provided.'}
                    </p>
                    <div style={{ marginTop: 24 }}>
                      <SectionTitle icon="🏷️" title="Booking Type" />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                        <span style={{
                          padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                          background: '#f1f5f9', color: '#475569',
                        }}>
                          🚶 Walk-In
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── BOTTOM: ORDER MANAGEMENT (full width, seated only) ── */}
              {!isViewingTimeline && activeDisplay.status === 'seated' && (
                <div style={{ background: '#fff', borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <SectionTitle icon="🍽️" title="Order Management" />
                  {orderSaved && (
                    <div style={{ marginBottom: 12, padding: '8px 14px', background: '#d1fae5', borderRadius: 6, color: '#065f46', fontSize: 13, fontWeight: 600 }}>
                      ✅ Items added to order
                    </div>
                  )}
                  <OrderForm
                    items={orderItems}
                    menuItems={menuItems}
                    onAddItem={handleOrderAddItem}
                    onUpdateItem={handleOrderUpdateItem}
                    onRemoveItem={handleOrderRemoveItem}
                    disabled={orderSaving || !orderId}
                  />
                  {orderError && (
                    <div style={{ marginTop: 10, padding: '8px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
                      {orderError}
                    </div>
                  )}
                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={handleOrderSave}
                      disabled={orderSaving || !orderId}
                      style={{
                        padding: '10px 28px', borderRadius: 8, border: 'none',
                        background: '#1d4ed8', color: '#fff', fontSize: 14, fontWeight: 600,
                        cursor: orderSaving || !orderId ? 'not-allowed' : 'pointer',
                        opacity: orderSaving || !orderId ? 0.6 : 1,
                      }}
                    >
                      {orderSaving ? 'Saving…' : 'Add to Order'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '16px 28px', background: '#fff',
          borderTop: '1px solid #e2e8f0', display: 'flex',
          justifyContent: 'flex-end', gap: 12, flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px', borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#fff', color: '#475569', fontSize: 14, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
