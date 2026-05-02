/**
 * Create/Edit Promo Code Form Component
 *
 * Handles creation and editing of promo codes with type-specific fields.
 * Supports all 6 code types:
 * - Priority: Lead-time override (1h)
 * - Turnover: Time window restriction
 * - VIP: Session duration override (3h)
 * - Affiliate: Booking source tracking
 * - Group: Minimum party size
 * - Discount: Percentage or fixed amount
 */

import React, { useState, useEffect } from 'react';
import { createPromoCode, updatePromoCode } from '../api';
import type { PromoCode, PromoCodeType } from '../types';
import './CreatePromoCodeForm.css';

interface CreatePromoCodeFormProps {
  editingCode?: PromoCode | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormState {
  code: string;
  type: PromoCodeType;
  description: string;

  // Priority code
  overrideLeadTime: boolean;

  // Turnover code
  validFromTime: string;
  validToTime: string;
  validDaysOfWeek: string;

  // VIP code
  forceSessionDuration: string;

  // Discount code
  discountType: 'percentage' | 'fixed';
  discountValue: string;

  // Group code
  minPartySize: string;

  // Affiliate code
  affiliateId: string;

  // Validity
  validFrom: string;
  validTo: string;
  maxUses: string;
}

interface FormErrors {
  code?: string;
  type?: string;
  validFromTime?: string;
  validToTime?: string;
  validDaysOfWeek?: string;
  forceSessionDuration?: string;
  discountType?: string;
  discountValue?: string;
  minPartySize?: string;
  affiliateId?: string;
  validFrom?: string;
  validTo?: string;
  maxUses?: string;
}

const PROMO_TYPES: PromoCodeType[] = ['priority', 'turnover', 'vip', 'affiliate', 'group', 'discount'];

const TYPE_LABELS: Record<PromoCodeType, string> = {
  priority: '⚡ Priority (1h Lead-time)',
  turnover: '🔄 Turnover (Time Window)',
  vip: '👑 VIP (3h Session)',
  affiliate: '📊 Affiliate (Tracking)',
  group: '👥 Group (Min Party Size)',
  discount: '💰 Discount (% or Fixed)',
};

const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * Validate form state and return errors.
 */
function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};

  // Code validation
  if (!form.code || form.code.trim().length === 0) {
    errors.code = 'Code is required';
  } else if (form.code.length > 50) {
    errors.code = 'Code must be less than 50 characters';
  }

  // Type validation
  if (!form.type) {
    errors.type = 'Type is required';
  }

  // Type-specific validation
  switch (form.type) {
    case 'turnover':
      if (!form.validFromTime) {
        errors.validFromTime = 'Start time is required for Turnover code';
      }
      if (!form.validToTime) {
        errors.validToTime = 'End time is required for Turnover code';
      }
      if (form.validFromTime && form.validToTime && form.validFromTime >= form.validToTime) {
        errors.validToTime = 'End time must be after start time';
      }
      break;

    case 'vip':
      if (form.forceSessionDuration && parseInt(form.forceSessionDuration, 10) <= 0) {
        errors.forceSessionDuration = 'Session duration must be greater than 0';
      }
      break;

    case 'discount':
      if (!form.discountType) {
        errors.discountType = 'Discount type is required';
      }
      if (!form.discountValue || parseFloat(form.discountValue) <= 0) {
        errors.discountValue = 'Discount value must be greater than 0';
      }
      break;

    case 'group':
      if (form.minPartySize && parseInt(form.minPartySize, 10) < 2) {
        errors.minPartySize = 'Minimum party size must be at least 2';
      }
      break;

    case 'affiliate':
      if (!form.affiliateId || form.affiliateId.trim().length === 0) {
        errors.affiliateId = 'Affiliate ID is required';
      }
      break;
  }

  // Validity dates validation
  if (form.validFrom && form.validTo) {
    const from = new Date(form.validFrom);
    const to = new Date(form.validTo);
    if (from >= to) {
      errors.validTo = 'Valid to date must be after valid from date';
    }
  }

  // Max uses validation
  if (form.maxUses && parseInt(form.maxUses, 10) <= 0) {
    errors.maxUses = 'Max uses must be greater than 0';
  }

  return errors;
}

export default function CreatePromoCodeForm({
  editingCode,
  onSuccess,
  onCancel,
}: CreatePromoCodeFormProps) {
  const [form, setForm] = useState<FormState>({
    code: editingCode?.code ?? '',
    type: editingCode?.type ?? 'priority',
    description: editingCode?.description ?? '',

    overrideLeadTime: editingCode?.overrideLeadTime ?? true,

    validFromTime: editingCode?.validFromTime ?? '',
    validToTime: editingCode?.validToTime ?? '',
    validDaysOfWeek: editingCode?.validDaysOfWeek ?? '',

    forceSessionDuration: editingCode?.forceSessionDuration?.toString() ?? '180',

    discountType: editingCode?.discountType ?? 'percentage',
    discountValue: editingCode?.discountValue?.toString() ?? '',

    minPartySize: editingCode?.minPartySize?.toString() ?? '6',

    affiliateId: editingCode?.affiliateId ?? '',

    validFrom: editingCode?.validFrom ? new Date(editingCode.validFrom).toISOString().split('T')[0] : '',
    validTo: editingCode?.validTo ? new Date(editingCode.validTo).toISOString().split('T')[0] : '',
    maxUses: editingCode?.maxUses?.toString() ?? '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleChange = (field: keyof FormState, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleTypeChange = (newType: PromoCodeType) => {
    handleChange('type', newType);
  };

  const handleDayToggle = (day: string) => {
    const days = form.validDaysOfWeek.split(',').map((d) => d.trim());
    const newDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    handleChange('validDaysOfWeek', newDays.filter((d) => d).join(','));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    const newErrors = validateForm(form);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setSubmitError('');

    try {
      const payload = {
        code: form.code.toUpperCase().trim(),
        type: form.type,
        description: form.description || undefined,
        overrideLeadTime: form.type === 'priority' ? form.overrideLeadTime : undefined,
        validFromTime: form.type === 'turnover' ? form.validFromTime : undefined,
        validToTime: form.type === 'turnover' ? form.validToTime : undefined,
        validDaysOfWeek: form.type === 'turnover' ? form.validDaysOfWeek : undefined,
        forceSessionDuration: form.type === 'vip' ? parseInt(form.forceSessionDuration, 10) : undefined,
        discountType: form.type === 'discount' ? form.discountType : undefined,
        discountValue: form.type === 'discount' ? parseFloat(form.discountValue) : undefined,
        minPartySize: form.type === 'group' ? parseInt(form.minPartySize, 10) : undefined,
        affiliateId: form.type === 'affiliate' ? form.affiliateId : undefined,
        validFrom: form.validFrom || undefined,
        validTo: form.validTo || undefined,
        maxUses: form.maxUses ? parseInt(form.maxUses, 10) : undefined,
      };

      if (editingCode) {
        await updatePromoCode(editingCode.id, payload);
      } else {
        await createPromoCode(payload);
      }

      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save promo code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-promo-code-form">
      <form onSubmit={handleSubmit}>
        {submitError && (
          <div className="alert alert-error">
            <strong>Error:</strong> {submitError}
          </div>
        )}

        {/* Code Input */}
        <div className="form-group">
          <label htmlFor="code">
            Promo Code <span className="required">*</span>
          </label>
          <input
            id="code"
            type="text"
            value={form.code}
            onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
            placeholder="e.g., EARLYBIRD"
            maxLength={50}
            disabled={!!editingCode}
            className={errors.code ? 'error' : ''}
          />
          {errors.code && <span className="error-message">{errors.code}</span>}
          <div className="form-hint">Uppercase letters and numbers only. Cannot be changed after creation.</div>
        </div>

        {/* Type Selector */}
        <div className="form-group">
          <label htmlFor="type">
            Promo Code Type <span className="required">*</span>
          </label>
          <select
            id="type"
            value={form.type}
            onChange={(e) => handleTypeChange(e.target.value as PromoCodeType)}
            className={errors.type ? 'error' : ''}
          >
            {PROMO_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          {errors.type && <span className="error-message">{errors.type}</span>}
          <div className="form-hint">Choose the type of promo code and its behavior.</div>
        </div>

        {/* Description */}
        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="e.g., Early bird special for off-peak hours"
            maxLength={500}
          />
          <div className="form-hint">{form.description.length} / 500 characters</div>
        </div>

        {/* Type-Specific Fields */}

        {/* Priority Code Fields */}
        {form.type === 'priority' && (
          <div className="type-fields">
            <h3>Priority Code Settings</h3>
            <p className="type-info">Allows same-day or next-hour bookings by overriding the standard 24h/48h lead-time.</p>
            <div className="form-group checkbox">
              <input
                id="overrideLeadTime"
                type="checkbox"
                checked={form.overrideLeadTime}
                onChange={(e) => handleChange('overrideLeadTime', e.target.checked)}
              />
              <label htmlFor="overrideLeadTime">Override lead-time to 1 hour</label>
            </div>
          </div>
        )}

        {/* Turnover Code Fields */}
        {form.type === 'turnover' && (
          <div className="type-fields">
            <h3>Turnover Code Settings</h3>
            <p className="type-info">Restrict code usage to specific time windows and days to fill off-peak slots.</p>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="validFromTime">
                  Start Time <span className="required">*</span>
                </label>
                <input
                  id="validFromTime"
                  type="time"
                  value={form.validFromTime}
                  onChange={(e) => handleChange('validFromTime', e.target.value)}
                  className={errors.validFromTime ? 'error' : ''}
                />
                {errors.validFromTime && <span className="error-message">{errors.validFromTime}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="validToTime">
                  End Time <span className="required">*</span>
                </label>
                <input
                  id="validToTime"
                  type="time"
                  value={form.validToTime}
                  onChange={(e) => handleChange('validToTime', e.target.value)}
                  className={errors.validToTime ? 'error' : ''}
                />
                {errors.validToTime && <span className="error-message">{errors.validToTime}</span>}
              </div>
            </div>

            <div className="form-group">
              <label>Valid Days of Week</label>
              <div className="days-selector">
                {DAYS_OF_WEEK.map((day) => (
                  <label key={day} className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={form.validDaysOfWeek.includes(day)}
                      onChange={() => handleDayToggle(day)}
                    />
                    {day}
                  </label>
                ))}
              </div>
              {errors.validDaysOfWeek && <span className="error-message">{errors.validDaysOfWeek}</span>}
              <div className="form-hint">Leave empty to apply to all days.</div>
            </div>
          </div>
        )}

        {/* VIP Code Fields */}
        {form.type === 'vip' && (
          <div className="type-fields">
            <h3>VIP Code Settings</h3>
            <p className="type-info">Force 3-hour session duration even for daytime slots, and offer premium benefits.</p>

            <div className="form-group">
              <label htmlFor="forceSessionDuration">Session Duration (minutes)</label>
              <input
                id="forceSessionDuration"
                type="number"
                value={form.forceSessionDuration}
                onChange={(e) => handleChange('forceSessionDuration', e.target.value)}
                min="60"
                max="480"
                className={errors.forceSessionDuration ? 'error' : ''}
              />
              {errors.forceSessionDuration && <span className="error-message">{errors.forceSessionDuration}</span>}
              <div className="form-hint">Default is 180 minutes (3 hours). Range: 60-480 minutes.</div>
            </div>
          </div>
        )}

        {/* Affiliate Code Fields */}
        {form.type === 'affiliate' && (
          <div className="type-fields">
            <h3>Affiliate Code Settings</h3>
            <p className="type-info">Track booking sources for marketing ROI measurement.</p>

            <div className="form-group">
              <label htmlFor="affiliateId">
                Affiliate ID <span className="required">*</span>
              </label>
              <input
                id="affiliateId"
                type="text"
                value={form.affiliateId}
                onChange={(e) => handleChange('affiliateId', e.target.value)}
                placeholder="e.g., partner_123, influencer_abc"
                className={errors.affiliateId ? 'error' : ''}
              />
              {errors.affiliateId && <span className="error-message">{errors.affiliateId}</span>}
              <div className="form-hint">Unique identifier for the affiliate or marketing source.</div>
            </div>
          </div>
        )}

        {/* Group Code Fields */}
        {form.type === 'group' && (
          <div className="type-fields">
            <h3>Group Code Settings</h3>
            <p className="type-info">Validate minimum party size to encourage larger reservations.</p>

            <div className="form-group">
              <label htmlFor="minPartySize">Minimum Party Size</label>
              <input
                id="minPartySize"
                type="number"
                value={form.minPartySize}
                onChange={(e) => handleChange('minPartySize', e.target.value)}
                min="2"
                className={errors.minPartySize ? 'error' : ''}
              />
              {errors.minPartySize && <span className="error-message">{errors.minPartySize}</span>}
              <div className="form-hint">Default is 6 guests. Minimum is 2.</div>
            </div>
          </div>
        )}

        {/* Discount Code Fields */}
        {form.type === 'discount' && (
          <div className="type-fields">
            <h3>Discount Code Settings</h3>
            <p className="type-info">Apply percentage or fixed-amount discount to the deposit.</p>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="discountType">
                  Discount Type <span className="required">*</span>
                </label>
                <select
                  id="discountType"
                  value={form.discountType}
                  onChange={(e) => handleChange('discountType', e.target.value as 'percentage' | 'fixed')}
                  className={errors.discountType ? 'error' : ''}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (MYR)</option>
                </select>
                {errors.discountType && <span className="error-message">{errors.discountType}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="discountValue">
                  Discount Value <span className="required">*</span>
                </label>
                <input
                  id="discountValue"
                  type="number"
                  value={form.discountValue}
                  onChange={(e) => handleChange('discountValue', e.target.value)}
                  min="0.01"
                  step="0.01"
                  placeholder={form.discountType === 'percentage' ? 'e.g., 10' : 'e.g., 50.00'}
                  className={errors.discountValue ? 'error' : ''}
                />
                {errors.discountValue && <span className="error-message">{errors.discountValue}</span>}
                <div className="form-hint">{form.discountType === 'percentage' ? '% discount' : 'MYR discount'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Validity Period */}
        <div className="form-section">
          <h3>Validity Period</h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="validFrom">Valid From</label>
              <input
                id="validFrom"
                type="date"
                value={form.validFrom}
                onChange={(e) => handleChange('validFrom', e.target.value)}
                className={errors.validFrom ? 'error' : ''}
              />
              {errors.validFrom && <span className="error-message">{errors.validFrom}</span>}
              <div className="form-hint">Leave empty for immediate availability.</div>
            </div>

            <div className="form-group">
              <label htmlFor="validTo">Valid To</label>
              <input
                id="validTo"
                type="date"
                value={form.validTo}
                onChange={(e) => handleChange('validTo', e.target.value)}
                className={errors.validTo ? 'error' : ''}
              />
              {errors.validTo && <span className="error-message">{errors.validTo}</span>}
              <div className="form-hint">Leave empty for indefinite validity.</div>
            </div>
          </div>
        </div>

        {/* Usage Limit */}
        <div className="form-group">
          <label htmlFor="maxUses">Maximum Uses</label>
          <input
            id="maxUses"
            type="number"
            value={form.maxUses}
            onChange={(e) => handleChange('maxUses', e.target.value)}
            min="1"
            placeholder="Leave empty for unlimited uses"
            className={errors.maxUses ? 'error' : ''}
          />
          {errors.maxUses && <span className="error-message">{errors.maxUses}</span>}
          <div className="form-hint">How many times this code can be used before expiring.</div>
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (editingCode ? 'Updating…' : 'Creating…') : editingCode ? 'Update Code' : 'Create Code'}
          </button>
        </div>
      </form>
    </div>
  );
}
