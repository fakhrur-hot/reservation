import { RestaurantProfileData } from '../../types/setup.types';

interface Step1RestaurantProfileProps {
  data: RestaurantProfileData;
  onChange: (data: RestaurantProfileData) => void;
  error?: string | null;
}

const TIMEZONES = [
  'Asia/Kuala_Lumpur',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'UTC',
];

const CURRENCIES = ['MYR', 'SGD', 'THB', 'HKD', 'CNY', 'JPY', 'USD'];

function generateBranchCode(restaurantName: string): string {
  return restaurantName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 10);
}

export default function Step1RestaurantProfile({
  data,
  onChange,
  error,
}: Step1RestaurantProfileProps) {
  const handleRestaurantNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    const newData = { ...data, restaurantName: name };
    // Auto-suggest branch code if it's empty or was auto-generated
    if (!data.branchCode || data.branchCode === generateBranchCode(data.restaurantName)) {
      newData.branchCode = generateBranchCode(name);
    }
    onChange(newData);
  };

  return (
    <div className="setup-step">
      <h2>Restaurant Profile</h2>
      <p className="step-description">Tell us about your restaurant</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-group">
        <label>
          Restaurant Name <span className="required">*</span>
        </label>
        <input
          type="text"
          value={data.restaurantName}
          onChange={handleRestaurantNameChange}
          placeholder="e.g., sejiwa Restaurant"
          className={error?.includes('Restaurant name') ? 'error' : ''}
        />
      </div>

      <div className="form-group">
        <label>
          Branch Code <span className="required">*</span>
        </label>
        <input
          type="text"
          value={data.branchCode}
          onChange={e => onChange({ ...data, branchCode: e.target.value.toUpperCase() })}
          placeholder="e.g., QITCH01"
          maxLength={10}
          className={error?.includes('Branch code') ? 'error' : ''}
        />
        <small>Auto-suggested from restaurant name. Uppercase letters and digits only.</small>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>
            Street Address <span className="required">*</span>
          </label>
          <input
            type="text"
            value={data.street}
            onChange={e => onChange({ ...data, street: e.target.value })}
            placeholder="e.g., 123 Jalan Bukit Bintang"
            className={error?.includes('Street') ? 'error' : ''}
          />
        </div>

        <div className="form-group">
          <label>
            City <span className="required">*</span>
          </label>
          <input
            type="text"
            value={data.city}
            onChange={e => onChange({ ...data, city: e.target.value })}
            placeholder="e.g., Kuala Lumpur"
            className={error?.includes('City') ? 'error' : ''}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>
            State <span className="required">*</span>
          </label>
          <input
            type="text"
            value={data.state}
            onChange={e => onChange({ ...data, state: e.target.value })}
            placeholder="e.g., Selangor"
            className={error?.includes('State') ? 'error' : ''}
          />
        </div>

        <div className="form-group">
          <label>
            Postcode <span className="required">*</span>
          </label>
          <input
            type="text"
            value={data.postcode}
            onChange={e => onChange({ ...data, postcode: e.target.value })}
            placeholder="e.g., 50050"
            className={error?.includes('Postcode') ? 'error' : ''}
          />
        </div>
      </div>

      <div className="form-group">
        <label>
          Country <span className="required">*</span>
        </label>
        <input
          type="text"
          value={data.country}
          onChange={e => onChange({ ...data, country: e.target.value })}
          placeholder="e.g., Malaysia"
          className={error?.includes('Country') ? 'error' : ''}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>
            Phone Number <span className="required">*</span>
          </label>
          <input
            type="tel"
            value={data.phone}
            onChange={e => onChange({ ...data, phone: e.target.value })}
            placeholder="e.g., +60 3 1234 5678"
            className={error?.includes('Phone') ? 'error' : ''}
          />
        </div>

        <div className="form-group">
          <label>Website (Optional)</label>
          <input
            type="url"
            value={data.website || ''}
            onChange={e => onChange({ ...data, website: e.target.value })}
            placeholder="e.g., https://sejiwa.com"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>
            Timezone <span className="required">*</span>
          </label>
          <select
            value={data.timezone}
            onChange={e => onChange({ ...data, timezone: e.target.value })}
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>
            Currency <span className="required">*</span>
          </label>
          <select
            value={data.currency}
            onChange={e => onChange({ ...data, currency: e.target.value })}
          >
            {CURRENCIES.map(curr => (
              <option key={curr} value={curr}>
                {curr}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>Operating Mode</label>
        <input
          type="text"
          value="TABLE_ONLY"
          disabled
          title="Fixed for Stage 1"
        />
        <small>Fixed for Stage 1. Table-based reservations only.</small>
      </div>
    </div>
  );
}

