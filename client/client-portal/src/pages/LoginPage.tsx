import { useState } from 'react';
import './LoginPage.css';

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'otp' | 'password'>('email');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/auth/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Failed to identify account');
        return;
      }

      // Route based on challenge type
      if (data.challenge === 'otp') {
        setStep('otp');
      } else if (data.challenge === 'password') {
        setStep('password');
      } else {
        setStep('otp'); // default to OTP
      }
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Invalid OTP');
        return;
      }

      localStorage.setItem('customer_token', data.accessToken);
      onLoginSuccess(data.accessToken);
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Login failed');
        return;
      }

      localStorage.setItem('customer_token', data.accessToken);
      onLoginSuccess(data.accessToken);
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🍽️</div>
        <h1>Sejiwa</h1>
        <p className="login-subtitle">Sign in to book your table</p>

        {error && <div className="login-error">{error}</div>}

        {step === 'email' && (
          <form onSubmit={handleIdentify} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Checking...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleOtpVerify} className="login-form">
            <p className="login-hint">We sent a code to <strong>{email}</strong></p>
            <div className="form-group">
              <label htmlFor="otp">Verification Code</label>
              <input
                id="otp"
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="123456"
                required
                autoFocus
                maxLength={6}
              />
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button type="button" className="login-back" onClick={() => { setStep('email'); setError(null); }}>
              ← Use a different email
            </button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handlePasswordLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="email-display">Email</label>
              <input id="email-display" type="email" value={email} disabled />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus
              />
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <button type="button" className="login-back" onClick={() => { setStep('email'); setError(null); }}>
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
