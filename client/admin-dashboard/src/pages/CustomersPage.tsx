import React, { useState } from 'react';
import RegisteredCustomersPage from './RegisteredCustomersPage';
import OneTimeCustomersPage from './OneTimeCustomersPage';
import './PromoControlPage.css'; // Reuse the tab styles

export default function CustomersPage() {
  const [activeTab, setActiveTab] = useState<'registered' | 'one-time'>('registered');

  return (
    <div className="promo-control-page">
      <div className="promo-control-tabs">
        <button
          className={`tab-button ${activeTab === 'registered' ? 'active' : ''}`}
          onClick={() => setActiveTab('registered')}
        >
          👤 Registered Customers
        </button>
        <button
          className={`tab-button ${activeTab === 'one-time' ? 'active' : ''}`}
          onClick={() => setActiveTab('one-time')}
        >
          ⏱️ One-Time Customers
        </button>
      </div>

      <div className="promo-control-content">
        {activeTab === 'registered' ? (
          <RegisteredCustomersPage />
        ) : (
          <OneTimeCustomersPage />
        )}
      </div>
    </div>
  );
}
