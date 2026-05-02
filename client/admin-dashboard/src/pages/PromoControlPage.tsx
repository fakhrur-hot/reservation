import React, { useState } from 'react';
import PromoCodeDashboardPage from './PromoCodeDashboardPage';
import PromoPerformanceDashboardPage from './PromoPerformanceDashboardPage';
import './PromoControlPage.css';

export default function PromoControlPage() {
  const [activeTab, setActiveTab] = useState<'codes' | 'analytics'>('codes');

  return (
    <div className="promo-control-page">
      <div className="promo-control-tabs">
        <button
          className={`tab-button ${activeTab === 'codes' ? 'active' : ''}`}
          onClick={() => setActiveTab('codes')}
        >
          🎟️ Promo Codes
        </button>
        <button
          className={`tab-button ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          📊 Promo Analytics
        </button>
      </div>

      <div className="promo-control-content">
        {activeTab === 'codes' ? (
          <PromoCodeDashboardPage />
        ) : (
          <PromoPerformanceDashboardPage />
        )}
      </div>
    </div>
  );
}
