import { useState, useEffect } from 'react';
import AdminSettingsNav from './AdminSettingsNav';
import AdminSettingsRestaurantProfile from './AdminSettingsRestaurantProfile';
import AdminSettingsOperatingHours from './AdminSettingsOperatingHours';
import AdminSettingsSectionsLayout from './AdminSettingsSectionsLayout';
import AdminSettingsStaffAccounts from './AdminSettingsStaffAccounts';
import AdminSettingsEmailSettings from './AdminSettingsEmailSettings';
import AdminSettingsDepositSettings from './AdminSettingsDepositSettings';
import AdminSettingsPaymentSettings from './AdminSettingsPaymentSettings';
import AdminSettingsCommissionSettings from './AdminSettingsCommissionSettings';
import AdminSettingsApiSettings from './AdminSettingsApiSettings';
import AdminSettingsTheme from './AdminSettingsTheme';
import './AdminSettingsPage.css';

export default function AdminSettingsPage() {
  const role = localStorage.getItem('staff_role') ?? '';
  const [activeCategory, setActiveCategory] = useState('restaurant-profile');
  const [searchQuery, setSearchQuery] = useState('');

  // Check authorization
  if (role !== 'superadmin' && role !== 'admin') {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1>Access Denied</h1>
            <p className="page-subtitle">Admin access is required to view this page.</p>
          </div>
        </div>
        <div className="empty-state">You do not have permission to access admin settings.</div>
      </div>
    );
  }

  const renderCategory = () => {
    switch (activeCategory) {
      case 'restaurant-profile':
        return <AdminSettingsRestaurantProfile />;
      case 'operating-hours':
        return <AdminSettingsOperatingHours />;
      case 'sections-tables':
        return <AdminSettingsSectionsLayout />;
      case 'staff-accounts':
        return <AdminSettingsStaffAccounts />;
      case 'email-settings':
        return <AdminSettingsEmailSettings />;
      case 'deposit-settings':
        return <AdminSettingsDepositSettings />;
      case 'payment-settings':
        return <AdminSettingsPaymentSettings />;
      case 'commission-settings':
        return <AdminSettingsCommissionSettings />;
      case 'api-settings':
        return <AdminSettingsApiSettings />;
      case 'theme':
        return <AdminSettingsTheme />;
      default:
        return <AdminSettingsRestaurantProfile />;
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Admin Settings</h1>
          <p className="page-subtitle">Manage your restaurant configuration and preferences</p>
        </div>
      </div>

      <div className="admin-settings-container">
        <div className="settings-sidebar">
          <div className="sidebar-search">
            <input
              type="text"
              placeholder="Search settings…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <AdminSettingsNav
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            searchQuery={searchQuery}
          />
        </div>

        <div className="settings-main">
          {renderCategory()}
        </div>
      </div>
    </div>
  );
}
