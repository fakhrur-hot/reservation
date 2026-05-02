import './AdminSettingsNav.css';

export interface SettingsCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'restaurant-profile',
    label: 'Restaurant Profile',
    icon: '🏪',
    description: 'Name, address, contact info',
  },
  {
    id: 'operating-hours',
    label: 'Operating Hours',
    icon: '⏰',
    description: 'Business hours & cutoff times',
  },
  {
    id: 'sections-tables',
    label: 'Sections & Tables',
    icon: '🪑',
    description: 'Dining areas and table layout',
  },
  {
    id: 'staff-accounts',
    label: 'Staff Accounts',
    icon: '👥',
    description: 'Admin and manager accounts',
  },
  {
    id: 'email-settings',
    label: 'Email Settings',
    icon: '📧',
    description: 'SMTP configuration',
  },
  {
    id: 'deposit-settings',
    label: 'Deposit Settings',
    icon: '💰',
    description: 'Booking deposits & refunds',
  },
  {
    id: 'payment-settings',
    label: 'Payment Gateway',
    icon: '💳',
    description: 'Billplz (FPX) & iPay88 credentials',
  },
  {
    id: 'commission-settings',
    label: 'Commission Settings',
    icon: '📊',
    description: 'Decoration & cake vendor commissions',
  },
  {
    id: 'api-settings',
    label: 'API & System',
    icon: '🔌',
    description: 'Operating mode, serial key, API info',
  },
  {
    id: 'theme',
    label: 'Theme & Colours',
    icon: '🎨',
    description: 'Customise dashboard colour palette',
  },
];

interface AdminSettingsNavProps {
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  searchQuery?: string;
}

export default function AdminSettingsNav({
  activeCategory,
  onCategoryChange,
  searchQuery = '',
}: AdminSettingsNavProps) {
  const filteredCategories = SETTINGS_CATEGORIES.filter(
    (cat) =>
      cat.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <nav className="admin-settings-nav">
      <div className="nav-header">
        <h3>Settings</h3>
      </div>

      <div className="nav-categories">
        {filteredCategories.length > 0 ? (
          filteredCategories.map((category) => (
            <button
              key={category.id}
              className={`nav-item ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => onCategoryChange(category.id)}
              title={category.description}
            >
              <span className="nav-icon">{category.icon}</span>
              <div className="nav-text">
                <div className="nav-label">{category.label}</div>
                <div className="nav-desc">{category.description}</div>
              </div>
            </button>
          ))
        ) : (
          <div className="nav-empty">No categories found</div>
        )}
      </div>
    </nav>
  );
}
