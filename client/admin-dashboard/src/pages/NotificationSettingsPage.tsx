/**
 * Notification Settings Page — Sneat Dashboard (Admin)
 *
 * Configure email and SMS notification preferences for:
 * - Reservation confirmations
 * - Reservation modifications
 * - Cancellations
 * - No-show reminders
 *
 * Backed by:
 *  GET  /api/admin/v1/branches/:id/notification-settings
 *  PATCH /api/admin/v1/branches/:id/notification-settings
 */

import { useEffect, useState } from 'react';
import { getNotificationSettings, updateNotificationSettings } from '../api';
import type { NotificationSettings } from '../types';

export default function NotificationSettingsPage() {
  const branchId = localStorage.getItem('branch_id');
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [form, setForm] = useState<NotificationSettings>({
    branch_id: '',
    reservation_confirmation_email: true,
    reservation_confirmation_sms: false,
    reservation_modification_email: true,
    reservation_modification_sms: false,
    cancellation_email: true,
    cancellation_sms: false,
    no_show_reminder_email: true,
    no_show_reminder_sms: false,
    send_reminder_before_minutes: 24 * 60, // 24 hours
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load notification settings
  useEffect(() => {
    async function load() {
      if (!branchId) {
        setError('Branch ID is missing. Please log in again.');
        setLoading(false);
        return;
      }

      try {
        const data = await getNotificationSettings(branchId);
        setSettings(data);
        setForm({ ...data });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load notification settings');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [branchId]);

  const handleToggle = (field: keyof Omit<NotificationSettings, 'branch_id'>) => {
    setForm(prev => ({
      ...prev,
      [field]: !prev[field as keyof typeof prev],
    }));
    setSuccessMessage(null);
  };

  const handleReminderChange = (minutes: number) => {
    setForm(prev => ({
      ...prev,
      send_reminder_before_minutes: minutes,
    }));
  };

  const handleSave = async () => {
    if (!branchId) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateNotificationSettings(branchId, form);
      setSettings(form);
      setSuccessMessage('Notification settings saved successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (settings) {
      setForm({ ...settings });
    }
    setSuccessMessage(null);
    setError(null);
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Notification Settings</h1>
        </div>
        <div className="page-body">Loading notification settings...</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Notification Settings</h1>
          <p className="page-subtitle">
            Configure when your customers receive confirmation, modification, and reminder emails and SMS messages.
          </p>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: '800px' }}>
        {error && (
          <div style={{
            padding: '12px 16px',
            background: '#fef2f2',
            color: '#991b1b',
            borderRadius: '8px',
            marginBottom: '16px',
            borderLeft: '4px solid #dc2626',
          }}>
            ⚠️ {error}
          </div>
        )}

        {successMessage && (
          <div style={{
            padding: '12px 16px',
            background: '#f0fdf4',
            color: '#15803d',
            borderRadius: '8px',
            marginBottom: '16px',
            borderLeft: '4px solid #22c55e',
          }}>
            ✓ {successMessage}
          </div>
        )}

        {/* Reservation Confirmation */}
        <div style={{
          padding: '24px',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 1px 4px rgba(15,23,42,0.08)',
          marginBottom: '16px',
        }}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>📧 Reservation Confirmation</h2>
          <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '14px' }}>
            When a customer books a table, send them a confirmation notification.
          </p>

          <div style={{ display: 'flex', gap: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.reservation_confirmation_email}
                onChange={() => handleToggle('reservation_confirmation_email')}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Send Email</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.reservation_confirmation_sms}
                onChange={() => handleToggle('reservation_confirmation_sms')}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Send SMS</span>
            </label>
          </div>
        </div>

        {/* Reservation Modification */}
        <div style={{
          padding: '24px',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 1px 4px rgba(15,23,42,0.08)',
          marginBottom: '16px',
        }}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>✓ Reservation Modification</h2>
          <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '14px' }}>
            When a customer modifies their reservation, notify them of the changes.
          </p>

          <div style={{ display: 'flex', gap: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.reservation_modification_email}
                onChange={() => handleToggle('reservation_modification_email')}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Send Email</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.reservation_modification_sms}
                onChange={() => handleToggle('reservation_modification_sms')}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Send SMS</span>
            </label>
          </div>
        </div>

        {/* Cancellation Notification */}
        <div style={{
          padding: '24px',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 1px 4px rgba(15,23,42,0.08)',
          marginBottom: '16px',
        }}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>🚫 Cancellation</h2>
          <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '14px' }}>
            When a customer or you cancel a reservation, notify the customer.
          </p>

          <div style={{ display: 'flex', gap: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.cancellation_email}
                onChange={() => handleToggle('cancellation_email')}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Send Email</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.cancellation_sms}
                onChange={() => handleToggle('cancellation_sms')}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Send SMS</span>
            </label>
          </div>
        </div>

        {/* No-Show Reminders */}
        <div style={{
          padding: '24px',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 1px 4px rgba(15,23,42,0.08)',
          marginBottom: '16px',
        }}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>⏰ No-Show Reminders</h2>
          <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '14px' }}>
            Send customers a reminder notification before their reservation time.
          </p>

          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.no_show_reminder_email}
                onChange={() => handleToggle('no_show_reminder_email')}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Send Email Reminder</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.no_show_reminder_sms}
                onChange={() => handleToggle('no_show_reminder_sms')}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Send SMS Reminder</span>
            </label>
          </div>

          <label style={{ display: 'block' }}>
            <span style={{ fontSize: '14px', color: '#475569', display: 'block', marginBottom: '8px' }}>
              Send reminder before:
            </span>
            <select
              value={form.send_reminder_before_minutes || 24 * 60}
              onChange={e => handleReminderChange(parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #d9dee3',
                fontSize: '14px',
              }}
            >
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={2 * 60}>2 hours</option>
              <option value={4 * 60}>4 hours</option>
              <option value={8 * 60}>8 hours</option>
              <option value={12 * 60}>12 hours</option>
              <option value={24 * 60}>1 day</option>
              <option value={2 * 24 * 60}>2 days</option>
            </select>
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            style={{
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #d9dee3',
              borderRadius: '10px',
              padding: '10px 20px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 20px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {saving ? 'Saving...' : 'Save Notification Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
