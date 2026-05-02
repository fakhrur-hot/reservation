import { useState } from 'react';
import './LoginPage.css';

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/auth/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || 'Login failed');
        return;
      }

      // Store token and branch context, then notify parent
      localStorage.setItem('staff_token', data.accessToken);
      localStorage.setItem('staff_role', data.role || '');
      if (data.branchId) {
        localStorage.setItem('branch_id', data.branchId);
      }

      // Fetch branch name for the nav title
      try {
        const statusRes = await fetch('/setup/status');
        const status = await statusRes.json();
        if (status.branchName) {
          localStorage.setItem('branch_name', status.branchName);
          document.title = `${status.branchName} — Staff Portal`;
        }
      } catch {
        // Non-fatal — title will update when App re-renders
      }

      onLoginSuccess(data.accessToken);
    } catch (err) {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🍽️</div>
        <h1>Staff Portal</h1>
        <p className="login-subtitle">Sign in to manage your restaurant</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@restaurant.com"
              required
              autoFocus
            />
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
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
