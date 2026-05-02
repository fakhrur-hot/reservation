/**
 * Returning Guest Recognition Component
 *
 * Displays when a customer's phone number is found in the system.
 * Shows customer name and profile, with option to proceed with recognition.
 *
 * Requirements: 3.12
 */

import React from 'react';
import './ReturningGuestBadge.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  preferredLanguage?: string;
  dietaryRestrictions?: string;
  allergies?: string;
  communicationPreference?: string;
}

interface ReturningGuestBadgeProps {
  customer: CustomerProfile;
  onConfirm?: () => void;
  onDismiss?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────────

export default function ReturningGuestBadge({
  customer,
  onConfirm,
  onDismiss,
}: ReturningGuestBadgeProps) {
  return (
    <div className="returning-guest-badge">
      <div className="badge-content">
        <div className="badge-icon">⭐</div>
        <div className="badge-info">
          <p className="badge-title">Welcome Back!</p>
          <p className="badge-name">{customer.name}</p>
          <p className="badge-subtitle">Returning Guest</p>
        </div>
      </div>

      <div className="badge-actions">
        {onConfirm && (
          <button
            className="badge-btn badge-btn--confirm"
            onClick={onConfirm}
            aria-label={`Use profile for ${customer.name}`}
          >
            Use This Profile
          </button>
        )}
        {onDismiss && (
          <button
            className="badge-btn badge-btn--dismiss"
            onClick={onDismiss}
            aria-label="Dismiss returning guest"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
