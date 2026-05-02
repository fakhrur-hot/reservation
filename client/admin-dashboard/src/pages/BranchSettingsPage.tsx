import { useEffect, useState } from 'react';
import { getBranchSettings, updateBranchSettings } from '../api';
import { BranchSettings } from '../types';

const PRINTER_OPTIONS = ['', 'usb', 'lan', 'wifi', 'bluetooth'];

export default function BranchSettingsPage() {
  const branchId = localStorage.getItem('branch_id');
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [form, setForm] = useState<BranchSettings>({
    branchId: '',
    bookingDepositAmt: 0,
    printerType: null,
    printerIpAddress: null,
    printerPort: null,
    printerName: null,
    printerQueueName: null,
    noShowGraceMin: 0,
    modCutoffHours: 0,
    decorationPackagePrice: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      if (!branchId) {
        setError('Branch ID is missing. Please select a branch or log in again.');
        setLoading(false);
        return;
      }

      try {
        const data = await getBranchSettings(branchId);
        setSettings(data);
        setForm(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load branch settings');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [branchId]);

  const handleChange = (field: keyof Omit<BranchSettings, 'branchId'>, value: string | number | null) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSuccessMessage(null);
  };

  const handleSave = async () => {
    if (!branchId) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateBranchSettings(branchId, {
        bookingDepositAmt: Number(form.bookingDepositAmt),
        printerType: form.printerType ?? undefined,
        printerIpAddress: form.printerIpAddress ?? undefined,
        printerPort: form.printerPort ?? undefined,
        printerName: form.printerName ?? undefined,
        printerQueueName: form.printerQueueName ?? undefined,
        noShowGraceMin: Number(form.noShowGraceMin),
        modCutoffHours: Number(form.modCutoffHours),
        decorationPackagePrice: Number(form.decorationPackagePrice),
      });
      setSuccessMessage('Branch settings saved successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save branch settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page">Loading branch settings…</div>;
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1>Branch Settings</h1>
            <p className="page-subtitle">Manage branch-level deposit, printer, timing, and decoration settings.</p>
          </div>
        </div>
        <div className="empty-state">{error}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Branch Settings</h1>
          <p className="page-subtitle">Edit the branch settings that were originally configured during setup.</p>
        </div>
      </div>

      <div className="settings-grid" style={{ display: 'grid', gap: '20px', maxWidth: '760px' }}>
        <div className="card" style={{ padding: '24px', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(15,23,42,0.08)' }}>
          <h2 style={{ marginBottom: '16px' }}>Payment & Printer</h2>

          <label style={{ display: 'block', marginBottom: '12px' }}>
            Booking deposit amount (RM)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.bookingDepositAmt}
              onChange={(e) => handleChange('bookingDepositAmt', Number(e.target.value))}
              style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d9dee3' }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: '12px' }}>
            Decoration package price (RM)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.decorationPackagePrice}
              onChange={(e) => handleChange('decorationPackagePrice', Number(e.target.value))}
              style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d9dee3' }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: '12px' }}>
            Printer type
            <select
              value={form.printerType ?? ''}
              onChange={(e) => handleChange('printerType', e.target.value || null)}
              style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d9dee3' }}
            >
              {PRINTER_OPTIONS.map((type) => (
                <option key={type} value={type}>{type || 'Not configured'}</option>
              ))}
            </select>
          </label>

          {form.printerType && (
            <>
              <label style={{ display: 'block', marginBottom: '12px' }}>
                Printer name/Queue name
                <input
                  type="text"
                  value={form.printerName ?? ''}
                  onChange={(e) => handleChange('printerName', e.target.value || null)}
                  placeholder="e.g., Receipt Printer, Thermal-01"
                  style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d9dee3' }}
                />
              </label>

              {(form.printerType === 'lan' || form.printerType === 'wifi') && (
                <>
                  <label style={{ display: 'block', marginBottom: '12px' }}>
                    IP Address
                    <input
                      type="text"
                      value={form.printerIpAddress ?? ''}
                      onChange={(e) => handleChange('printerIpAddress', e.target.value || null)}
                      placeholder="e.g., 192.168.1.100"
                      style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d9dee3' }}
                    />
                  </label>

                  <label style={{ display: 'block', marginBottom: '12px' }}>
                    Port number
                    <input
                      type="number"
                      value={form.printerPort ?? '9100'}
                      onChange={(e) => handleChange('printerPort', parseInt(e.target.value) || null)}
                      placeholder="9100"
                      style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d9dee3' }}
                    />
                  </label>
                </>
              )}

              {form.printerType === 'usb' && (
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  Queue name (Windows Print Queue)
                  <input
                    type="text"
                    value={form.printerQueueName ?? ''}
                    onChange={(e) => handleChange('printerQueueName', e.target.value || null)}
                    placeholder="e.g., \\\\SERVER\\PrinterName"
                    style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d9dee3' }}
                  />
                </label>
              )}

              <div style={{ padding: '12px', background: '#f0f4f9', borderRadius: '8px', marginBottom: '12px', fontSize: '14px', color: '#475569' }}>
                <strong>📋 Printer Setup Instructions:</strong>
                {form.printerType === 'lan' || form.printerType === 'wifi' ? (
                  <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0 }}>
                    <li>Ensure printer is connected to the network</li>
                    <li>Find printer IP address from printer settings or web UI</li>
                    <li>Default port is usually 9100 (raw) or 515 (LPD)</li>
                    <li>Test connectivity: ping {form.printerIpAddress || '192.168.x.x'}</li>
                  </ul>
                ) : form.printerType === 'usb' ? (
                  <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0 }}>
                    <li>Install printer drivers on the POS system</li>
                    <li>Add printer to Windows Print & Scan devices</li>
                    <li>Enter the network path or local queue name</li>
                    <li>Test print from Devices and Printers</li>
                  </ul>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="card" style={{ padding: '24px', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(15,23,42,0.08)' }}>
          <h2 style={{ marginBottom: '16px' }}>Timing Rules</h2>

          <label style={{ display: 'block', marginBottom: '12px' }}>
            No-show grace period (minutes)
            <input
              type="number"
              min="0"
              step="1"
              value={form.noShowGraceMin}
              onChange={(e) => handleChange('noShowGraceMin', Number(e.target.value))}
              style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d9dee3' }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: '12px' }}>
            Modification cutoff (hours)
            <input
              type="number"
              min="0"
              step="1"
              value={form.modCutoffHours}
              onChange={(e) => handleChange('modCutoffHours', Number(e.target.value))}
              style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d9dee3' }}
            />
          </label>
        </div>
      </div>

      <div style={{ marginTop: '24px' }}>
        {error && <div className="empty-state" style={{ marginBottom: '16px' }}>{error}</div>}
        {successMessage && <div className="success-state" style={{ marginBottom: '16px', color: '#1f8a3f' }}>{successMessage}</div>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 20px',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save branch settings'}
        </button>
      </div>
    </div>
  );
}
