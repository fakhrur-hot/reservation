import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import CommissionSettingsPage from './pages/CommissionSettingsPage';
import SuperadminSettingsPage from './pages/SuperadminSettingsPage';
import ReservationsPage from './pages/ReservationsPage';
import CustomersPage from './pages/CustomersPage';
import PromoControlPage from './pages/PromoControlPage';
import MenuPage from './pages/MenuPage';
import FloorPlanManagementPage from './pages/FloorPlanManagementPage';
import SetupWizardPage from './pages/SetupWizardPage';
import LoginPage from './pages/LoginPage';
import { useSetupStatus } from './hooks/useSetupStatus';
import { THEME_DEFAULTS } from './components/admin-settings/AdminSettingsTheme';
import './global.css';

// Apply saved theme overrides before first paint
(function applyPersistedTheme() {
  try {
    const raw = localStorage.getItem('admin_theme_overrides');
    const overrides: Record<string, string> = raw ? { ...THEME_DEFAULTS, ...JSON.parse(raw) } : THEME_DEFAULTS;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(overrides)) root.style.setProperty(k, v);
    const accent = overrides['--accent'] ?? THEME_DEFAULTS['--accent'];
    const r = parseInt(accent.slice(1, 3), 16);
    const g = parseInt(accent.slice(3, 5), 16);
    const b = parseInt(accent.slice(5, 7), 16);
    root.style.setProperty('--accent-subtle', `rgba(${r},${g},${b},0.15)`);
    root.style.setProperty('--accent-border', `rgba(${r},${g},${b},0.35)`);
  } catch { /* non-fatal */ }
}());

function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <div style={{
          width: '40px', height: '40px',
          border: '4px solid rgba(232,93,38,0.3)', borderTop: '4px solid #e85d26',
          borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px',
        }} />
        <p>Loading...</p>
      </div>
    </div>
  );
}

function Nav() {
  const handleLogout = () => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_role');
    localStorage.removeItem('branch_id');
    localStorage.removeItem('branch_name');
    window.location.reload();
  };

  const staffRole = localStorage.getItem('staff_role');
  const branchName = localStorage.getItem('branch_name') || 'Dashboard';

  const navLink = (to: string, label: string) => (
    <NavLink to={to} style={({ isActive }) => ({
      padding: '12px 16px', fontSize: 13, fontWeight: 500,
      color: isActive ? '#f97316' : 'var(--text-secondary)', textDecoration: 'none',
      borderBottom: isActive ? '2px solid #f97316' : '2px solid transparent',
      whiteSpace: 'nowrap',
    })}>{label}</NavLink>
  );

  return (
    <nav style={{
      background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
      padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 8,
    }}>
      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 8px 10px 0', borderRight: '1px solid var(--border)',
        marginRight: 8, flexShrink: 0,
      }}>
        <span style={{ fontSize: 18 }}>🍽️</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {branchName}
        </span>
      </div>

      {/* Nav links — Reservations first */}
      <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
        {navLink('/reservations', 'Reservations')}
        {navLink('/floor-plan', 'Floor Plan')}
        {navLink('/menu', 'Menu')}
        {navLink('/customers', 'Customers')}
        {navLink('/promo-control', 'Promo Control')}
        {navLink('/commission', 'Commission')}
        {(staffRole === 'superadmin' || staffRole === 'admin') && navLink('/settings', 'Settings')}
      </div>

      <button onClick={handleLogout} style={{
        background: 'none', border: 'none', color: 'var(--text-secondary)',
        fontSize: 13, cursor: 'pointer', padding: '8px 12px', flexShrink: 0,
      }}>Sign Out</button>
    </nav>
  );
}

function Dashboard() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/reservations" replace />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/registered-customers" element={<Navigate to="/customers" replace />} />
        <Route path="/one-time-customers" element={<Navigate to="/customers" replace />} />
        <Route path="/floor-plan" element={<FloorPlanManagementPage />} />
        <Route path="/tables" element={<Navigate to="/floor-plan" replace />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/promo-control" element={<PromoControlPage />} />
        <Route path="/promo-codes" element={<Navigate to="/promo-control" replace />} />
        <Route path="/promo-analytics" element={<Navigate to="/promo-control" replace />} />
        <Route path="/commission" element={<CommissionSettingsPage />} />
        <Route path="/settings" element={<SuperadminSettingsPage />} />
        <Route path="*" element={
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <h2>404 - Page Not Found</h2>
            <p>The page you are looking for does not exist.</p>
          </div>
        } />
      </Routes>
    </>
  );
}

export default function App() {
  const { loading, setupRequired, branchName } = useSetupStatus();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('staff_token'));
  const [setupDone, setSetupDone] = useState(false);

  // Update browser tab title whenever branchName is known
  useEffect(() => {
    const name = branchName || localStorage.getItem('branch_name') || 'Dashboard';
    document.title = `${name} — Staff Portal`;
    if (branchName) localStorage.setItem('branch_name', branchName);
  }, [branchName]);

  // Clear token AND stale setup progress if setup is required (fresh install / DB reset)
  useEffect(() => {
    if (setupRequired) {
      localStorage.removeItem('staff_token');
      localStorage.removeItem('setup_wizard_progress');
      localStorage.removeItem('branch_name');
      setToken(null);
    }
  }, [setupRequired]);

  if (loading) return <LoadingSpinner />;

  // Setup not done → show wizard
  // setupDone flag lets us transition to login without a full page reload
  if (setupRequired && !setupDone) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Navigate to="/setup" replace />} />
          <Route path="/setup" element={
            <SetupWizardPage onComplete={() => {
              // Mark setup as done locally — triggers re-render to login page
              setSetupDone(true);
            }} />
          } />
        </Routes>
      </BrowserRouter>
    );
  }

  // Setup done but not logged in → show login
  if (!token) {
    return <LoginPage onLoginSuccess={t => setToken(t)} />;
  }

  // Logged in → show dashboard
  return (
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
}
