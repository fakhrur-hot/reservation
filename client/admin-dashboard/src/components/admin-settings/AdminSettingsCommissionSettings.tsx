import { useState, useEffect, useCallback } from 'react';
import './AdminSettingsCategory.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type CommissionType = 'percentage' | 'fixed';
type Category = 'decoration' | 'cake';

interface VendorCommission {
  category: Category;
  commissionType: CommissionType;
  commissionValue: number;
  isEnabled: boolean;
}

interface CategoryState extends VendorCommission {
  saving: boolean;
  error: string | null;
  success: boolean;
}

interface VendorSummary {
  category: Category;
  bookingCount: number;
  totalServiceRevenue: number;
  totalCommissionEarned: number;
  totalVendorDue: number;
  totalPaidToVendor: number;
  paymentCount: number;
  balanceOwed: number;
}

interface RecentPayment {
  id: string;
  category: Category;
  amountPaid: number;
  note: string | null;
  paidAt: string;
  paidByName: string | null;
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

const CATEGORY_META: Record<Category, { label: string; icon: string; vendorType: string; desc: string }> = {
  decoration: {
    label: 'Decoration Vendor',
    icon: '🎀',
    vendorType: 'Table decoration supplier',
    desc: 'Commission charged to the decoration vendor per booking with table decoration.',
  },
  cake: {
    label: 'Cake Vendor',
    icon: '🎂',
    vendorType: 'Cake / pastry supplier',
    desc: 'Commission charged to the cake vendor per booking that includes a cake.',
  },
};

function fmt(n: number) {
  return `RM ${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSettingsCommissionSettings() {
  const branchId = localStorage.getItem('branch_id') ?? '';

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Commission rate settings
  const [categories, setCategories] = useState<Record<Category, CategoryState>>({
    decoration: { category: 'decoration', commissionType: 'percentage', commissionValue: 0, isEnabled: false, saving: false, error: null, success: false },
    cake:       { category: 'cake',       commissionType: 'percentage', commissionValue: 0, isEnabled: false, saving: false, error: null, success: false },
  });

  // Vendor payment summary
  const [summary, setSummary] = useState<Record<Category, VendorSummary>>({
    decoration: { category: 'decoration', bookingCount: 0, totalServiceRevenue: 0, totalCommissionEarned: 0, totalVendorDue: 0, totalPaidToVendor: 0, paymentCount: 0, balanceOwed: 0 },
    cake:       { category: 'cake',       bookingCount: 0, totalServiceRevenue: 0, totalCommissionEarned: 0, totalVendorDue: 0, totalPaidToVendor: 0, paymentCount: 0, balanceOwed: 0 },
  });
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);

  // Payment form state per category
  const [paymentAmount, setPaymentAmount] = useState<Record<Category, string>>({ decoration: '', cake: '' });
  const [paymentNote, setPaymentNote] = useState<Record<Category, string>>({ decoration: '', cake: '' });
  const [paymentSaving, setPaymentSaving] = useState<Record<Category, boolean>>({ decoration: false, cake: false });
  const [paymentError, setPaymentError] = useState<Record<Category, string | null>>({ decoration: null, cake: null });
  const [paymentSuccess, setPaymentSuccess] = useState<Record<Category, boolean>>({ decoration: false, cake: false });

  const loadAll = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const [settingsRes, summaryRes] = await Promise.all([
        fetch(`${BASE}/admin/v1/branches/${branchId}/commission-settings`, { headers: getHeaders() }),
        fetch(`${BASE}/admin/v1/branches/${branchId}/vendor-payment-summary`, { headers: getHeaders() }),
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setCategories(prev => {
          const updated = { ...prev };
          for (const row of (data.commissionSettings ?? [])) {
            const cat = row.category as Category;
            if (cat in updated) {
              updated[cat] = { ...updated[cat], commissionType: row.commissionType, commissionValue: row.commissionValue, isEnabled: row.isEnabled };
            }
          }
          return updated;
        });
      }

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        const newSummary = { ...summary };
        for (const row of (data.summary ?? [])) {
          const cat = row.category as Category;
          if (cat in newSummary) newSummary[cat] = row;
        }
        setSummary(newSummary);
        setRecentPayments(data.recentPayments ?? []);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const updateCategory = (cat: Category, patch: Partial<CategoryState>) =>
    setCategories(prev => ({ ...prev, [cat]: { ...prev[cat], ...patch } }));

  const handleSaveCommission = async (cat: Category) => {
    const state = categories[cat];
    updateCategory(cat, { saving: true, error: null, success: false });
    try {
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/commission-settings/${cat}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          commission_type: state.commissionType,
          commission_value: state.commissionValue,
          is_enabled: state.isEnabled,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      updateCategory(cat, { success: true, saving: false });
      setTimeout(() => updateCategory(cat, { success: false }), 3000);
    } catch (err) {
      updateCategory(cat, { error: err instanceof Error ? err.message : 'Failed to save', saving: false });
    }
  };

  const handleRecordPayment = async (cat: Category) => {
    const amount = parseFloat(paymentAmount[cat]);
    if (!amount || amount <= 0) {
      setPaymentError(prev => ({ ...prev, [cat]: 'Enter a valid amount greater than 0' }));
      return;
    }
    setPaymentSaving(prev => ({ ...prev, [cat]: true }));
    setPaymentError(prev => ({ ...prev, [cat]: null }));
    setPaymentSuccess(prev => ({ ...prev, [cat]: false }));

    try {
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/vendor-payments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ category: cat, amountPaid: amount, note: paymentNote[cat] || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      setPaymentAmount(prev => ({ ...prev, [cat]: '' }));
      setPaymentNote(prev => ({ ...prev, [cat]: '' }));
      setPaymentSuccess(prev => ({ ...prev, [cat]: true }));
      setTimeout(() => setPaymentSuccess(prev => ({ ...prev, [cat]: false })), 3000);

      // Refresh summary
      await loadAll();
    } catch (err) {
      setPaymentError(prev => ({ ...prev, [cat]: err instanceof Error ? err.message : 'Failed to record payment' }));
    } finally {
      setPaymentSaving(prev => ({ ...prev, [cat]: false }));
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

  const totalOwed = (summary.decoration.balanceOwed + summary.cake.balanceOwed);

  return (
    <div className="settings-category">
      <div className="category-header">
        <h2>Vendor Commission &amp; Payments</h2>
        <p>Set commission rates for decoration and cake vendors, track services used, and record payments owed</p>
      </div>

      <div className="category-content">

        {fetchError && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{fetchError}</div>}

        {/* ── Total owed banner ──────────────────────────────────────── */}
        {totalOwed > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '14px',
            padding: '14px 18px', marginBottom: '24px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#ef4444' }}>
                Total outstanding to vendors: {fmt(totalOwed)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Decoration: {fmt(summary.decoration.balanceOwed)} · Cake: {fmt(summary.cake.balanceOwed)}
              </div>
            </div>
          </div>
        )}

        {/* ── Per-category cards ─────────────────────────────────────── */}
        {(['decoration', 'cake'] as Category[]).map(cat => {
          const state = categories[cat];
          const meta = CATEGORY_META[cat];
          const s = summary[cat];
          const exampleBase = cat === 'decoration' ? 150 : 80;
          const exampleCommission = state.commissionType === 'percentage'
            ? (exampleBase * state.commissionValue / 100)
            : state.commissionValue;

          return (
            <div key={cat} style={{
              border: `1px solid ${s.balanceOwed > 0 ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              marginBottom: '24px',
              overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px',
                background: 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px' }}>{meta.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{meta.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{meta.vendorType}</div>
                  </div>
                </div>
                {s.balanceOwed > 0 && (
                  <span style={{
                    background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                    padding: '4px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: 700,
                  }}>
                    Owes {fmt(s.balanceOwed)}
                  </span>
                )}
                {s.balanceOwed === 0 && s.bookingCount > 0 && (
                  <span style={{
                    background: 'rgba(16,185,129,0.12)', color: '#10b981',
                    padding: '4px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
                  }}>
                    ✓ Settled
                  </span>
                )}
              </div>

              <div style={{ padding: '20px' }}>

                {/* ── Service usage stats ─────────────────────────── */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '10px', marginBottom: '20px',
                }}>
                  {[
                    { label: 'Bookings Used', value: String(s.bookingCount), sub: 'confirmed reservations' },
                    { label: 'Service Revenue', value: fmt(s.totalServiceRevenue), sub: 'collected from customers' },
                    { label: 'Commission Kept', value: fmt(s.totalCommissionEarned), sub: 'cafe earnings' },
                    { label: 'Vendor Due', value: fmt(s.totalVendorDue), sub: 'revenue minus commission' },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      padding: '12px', background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '2px' }}>{stat.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>{stat.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Payment progress bar */}
                {s.totalVendorDue > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      <span>Paid to vendor: {fmt(s.totalPaidToVendor)} ({s.paymentCount} payment{s.paymentCount !== 1 ? 's' : ''})</span>
                      <span>Still owed: <strong style={{ color: s.balanceOwed > 0 ? '#ef4444' : '#10b981' }}>{fmt(s.balanceOwed)}</strong></span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, (s.totalPaidToVendor / s.totalVendorDue) * 100)}%`,
                        background: s.balanceOwed === 0 ? '#10b981' : '#3b82f6',
                        borderRadius: '4px',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                )}

                {/* ── Record payment ──────────────────────────────── */}
                <div style={{
                  padding: '16px', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  marginBottom: '20px',
                }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '12px' }}>
                    💸 Record Payment to {meta.label}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: '0 0 140px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Amount Paid (RM) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={paymentAmount[cat]}
                        onChange={e => setPaymentAmount(prev => ({ ...prev, [cat]: e.target.value }))}
                        placeholder={s.balanceOwed > 0 ? s.balanceOwed.toFixed(2) : '0.00'}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '160px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Note (optional)
                      </label>
                      <input
                        type="text"
                        value={paymentNote[cat]}
                        onChange={e => setPaymentNote(prev => ({ ...prev, [cat]: e.target.value }))}
                        placeholder="e.g. Bank transfer ref #12345"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleRecordPayment(cat)}
                      disabled={paymentSaving[cat] || !paymentAmount[cat]}
                      style={{ fontSize: '13px', whiteSpace: 'nowrap' }}
                    >
                      {paymentSaving[cat] ? 'Saving…' : 'Record Payment'}
                    </button>
                  </div>
                  {paymentError[cat] && <div className="alert alert-error" style={{ marginTop: '10px' }}>{paymentError[cat]}</div>}
                  {paymentSuccess[cat] && <div className="alert alert-success" style={{ marginTop: '10px' }}>✓ Payment recorded</div>}
                </div>

                {/* ── Commission rate settings ────────────────────── */}
                <details style={{ marginTop: '4px' }}>
                  <summary style={{
                    cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                    color: 'var(--text-secondary)', userSelect: 'none', padding: '4px 0',
                  }}>
                    ⚙️ Commission Rate Settings
                    {state.isEnabled
                      ? ` — ${state.commissionType === 'percentage' ? `${state.commissionValue}%` : fmt(state.commissionValue)} per booking`
                      : ' — disabled'}
                  </summary>
                  <div style={{ paddingTop: '14px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>{meta.desc}</p>

                    {/* Enable toggle */}
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={state.isEnabled}
                          onChange={e => updateCategory(cat, { isEnabled: e.target.checked })}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: state.isEnabled ? 600 : 400 }}>
                          {state.isEnabled ? 'Commission enabled' : 'Commission disabled'}
                        </span>
                      </label>
                    </div>

                    {/* Type selector */}
                    <div className="form-group">
                      <label>Commission Type</label>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                        {(['percentage', 'fixed'] as CommissionType[]).map(type => (
                          <label key={type} style={{
                            flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: '6px', padding: '8px 12px',
                            border: `2px solid ${state.commissionType === type ? 'var(--primary)' : 'var(--border)'}`,
                            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            background: state.commissionType === type ? 'var(--primary-light, #eff6ff)' : 'var(--bg-elevated)',
                            fontWeight: state.commissionType === type ? 600 : 400, fontSize: '13px',
                          }}>
                            <input type="radio" name={`${cat}-type`} value={type}
                              checked={state.commissionType === type}
                              onChange={() => updateCategory(cat, { commissionType: type })}
                              style={{ display: 'none' }} />
                            {type === 'percentage' ? '% Percentage' : 'RM Fixed Amount'}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Value */}
                    <div className="form-group">
                      <label>{state.commissionType === 'percentage' ? 'Commission Rate (%)' : 'Commission Amount (RM)'}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                        <input
                          type="number" min="0"
                          max={state.commissionType === 'percentage' ? 100 : undefined}
                          step={state.commissionType === 'percentage' ? 0.5 : 1}
                          value={state.commissionValue}
                          onChange={e => updateCategory(cat, { commissionValue: Number(e.target.value) })}
                          style={{ width: '120px' }}
                          disabled={!state.isEnabled}
                        />
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          {state.commissionType === 'percentage' ? '%' : 'RM per booking'}
                        </span>
                      </div>
                      {state.isEnabled && state.commissionValue > 0 && (
                        <small>
                          Example: vendor charges {fmt(exampleBase)} → commission = <strong>{fmt(exampleCommission)}</strong>
                        </small>
                      )}
                    </div>

                    {state.error && <div className="alert alert-error">{state.error}</div>}
                    {state.success && <div className="alert alert-success">✓ Commission rate saved</div>}

                    <button type="button" className="btn btn-primary"
                      onClick={() => handleSaveCommission(cat)}
                      disabled={state.saving}
                      style={{ fontSize: '13px', marginTop: '4px' }}>
                      {state.saving ? 'Saving…' : 'Save Commission Rate'}
                    </button>
                  </div>
                </details>

              </div>
            </div>
          );
        })}

        {/* ── Recent payment history ─────────────────────────────────── */}
        {recentPayments.length > 0 && (
          <div className="form-section">
            <h3>Recent Vendor Payments</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Vendor', 'Amount Paid', 'Note', 'Recorded By'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentPayments.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{fmtDate(p.paidAt)}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {CATEGORY_META[p.category].icon} {CATEGORY_META[p.category].label}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontWeight: 700, color: '#10b981' }}>{fmt(p.amountPaid)}</td>
                    <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{p.note || '—'}</td>
                    <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{p.paidByName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
