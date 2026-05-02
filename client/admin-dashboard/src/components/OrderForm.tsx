import React from 'react';
import type { MenuItem } from '../types';

export interface OrderItem {
  id: string;
  menu_item_id: string;
  menu: string;
  qty: number;
  price: number;
}

export function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '12px 0 8px', borderBottom: '2px solid #e2e8f0', marginBottom: 4,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </h3>
    </div>
  );
}

interface OrderFormProps {
  items: OrderItem[];
  menuItems: MenuItem[];
  onAddItem: () => void;
  onUpdateItem: (id: string, field: keyof OrderItem, value: string | number) => void;
  onRemoveItem: (id: string) => void;
  disabled?: boolean;
}

export default function OrderForm({ items, menuItems, onAddItem, onUpdateItem, onRemoveItem, disabled }: OrderFormProps) {
  const total = items.reduce((sum, item) => sum + (item.qty * item.price), 0);

  const handleMenuSelect = (id: string, menuItemId: string) => {
    const found = menuItems.find(m => m.id === menuItemId);
    if (found) {
      onUpdateItem(id, 'menu_item_id', found.id);
      onUpdateItem(id, 'menu', found.name);
      onUpdateItem(id, 'price', found.price);
    }
  };

  return (
    <div className="order-form" style={{ marginTop: 8 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1.5fr 1fr 40px',
        gap: 10,
        marginBottom: 8,
        fontSize: 12,
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase'
      }}>
        <span>Menu Item</span>
        <span>Qty</span>
        <span>Price (RM)</span>
        <span style={{ textAlign: 'right' }}>Subtotal</span>
        <span></span>
      </div>

      {items.map((item) => (
        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr 40px', gap: 10, marginBottom: 8, alignItems: 'center' }}>
          <select
            value={item.menu_item_id}
            onChange={(e) => handleMenuSelect(item.id, e.target.value)}
            disabled={disabled || menuItems.length === 0}
            style={{
              padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
              fontSize: 13, backgroundColor: '#fff', color: item.menu_item_id ? '#1e293b' : '#94a3b8',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <option value="">
              {menuItems.length === 0 ? 'Loading menu…' : '— Select item —'}
            </option>
            {/* Group menu items by section_name */}
            {Array.from(new Set(menuItems.map(m => (m as any).section_name))).map(sectionName => (
              <optgroup key={sectionName} label={sectionName}>
                {menuItems
                  .filter(m => (m as any).section_name === sectionName)
                  .map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} — RM {Number(m.price).toFixed(2)}
                    </option>
                  ))
                }
              </optgroup>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={item.qty}
            onChange={(e) => onUpdateItem(item.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
            disabled={disabled}
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, backgroundColor: '#fff', color: '#1e293b' }}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            value={item.price}
            readOnly
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, backgroundColor: '#f1f5f9', color: '#64748b' }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: '#1e293b' }}>
            {(item.qty * item.price).toFixed(2)}
          </span>
          <button
            onClick={() => onRemoveItem(item.id)}
            disabled={disabled || items.length <= 1}
            style={{
              background: 'none', border: 'none', color: '#94a3b8',
              cursor: disabled || items.length <= 1 ? 'not-allowed' : 'pointer',
              fontSize: 16, opacity: items.length <= 1 ? 0.4 : 1,
            }}
          >
            🗑️
          </button>
        </div>
      ))}

      <button
        onClick={onAddItem}
        disabled={disabled}
        style={{
          marginTop: 8,
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px dashed #cbd5e1',
          background: '#f8fafc',
          color: '#64748b',
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          width: '100%',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        + Add Another Item
      </button>

      <div style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: '2px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>TOTAL AMOUNT</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8' }}>RM {total.toFixed(2)}</span>
      </div>
    </div>
  );
}
