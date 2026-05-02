import { useState, useEffect } from 'react';
import './AdminSettingsCategory.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Gateway = 'billplz' | 'ipay88';

interface PaymentSettingsData {
  enabled: boolean;
  activeGateway: Gateway;
  billplz: {
    collectionId: string;
    apiKeySet: boolean;
    xSignatureKeySet: boolean;
  };
  ipay88: {
    merchantCode: string;
    merchantKeySet: boolean;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSettingsPaymentSettings() {
  const branchId = localStorage.getItem('branch_id') ?? '';

  const [data, setData] = useState<PaymentSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Local editable fields (secrets are write-only — never pre-filled)
  const [enabled, setEnabled] = useState(false);
  const [activeGateway, setActiveGateway] = useState<Gateway>('billplz');

  // Billplz
  const [billplzCollectionId, setBillplzCollectionId] = useState('');
  const [billplzApiKey, setBillplzApiKey] = useState('');
  const [billplzXSigKey, setBillplzXSigKey] = useState('');

  // iPay88
  const [ipay88MerchantCode, setIpay88MerchantCode] = useState('');
  const [ipay88MerchantKey, setIpay88MerchantKey] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load current settings
  useEffect(() => {
    if (!branchId) return;
    fetch(`${BASE}/admin/v1/branches/${branchId}/payment-settings`, { headers: getHeaders() })
      .then(r => r.json())
      .then((d: PaymentSettingsData) => {
        setData(d);
        setEnabled(d.enabled);
        setActiveGateway(d.activeGateway);
        setBillplzCollectionId(d.billplz.collectionId);
        setIpay88MerchantCode(d.ipay88.merchantCode);
      })
      .catch(err => setFetchError(err.message))
      .finally(() => setLoading(false));
  }, [branchId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const payload: Record<string, unknown> = {
      enabled,
      activeGateway,
      billplz: {
        collectionId: billplzCollectionId,
        sandboxMode: false,
        ...(billplzApiKey ? { apiKey: billplzApiKey } : {}),
        ...(billplzXSigKey ? { xSignatureKey: billplzXSigKey } : {}),
      },
      ipay88: {
        merchantCode: ipay88MerchantCode,
        sandboxMode: false,
        ...(ipay88MerchantKey ? { merchantKey: ipay88MerchantKey } : {}),
      },
    };

    try {
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/payment-settings`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      // Clear secret fields after save (write-only UX)
      setBillplzApiKey('');
      setBillplzXSigKey('');
      setIpay88MerchantKey('');

      // Refresh key-set flags
      setData(prev => prev ? {
        ...prev,
        enabled,
        activeGateway,
        billplz: {
          ...prev.billplz,
          collectionId: billplzCollectionId,
          apiKeySet: prev.billplz.apiKeySet || !!billplzApiKey,
          xSignatureKeySet: prev.billplz.xSignatureKeySet || !!billplzXSigKey,
        },
        ipay88: {
          ...prev.ipay88,
          merchantCode: ipay88MerchantCode,
          merchantKeySet: prev.ipay88.merchantKeySet || !!ipay88MerchantKey,
        },
      } : prev);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="settings-category">
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="settings-category">
      <div className="category-header">
        <h2>Payment Gateway Settings</h2>
        <p>Configure Malaysian payment gateways — Billplz (FPX) and iPay88 (card / e-wallet)</p>
      </div>

      <div className="category-content">

        {fetchError && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>{fetchError}</div>
        )}

        {/* ── Enable toggle ─────────────────────────────────────────────── */}
        <div className="form-section">
          <h3>Gateway Status</h3>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px' }}
              />
              <span>Enable payment gateway</span>
            </label>
            <small>When disabled, bookings proceed without charging a deposit.</small>
          </div>

          <div className="form-group">
            <label>Active Gateway</label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              {(['billplz', 'ipay88'] as Gateway[]).map(gw => (
                <label
                  key={gw}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    border: `2px solid ${activeGateway === gw ? 'var(--primary, #e85d26)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: activeGateway === gw ? 'var(--bg-active, rgba(232,93,38,0.12))' : 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontWeight: activeGateway === gw ? 600 : 400,
                    fontSize: '14px',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <input
                    type="radio"
                    name="activeGateway"
                    value={gw}
                    checked={activeGateway === gw}
                    onChange={() => setActiveGateway(gw)}
                    style={{ accentColor: 'var(--primary, #e85d26)' }}
                  />
                  {gw === 'billplz' ? '🏦 Billplz (FPX)' : '💳 iPay88 (Card / eWallet)'}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Billplz ───────────────────────────────────────────────────── */}
        <div className="form-section">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            🏦 Billplz Configuration
            {data?.billplz.apiKeySet && (
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '999px' }}>
                ✓ API Key saved
              </span>
            )}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Billplz supports FPX (online banking) payments. Get your credentials from{' '}
            <a href="https://www.billplz.com" target="_blank" rel="noopener noreferrer">billplz.com</a>.
          </p>

          <div className="form-group">
            <label>Collection ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(required)</span></label>
            <input
              type="text"
              value={billplzCollectionId}
              onChange={e => setBillplzCollectionId(e.target.value)}
              placeholder="e.g. abc123"
              autoComplete="off"
            />
            <small>Found in your Billplz dashboard under Collections.</small>
          </div>

          <div className="form-group">
            <label>
              API Key
              {data?.billplz.apiKeySet && (
                <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  (leave blank to keep existing)
                </span>
              )}
            </label>
            <input
              type="password"
              value={billplzApiKey}
              onChange={e => setBillplzApiKey(e.target.value)}
              placeholder={data?.billplz.apiKeySet ? '••••••••••••••••' : 'Enter Billplz API key'}
              autoComplete="new-password"
            />
            <small>Your Billplz API secret key. Stored encrypted.</small>
          </div>

          <div className="form-group">
            <label>
              X-Signature Key
              {data?.billplz.xSignatureKeySet && (
                <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  (leave blank to keep existing)
                </span>
              )}
            </label>
            <input
              type="password"
              value={billplzXSigKey}
              onChange={e => setBillplzXSigKey(e.target.value)}
              placeholder={data?.billplz.xSignatureKeySet ? '••••••••••••••••' : 'Enter X-Signature key'}
              autoComplete="new-password"
            />
            <small>Used to verify Billplz webhook callbacks. Stored encrypted.</small>
          </div>
        </div>

        {/* ── iPay88 ────────────────────────────────────────────────────── */}
        <div className="form-section">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            💳 iPay88 Configuration
            {data?.ipay88.merchantKeySet && (
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '999px' }}>
                ✓ Merchant Key saved
              </span>
            )}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            iPay88 supports credit/debit card and e-wallet payments. Get your credentials from{' '}
            <a href="https://www.ipay88.com.my" target="_blank" rel="noopener noreferrer">ipay88.com.my</a>.
          </p>

          <div className="form-group">
            <label>Merchant Code <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(required)</span></label>
            <input
              type="text"
              value={ipay88MerchantCode}
              onChange={e => setIpay88MerchantCode(e.target.value)}
              placeholder="e.g. M12345"
              autoComplete="off"
            />
            <small>Your iPay88 Merchant Code from the merchant portal.</small>
          </div>

          <div className="form-group">
            <label>
              Merchant Key
              {data?.ipay88.merchantKeySet && (
                <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  (leave blank to keep existing)
                </span>
              )}
            </label>
            <input
              type="password"
              value={ipay88MerchantKey}
              onChange={e => setIpay88MerchantKey(e.target.value)}
              placeholder={data?.ipay88.merchantKeySet ? '••••••••••••••••' : 'Enter iPay88 Merchant Key'}
              autoComplete="new-password"
            />
            <small>Your iPay88 Merchant Key. Stored encrypted.</small>
          </div>
        </div>

        {/* ── Webhook info ──────────────────────────────────────────────── */}
        <div className="form-section">
          <h3>Webhook Callback URLs</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Configure these URLs in your payment gateway dashboards to receive payment status updates.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {[
                { label: 'Billplz Callback URL', path: '/api/webhooks/billplz/callback' },
                { label: 'iPay88 Backend URL', path: '/api/webhooks/ipay88/callback' },
                { label: 'iPay88 Response URL', path: '/api/webhooks/ipay88/response' },
              ].map(row => {
                const url = `${window.location.origin}${row.path}`;
                return (
                  <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 0', width: '200px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {row.label}
                    </td>
                    <td style={{ padding: '10px 0 10px 16px' }}>
                      <code style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '4px', wordBreak: 'break-all' }}>
                        {url}
                      </code>
                    </td>
                    <td style={{ padding: '10px 0 10px 8px' }}>
                      <button
                        type="button"
                        title="Copy"
                        onClick={() => navigator.clipboard.writeText(url)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}
                      >
                        📋
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="category-footer">
        {fetchError && <div className="alert alert-error">{fetchError}</div>}
        {saveError && <div className="alert alert-error">{saveError}</div>}
        {saveSuccess && <div className="alert alert-success">✓ Payment settings saved</div>}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Payment Settings'}
        </button>
      </div>
    </div>
  );
}
