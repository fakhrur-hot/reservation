import { useState, useEffect } from 'react';
import './AdminSettingsCategory.css';

interface RestaurantProfileData {
  restaurantName: string;
  branchCode: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
  website?: string;
  timezone: string;
  currency: string;
}

const BASE = '/api';
function getHeaders(): HeadersInit {
  const token = localStorage.getItem('staff_token');
  const branchId = localStorage.getItem('branch_id');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(branchId ? { 'X-Branch-ID': branchId } : {}),
  };
}

export default function AdminSettingsRestaurantProfile() {
  const branchId = localStorage.getItem('branch_id') ?? '';

  const [form, setForm] = useState<RestaurantProfileData>({
    restaurantName: '', branchCode: '', street: '', city: '',
    state: '', postcode: '', country: '', phone: '',
    website: '', timezone: 'Asia/Kuala_Lumpur', currency: 'MYR',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    fetch(`${BASE}/admin/v1/branches/${branchId}/profile`, { headers: getHeaders() })
      .then(r => r.json())
      .then(data => {
        setForm({
          restaurantName: data.restaurantName || '',
          branchCode: data.branchCode || '',
          street: data.street || '',
          city: data.city || '',
          state: data.state || '',
          postcode: data.postcode || '',
          country: data.country || '',
          phone: data.phone || '',
          website: data.website || '',
          timezone: data.timezone || 'Asia/Kuala_Lumpur',
          currency: data.currency || 'MYR',
        });
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [branchId]);

  const handleChange = (field: keyof RestaurantProfileData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const address = `${form.street}, ${form.city}, ${form.state} ${form.postcode}, ${form.country}`;
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/profile`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          restaurantName: form.restaurantName,
          branchCode: form.branchCode,
          address,
          phone: form.phone,
          website: form.website,
          timezone: form.timezone,
          currency: form.currency,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="settings-category"><div style={{padding:'32px',textAlign:'center',color:'#64748b'}}>Loading…</div></div>;

  return (
    <div className="settings-category">
      <div className="category-header">
        <h2>Restaurant Profile</h2>
        <p>Update your restaurant's basic information</p>
      </div>

      <div className="category-content">
        <div className="form-section">
          <h3>Basic Information</h3>

          <div className="form-group">
            <label>Restaurant Name *</label>
            <input
              type="text"
              value={form.restaurantName}
              onChange={(e) => handleChange('restaurantName', e.target.value)}
              placeholder="e.g., Qitchen Restaurant"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Branch Code *</label>
              <input
                type="text"
                value={form.branchCode}
                onChange={(e) => handleChange('branchCode', e.target.value.toUpperCase())}
                placeholder="e.g., QITCH01"
                maxLength={10}
              />
              <small>Uppercase letters and digits only</small>
            </div>

            <div className="form-group">
              <label>Phone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="e.g., +60 3 1234 5678"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Website</label>
            <input
              type="url"
              value={form.website || ''}
              onChange={(e) => handleChange('website', e.target.value)}
              placeholder="e.g., https://qitchen.com"
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Address</h3>

          <div className="form-group">
            <label>Street Address *</label>
            <input
              type="text"
              value={form.street}
              onChange={(e) => handleChange('street', e.target.value)}
              placeholder="e.g., 123 Jalan Bukit Bintang"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>City *</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="e.g., Kuala Lumpur"
              />
            </div>

            <div className="form-group">
              <label>State *</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => handleChange('state', e.target.value)}
                placeholder="e.g., Selangor"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Postcode *</label>
              <input
                type="text"
                value={form.postcode}
                onChange={(e) => handleChange('postcode', e.target.value)}
                placeholder="e.g., 50050"
              />
            </div>

            <div className="form-group">
              <label>Country *</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => handleChange('country', e.target.value)}
                placeholder="e.g., Malaysia"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Regional Settings</h3>

          <div className="form-row">
            <div className="form-group">
              <label>Timezone *</label>
              <select
                value={form.timezone}
                onChange={(e) => handleChange('timezone', e.target.value)}
              >
                <option value="Asia/Kuala_Lumpur">Asia/Kuala Lumpur (UTC+8)</option>
                <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
                <option value="Asia/Bangkok">Asia/Bangkok (UTC+7)</option>
                <option value="Asia/Jakarta">Asia/Jakarta (UTC+7)</option>
                <option value="Asia/Hong_Kong">Asia/Hong Kong (UTC+8)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Currency *</label>
              <select
                value={form.currency}
                onChange={(e) => handleChange('currency', e.target.value)}
              >
                <option value="MYR">MYR - Malaysian Ringgit</option>
                <option value="SGD">SGD - Singapore Dollar</option>
                <option value="THB">THB - Thai Baht</option>
                <option value="IDR">IDR - Indonesian Rupiah</option>
                <option value="HKD">HKD - Hong Kong Dollar</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="category-footer">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">Settings saved successfully</div>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
