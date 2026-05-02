import { useState } from 'react';
import { SmtpSettingsData } from '../../types/setup.types';

interface Step6SmtpSettingsProps {
  data: SmtpSettingsData | null;
  onChange: (data: SmtpSettingsData | null) => void;
  onSkip: () => void;
  error?: string | null;
}

const BASE = '';

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function Step6SmtpSettings({
  data,
  onChange,
  onSkip,
  error,
}: Step6SmtpSettingsProps) {
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const isComplete = data && data.host && data.port && data.username && data.password && data.fromName && data.fromEmail;

  const handleTestEmail = async () => {
    if (!data) return;

    setTestLoading(true);
    setTestResult(null);

    try {
      const result = await request<{ success: boolean; error?: string }>('/setup/smtp/test', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      setTestResult({
        success: result.success,
        message: result.success
          ? 'Test email sent successfully!'
          : result.error || 'Failed to send test email',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test SMTP settings';
      setTestResult({
        success: false,
        message,
      });
    } finally {
      setTestLoading(false);
    }
  };

  const defaultData: SmtpSettingsData = data || {
    host: '',
    port: 587,
    username: '',
    password: '',
    fromName: '',
    fromEmail: '',
    tls: true,
  };

  return (
    <div className="setup-step">
      <h2>Email / SMTP Settings</h2>
      <p className="step-description">Configure email for reservation confirmations and notifications (optional)</p>

      {error && <div className="alert alert-error">{error}</div>}

      {testResult && (
        <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'}`}>
          {testResult.message}
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label>SMTP Host</label>
          <input
            type="text"
            value={defaultData.host}
            onChange={e => onChange({ ...defaultData, host: e.target.value })}
            placeholder="e.g., smtp.gmail.com"
          />
        </div>

        <div className="form-group">
          <label>SMTP Port</label>
          <input
            type="number"
            value={defaultData.port}
            onChange={e => onChange({ ...defaultData, port: parseInt(e.target.value) || 587 })}
            placeholder="e.g., 587"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            value={defaultData.username}
            onChange={e => onChange({ ...defaultData, username: e.target.value })}
            placeholder="e.g., your-email@gmail.com"
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={defaultData.password}
            onChange={e => onChange({ ...defaultData, password: e.target.value })}
            placeholder="SMTP password or app password"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>From Name</label>
          <input
            type="text"
            value={defaultData.fromName}
            onChange={e => onChange({ ...defaultData, fromName: e.target.value })}
            placeholder="e.g., sejiwa Restaurant"
          />
        </div>

        <div className="form-group">
          <label>From Email</label>
          <input
            type="email"
            value={defaultData.fromEmail}
            onChange={e => onChange({ ...defaultData, fromEmail: e.target.value })}
            placeholder="e.g., noreply@sejiwa.com"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={defaultData.tls}
            onChange={e => onChange({ ...defaultData, tls: e.target.checked })}
          />
          <span>Use TLS/SSL</span>
        </label>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
        <button
          className="btn btn-secondary"
          onClick={handleTestEmail}
          disabled={!isComplete || testLoading}
        >
          {testLoading ? 'Sending...' : 'Send Test Email'}
        </button>
        <button
          className="btn btn-link"
          onClick={onSkip}
        >
          Skip for now
        </button>
      </div>

      <div className="info-box" style={{ marginTop: '24px' }}>
        <strong>Gmail Users:</strong>
        <ul>
          <li>Use your Gmail address as username</li>
          <li>Generate an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">App Password</a> and use it here</li>
          <li>Port: 587 with TLS enabled</li>
        </ul>
      </div>
    </div>
  );
}

