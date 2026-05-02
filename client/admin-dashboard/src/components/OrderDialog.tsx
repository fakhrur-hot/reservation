import React, { useState, useEffect, useCallback } from 'react';
import OrderForm, { SectionTitle, OrderItem } from './OrderForm';
import { createOrGetOrder, addOrderItem, getMenuSections } from '../api';
import type { MenuItem, MenuSection } from '../types';

interface OrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reservationTitle: string;
  branchId: string;
  tableId: string;
}

function makeItem(): OrderItem {
  return { id: crypto.randomUUID(), menu_item_id: '', menu: '', qty: 1, price: 0 };
}

function flattenMenuItems(sections: MenuSection[]): MenuItem[] {
  return sections.flatMap(s => (s.items ?? []).filter(i => i.is_available));
}

export default function OrderDialog({ isOpen, onClose, reservationTitle, branchId, tableId }: OrderDialogProps) {
  const [items, setItems] = useState<OrderItem[]>([makeItem()]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Load order + menu items when dialog opens
  useEffect(() => {
    if (!isOpen || !branchId || !tableId) return;

    setItems([makeItem()]);
    setOrderId(null);
    setError(null);
    setInitError(null);

    Promise.all([
      createOrGetOrder(branchId, tableId),
      getMenuSections(branchId),
    ])
      .then(([order, sections]) => {
        setOrderId(order.id);
        setMenuItems(flattenMenuItems(sections));
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to initialise order';
        setInitError(msg);
      });
  }, [isOpen, branchId, tableId]);

  const handleAddItem = useCallback(() => {
    setItems((prev) => [...prev, makeItem()]);
  }, []);

  const handleUpdateItem = useCallback((id: string, field: keyof OrderItem, value: string | number) => {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setItems((prev) => prev.length > 1 ? prev.filter((item) => item.id !== id) : prev);
  }, []);

  const handleSave = async () => {
    if (!orderId) return;

    const validItems = items.filter((item) => item.menu_item_id !== '');
    if (validItems.length === 0) {
      setError('Select at least one menu item.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await Promise.all(
        validItems.map((item) =>
          addOrderItem(branchId, orderId, {
            menu_item_id: item.menu_item_id,
            item_name: item.menu,
            item_price: item.price,
            quantity: item.qty,
          })
        )
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save order';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={saving ? undefined : onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          width: '90vw',
          maxWidth: 640,
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          animation: 'modalFadeIn 0.3s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: '#fff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Quick Order</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>{reservationTitle}</p>
          </div>
          <button
            onClick={saving ? undefined : onClose}
            disabled={saving}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
              width: 32, height: 32, borderRadius: '50%',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', background: '#f8fafc', flex: 1 }}>
          <SectionTitle icon="🍽️" title="Order Management" />

          {initError && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
              {initError}
            </div>
          )}

          {!initError && (
            <OrderForm
              items={items}
              menuItems={menuItems}
              onAddItem={handleAddItem}
              onUpdateItem={handleUpdateItem}
              onRemoveItem={handleRemoveItem}
              disabled={saving || !orderId}
            />
          )}

          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', background: '#fff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 12
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#fff', color: '#475569', fontSize: 14, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !orderId || !!initError}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: '#1d4ed8', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: saving || !orderId || !!initError ? 'not-allowed' : 'pointer',
              opacity: saving || !orderId || !!initError ? 0.6 : 1,
              minWidth: 110,
            }}
          >
            {saving ? 'Saving…' : 'Save Order'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
