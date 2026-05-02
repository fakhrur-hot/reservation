import { useState, useEffect } from 'react';
import './AdminSettingsCategory.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type OperatingMode = 'TABLE_ONLY' | 'MENU_READY' | 'FULL';

interface BranchApiInfo {
  branchId: string;
  appOperatingMode: OperatingMode;
  branchCode: string;
  branchName: string;
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

const MODE_LABELS: Record<OperatingMode, string> = {
  TABLE_ONLY: 'Table Only',
  MENU_READY: 'Menu Ready',
  FULL: 'Full',
};

const MODE_DESCRIPTIONS: Record<OperatingMode, string> = {
  TABLE_ONLY: 'Stage 1 — Table reservations only. No menu pre-order, no payment gateway.',
  MENU_READY: 'Stage 2 — Table reservations + menu pre-order. Payment gateway active.',
  FULL: 'Stage 3 — All features enabled including e-Invoice and advanced reporting.',
};

const MODE_BADGE_COLOR: Record<OperatingMode, string> = {
  TABLE_ONLY: '#3b82f6',
  MENU_READY: '#f59e0b',
  FULL: '#10b981',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSettingsApiSettings() {
  const branchId = localStorage.getItem('branch_id') ?? '';

  const [info, setInfo] = useState<BranchApiInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Serial key activation
  const [serialKey, setSerialKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateSuccess, setActivateSuccess] = useState<string | null>(null);
  const [updatingMode, setUpdatingMode] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Load current branch info
  useEffect(() => {
    if (!branchId) return;
    fetch(`${BASE}/admin/v1/branches/${branchId}`, { headers: getHeaders() })
      .then(r => r.json())
      .then(data => {
        setInfo({
          branchId: data.id ?? branchId,
          appOperatingMode: (data.app_operating_mode ?? 'TABLE_ONLY') as OperatingMode,
          branchCode: data.branch_code ?? data.code ?? '—',
          branchName: data.name ?? '—',
        });
      })
      .catch(err => setFetchError(err.message))
      .finally(() => setLoading(false));
  }, [branchId]);

  const handleActivateSerialKey = async () => {
    if (!serialKey.trim()) return;
    setActivating(true);
    setActivateError(null);
    setActivateSuccess(null);

    try {
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/serial-key`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ serialKey: serialKey.trim() }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const newMode = body.newMode as OperatingMode;
      setActivateSuccess(
        `Operating mode updated: ${MODE_LABELS[body.previousMode as OperatingMode] ?? body.previousMode} → ${MODE_LABELS[newMode] ?? newMode}`
      );
      setSerialKey('');

      // Refresh branch info
      setInfo(prev => prev ? { ...prev, appOperatingMode: newMode } : prev);
    } catch (err) {
      setActivateError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setActivating(false);
    }
  };

  const handleUpdateMode = async (newMode: OperatingMode) => {
    if (!branchId || activating || updatingMode) return;
    
    setUpdatingMode(true);
    setUpdateError(null);
    setActivateSuccess(null);

    try {
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/settings`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ appOperatingMode: newMode }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setInfo(prev => prev ? { ...prev, appOperatingMode: newMode } : null);
      setActivateSuccess(`Operating mode manually updated to ${MODE_LABELS[newMode]}`);
    } catch (err: any) {
      setUpdateError(err.message);
    } finally {
      setUpdatingMode(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="settings-category">
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading…
        </div>
      </div>
    );
  }

  const currentMode = info?.appOperatingMode ?? 'TABLE_ONLY';

  return (
    <div className="settings-category">
      <div className="category-header">
        <h2>API &amp; System Settings</h2>
        <p>Operating mode, serial key activation, and API access information</p>
      </div>

      <div className="category-content">

        {/* ── Operating Mode ─────────────────────────────────────────────── */}
        <div className="form-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Operating Mode</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Manual Override:</span>
              <select
                value={currentMode}
                onChange={(e) => handleUpdateMode(e.target.value as OperatingMode)}
                disabled={updatingMode || activating}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  borderRadius: '4px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                <option value="TABLE_ONLY">Stage 1: Table Only</option>
                <option value="MENU_READY">Stage 2: Menu Ready</option>
                <option value="FULL">Stage 3: Full</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Controls which feature stages are active for this branch. Upgrade by activating a serial key below.
          </p>

          {fetchError && (
            <div className="alert alert-error" style={{ marginBottom: '16px' }}>{fetchError}</div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '20px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: `2px solid ${MODE_BADGE_COLOR[currentMode]}33`,
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: MODE_BADGE_COLOR[currentMode],
                flexShrink: 0,
                boxShadow: `0 0 8px ${MODE_BADGE_COLOR[currentMode]}88`,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                  {MODE_LABELS[currentMode]}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: `${MODE_BADGE_COLOR[currentMode]}22`,
                    color: MODE_BADGE_COLOR[currentMode],
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                  }}
                >
                  {currentMode}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                {MODE_DESCRIPTIONS[currentMode]}
              </p>
            </div>
          </div>

          {/* Stage progression */}
          <div style={{ marginTop: '20px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Stage Progression
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['TABLE_ONLY', 'MENU_READY', 'FULL'] as OperatingMode[]).map((mode, idx) => {
                const isActive = currentMode === mode;
                const isPast = ['TABLE_ONLY', 'MENU_READY', 'FULL'].indexOf(currentMode) > idx;
                return (
                  <div
                    key={mode}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: isActive
                        ? MODE_BADGE_COLOR[mode]
                        : isPast
                          ? `${MODE_BADGE_COLOR[mode]}33`
                          : 'var(--bg-elevated)',
                      color: isActive ? '#fff' : isPast ? MODE_BADGE_COLOR[mode] : 'var(--text-muted)',
                      border: `1px solid ${isActive || isPast ? MODE_BADGE_COLOR[mode] : 'var(--border)'}`,
                    }}
                  >
                    {isPast && !isActive && <span>✓</span>}
                    {isActive && <span>●</span>}
                    Stage {idx + 1}: {MODE_LABELS[mode]}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Serial Key Activation ──────────────────────────────────────── */}
        <div className="form-section">
          <h3>Activate Feature Stage</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Enter a valid HMAC-SHA256 serial key to unlock the next operating stage for this branch.
            Contact your system vendor to obtain a key.
          </p>

          <div className="form-group">
            <label>Serial Key</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={serialKey}
                onChange={e => {
                  setSerialKey(e.target.value);
                  setActivateError(null);
                  setActivateSuccess(null);
                }}
                placeholder="Paste your serial key here…"
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px' }}
                disabled={activating}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleActivateSerialKey}
                disabled={activating || !serialKey.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                {activating ? 'Activating…' : 'Activate'}
              </button>
            </div>
            <small>
              Keys are branch-specific and time-bound. Each key encodes the target operating mode and expiry date.
            </small>
          </div>

          {activateError && (
            <div className="alert alert-error" style={{ marginTop: '12px' }}>{activateError}</div>
          )}
          {updateError && (
            <div className="alert alert-error" style={{ marginTop: '12px' }}>{updateError}</div>
          )}
          {activateSuccess && (
            <div className="alert alert-success" style={{ marginTop: '12px' }}>✓ {activateSuccess}</div>
          )}
        </div>

        {/* ── API Access Info ────────────────────────────────────────────── */}
        <div className="form-section">
          <h3>API Access Information</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Reference details for integrating with this branch's API.
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {[
                { label: 'Branch ID', value: info?.branchId ?? branchId, mono: true },
                { label: 'Branch Code', value: info?.branchCode ?? '—', mono: true },
                { label: 'Branch Name', value: info?.branchName ?? '—', mono: false },
                { label: 'Operating Mode', value: currentMode, mono: true },
                { label: 'API Base URL', value: `${window.location.origin}/api/v1`, mono: true },
                { label: 'Admin API Base', value: `${window.location.origin}/api/admin/v1`, mono: true },
                { label: 'WebSocket URL', value: `${window.location.origin.replace(/^http/, 'ws')}/ws?branch_id=${info?.branchId ?? branchId}`, mono: true },
              ].map(row => (
                <tr
                  key={row.label}
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <td
                    style={{
                      padding: '10px 0',
                      width: '180px',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                      verticalAlign: 'top',
                    }}
                  >
                    {row.label}
                  </td>
                  <td style={{ padding: '10px 0 10px 16px', verticalAlign: 'top' }}>
                    <code
                      style={{
                        fontFamily: row.mono ? 'monospace' : 'inherit',
                        fontSize: row.mono ? '12px' : '13px',
                        background: row.mono ? 'var(--bg-elevated)' : 'transparent',
                        padding: row.mono ? '2px 6px' : '0',
                        borderRadius: '4px',
                        color: 'var(--text-primary)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {row.value}
                    </code>
                  </td>
                  <td style={{ padding: '10px 0 10px 8px', verticalAlign: 'top' }}>
                    {row.mono && (
                      <button
                        type="button"
                        title="Copy to clipboard"
                        onClick={() => navigator.clipboard.writeText(row.value)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: '14px',
                          padding: '2px 4px',
                        }}
                      >
                        📋
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Authentication Headers ─────────────────────────────────────── */}
        <div className="form-section">
          <h3>Required Request Headers</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            All authenticated API requests must include these headers.
          </p>

          <div
            style={{
              background: '#0f172a',
              borderRadius: 'var(--radius-sm)',
              padding: '16px 20px',
              fontFamily: 'monospace',
              fontSize: '13px',
              color: '#e2e8f0',
              lineHeight: '1.8',
            }}
          >
            <div><span style={{ color: '#94a3b8' }}>Authorization:</span> <span style={{ color: '#7dd3fc' }}>Bearer &lt;staff_token&gt;</span></div>
            <div><span style={{ color: '#94a3b8' }}>X-Branch-ID:</span> <span style={{ color: '#7dd3fc' }}>{info?.branchId ?? branchId}</span></div>
            <div><span style={{ color: '#94a3b8' }}>Content-Type:</span> <span style={{ color: '#7dd3fc' }}>application/json</span></div>
          </div>

          <small style={{ marginTop: '10px', display: 'block' }}>
            Staff tokens are obtained via <code>POST /auth/staff/login</code> and expire after 24 hours.
            Refresh tokens are stored in HTTP-only cookies.
          </small>
        </div>

      </div>
    </div>
  );
}
