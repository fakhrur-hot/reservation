import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import BookingFlow from './pages/BookingFlow';
import SetupRequiredPage from './components/SetupRequiredPage';
import { useSetupStatus } from './hooks/useSetupStatus';
import './global.css';

function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <div style={{
          width: '40px', height: '40px',
          border: '4px solid rgba(255,255,255,0.3)', borderTop: '4px solid white',
          borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px',
        }} />
        <p>Loading...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { loading, setupRequired, branchId, branchName } = useSetupStatus();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('customer_token'));

  // Update browser tab title with restaurant name
  useEffect(() => {
    if (branchName) {
      document.title = `${branchName} — Book a Table`;
    }
  }, [branchName]);

  if (loading) return <LoadingSpinner />;

  if (setupRequired) {
    return <SetupRequiredPage branchName={branchName} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/book" replace />} />
        <Route
          path="/book"
          element={
            <BookingFlow
              branchId={branchId ?? ''}
              branchName={branchName}
              token={token}
              onLogin={t => setToken(t)}
              onLogout={() => setToken(null)}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
