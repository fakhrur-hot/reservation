import { useState } from 'react';
import { AdminAccountData } from '../../types/setup.types';

interface Step4AdminAccountProps {
  data: AdminAccountData;
  onChange: (data: AdminAccountData) => void;
  error?: string | null;
}

function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  if (!password) return 'weak';
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z\d]/.test(password)) strength++;

  if (strength <= 2) return 'weak';
  if (strength <= 3) return 'medium';
  return 'strong';
}

export default function Step4AdminAccount({
  data,
  onChange,
  error,
}: Step4AdminAccountProps) {
  const [showPassword, setShowPassword] = useState(false);
  const strength = getPasswordStrength(data.password);

  return (
    <div className="setup-step">
      <h2>Admin Account</h2>
      <p className="step-description">Create your admin account</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-group">
        <label>
          Full Name <span className="required">*</span>
        </label>
        <input
          type="text"
          value={data.fullName}
          onChange={e => onChange({ ...data, fullName: e.target.value })}
          placeholder="e.g., John Doe"
          className={error?.includes('Full name') ? 'error' : ''}
        />
      </div>

      <div className="form-group">
        <label>
          Email Address <span className="required">*</span>
        </label>
        <input
          type="email"
          value={data.email}
          onChange={e => onChange({ ...data, email: e.target.value })}
          placeholder="e.g., admin@sejiwa.com"
          className={error?.includes('email') ? 'error' : ''}
        />
      </div>

      <div className="form-group">
        <label>
          Password <span className="required">*</span>
        </label>
        <div className="password-input-wrapper">
          <input
            type={showPassword ? 'text' : 'password'}
            value={data.password}
            onChange={e => onChange({ ...data, password: e.target.value })}
            placeholder="Minimum 8 characters"
            className={error?.includes('Password') ? 'error' : ''}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? 'ðŸ‘ï¸' : 'ðŸ‘ï¸â€ðŸ—¨ï¸'}
          </button>
        </div>

        {data.password && (
          <>
            <div className="password-strength">
              <div className={`password-strength-bar ${strength}`} />
            </div>
            <div className="password-strength-text">
              Strength: <strong>{strength === 'weak' ? 'Weak' : strength === 'medium' ? 'Medium' : 'Strong'}</strong>
            </div>
          </>
        )}
      </div>

      <div className="form-group">
        <label>Role</label>
        <input
          type="text"
          value="Admin"
          disabled
          title="Fixed role for setup"
        />
        <small>Admin role is fixed during setup</small>
      </div>

      <div className="info-box" style={{ marginTop: '24px' }}>
        <strong>Password Requirements:</strong>
        <ul>
          <li>At least 8 characters long</li>
          <li>Mix of uppercase and lowercase letters</li>
          <li>Include numbers and special characters for better security</li>
        </ul>
      </div>
    </div>
  );
}

