import React, { useState, useEffect } from 'react';
import './VendorManagementModal.css';

interface Vendor {
  id: string;
  vendor_name: string;
  vendor_type: string;
  merchant_id: string;
  commission_type: string;
  commission_value: number;
  status: string;
}

interface MenuItem {
  id: string;
  item_name: string;
  category: string;
  cost: number;
  quantity_available: number;
  commission_override: boolean;
  commission_value?: number;
}

interface VendorManagementModalProps {
  branchId: string;
  isOpen: boolean;
  onClose: () => void;
  onVendorCreated: () => void;
}

export const VendorManagementModal: React.FC<VendorManagementModalProps> = ({
  branchId,
  isOpen,
  onClose,
  onVendorCreated
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchVendors();
    }
  }, [isOpen, branchId]);

  useEffect(() => {
    if (selectedVendor && !showCreateForm) {
      fetchMenuItems(selectedVendor.id);
    }
  }, [selectedVendor, showCreateForm]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/v1/branches/${branchId}/vendors`);
      if (response.ok) {
        const data = await response.json();
        setVendors(data);
        if (data.length > 0) {
          setSelectedVendor(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch vendors:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenuItems = async (vendorId: string) => {
    try {
      const response = await fetch(
        `/api/admin/v1/branches/${branchId}/vendors/${vendorId}/menu-items`
      );
      if (response.ok) {
        const data = await response.json();
        setMenuItems(data);
      }
    } catch (error) {
      console.error('Failed to fetch menu items:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content vendor-management-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Vendor Account Management</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="vendor-list-panel">
            <h3>Vendors</h3>
            <div className="vendor-list">
              {vendors.map(vendor => (
                <div
                  key={vendor.id}
                  className={`vendor-item ${selectedVendor?.id === vendor.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedVendor(vendor);
                    setShowCreateForm(false);
                  }}
                >
                  {selectedVendor?.id === vendor.id && <span className="checkmark">☑</span>}
                  {selectedVendor?.id !== vendor.id && <span className="checkbox">☐</span>}
                  <span className="vendor-name">{vendor.vendor_name}</span>
                </div>
              ))}
            </div>
            <button
              className="add-vendor-btn"
              onClick={() => setShowCreateForm(true)}
            >
              + Add New Vendor
            </button>
          </div>

          <div className="vendor-profile-panel">
            {loading ? (
              <div className="loading">Loading...</div>
            ) : selectedVendor && !showCreateForm ? (
              <VendorProfile
                vendor={selectedVendor}
                menuItems={menuItems}
                branchId={branchId}
                onMenuItemsUpdated={() => fetchMenuItems(selectedVendor.id)}
              />
            ) : showCreateForm ? (
              <CreateVendorForm
                branchId={branchId}
                onSuccess={() => {
                  setShowCreateForm(false);
                  fetchVendors();
                  onVendorCreated();
                }}
              />
            ) : (
              <div className="empty-state">Select a vendor or create a new one</div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save">Save Changes</button>
        </div>
      </div>
    </div>
  );
};

// Vendor Profile Component
const VendorProfile: React.FC<{
  vendor: Vendor;
  menuItems: MenuItem[];
  branchId: string;
  onMenuItemsUpdated: () => void;
}> = ({ vendor, menuItems, branchId, onMenuItemsUpdated }) => {
  const totalValue = menuItems.reduce((sum, item) => sum + (item.cost * item.quantity_available), 0);
  const totalCommission = menuItems.reduce((sum, item) => {
    const commission = (item.cost * vendor.commission_value) / 100;
    return sum + (commission * item.quantity_available);
  }, 0);

  return (
    <div className="vendor-profile">
      <h3>Vendor Profile: {vendor.vendor_name}</h3>

      <div className="profile-details">
        <div className="detail-row">
          <span className="label">Type:</span>
          <span className="value">{vendor.vendor_type}</span>
        </div>
        <div className="detail-row">
          <span className="label">Merchant ID:</span>
          <span className="value">{vendor.merchant_id}</span>
        </div>
        <div className="detail-row">
          <span className="label">Commission:</span>
          <span className="value">
            {vendor.commission_value}% ({vendor.commission_type})
          </span>
        </div>
        <div className="detail-row">
          <span className="label">Status:</span>
          <span className={`status ${vendor.status}`}>{vendor.status}</span>
        </div>
      </div>

      <div className="menu-items-section">
        <h4>Services & Menu Items</h4>
        {menuItems.length > 0 ? (
          <table className="menu-items-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Cost</th>
                <th>Commission</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {menuItems.map(item => {
                const commission = (item.cost * vendor.commission_value) / 100;
                return (
                  <tr key={item.id}>
                    <td>{item.item_name}</td>
                    <td>{item.category}</td>
                    <td>{item.quantity_available}</td>
                    <td>RM {item.cost.toFixed(2)}</td>
                    <td>RM {commission.toFixed(2)}</td>
                    <td>
                      <button className="btn-edit">Edit</button>
                      <button className="btn-delete">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-items">No menu items yet</div>
        )}
        <button className="btn-add-item">+ Add New Item</button>
      </div>

      <div className="inventory-summary">
        <h4>Inventory Summary</h4>
        <div className="summary-row">
          <span>Total Items:</span>
          <span className="value">{menuItems.length}</span>
        </div>
        <div className="summary-row">
          <span>Total Quantity:</span>
          <span className="value">{menuItems.reduce((sum, item) => sum + item.quantity_available, 0)} units</span>
        </div>
        <div className="summary-row">
          <span>Total Value:</span>
          <span className="value">RM {totalValue.toFixed(2)}</span>
        </div>
        <div className="summary-row">
          <span>Total Commission:</span>
          <span className="value">RM {totalCommission.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

// Create Vendor Form Component
const CreateVendorForm: React.FC<{
  branchId: string;
  onSuccess: () => void;
}> = ({ branchId, onSuccess }) => {
  const [formData, setFormData] = useState({
    vendorName: '',
    vendorType: 'decoration',
    merchantId: '',
    commissionType: 'percentage',
    commissionValue: 0,
    contactEmail: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(
        `/api/admin/v1/branches/${branchId}/vendors`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        }
      );

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create vendor');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to create vendor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="create-vendor-form" onSubmit={handleSubmit}>
      <h3>Create New Vendor</h3>

      {error && <div className="error-message">{error}</div>}

      <div className="form-group">
        <label>Vendor Name *</label>
        <input
          type="text"
          value={formData.vendorName}
          onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
          required
          placeholder="e.g., Decoration Vendor Co."
        />
      </div>

      <div className="form-group">
        <label>Vendor Type *</label>
        <select
          value={formData.vendorType}
          onChange={(e) => setFormData({ ...formData, vendorType: e.target.value })}
        >
          <option value="decoration">Decoration</option>
          <option value="cake">Cake</option>
          <option value="beverage">Beverage</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="form-group">
        <label>Merchant ID *</label>
        <input
          type="text"
          value={formData.merchantId}
          onChange={(e) => setFormData({ ...formData, merchantId: e.target.value })}
          required
          placeholder="e.g., MER-DEC-001"
        />
      </div>

      <div className="form-group">
        <label>Commission Type *</label>
        <select
          value={formData.commissionType}
          onChange={(e) => setFormData({ ...formData, commissionType: e.target.value })}
        >
          <option value="percentage">Percentage (%)</option>
          <option value="fixed">Fixed (RM)</option>
        </select>
      </div>

      <div className="form-group">
        <label>Commission Value *</label>
        <input
          type="number"
          value={formData.commissionValue}
          onChange={(e) => setFormData({ ...formData, commissionValue: parseFloat(e.target.value) })}
          required
          placeholder="e.g., 10"
          min="0"
          step="0.01"
        />
      </div>

      <div className="form-group">
        <label>Contact Email (Optional)</label>
        <input
          type="email"
          value={formData.contactEmail}
          onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
          placeholder="vendor@example.com"
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn-create" disabled={loading}>
          {loading ? 'Creating...' : 'Create Vendor'}
        </button>
      </div>
    </form>
  );
};
