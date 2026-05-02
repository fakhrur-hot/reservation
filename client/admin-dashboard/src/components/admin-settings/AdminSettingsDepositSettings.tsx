import { useState, useEffect } from 'react';
import './AdminSettingsCategory.css';

interface DepositSettings {
  depositAmount: number;
  depositRequired: boolean;
  refundTier1Percent: number;
  refundTier2Percent: number;
  refundTier3Percent: number;
  cakeDepositAmt: number;
  cakeDepositType: 'fixed' | 'percentage';
  decorationPackagePrice: number;
}

const BASE = '/api';
function getHeaders(): HeadersInit {
  const token = localStorage.getItem('staff_token');
  const branchId = localStorage.getItem('branch_id');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(branchId ? { 'X-Branch-ID': branchId } : {}),
  };
}

export default function AdminSettingsDepositSettings() {
  const branchId = localStorage.getItem('branch_id') ?? '';

  const [form, setForm] = useState<DepositSettings>({
    depositAmount: 50.0, depositRequired: true,
    refundTier1Percent: 100, refundTier2Percent: 50, refundTier3Percent: 0,
    cakeDepositAmt: 0,
    cakeDepositType: 'fixed',
    decorationPackagePrice: 50.0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    fetch(`${BASE}/admin/v1/branches/${branchId}/deposit-settings`, { headers: getHeaders() })
      .then(r => r.json())
      .then(data => setForm({
        depositAmount: data.depositAmount ?? 50,
        depositRequired: data.depositRequired ?? true,
        refundTier1Percent: data.refundTier1Percent ?? 100,
        refundTier2Percent: data.refundTier2Percent ?? 50,
        refundTier3Percent: data.refundTier3Percent ?? 0,
        cakeDepositAmt: data.cakeDepositAmt ?? 0,
        cakeDepositType: data.cakeDepositType ?? 'fixed',
        decorationPackagePrice: data.decorationPackagePrice ?? 50,
      }))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [branchId]);

  const handleChange = (field: keyof DepositSettings, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/deposit-settings`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="settings-category"><div style={{padding:'32px',textAlign:'center',color:'var(--text-muted)'}}>Loading…</div></div>;

  return (
    <div className="settings-category">
      <div className="category-header">
        <h2>Deposit Settings</h2>
        <p>Configure booking deposits and refund policies</p>
      </div>

      <div className="category-content">
        <div className="form-section">
          <h3>Deposit Configuration</h3>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={form.depositRequired}
                onChange={(e) => handleChange('depositRequired', e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              Require deposit for bookings
            </label>
            <small>When enabled, customers must pay a deposit to confirm their reservation</small>
          </div>

          <div className="form-group">
            <label>Deposit Amount (RM) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.depositAmount}
              onChange={(e) => handleChange('depositAmount', Number(e.target.value))}
              disabled={!form.depositRequired}
            />
          </div>

          <div className="form-group">
            <label>Cake Deposit Type</label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px', marginBottom: '12px' }}>
              {(['fixed', 'percentage'] as const).map(type => (
                <label
                  key={type}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    border: `2px solid ${form.cakeDepositType === type ? 'var(--primary, #e85d26)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: form.depositRequired ? 'pointer' : 'not-allowed',
                    background: form.cakeDepositType === type ? 'var(--bg-active, rgba(232,93,38,0.12))' : 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontWeight: form.cakeDepositType === type ? 600 : 400,
                    fontSize: '14px',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                    opacity: form.depositRequired ? 1 : 0.5,
                  }}
                >
                  <input
                    type="radio"
                    name="cakeDepositType"
                    value={type}
                    checked={form.cakeDepositType === type}
                    onChange={() => handleChange('cakeDepositType', type)}
                    disabled={!form.depositRequired}
                    style={{ accentColor: 'var(--primary, #e85d26)' }}
                  />
                  {type === 'fixed' ? 'Fixed Amount (RM)' : 'Percentage (%)'}
                </label>
              ))}
            </div>
            
            <label>Cake Deposit {form.cakeDepositType === 'fixed' ? 'Amount (RM)' : 'Percentage (%)'}</label>
            <input
              type="number"
              min="0"
              max={form.cakeDepositType === 'percentage' ? 100 : undefined}
              step="0.01"
              value={form.cakeDepositAmt}
              onChange={(e) => handleChange('cakeDepositAmt', Number(e.target.value))}
              disabled={!form.depositRequired}
            />
            <small>
              {form.cakeDepositType === 'fixed' 
                ? 'Additional fixed deposit required when a customer selects a cake'
                : 'Additional deposit calculated as a percentage of the selected cake price'}
            </small>
          </div>

          <div className="form-group">
            <label>Decoration Package Price (RM) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.decorationPackagePrice}
              onChange={(e) => handleChange('decorationPackagePrice', Number(e.target.value))}
              disabled={!form.depositRequired}
            />
            <small>Flat fee added to the deposit when a Special Occasion booking is selected</small>
          </div>
        </div>

        <div className="form-section">
          <h3>Refund Policy</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Set the refund percentage based on how far in advance the customer cancels
          </p>

          <div className="form-group">
            <label>Cancellation &gt; 72 hours before — Refund %</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={form.refundTier1Percent}
                onChange={(e) => handleChange('refundTier1Percent', Number(e.target.value))}
                style={{ flex: 1 }}
                disabled={!form.depositRequired}
              />
              <span style={{ minWidth: '48px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {form.refundTier1Percent}%
              </span>
            </div>
            <small>Full refund recommended for early cancellations</small>
          </div>

          <div className="form-group">
            <label>Cancellation 24–72 hours before — Refund %</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={form.refundTier2Percent}
                onChange={(e) => handleChange('refundTier2Percent', Number(e.target.value))}
                style={{ flex: 1 }}
                disabled={!form.depositRequired}
              />
              <span style={{ minWidth: '48px', fontWeight: 600, color: '#1e293b' }}>
                {form.refundTier2Percent}%
              </span>
            </div>
          </div>

          <div className="form-group">
            <label>Cancellation &lt; 24 hours before — Refund %</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={form.refundTier3Percent}
                onChange={(e) => handleChange('refundTier3Percent', Number(e.target.value))}
                style={{ flex: 1 }}
                disabled={!form.depositRequired}
              />
              <span style={{ minWidth: '48px', fontWeight: 600, color: '#1e293b' }}>
                {form.refundTier3Percent}%
              </span>
            </div>
            <small>No refund recommended for last-minute cancellations</small>
          </div>

          <div
            style={{
              marginTop: '20px',
              padding: '16px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
            }}
          >
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Policy Summary
            </h4>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>• Cancel &gt;72h before: <strong>{form.refundTier1Percent}%</strong> refund of RM {form.depositAmount.toFixed(2)}</div>
              <div>• Cancel 24–72h before: <strong>{form.refundTier2Percent}%</strong> refund of RM {form.depositAmount.toFixed(2)}</div>
              <div>• Cancel &lt;24h before: <strong>{form.refundTier3Percent}%</strong> refund of RM {form.depositAmount.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="category-footer">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">Settings saved successfully</div>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
