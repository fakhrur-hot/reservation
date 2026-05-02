import { useState, useEffect } from 'react';
import './TopNav.css';

interface TopNavProps {
  token: string | null;
  branchName?: string;
  onLogin: (token: string) => void;
  onLogout: () => void;
}

type AuthStep = 'email' | 'otp' | 'password';
type AuthMode = 'login' | 'register';

export default function TopNav({ token, branchName = 'Sejiwa', onLogin, onLogout }: TopNavProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Listen for booking-triggered auth requests
  useEffect(() => {
    const handler = () => { setMode('login'); setOpen(true); };
    window.addEventListener('open-auth-modal', handler);
    return () => window.removeEventListener('open-auth-modal', handler);
  }, []);

  const reset = () => {
    setStep('email'); setEmail(''); setPassword('');
    setOtp(''); setName(''); setPhone(''); setError('');
  };

  const close = () => { setOpen(false); reset(); };

  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/auth/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Failed'); return; }
      setStep(data.challenge === 'password' ? 'password' : 'otp');
    } catch { setError('Connection error. Try again.'); }
    finally { setLoading(false); }
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Invalid code'); return; }
      localStorage.setItem('customer_token', data.accessToken);
      onLogin(data.accessToken);
      close();
    } catch { setError('Connection error. Try again.'); }
    finally { setLoading(false); }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Invalid credentials'); return; }
      localStorage.setItem('customer_token', data.accessToken);
      onLogin(data.accessToken);
      close();
    } catch { setError('Connection error. Try again.'); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Registration failed'); return; }
      // After register, switch to OTP verify
      setMode('login');
      setStep('otp');
    } catch { setError('Connection error. Try again.'); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('customer_token');
    onLogout();
  };

  return (
    <>
      <nav className="top-nav">
        <div className="top-nav-inner">
          <span className="top-nav-brand">🍽️ {branchName}</span>
          <div className="top-nav-actions">
            {token ? (
              <button className="nav-btn nav-btn--ghost" onClick={handleLogout}>
                Sign Out
              </button>
            ) : (
              <>
                <button className="nav-btn nav-btn--ghost" onClick={() => { setMode('login'); setOpen(true); }}>
                  Log In
                </button>
                <button className="nav-btn nav-btn--primary" onClick={() => { setMode('register'); setOpen(true); }}>
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Auth Modal ── */}
      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={close} aria-label="Close">✕</button>

            {/* Tabs */}
            <div className="modal-tabs">
              <button
                className={`modal-tab ${mode === 'login' ? 'modal-tab--active' : ''}`}
                onClick={() => { setMode('login'); reset(); }}
              >Log In</button>
              <button
                className={`modal-tab ${mode === 'register' ? 'modal-tab--active' : ''}`}
                onClick={() => { setMode('register'); reset(); }}
              >Register</button>
            </div>

            {error && <div className="modal-error">{error}</div>}

            {/* ── Login flow ── */}
            {mode === 'login' && step === 'email' && (
              <form onSubmit={handleIdentify} className="modal-form">
                <label>Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus />
                <button type="submit" className="modal-submit" disabled={loading}>
                  {loading ? 'Checking…' : 'Continue →'}
                </button>
              </form>
            )}

            {mode === 'login' && step === 'otp' && (
              <form onSubmit={handleOtp} className="modal-form">
                <p className="modal-hint">We sent a code to <strong>{email}</strong></p>
                <label>Verification Code</label>
                <input type="text" value={otp} onChange={e => setOtp(e.target.value)}
                  placeholder="123456" required autoFocus maxLength={6} inputMode="numeric" />
                <button type="submit" className="modal-submit" disabled={loading}>
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
                <button type="button" className="modal-back" onClick={() => { setStep('email'); setError(''); }}>
                  ← Different email
                </button>
              </form>
            )}

            {mode === 'login' && step === 'password' && (
              <form onSubmit={handlePassword} className="modal-form">
                <label>Email</label>
                <input type="email" value={email} disabled />
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoFocus />
                <button type="submit" className="modal-submit" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
                <button type="button" className="modal-back" onClick={() => { setStep('email'); setError(''); }}>
                  ← Different email
                </button>
              </form>
            )}

            {/* ── Register flow ── */}
            {mode === 'register' && (
              <form onSubmit={handleRegister} className="modal-form">
                <label>Full Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name" required autoFocus />
                <label>Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required />
                <label>Phone (optional)</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+60 12-345 6789" />
                <button type="submit" className="modal-submit" disabled={loading}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
