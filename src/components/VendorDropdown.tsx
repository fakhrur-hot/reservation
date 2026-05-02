import React, { useState, useEffect, useRef } from 'react';
import './VendorDropdown.css';

interface Vendor {
  id: string;
  vendor_name: string;
  vendor_type: string;
  status: string;
}

interface VendorDropdownProps {
  branchId: string;
  selectedVendorId: string;
  onVendorSelect: (vendorId: string) => void;
  onManageVendors: () => void;
}

export const VendorDropdown: React.FC<VendorDropdownProps> = ({
  branchId,
  selectedVendorId,
  onVendorSelect,
  onManageVendors
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchVendors();
  }, [branchId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/v1/branches/${branchId}/vendors`);
      if (response.ok) {
        const data = await response.json();
        setVendors(data);
      }
    } catch (error) {
      console.error('Failed to fetch vendors:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedVendor = selectedVendorId === 'restaurant'
    ? { id: 'restaurant', vendor_name: 'Restaurant (Default)', vendor_type: 'restaurant', status: 'active' }
    : vendors.find(v => v.id === selectedVendorId);

  const displayName = selectedVendor?.vendor_name || 'Select Vendor';

  return (
    <div className="vendor-dropdown" ref={dropdownRef}>
      <button
        className="dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{displayName}</span>
        <span className="dropdown-arrow">▼</span>
      </button>

      {isOpen && (
        <div className="dropdown-menu" role="listbox">
          {/* Restaurant (Default) */}
          <div
            className={`dropdown-item ${selectedVendorId === 'restaurant' ? 'active' : ''}`}
            onClick={() => {
              onVendorSelect('restaurant');
              setIsOpen(false);
            }}
            role="option"
            aria-selected={selectedVendorId === 'restaurant'}
          >
            {selectedVendorId === 'restaurant' && <span className="checkmark">✓</span>}
            <span>Restaurant (Default)</span>
          </div>

          {/* Existing Vendors */}
          {vendors.length > 0 && (
            <>
              <div className="dropdown-divider" />
              {vendors.map(vendor => (
                <div
                  key={vendor.id}
                  className={`dropdown-item ${selectedVendorId === vendor.id ? 'active' : ''}`}
                  onClick={() => {
                    onVendorSelect(vendor.id);
                    setIsOpen(false);
                  }}
                  role="option"
                  aria-selected={selectedVendorId === vendor.id}
                >
                  {selectedVendorId === vendor.id && <span className="checkmark">✓</span>}
                  <span>{vendor.vendor_name}</span>
                  <span className="vendor-type">({vendor.vendor_type})</span>
                </div>
              ))}
            </>
          )}

          {/* Create Vendor Section */}
          <div className="dropdown-divider" />
          <div className="dropdown-action">
            <button
              className="create-vendor-btn"
              onClick={() => {
                onManageVendors();
                setIsOpen(false);
              }}
            >
              + CREATE VENDOR
            </button>
            <button
              className="manage-link"
              onClick={() => {
                onManageVendors();
                setIsOpen(false);
              }}
            >
              → Manage Vendors
            </button>
          </div>
        </div>
      )}

      {loading && <div className="dropdown-loading">Loading...</div>}
    </div>
  );
};
