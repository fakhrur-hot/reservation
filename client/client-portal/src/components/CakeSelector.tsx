/**
 * CakeSelector — Cake selection UI for the booking form.
 *
 * Implements:
 *  30.1 — Cake preference dropdown (predefined choices from DB)
 *  30.2 — "View Menu" link (disabled in TABLE_ONLY / Stage 1)
 *  30.3 — Cake menu modal with search, filter, and selection
 *  30.4 — Cake details view with allergen warnings and custom notes
 *  30.5 — Custom notes field for special requests
 *
 * Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.9
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { CakePreference, MenuItem, CakeSelection } from '../types';
import { getCakePreferences, getMenuItems, getMenuItem } from '../api';
import './CakeSelector.css';

interface CakeSelectorProps {
  branchId: string;
  /** Current operating mode — 'TABLE_ONLY' disables the View Menu link (Req 27.2, 27.9) */
  operatingMode?: 'TABLE_ONLY' | 'MENU_READY';
  value: CakeSelection | null;
  onChange: (selection: CakeSelection | null) => void;
}

// ─── Cake Menu Modal ──────────────────────────────────────────────────────────

interface CakeMenuModalProps {
  branchId: string;
  onSelect: (item: MenuItem) => void;
  onClose: () => void;
}

function CakeMenuModal({ branchId, onSelect, onClose }: CakeMenuModalProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterAllergen, setFilterAllergen] = useState('');
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getMenuItems(branchId, 'cake')
      .then(setItems)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [branchId]);

  const handleViewDetail = useCallback(async (item: MenuItem) => {
    setDetailLoading(true);
    try {
      const full = await getMenuItem(branchId, item.id);
      setDetailItem(full);
    } catch {
      // Fall back to list data if detail fetch fails
      setDetailItem(item);
    } finally {
      setDetailLoading(false);
    }
  }, [branchId]);

  // Filter by search text and allergen exclusion
  const filtered = items.filter(item => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.description ?? '').toLowerCase().includes(q);
    const matchesAllergen =
      !filterAllergen ||
      !(item.allergens ?? '').toLowerCase().includes(filterAllergen.toLowerCase());
    return matchesSearch && matchesAllergen;
  });

  // Trap focus / close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (detailItem) setDetailItem(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [detailItem, onClose]);

  return (
    <div
      className="cake-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Cake menu browser"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cake-modal">
        {/* ── Detail View ── */}
        {detailItem ? (
          <CakeDetailView
            item={detailItem}
            onBack={() => setDetailItem(null)}
            onSelect={() => { onSelect(detailItem); onClose(); }}
          />
        ) : (
          <>
            <div className="cake-modal-header">
              <h2>Cake Menu</h2>
              <button className="cake-modal-close" onClick={onClose} aria-label="Close cake menu">✕</button>
            </div>

            {/* ── Search & Filter ── */}
            <div className="cake-modal-filters">
              <input
                className="cake-search"
                type="search"
                placeholder="Search cakes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search cakes"
              />
              <input
                className="cake-allergen-filter"
                type="text"
                placeholder="Exclude allergen (e.g. nuts)"
                value={filterAllergen}
                onChange={e => setFilterAllergen(e.target.value)}
                aria-label="Exclude allergen"
              />
            </div>

            {/* ── Item Grid ── */}
            <div className="cake-modal-body">
              {loading && <p className="cake-modal-state">Loading menu…</p>}
              {error && <p className="cake-modal-state cake-modal-error">⚠ {error}</p>}
              {!loading && !error && filtered.length === 0 && (
                <p className="cake-modal-state">No cakes match your search.</p>
              )}
              {!loading && !error && (
                <div className="cake-item-grid">
                  {filtered.map(item => (
                    <button
                      key={item.id}
                      className="cake-item-card"
                      onClick={() => handleViewDetail(item)}
                      aria-label={`View details for ${item.name}`}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="cake-item-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="cake-item-img-placeholder">🎂</div>
                      )}
                      <div className="cake-item-info">
                        <div className="cake-item-name">{item.name}</div>
                        {item.description && (
                          <div className="cake-item-desc">{item.description}</div>
                        )}
                        {item.price > 0 && (
                          <div className="cake-item-price">RM {item.price.toFixed(2)}</div>
                        )}
                        {item.allergens && (
                          <div className="cake-item-allergens" aria-label={`Allergens: ${item.allergens}`}>
                            ⚠ {item.allergens}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {detailLoading && (
                <div className="cake-detail-loading">Loading details…</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Cake Detail View ─────────────────────────────────────────────────────────

function CakeDetailView({
  item,
  onBack,
  onSelect,
}: {
  item: MenuItem;
  onBack: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="cake-detail">
      <div className="cake-modal-header">
        <button className="cake-back-btn" onClick={onBack} aria-label="Back to cake list">
          ← Back
        </button>
        <button className="cake-modal-close" onClick={onBack} aria-label="Close">✕</button>
      </div>

      <div className="cake-detail-body">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="cake-detail-img" />
        ) : (
          <div className="cake-detail-img-placeholder">🎂</div>
        )}

        <h3 className="cake-detail-name">{item.name}</h3>

        {item.price > 0 && (
          <div className="cake-detail-price">RM {item.price.toFixed(2)}</div>
        )}

        {item.description && (
          <p className="cake-detail-desc">{item.description}</p>
        )}

        {item.ingredients && (
          <div className="cake-detail-section">
            <h4>Ingredients</h4>
            <p>{item.ingredients}</p>
          </div>
        )}

        {/* Allergen warning — displayed prominently per Req 27.4 */}
        {item.allergens && (
          <div className="cake-allergen-warning" role="alert">
            <span className="cake-allergen-icon">⚠</span>
            <div>
              <strong>Allergen Warning</strong>
              <p>{item.allergens}</p>
            </div>
          </div>
        )}

        <button className="btn-select-cake" onClick={onSelect}>
          Select This Cake
        </button>
      </div>
    </div>
  );
}

// ─── Main CakeSelector ────────────────────────────────────────────────────────

export default function CakeSelector({
  branchId,
  operatingMode = 'TABLE_ONLY',
  value,
  onChange,
}: CakeSelectorProps) {
  const [preferences, setPreferences] = useState<CakePreference[]>([]);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [customNotes, setCustomNotes] = useState(value?.customNotes ?? '');

  const isMenuReady = operatingMode !== 'TABLE_ONLY';

  useEffect(() => {
    getCakePreferences(branchId)
      .then(setPreferences)
      .catch(() => {/* non-fatal — dropdown just stays empty */})
      .finally(() => setLoadingPrefs(false));
  }, [branchId]);

  // Sync notes into parent when they change
  const handleNotesChange = (notes: string) => {
    setCustomNotes(notes);
    if (value) {
      onChange({ ...value, customNotes: notes });
    }
  };

  // Handle dropdown selection (Req 27.1)
  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) {
      onChange(null);
      return;
    }
    const pref = preferences.find(p => p.id === id);
    if (pref) {
      onChange({ type: 'preference', id: pref.id, name: pref.cake_name, customNotes });
    }
  };

  // Handle menu item selection from modal (Req 27.3)
  const handleMenuSelect = (item: MenuItem) => {
    onChange({ type: 'menu_item', id: item.id, name: item.name, customNotes });
    setShowModal(false);
  };

  const selectedPrefId = value?.type === 'preference' ? value.id : '';

  return (
    <div className="cake-selector">
      <div className="cake-selector-header">
        <label className="cake-selector-label" htmlFor="cake-dropdown">
          Cake Preference
          <span className="cake-selector-optional">(optional)</span>
        </label>

        {/* View Menu link — disabled in TABLE_ONLY (Req 27.2, 27.9) */}
        {isMenuReady ? (
          <button
            type="button"
            className="cake-view-menu-link"
            onClick={() => setShowModal(true)}
            aria-label="Browse full cake menu"
          >
            View Menu →
          </button>
        ) : (
          <span
            className="cake-view-menu-link cake-view-menu-link--disabled"
            title="Full menu available in Stage 2"
            aria-disabled="true"
          >
            View Menu
          </span>
        )}
      </div>

      {/* Dropdown — predefined cake preferences (Req 27.1) */}
      <select
        id="cake-dropdown"
        className="cake-dropdown"
        value={selectedPrefId}
        onChange={handleDropdownChange}
        disabled={loadingPrefs}
        aria-label="Select a cake preference"
      >
        <option value="">— No cake —</option>
        {preferences.map(p => (
          <option key={p.id} value={p.id}>
            {p.cake_name}{p.description ? ` — ${p.description}` : ''}
          </option>
        ))}
      </select>

      {/* Show selected menu item name when chosen from modal */}
      {value?.type === 'menu_item' && (
        <div className="cake-menu-selection">
          <span>🎂 {value.name}</span>
          <button
            type="button"
            className="cake-clear-btn"
            onClick={() => onChange(null)}
            aria-label="Remove cake selection"
          >
            ✕
          </button>
        </div>
      )}

      {/* Custom notes (Req 27.5) */}
      {value && (
        <div className="cake-notes-group">
          <label htmlFor="cake-notes" className="cake-notes-label">
            Special Requests
          </label>
          <textarea
            id="cake-notes"
            className="cake-notes-input"
            value={customNotes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder='e.g. "No nuts", "Extra frosting", "Write Happy Birthday"'
            rows={2}
            maxLength={300}
            aria-label="Cake special requests"
          />
          <span className="cake-notes-count">{customNotes.length}/300</span>
        </div>
      )}

      {/* Cake menu modal (Req 27.3) */}
      {showModal && (
        <CakeMenuModal
          branchId={branchId}
          onSelect={handleMenuSelect}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
