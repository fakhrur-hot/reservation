/**
 * Table Setup Page — Admin / Manager
 *
 * Allows admin/manager to:
 *  - Create and view sections (Indoor, Outdoor, Private Room)
 *  - Create tables within sections (name, capacity, type, features)
 *  - Edit table details
 *  - Deactivate / reactivate tables
 *  - View decoration indicators on reserved/occupied tables
 *
 * Backed by:
 *  GET    /api/manager/v1/branches/:id/tables
 *  GET    /api/v1/branches/:id/sections
 *  POST   /api/admin/v1/branches/:id/sections
 *  POST   /api/admin/v1/branches/:id/tables
 *  PATCH  /api/admin/v1/branches/:id/tables/:tableId
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getAllTables, getSections, createSection, createTable, updateTable } from '../api';
import type { Section, Table, CreateSectionPayload, CreateTablePayload, UpdateTablePayload } from '../types';
import TableDetailModal from '../components/TableDetailModal';
import './TableSetupPage.css';

function getBranchId() {
  return localStorage.getItem('branch_id') ?? '';
}

const TABLE_TYPES = ['standard', 'booth', 'bar', 'high-top', 'lounge'];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  available: { label: 'Available', cls: 'badge-available' },
  locked:    { label: 'Locked',    cls: 'badge-locked' },
  reserved:  { label: 'Reserved',  cls: 'badge-reserved' },
  occupied:  { label: 'Occupied',  cls: 'badge-occupied' },
};

const OCCASION_LABELS: Record<string, string> = {
  birthday:     '🎉 Birthday',
  anniversary:  '💍 Anniversary',
  bachelorette: '🥂 Bachelorette',
};

// ─── Decoration Tooltip ───────────────────────────────────────────────────────

function DecorationTooltip({ table, onClose }: { table: Table; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="decoration-tooltip" ref={ref} role="tooltip">
      <div className="decoration-tooltip-header">
        <span>{OCCASION_LABELS[table.occasion_type ?? ''] ?? '🎉 Decoration'}</span>
        <button className="decoration-tooltip-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <dl className="decoration-tooltip-details">
        {table.occasion_type && (
          <>
            <dt>Occasion</dt>
            <dd>{table.occasion_type.charAt(0).toUpperCase() + table.occasion_type.slice(1)}</dd>
          </>
        )}
        {table.decoration_color && (
          <>
            <dt>Color</dt>
            <dd>{table.decoration_color}</dd>
          </>
        )}
        {(table.cake_menu_name || table.cake_choice) && (
          <>
            <dt>Cake</dt>
            <dd>
              {table.cake_menu_name
                ? `${table.cake_menu_name} (RM ${(table.cake_menu_price ?? 0).toFixed(2)})`
                : table.cake_choice}
            </dd>
          </>
        )}
        {table.cake_custom_notes && (
          <>
            <dt>Cake Notes</dt>
            <dd>{table.cake_custom_notes}</dd>
          </>
        )}
        {table.decoration_notes && (
          <>
            <dt>Notes</dt>
            <dd>{table.decoration_notes}</dd>
          </>
        )}
        {table.reservation_ref && (
          <>
            <dt>Ref</dt>
            <dd className="decoration-tooltip-ref">{table.reservation_ref}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// ─── Decoration Detail Modal ──────────────────────────────────────────────────

function DecorationDetailModal({ table, onClose }: { table: Table; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{OCCASION_LABELS[table.occasion_type ?? ''] ?? '🎉 Decoration Details'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <dl className="decoration-detail-list">
          <div className="decoration-detail-row">
            <dt>Table</dt>
            <dd>{table.name}</dd>
          </div>
          {table.reservation_ref && (
            <div className="decoration-detail-row">
              <dt>Reservation</dt>
              <dd>{table.reservation_ref}</dd>
            </div>
          )}
          {table.occasion_type && (
            <div className="decoration-detail-row">
              <dt>Occasion</dt>
              <dd>{table.occasion_type.charAt(0).toUpperCase() + table.occasion_type.slice(1)}</dd>
            </div>
          )}
          {table.decoration_color && (
            <div className="decoration-detail-row">
              <dt>Decoration Color</dt>
              <dd>{table.decoration_color}</dd>
            </div>
          )}
          {(table.cake_menu_name || table.cake_choice) && (
            <div className="decoration-detail-row">
              <dt>Cake</dt>
              <dd>
                {table.cake_menu_name
                  ? `${table.cake_menu_name} (RM ${(table.cake_menu_price ?? 0).toFixed(2)})`
                  : table.cake_choice}
              </dd>
            </div>
          )}
          {table.cake_custom_notes && (
            <div className="decoration-detail-row">
              <dt>Cake Notes</dt>
              <dd>{table.cake_custom_notes}</dd>
            </div>
          )}
          {table.decoration_notes && (
            <div className="decoration-detail-row">
              <dt>Special Notes</dt>
              <dd>{table.decoration_notes}</dd>
            </div>
          )}
        </dl>
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: CreateSectionPayload) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Section name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        sort_order: sortOrder ? parseInt(sortOrder) : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Section</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Section Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Indoor, Outdoor, Private Room"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="form-group">
            <label>Sort Order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              placeholder="1"
              min="1"
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Create Section'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TableModal({
  sections,
  table,
  onClose,
  onSave,
}: {
  sections: Section[];
  table?: Table;
  onClose: () => void;
  onSave: (data: CreateTablePayload | UpdateTablePayload, tableId?: string) => Promise<void>;
}) {
  const isEdit = !!table;
  const [sectionId, setSectionId] = useState(table?.section_id ?? sections[0]?.id ?? '');
  const [name, setName] = useState(table?.name ?? '');
  const [capacity, setCapacity] = useState(String(table?.capacity ?? ''));
  const [tableType, setTableType] = useState(table?.table_type ?? 'standard');
  const [windowView, setWindowView] = useState(table?.has_window_view ?? false);
  const [wheelchair, setWheelchair] = useState(table?.is_wheelchair_accessible ?? false);
  const [supportsDecoration, setSupportsDecoration] = useState(table?.supports_decoration ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Table name is required'); return; }
    const cap = parseInt(capacity);
    if (!cap || cap < 1) { setError('Capacity must be at least 1'); return; }
    if (!sectionId) { setError('Please select a section'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        section_id: sectionId,
        name: name.trim(),
        capacity: cap,
        table_type: tableType,
        has_window_view: windowView,
        is_wheelchair_accessible: wheelchair,
        supports_decoration: supportsDecoration,
      };
      await onSave(payload, table?.id);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Table' : 'New Table'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Table Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. T01, Window Booth"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Capacity *</label>
              <input
                type="number"
                value={capacity}
                onChange={e => setCapacity(e.target.value)}
                placeholder="4"
                min="1"
                max="50"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Section *</label>
              <select value={sectionId} onChange={e => setSectionId(e.target.value)}>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Table Type</label>
              <select value={tableType} onChange={e => setTableType(e.target.value)}>
                {TABLE_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-checkboxes">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={windowView}
                onChange={e => setWindowView(e.target.checked)}
              />
              Window view
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={wheelchair}
                onChange={e => setWheelchair(e.target.checked)}
              />
              Wheelchair accessible
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={supportsDecoration}
                onChange={e => setSupportsDecoration(e.target.checked)}
              />
              Has Decoration
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TableSetupPage({ onDataChange }: { onDataChange?: () => void }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | undefined>();

  const [filterSection, setFilterSection] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDecoration, setFilterDecoration] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Decoration tooltip/modal state
  const [tooltipTableId, setTooltipTableId] = useState<string | null>(null);
  const [detailTable, setDetailTable] = useState<Table | null>(null);
  const [selectedTableForDetail, setSelectedTableForDetail] = useState<Table | null>(null);

  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const branchId = getBranchId();
    if (!branchId) {
      setError('Branch not selected. Please sign out and sign in again.');
      setLoading(false);
      return;
    }
    try {
      const [sData, tData] = await Promise.all([
        getSections(branchId),
        getAllTables(branchId),
      ]);
      setTables(tData);
      setSections(sData);
      // Notify parent of data change
      onDataChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [onDataChange]);

  useEffect(() => { load(); }, [load]);

  const handleCreateSection = async (data: CreateSectionPayload) => {
    const branchId = getBranchId();
    if (!branchId) {
      throw new Error('Branch not selected. Please sign out and sign in again.');
    }
    await createSection(branchId, data);
    showToast('Section created');
    await load();
  };

  const handleSaveTable = async (
    data: CreateTablePayload | UpdateTablePayload,
    tableId?: string
  ) => {
    const branchId = getBranchId();
    if (!branchId) {
      throw new Error('Branch not selected. Please sign out and sign in again.');
    }
    if (tableId) {
      await updateTable(branchId, tableId, data as UpdateTablePayload);
      showToast('Table updated');
    } else {
      await createTable(branchId, data as CreateTablePayload);
      showToast('Table created');
    }
    await load();
  };

  const handleToggleActive = async (table: Table) => {
    const branchId = getBranchId();
    if (!branchId) {
      throw new Error('Branch not selected. Please sign out and sign in again.');
    }
    await updateTable(branchId, table.id, { is_active: !table.is_active });
    showToast(table.is_active ? 'Table deactivated' : 'Table reactivated');
    await load();
  };

  const filteredTables = tables.filter(t => {
    if (!showInactive && !t.is_active) return false;
    if (filterSection !== 'all' && t.section_id !== filterSection) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterDecoration && !t.supports_decoration) return false;
    return true;
  });

  // Group by section
  const grouped = sections.map(s => ({
    section: s,
    tables: filteredTables.filter(t => t.section_id === s.id),
  }));

  const stats = {
    total: tables.filter(t => t.is_active).length,
    available: tables.filter(t => t.status === 'available').length,
    occupied: tables.filter(t => t.status === 'occupied' || t.status === 'reserved').length,
    inactive: tables.filter(t => !t.is_active).length,
    decorated: tables.filter(t => t.has_decoration && (t.status === 'reserved' || t.status === 'occupied')).length,
  };

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Table Setup</h1>
          <p className="page-subtitle">Manage sections and tables for this branch</p>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Active Tables</span>
        </div>
        <div className="stat-card">
          <span className="stat-value stat-green">{stats.available}</span>
          <span className="stat-label">Available Now</span>
        </div>
        <div className="stat-card">
          <span className="stat-value stat-red">{stats.occupied}</span>
          <span className="stat-label">In Use</span>
        </div>
        <div className="stat-card">
          <span className="stat-value stat-purple">{stats.decorated}</span>
          <span className="stat-label">With Decoration</span>
        </div>
        <div className="stat-card">
          <span className="stat-value stat-muted">{stats.inactive}</span>
          <span className="stat-label">Inactive</span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="filters-bar">
        <select value={filterSection} onChange={e => setFilterSection(e.target.value)}>
          <option value="all">All Sections</option>
          {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="available">Available</option>
          <option value="locked">Locked</option>
          <option value="reserved">Reserved</option>
          <option value="occupied">Occupied</option>
        </select>
        <button
          className={`btn-filter ${filterDecoration ? 'btn-filter--active' : ''}`}
          onClick={() => setFilterDecoration(v => !v)}
          title="Show only tables with decoration"
        >
          🎉 Has Decoration
        </button>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <button className="btn-icon" onClick={load} title="Refresh">↻</button>
      </div>

      {/* ── Content ── */}
      {loading && <div className="loading-state">Loading tables…</div>}
      {error && <div className="error-state">⚠ {error} <button onClick={load}>Retry</button></div>}

      {!loading && !error && sections.length === 0 && (
        <div className="empty-state">
          <p>No sections yet. Create a section first, then add tables to it.</p>
          <button className="btn-primary" onClick={() => setShowSectionModal(true)}>
            Create First Section
          </button>
        </div>
      )}

      {!loading && !error && sections.length > 0 && (
        <div className="sections-list">
          {grouped.map(({ section, tables: sectionTables }) => (
            <div key={section.id} className="section-block">
              <div className="section-header">
                <div>
                  <h2 className="section-name">{section.name}</h2>
                  {section.description && (
                    <span className="section-desc">{section.description}</span>
                  )}
                </div>
                <span className="section-count">{sectionTables.length} table{sectionTables.length !== 1 ? 's' : ''}</span>
              </div>

              {sectionTables.length === 0 ? (
                <div className="section-empty">
                  No tables in this section.{' '}
                  <button
                    className="link-btn"
                    onClick={() => {
                      setEditingTable(undefined);
                      setShowTableModal(true);
                    }}
                  >
                    Add one
                  </button>
                </div>
              ) : (
                <div className="table-grid">
                  {sectionTables.map(table => {
                    const badge = table.status ? STATUS_BADGE[table.status] : null;
                    const showTooltip = tooltipTableId === table.id;
                    const hasDecoration = table.has_decoration && (table.status === 'reserved' || table.status === 'occupied');
                    return (
                      <div
                        key={table.id}
                        className={`table-card ${!table.is_active ? 'table-card--inactive' : ''} table-card--clickable`}
                        onClick={() => setSelectedTableForDetail(table)}
                      >
                        <div className="table-card-top">
                          <span className="table-name">{table.name}</span>
                          {badge && (
                            <span className={`badge ${badge.cls}`}>{badge.label}</span>
                          )}
                          {!table.is_active && (
                            <span className="badge badge-inactive">Inactive</span>
                          )}
                          {hasDecoration && (
                            <div className="decoration-indicator-wrap">
                              <button
                                className="decoration-indicator"
                                onClick={e => {
                                  e.stopPropagation();
                                  setTooltipTableId(showTooltip ? null : table.id);
                                }}
                                title="View decoration details"
                                aria-label="Decoration details"
                              >
                                {OCCASION_LABELS[table.occasion_type ?? ''] ?? '🎉'}
                              </button>
                              {showTooltip && (
                                <DecorationTooltip
                                  table={table}
                                  onClose={() => setTooltipTableId(null)}
                                />
                              )}
                            </div>
                          )}
                        </div>
                        <div className="table-card-meta">
                          <span>👥 {table.capacity} seats</span>
                          {table.table_type && <span>· {table.table_type}</span>}
                          {table.has_window_view && <span>· 🪟 Window</span>}
                          {table.is_wheelchair_accessible && <span>· ♿</span>}
                        </div>
                        <div className="table-card-actions">
                          <button
                            className="btn-sm btn-secondary"
                            onClick={e => {
                              e.stopPropagation();
                              setEditingTable(table);
                              setShowTableModal(true);
                            }}
                          >
                            Edit
                          </button>
                          {hasDecoration && (
                            <button
                              className="btn-sm btn-decoration"
                              onClick={e => {
                                e.stopPropagation();
                                setDetailTable(table);
                              }}
                            >
                              🎉 Details
                            </button>
                          )}
                          <button
                            className={`btn-sm ${table.is_active ? 'btn-danger' : 'btn-success'}`}
                            onClick={e => {
                              e.stopPropagation();
                              handleToggleActive(table);
                            }}
                          >
                            {table.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {showSectionModal && (
        <SectionModal
          onClose={() => setShowSectionModal(false)}
          onSave={handleCreateSection}
        />
      )}
      {showTableModal && (
        <TableModal
          sections={sections}
          table={editingTable}
          onClose={() => { setShowTableModal(false); setEditingTable(undefined); }}
          onSave={handleSaveTable}
        />
      )}
      {detailTable && (
        <DecorationDetailModal
          table={detailTable}
          onClose={() => setDetailTable(null)}
        />
      )}

      {selectedTableForDetail && (
        <TableDetailModal
          table={selectedTableForDetail}
          branchId={getBranchId()}
          staffId={localStorage.getItem('staff_id') || ''}
          onClose={() => setSelectedTableForDetail(null)}
          onTableStatusChanged={() => load()}
        />
      )}

      {/* ── Toast ── */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
