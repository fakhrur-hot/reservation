import React from 'react';

interface SetupSuccessScreenProps {
  onGoToDashboard?: () => void;
}

export default function SetupSuccessScreen({ onGoToDashboard }: SetupSuccessScreenProps) {
  return (
    <div className="setup-success-screen">
      <div className="success-container">
        <div className="success-icon">✓</div>
        <h1>Setup Complete!</h1>
        <p className="success-message">
          Your restaurant is now configured and ready to accept reservations.
        </p>

        <div className="success-details">
          <div className="detail-item">
            <span className="detail-icon">📋</span>
            <span>Restaurant profile configured</span>
          </div>
          <div className="detail-item">
            <span className="detail-icon">⏰</span>
            <span>Operating hours set</span>
          </div>
          <div className="detail-item">
            <span className="detail-icon">🪑</span>
            <span>Sections and tables created</span>
          </div>
          <div className="detail-item">
            <span className="detail-icon">👤</span>
            <span>Admin and manager accounts ready</span>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={onGoToDashboard}
          style={{ marginTop: '32px', fontSize: '16px', padding: '12px 32px' }}
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}
