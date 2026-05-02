/**
 * Commission Settings Page — Admin
 *
 * Allows admin to:
 *  - View all commission settings (decoration / cake)
 *  - Edit a category's commission type, value, and enabled state
 *  - View commission statistics (charged / refunded / net)
 *  - Reset all settings to defaults
 *
 * Backed by:
 *  GET   /api/admin/v1/branches/:id/commission-settings
 *  PATCH /api/admin/v1/branches/:id/commission-settings/:category
 *  POST  /api/admin/v1/branches/:id/commission-settings/reset
 *  GET   /api/admin/v1/branches/:id/commission-statistics
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  getCommissionSettings,
  updateCommissionSetting,
  getCommissionStatistics,
} from '../api';
import type {
  CommissionSetting,
  CommissionStatistics,
  UpdateCommissionPayload,
} from '../types';
import './CommissionSettingsPage.css';

function getBranchId() {
  return localStorage.getItem('branch_id') ?? '';
}

const CATEGORY_LABELS: Record<string, string> = {
  decoration: 'Decoration',
  cake: 'Cake',
};

// ─── Reset Confirmation Modal ─────────────────────────────────────────────────

function ResetConfirmModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Reset to Defaults</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          This will reset <strong>all commission settings</strong> to their defaults:
          <br />
          <br />
          • Type: <strong>Percentage</strong>
          <br />
          • Value: <strong>0%</strong>
          <br />
          • Status: <strong>Disabled</strong>
          <br />
          <br />
          This action cannot be undone.
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Resetting…' : 'Reset to Defaults'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Commission Settings Form ─────────────────────────────────────────────────

interface FormState {
  category: string;
  commissionType: 'percentage' | 'fixed';
  commissionValue: string;
  isEnabled: boolean;
}

interface FormErrors {
  commissionValue?: string;
}

function CommissionForm({
  settings,
  initialCategory,
  onSaved,
}: {
  settings: CommissionSetting[];
  initialCategory: string | null;
  onSaved: () => void;
}) {
  const defaultCategory = initialCategory ?? settings[0]?.category ?? 'decoration';
  const defaultSetting = settings.find((s) => s.category === defaultCategory) ?? settings[0];

  const [form, setForm] = useState<FormState>({
    category: defaultSetting?.category ?? 'decoration',
    commissionType: defaultSetting?.commissionType ?? 'percentage',
    commissionValue: String(defaultSetting?.commissionValue ?? 0),
    isEnabled: defaultSetting?.isEnabled ?? false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // When initialCategory changes (e.g. Edit button clicked), update form
  useEffect(() => {
    if (initialCategory) {
      const s = settings.find((x) => x.category === initialCategory);
      if (s) {
        setForm({
          category: s.category,
          commissionType: s.commissionType,
          commissionValue: String(s.commissionValue),
          isEnabled: s.isEnabled,
        });
        setErrors({});
        setSaveError('');
      }
    }
  }, [initialCategory, settings]);

  const handleCategoryChange = (cat: string) => {
    const s = settings.find((x) => x.category === cat);
    if (s) {
      setForm({
        category: s.category,
        commissionType: s.commissionType,
        commissionValue: String(s.commissionValue),
        isEnabled: s.isEnabled,
      });
      setErrors({});
      setSaveError('');
    }
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    const val = parseFloat(form.commissionValue);
    if (isNaN(val)) {
      errs.commissionValue = 'Value must be a number';
    } else if (form.commissionType === 'percentage' && (val < 0 || val > 100)) {
      errs.commissionValue = 'Percentage must be between 0 and 100';
    } else if (form.commissionType === 'fixed' && val < 0) {
      errs.commissionValue = 'Fixed amount must be 0 or greater';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSaveError('');
    try {
      const branchId = getBranchId();
      if (!branchId) {
        throw new Error('Branch not selected. Please sign out and sign in again.');
      }
      const payload: UpdateCommissionPayload = {
        commission_type: form.commissionType,
        commission_value: parseFloat(form.commissionValue),
        is_enabled: form.isEnabled,
      };
      await updateCommissionSetting(branchId, form.category, payload);
      onSaved();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        {/* Category */}
        <div className="form-group">
          <label htmlFor="cs-category">Category</label>
          <select
            id="cs-category"
            className="form-select"
            value={form.category}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            {settings.map((s) => (
              <option key={s.category} value={s.category}>
                {CATEGORY_LABELS[s.category] ?? s.category}
              </option>
            ))}
          </select>
        </div>

        {/* Commission Type */}
        <div className="form-group">
          <label htmlFor="cs-type">Commission Type</label>
          <select
            id="cs-type"
            className="form-select"
            value={form.commissionType}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                commissionType: e.target.value as 'percentage' | 'fixed',
              }))
            }
          >
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed (RM)</option>
          </select>
        </div>

        {/* Commission Value */}
        <div className="form-group">
          <label htmlFor="cs-value">
            Commission Value{' '}
            {form.commissionType === 'percentage' ? '(0–100%)' : '(RM, ≥ 0)'}
          </label>
          <input
            id="cs-value"
            type="number"
            className={`form-control${errors.commissionValue ? ' is-invalid' : ''}`}
            value={form.commissionValue}
            min={0}
            max={form.commissionType === 'percentage' ? 100 : undefined}
            step="0.01"
            onChange={(e) => setForm((f) => ({ ...f, commissionValue: e.target.value }))}
          />
          {errors.commissionValue && (
            <div className="invalid-feedback">{errors.commissionValue}</div>
          )}
        </div>

        {/* Enable toggle */}
        <div className="form-group" style={{ justifyContent: 'flex-end' }}>
          <label>&nbsp;</label>
          <label className="form-check">
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))}
            />
            Enable commission for this category
          </label>
        </div>
      </div>

      {saveError && (
        <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{saveError}</p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

// ─── Commission Settings Table ────────────────────────────────────────────────

function CommissionTable({
  settings,
  onEdit,
}: {
  settings: CommissionSetting[];
  onEdit: (category: string) => void;
}) {
  return (
    <table className="table table-bordered">
      <thead>
        <tr>
          <th>Category</th>
          <th>Type</th>
          <th>Value</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {settings.map((s) => (
          <tr key={s.category}>
            <td>{CATEGORY_LABELS[s.category] ?? s.category}</td>
            <td style={{ textTransform: 'capitalize' }}>{s.commissionType}</td>
            <td>
              {s.commissionType === 'percentage'
                ? `${s.commissionValue}%`
                : `RM ${s.commissionValue.toFixed(2)}`}
            </td>
            <td>
              {s.isEnabled ? (
                <span className="badge bg-success">Enabled</span>
              ) : (
                <span className="badge bg-secondary">Disabled</span>
              )}
            </td>
            <td>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onEdit(s.category)}
              >
                Edit
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Commission Statistics ────────────────────────────────────────────────────

function CommissionStats({ stats }: { stats: CommissionStatistics }) {
  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value stat-green">RM {stats.totalCharged.toFixed(2)}</span>
          <span className="stat-label">Total Charged</span>
        </div>
        <div className="stat-card">
          <span className="stat-value stat-red">RM {stats.totalRefunded.toFixed(2)}</span>
          <span className="stat-label">Total Refunded</span>
        </div>
        <div className="stat-card">
          <span className="stat-value stat-purple">RM {stats.net.toFixed(2)}</span>
          <span className="stat-label">Net</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Breakdown by Category</h2>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table table-bordered" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Charged (RM)</th>
                <th>Refunded (RM)</th>
                <th>Net (RM)</th>
              </tr>
            </thead>
            <tbody>
              {stats.breakdown.map((b) => (
                <tr key={b.category}>
                  <td>{CATEGORY_LABELS[b.category] ?? b.category}</td>
                  <td>{b.charged.toFixed(2)}</td>
                  <td>{b.refunded.toFixed(2)}</td>
                  <td style={{ fontWeight: 600 }}>{b.net.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommissionSettingsPage() {
  const [settings, setSettings] = useState<CommissionSetting[]>([]);
  const [stats, setStats] = useState<CommissionStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Which category the form should pre-fill (null = first)
  const [editCategory, setEditCategory] = useState<string | null>(null);

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
      const [settingsRes, statsRes] = await Promise.all([
        getCommissionSettings(branchId),
        getCommissionStatistics(branchId),
      ]);
      setSettings(settingsRes.commissionSettings);
      setStats(statsRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaved = async () => {
    showToast('Commission setting saved');
    await load();
  };

  const handleEdit = (category: string) => {
    setEditCategory(category);
    // Scroll to form
    document.getElementById('commission-form-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Commission Settings</h1>
          <p className="page-subtitle">Configure commission rates for decoration and cake services</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={load} title="Refresh">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {loading && <div className="loading-state">Loading commission data…</div>}
      {error && (
        <div className="error-state">
          ⚠ {error}{' '}
          <button className="btn btn-secondary btn-sm" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── Statistics ── */}
          {stats && <CommissionStats stats={stats} />}

          {/* ── Settings Summary Table ── */}
          <div className="card">
            <div className="card-header">
              <h2>Commission Settings</h2>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {settings.length === 0 ? (
                <div className="empty-state">No commission settings found.</div>
              ) : (
                <CommissionTable settings={settings} onEdit={handleEdit} />
              )}
            </div>
          </div>

          {/* ── Edit Form ── */}
          {settings.length > 0 && (
            <div className="card" id="commission-form-card">
              <div className="card-header">
                <h2>
                  {editCategory
                    ? `Edit — ${CATEGORY_LABELS[editCategory] ?? editCategory}`
                    : 'Edit Commission Setting'}
                </h2>
              </div>
              <div className="card-body">
                <CommissionForm
                  settings={settings}
                  initialCategory={editCategory}
                  onSaved={handleSaved}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Reset Modal ── */}

      {/* ── Toast ── */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
