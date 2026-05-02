/**
 * Promo Code Dashboard Page — Admin
 *
 * Allows admin to:
 *  - View all promo codes for the branch
 *  - Create new promo codes
 *  - Edit existing codes
 *  - Deactivate/Delete codes
 *  - Filter by type and status
 *  - View performance metrics
 *
 * Backed by:
 *  GET    /api/admin/v1/promo-codes
 *  GET    /api/admin/v1/promo-codes/:codeId
 *  POST   /api/admin/v1/promo-codes
 *  PUT    /api/admin/v1/promo-codes/:codeId
 *  DELETE /api/admin/v1/promo-codes/:codeId
 *  GET    /api/admin/v1/promo-codes/:codeId/performance
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  listPromoCodesForBranch,
  getPromoCode,
  getPromoCodeMetrics,
  deletePromoCode,
} from '../api';
import CreatePromoCodeForm from '../components/CreatePromoCodeForm';
import type {
  PromoCode,
  PromoCodeType,
  PromoCodeMetrics,
  PromoCodesListResponse,
} from '../types';
import './PromoCodeDashboardPage.css';

function getBranchId() {
  return localStorage.getItem('branch_id') ?? '';
}

const PROMO_TYPES: PromoCodeType[] = ['priority', 'turnover', 'vip', 'affiliate', 'group', 'discount'];

const TYPE_LABELS: Record<PromoCodeType, string> = {
  priority: '⚡ Priority (1h Lead-time)',
  turnover: '🔄 Turnover (Time Window)',
  vip: '👑 VIP (3h Session)',
  affiliate: '📊 Affiliate (Tracking)',
  group: '👥 Group (Min Party Size)',
  discount: '💰 Discount (% or Fixed)',
};

// ─── Promo Code Table Component ───────────────────────────────────────────────

interface PromoCodeTableProps {
  codes: PromoCode[];
  loading: boolean;
  onEdit: (code: PromoCode) => void;
  onDelete: (code: PromoCode) => void;
  onViewMetrics: (code: PromoCode) => void;
  sortBy: 'code' | 'type' | 'usage' | 'created';
  onSort: (key: 'code' | 'type' | 'usage' | 'created') => void;
}

function PromoCodeTable({
  codes,
  loading,
  onEdit,
  onDelete,
  onViewMetrics,
  sortBy,
  onSort,
}: PromoCodeTableProps) {
  if (loading) {
    return <div className="loading-spinner">Loading promo codes...</div>;
  }

  if (codes.length === 0) {
    return (
      <div className="empty-state">
        <p>No promo codes found. Create one to get started!</p>
      </div>
    );
  }

  const getSortIndicator = (key: string) => {
    return sortBy === key ? '▼' : '▽';
  };

  return (
    <div className="table-container">
      <table className="promo-codes-table">
        <thead>
          <tr>
            <th onClick={() => onSort('code')} style={{ cursor: 'pointer' }}>
              Code {getSortIndicator('code')}
            </th>
            <th onClick={() => onSort('type')} style={{ cursor: 'pointer' }}>
              Type {getSortIndicator('type')}
            </th>
            <th>Valid From</th>
            <th>Valid To</th>
            <th onClick={() => onSort('usage')} style={{ cursor: 'pointer' }}>
              Usage {getSortIndicator('usage')}
            </th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((code) => (
            <tr key={code.id} className={!code.isActive ? 'inactive' : ''}>
              <td className="code-cell">
                <strong>{code.code}</strong>
                {code.description && <div className="description">{code.description}</div>}
              </td>
              <td>
                <span className={`badge type-${code.type}`}>{TYPE_LABELS[code.type] || code.type}</span>
              </td>
              <td>{code.validFrom ? new Date(code.validFrom).toLocaleDateString() : '—'}</td>
              <td>{code.validTo ? new Date(code.validTo).toLocaleDateString() : '—'}</td>
              <td>
                {code.maxUses ? (
                  <>
                    {code.currentUses || 0} / {code.maxUses}
                  </>
                ) : (
                  'Unlimited'
                )}
              </td>
              <td>
                <span className={`status-badge ${code.isActive ? 'active' : 'inactive'}`}>
                  {code.isActive ? '✓ Active' : '✗ Inactive'}
                </span>
              </td>
              <td className="actions-cell">
                <button
                  className="btn btn-small btn-secondary"
                  onClick={() => onViewMetrics(code)}
                  title="View performance metrics"
                >
                  📊 Metrics
                </button>
                <button
                  className="btn btn-small btn-primary"
                  onClick={() => onEdit(code)}
                  title="Edit this promo code"
                >
                  ✏️ Edit
                </button>
                {code.isActive && (
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => onDelete(code)}
                    title="Deactivate this promo code"
                  >
                    🗑️ Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Filter Bar Component ─────────────────────────────────────────────────────

interface FilterBarProps {
  typeFilter: string;
  statusFilter: string;
  onTypeChange: (type: string) => void;
  onStatusChange: (status: string) => void;
  onCreateNew: () => void;
}

function FilterBar({
  typeFilter,
  statusFilter,
  onTypeChange,
  onStatusChange,
  onCreateNew,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filters">
        <select
          value={typeFilter}
          onChange={(e) => onTypeChange(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All Types</option>
          {PROMO_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <button className="btn btn-primary" onClick={onCreateNew}>
        + New Promo Code
      </button>
    </div>
  );
}

// ─── Metrics Modal Component ──────────────────────────────────────────────────

interface MetricsModalProps {
  code: PromoCode | null;
  metrics: PromoCodeMetrics | null;
  loading: boolean;
  onClose: () => void;
}

function MetricsModal({ code, metrics, loading, onClose }: MetricsModalProps) {
  if (!code) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Metrics: {code.code}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="modal-body">
            <p>Loading metrics...</p>
          </div>
        ) : metrics ? (
          <div className="modal-body">
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Usage Count</div>
                <div className="metric-value">{metrics.usageCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Max Uses</div>
                <div className="metric-value">{metrics.maxUses || '∞'}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Booking Count</div>
                <div className="metric-value">{metrics.bookingCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Conversion Rate</div>
                <div className="metric-value">{metrics.conversionRate.toFixed(1)}%</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Total Discount Given</div>
                <div className="metric-value">
                  {code.discountType === 'percentage' ? '~' : 'MYR '}
                  {metrics.totalDiscountGiven.toFixed(2)}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Avg Discount per Booking</div>
                <div className="metric-value">
                  {code.discountType === 'percentage' ? '~' : 'MYR '}
                  {metrics.avgDiscountPerBooking.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <p>No metrics available</p>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  code: PromoCode | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ code, loading, onConfirm, onCancel }: DeleteConfirmModalProps) {
  if (!code) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Deactivate Promo Code</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p>
            Are you sure you want to deactivate promo code <strong>{code.code}</strong>?
          </p>
          <p>Customers will no longer be able to use this code, but existing reservations will remain active.</p>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function PromoCodeDashboardPage() {
  const branchId = getBranchId();

  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<'code' | 'type' | 'usage' | 'created'>('created');

  const [metricsModal, setMetricsModal] = useState<PromoCode | null>(null);
  const [metricsData, setMetricsData] = useState<PromoCodeMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [deleteModal, setDeleteModal] = useState<PromoCode | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formModal, setFormModal] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null);
  const [editingCodeFull, setEditingCodeFull] = useState<PromoCode | null>(null);

  // Load promo codes on mount and when filters change
  const loadPromoCodes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listPromoCodesForBranch(branchId, {
        type: typeFilter || undefined,
        isActive: statusFilter ? statusFilter === 'true' : undefined,
      });
      setCodes(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load promo codes');
    } finally {
      setLoading(false);
    }
  }, [branchId, typeFilter, statusFilter]);

  useEffect(() => {
    loadPromoCodes();
  }, [loadPromoCodes]);

  // Load metrics when metrics modal opens
  useEffect(() => {
    if (!metricsModal) return;
    (async () => {
      setMetricsLoading(true);
      try {
        const metrics = await getPromoCodeMetrics(metricsModal.id);
        setMetricsData(metrics);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setMetricsLoading(false);
      }
    })();
  }, [metricsModal]);

  // Load full code data when editing code changes
  useEffect(() => {
    if (!editingCode) return;
    (async () => {
      try {
        const fullCode = await getPromoCode(editingCode.id);
        setEditingCodeFull(fullCode);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load promo code');
      }
    })();
  }, [editingCode]);

  // Sort codes based on sortBy state
  const sortedCodes = [...codes].sort((a, b) => {
    switch (sortBy) {
      case 'code':
        return a.code.localeCompare(b.code);
      case 'type':
        return a.type.localeCompare(b.type);
      case 'usage':
        return (b.currentUses || 0) - (a.currentUses || 0);
      default:
        return 0;
    }
  });

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await deletePromoCode(deleteModal.id);
      await loadPromoCodes();
      setDeleteModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete promo code');
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSuccess = async () => {
    setFormModal(false);
    setEditingCode(null);
    setEditingCodeFull(null);
    await loadPromoCodes();
  };

  return (
    <div className="promo-code-dashboard page">
      <div className="page-header">
        <h1>Promo Code Management</h1>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <FilterBar
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        onTypeChange={setTypeFilter}
        onStatusChange={setStatusFilter}
        onCreateNew={() => {
          setEditingCode(null);
          setEditingCodeFull(null);
          setFormModal(true);
        }}
      />

      <PromoCodeTable
        codes={sortedCodes}
        loading={loading}
        onEdit={(code) => {
          setEditingCode(code);
          setFormModal(true);
        }}
        onDelete={setDeleteModal}
        onViewMetrics={setMetricsModal}
        sortBy={sortBy}
        onSort={(key) => setSortBy(key)}
      />

      <MetricsModal
        code={metricsModal}
        metrics={metricsData}
        loading={metricsLoading}
        onClose={() => {
          setMetricsModal(null);
          setMetricsData(null);
        }}
      />

      {formModal && (
        <div className="modal-overlay" onClick={() => setFormModal(false)}>
          <div className="modal large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCode ? 'Edit Promo Code' : 'Create New Promo Code'}</h3>
              <button
                className="modal-close"
                onClick={() => setFormModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <CreatePromoCodeForm
              editingCode={editingCodeFull || editingCode}
              onSuccess={handleFormSuccess}
              onCancel={() => setFormModal(false)}
            />
          </div>
        </div>
      )}

      <DeleteConfirmModal
        code={deleteModal}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(null)}
      />
    </div>
  );
}
