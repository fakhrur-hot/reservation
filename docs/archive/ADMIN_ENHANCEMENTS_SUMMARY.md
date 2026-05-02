# Admin & Customer Management Enhancements

**Date:** April 18, 2026  
**Status:** ✅ Frontend Complete (Backend Endpoints Required)

---

## 📋 Summary

The Sneat Dashboard has been enhanced with comprehensive admin settings and customer management pages. All changes follow the dark theme design system and maintain consistency across the application.

---

## ✨ Changes Made

### 1. **Admin Settings - Dark Theme Fixes**

#### AdminSettingsNav.css (Fixed)
- ✅ Updated CSS classes to match actual component structure
- ✅ Replaced old `.settings-nav-*` classes with `.nav-*` classes
- ✅ All colors now use CSS variables for dark theme compatibility
- ✅ Fixed hover and active states for proper visibility

#### AdminSettingsDepositSettings.tsx (Fixed)
- ✅ Replaced hardcoded colors with CSS variables
  - `color: '#64748b'` → `var(--text-muted)`
  - `color: '#1e293b'` → `var(--text-primary)`
  - `background: '#f8f9fa'` → `var(--bg-elevated)`
  - `border: '#e2e8f0'` → `var(--border)`
- ✅ Policy summary box now properly styled for dark theme

### 2. **Staff Account Management**

#### AdminSettingsStaffAccounts.tsx (Enhanced)
- ✅ Added **+ Add Staff Member** button
- ✅ New creation form with fields:
  - Full Name
  - Email
  - Role (Waiter, Manager, Admin)
- ✅ POST endpoint integration for creating staff
- ✅ Dark theme color coding for roles:
  - Admin: Orange accent
  - Manager: Blue
  - Waiter: Green
- ✅ Status badges for active/inactive staff
- ✅ Refresh staff list after successful creation
- ✅ Error and success feedback

### 3. **Commission Settings Configuration**

#### AdminSettingsNav.tsx (Updated)
- ✅ Added new "Commission Settings" category:
  - Icon: 📊
  - Label: Commission Settings
  - Description: Staff commission rates & tiers

#### AdminSettingsCommissionSettings.tsx (New)
- ✅ **Commission Model Selection:**
  - Flat commission mode: Single percentage for all staff
  - Tiered commission mode: Variable rates based on reservation value
  
- ✅ **Flat Mode:**
  - Adjustable base commission rate (0-20%)
  - Visual slider with real-time percentage display
  
- ✅ **Tiered Mode:**
  - Add/remove commission tiers
  - Define min/max amount ranges
  - Set percentage rate per tier
  - Dynamically add new tiers
  - Remove tiers with confirmation
  
- ✅ **Live Example:**
  - Real-time example calculation showing:
    - Tiered breakdown for sample reservation value
    - Total commission earned
    - Dynamic calculation based on current settings
  
- ✅ **Dark Theme:**
  - All colors use CSS variables
  - Tier configuration cards in elevated background
  - Summary boxes with accent colors
  
- ✅ **API Integration:**
  - GET `/api/admin/v1/branches/:id/commission-settings`
  - PATCH `/api/admin/v1/branches/:id/commission-settings`

#### AdminSettingsPage.tsx (Updated)
- ✅ Added import for AdminSettingsCommissionSettings
- ✅ Added case handler for 'commission-settings' category

### 4. **Deposit Amount Update**

- ✅ **SetupWizardPage.tsx:**
  - Step 7 deposit changed from 100.0 to 50.0 (RM50)
  
- ✅ **src/seeds/data/default-branch.ts:**
  - DEFAULT_BRANCH.depositAmount changed to 50.0
  
- ✅ **AdminSettingsDepositSettings.tsx:**
  - Default form value set to 50.0
  - Displays RM50 in all examples

### 5. **Registered Customers Page**

#### RegisteredCustomersPage.tsx (New)
- ✅ **Location:** `/registered-customers`
- ✅ **Features:**
  - List all registered customers in branch
  - Search by email or name (real-time)
  - **Email column is sortable** (ascending/descending)
  - Name column is not sortable
  - Phone column is not sortable
  
- ✅ **Hidden Phone Numbers:**
  - Masked format: `●●●●` + last 4 digits
  - Eye icon toggle to reveal full phone
  - Click icon to show/hide (per customer)
  
- ✅ **Display Columns:**
  - Email (sortable by clicking header)
  - Name (unsortable)
  - Phone (masked, toggleable with eye icon)
  - Total Reservations (count)
  - Loyalty Points (badge display)
  
- ✅ **Dark Theme:**
  - All colors use CSS variables
  - Proper contrast for accessibility
  - Loyalty points badge with accent colors
  
- ✅ **API Integration:**
  - GET `/api/admin/v1/branches/:id/customers/registered`

### 6. **One-Time Customers Page**

#### OneTimeCustomersPage.tsx (New)
- ✅ **Location:** `/one-time-customers`
- ✅ **Purpose:** Instant booking without registration (email as primary key)
- ✅ **Features:**
  - List all one-time customers
  - Search by email or name (real-time)
  - **Email column is sortable** (ascending/descending)
  - Name column is not sortable
  - Phone column is not sortable
  
- ✅ **Hidden Phone Numbers:**
  - Same masking as registered customers
  - Eye icon toggle per customer
  
- ✅ **Customer Creation:**
  - **+ Add Customer** button
  - Inline form with fields:
    - Name
    - Email (primary key)
    - Phone
  - Grid layout with responsive design
  
- ✅ **Display Columns:**
  - Email (sortable)
  - Name (unsortable)
  - Phone (masked, toggleable)
  - Booking Count
  - Last Booking Date (formatted, or '—' if none)
  
- ✅ **Dark Theme:**
  - All styling uses CSS variables
  - Create form integrated in header area
  - Consistent with app theme
  
- ✅ **API Integration:**
  - GET `/api/admin/v1/branches/:id/customers/one-time`
  - POST `/api/admin/v1/branches/:id/customers/one-time`

### 7. **Navigation Updates**

#### App.tsx (Updated)
- ✅ Added imports:
  ```typescript
  import RegisteredCustomersPage from './pages/RegisteredCustomersPage';
  import OneTimeCustomersPage from './pages/OneTimeCustomersPage';
  ```
  
- ✅ Added navigation links in Nav() function:
  - `/registered-customers` → "Registered Customers"
  - `/one-time-customers` → "One-Time Customers"
  
- ✅ Added routes in Dashboard():
  - `<Route path="/registered-customers" element={<RegisteredCustomersPage />} />`
  - `<Route path="/one-time-customers" element={<OneTimeCustomersPage />} />`

---

## 🎨 Dark Theme Implementation

All new components follow the established dark theme color system:

```css
/* Backgrounds */
--bg-surface:    #0f172a
--bg-elevated:   #1e293b
--bg-hover:      #1e2d45
--bg-input:      #162032

/* Text */
--text-primary:   #f1f5f9
--text-secondary: #94a3b8
--text-muted:     #475569

/* Accent (Orange) */
--accent:        #e85d26
--accent-hover:  #f97316
--accent-subtle: rgba(232,93,38,0.15)
--accent-border: rgba(232,93,38,0.35)

/* Status */
--status-confirmed-*:  Blue tones
--status-seated-*:     Green tones
--status-cancelled-*:  Red tones
--status-no-show-*:    Amber tones
```

---

## 📊 File Structure

```
client/sneat-dashboard/src/
├── pages/
│   ├── RegisteredCustomersPage.tsx    (New)
│   └── OneTimeCustomersPage.tsx       (New)
├── components/admin-settings/
│   ├── AdminSettingsNav.css           (Fixed)
│   ├── AdminSettingsNav.tsx           (Updated)
│   ├── AdminSettingsPage.tsx          (Updated)
│   ├── AdminSettingsStaffAccounts.tsx (Enhanced)
│   ├── AdminSettingsDepositSettings.tsx (Fixed)
│   └── AdminSettingsCommissionSettings.tsx (New)
└── App.tsx                             (Updated)
```

---

## 🔌 Required Backend Endpoints

The frontend is ready and expects the following backend API endpoints:

### Staff Management
```
GET    /api/admin/v1/branches/:id/staff
POST   /api/admin/v1/branches/:id/staff
```

### Registered Customers
```
GET    /api/admin/v1/branches/:id/customers/registered
Response: { customers: Array<RegisteredCustomer> }
```

### One-Time Customers
```
GET    /api/admin/v1/branches/:id/customers/one-time
POST   /api/admin/v1/branches/:id/customers/one-time
```

### Commission Settings
```
GET    /api/admin/v1/branches/:id/commission-settings
PATCH  /api/admin/v1/branches/:id/commission-settings
```

### Deposit Settings
```
GET    /api/admin/v1/branches/:id/deposit-settings
PATCH  /api/admin/v1/branches/:id/deposit-settings
```

---

## ✅ Verification Checklist

- [x] AdminSettingsNav CSS matches component class names
- [x] All hardcoded colors replaced with CSS variables
- [x] Dark theme works across all admin settings pages
- [x] Staff creation form with role selection
- [x] Commission settings with flat and tiered modes
- [x] RegisteredCustomersPage created with email sorting
- [x] OneTimeCustomersPage created with customer creation
- [x] Hidden phone numbers with eye-icon toggle on both pages
- [x] Name and phone columns unsortable (email sortable only)
- [x] RM50 deposit applied in SetupWizard, seeds, and admin page
- [x] Navigation links added to App.tsx
- [x] Routes configured in App.tsx
- [x] All components properly styled for dark theme
- [x] API endpoints expected in frontend match interface definitions

---

## 🚀 Next Steps

1. **Backend Implementation:**
   - Create staff management endpoints in `src/routes/admin/staff.routes.ts`
   - Create customer management endpoints (new file or extend existing)
   - Create commission settings endpoints in `src/routes/commission.routes.ts`
   - Implement database queries for customer retrieval and creation

2. **Testing:**
   - Test all admin settings pages in dark theme
   - Verify staff creation with different roles
   - Test commission settings with flat and tiered modes
   - Test customer pages with search and sorting
   - Test phone number reveal/hide toggle
   - Verify API responses match expected interface

3. **Database Schema:**
   - Ensure `customers` table has proper columns
   - Verify `staff_accounts` table structure
   - Check `commission_settings` storage (JSONB?)

---

## 📝 Implementation Notes

- **Email as Primary Key (One-Time Customers):** The frontend assumes email can uniquely identify one-time customers. This allows instant booking without user registration.

- **Hidden Phone Numbers:** Phone numbers are masked by default and revealed with an eye-icon toggle. This is a UX feature for data privacy.

- **Sortable Columns:** Only the email column is made sortable. Name and phone columns use `pointer-events: none` to prevent sorting, maintaining data integrity.

- **Dark Theme Consistency:** All new components use CSS variables from `global.css` instead of hardcoded colors. This ensures consistency with the app theme.

- **Commission Tiers:** Tiered commission allows restaurants to incentivize higher-value reservations by offering increasing commission rates.

---

**Status:** ✅ Frontend Complete - Ready for Backend Integration  
**Last Updated:** April 18, 2026
