import { useState, useEffect } from 'react';
import './AdminSettingsCategory.css';

interface SmtpSettings {
  host: string; port: number; username: string; password: string;
  fromName: string; fromEmail: string; tls: boolean;
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

export default function AdminSettingsEmailSettings() {
  const branchId = localStorage.getItem('branch_id') ?? '';

  const [form, setForm] = useState<SmtpSettings>({
    host: '', port: 587, username: '', password: '',
    fromName: '', fromEmail: '', tls: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId) return;
    fetch(`${BASE}/admin/v1/branches/${branchId}/smtp`, { headers: getHeaders() })
      .then(r => r.json())
      .then(data => setForm(prev => ({ ...prev, ...data, password: '' })))
      .catch(() => {/* no smtp configured yet */})
      .finally(() => setLoading(false));
  }, [branchId]);

  const handleChange = (field: keyof SmtpSettings, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSuccess(false);
  };

  const handleTestEmail = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch('/setup/smtp/test', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) setTestResult('Test email sent successfully to ' + form.fromEmail);
      else throw new Error(data.error || 'Test failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const body: Partial<SmtpSettings> = { ...form };
      if (!body.password) delete body.password; // don't overwrite with empty
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/smtp`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="settings-category"><div style={{padding:'32px',textAlign:'center',color:'#64748b'}}>Loading…</div></div>;

  return (
    <div className="settings-category">
      <div className="category-header">
        <h2>Email Settings</h2>
        <p>Configure SMTP for transactional emails</p>
      </div>

      <div className="category-content">
        <div className="form-section">
          <h3>SMTP Configuration</h3>

          <div className="form-row">
            <div className="form-group">
              <label>SMTP Host *</label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => handleChange('host', e.target.value)}
                placeholder="e.g., smtp.gmail.com"
              />
            </div>

            <div className="form-group">
              <label>SMTP Port *</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => handleChange('port', Number(e.target.value))}
                placeholder="587"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Username *</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="e.g., your-email@gmail.com"
              />
            </div>

            <div className="form-group">
              <label>Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={form.tls}
                onChange={(e) => handleChange('tls', e.target.checked)}
              />
              <span>Use TLS/SSL</span>
            </label>
          </div>
        </div>

        <div className="form-section">
          <h3>From Address</h3>

          <div className="form-group">
            <label>From Name *</label>
            <input
              type="text"
              value={form.fromName}
              onChange={(e) => handleChange('fromName', e.target.value)}
              placeholder="e.g., Qitchen Restaurant"
            />
          </div>

          <div className="form-group">
            <label>From Email *</label>
            <input
              type="email"
              value={form.fromEmail}
              onChange={(e) => handleChange('fromEmail', e.target.value)}
              placeholder="e.g., noreply@qitchen.com"
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Test Connection</h3>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
            Send a test email to verify your SMTP settings are correct
          </p>

          {testResult && (
            <div className="alert alert-success" style={{ marginBottom: '16px' }}>
              {testResult}
            </div>
          )}

          <button
            type="button"
            onClick={handleTestEmail}
            disabled={testing || !form.host || !form.username || !form.password}
            className="btn btn-secondary"
          >
            {testing ? 'Sending…' : 'Send Test Email'}
          </button>
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
