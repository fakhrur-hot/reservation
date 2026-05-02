import { useState, useEffect } from 'react';
import PublicHolidaysSection from './PublicHolidaysSection';
import './AdminSettingsCategory.css';

interface DaySchedule {
  dayOfWeek: number;
  dayName: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

interface OperatingHoursData {
  schedule: DaySchedule[];
  lastOrderCutoffMinutes: number;
  noShowGraceMinutes: number;
  modificationCutoffHours: number;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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

export default function AdminSettingsOperatingHours() {
  const branchId = localStorage.getItem('branch_id') ?? '';

  const [form, setForm] = useState<OperatingHoursData>({
    schedule: DAYS.map((day, idx) => ({
      dayOfWeek: idx, dayName: day,
      isOpen: idx < 5, openTime: '09:00', closeTime: '22:00',
    })),
    lastOrderCutoffMinutes: 30,
    noShowGraceMinutes: 15,
    modificationCutoffHours: 24,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    fetch(`${BASE}/admin/v1/branches/${branchId}/operating-hours`, { headers: getHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.schedule) {
          setForm(prev => ({
            ...prev,
            schedule: DAYS.map((day, idx) => {
              const saved = data.schedule.find((s: any) => s.dayOfWeek === idx);
              return {
                dayOfWeek: idx, dayName: day,
                isOpen: saved?.isOpen ?? (idx < 5),
                openTime: saved?.openTime ?? '09:00',
                closeTime: saved?.closeTime ?? '22:00',
              };
            }),
            noShowGraceMinutes: data.noShowGraceMinutes ?? 15,
            modificationCutoffHours: data.modificationCutoffHours ?? 2,
          }));
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [branchId]);

  const handleDayChange = (dayIdx: number, field: string, value: any) => {
    setForm(prev => ({
      ...prev,
      schedule: prev.schedule.map((day, idx) => idx === dayIdx ? { ...day, [field]: value } : day),
    }));
    setSuccess(false);
  };

  const handleApplyToAll = () => {
    const firstOpenDay = form.schedule.find(d => d.isOpen);
    if (!firstOpenDay) return;
    setForm(prev => ({
      ...prev,
      schedule: prev.schedule.map(day =>
        day.isOpen ? { ...day, openTime: firstOpenDay.openTime, closeTime: firstOpenDay.closeTime } : day
      ),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/operating-hours`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          schedule: form.schedule.map(d => ({
            dayOfWeek: d.dayOfWeek, isOpen: d.isOpen,
            openTime: d.openTime, closeTime: d.closeTime,
          })),
          noShowGraceMinutes: form.noShowGraceMinutes,
          modificationCutoffHours: form.modificationCutoffHours,
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
        <h2>Operating Hours</h2>
        <p>Set your business hours and timing rules</p>
      </div>

      <div className="category-content">
        <div className="form-section">
          <h3>Weekly Schedule</h3>

          <div style={{ marginBottom: '16px' }}>
            <button
              type="button"
              onClick={handleApplyToAll}
              className="btn btn-secondary"
              style={{ marginBottom: '16px' }}
            >
              Apply first open day to all open days
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontWeight: 600, fontSize: '14px' }}>
                    Day
                  </th>
                  <th style={{ textAlign: 'center', padding: '12px', fontWeight: 600, fontSize: '14px' }}>
                    Open
                  </th>
                  <th style={{ textAlign: 'center', padding: '12px', fontWeight: 600, fontSize: '14px' }}>
                    Opening Time
                  </th>
                  <th style={{ textAlign: 'center', padding: '12px', fontWeight: 600, fontSize: '14px' }}>
                    Closing Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {form.schedule.map((day, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px' }}>{day.dayName}</td>
                    <td style={{ textAlign: 'center', padding: '12px' }}>
                      <input
                        type="checkbox"
                        checked={day.isOpen}
                        onChange={(e) => handleDayChange(idx, 'isOpen', e.target.checked)}
                      />
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px' }}>
                      <input
                        type="time"
                        value={day.openTime}
                        onChange={(e) => handleDayChange(idx, 'openTime', e.target.value)}
                        disabled={!day.isOpen}
                        style={{ width: '145px', minWidth: '145px' }}
                      />
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px' }}>
                      <input
                        type="time"
                        value={day.closeTime}
                        onChange={(e) => handleDayChange(idx, 'closeTime', e.target.value)}
                        disabled={!day.isOpen}
                        style={{ width: '145px', minWidth: '145px' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="form-section">
          <h3>Timing Rules</h3>

          <div className="form-group">
            <label>Last Order Cutoff (minutes before closing) *</label>
            <input
              type="number"
              min="0"
              value={form.lastOrderCutoffMinutes}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  lastOrderCutoffMinutes: Number(e.target.value),
                }))
              }
            />
            <small>Orders cannot be placed within this time before closing</small>
          </div>

          <div className="form-group">
            <label>No-Show Grace Period (minutes) *</label>
            <input
              type="number"
              min="0"
              value={form.noShowGraceMinutes}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  noShowGraceMinutes: Number(e.target.value),
                }))
              }
            />
            <small>Time allowed after reservation time before marking as no-show</small>
          </div>

          <div className="form-group">
            <label>Modification Cutoff (hours before reservation) *</label>
            <input
              type="number"
              min="0"
              value={form.modificationCutoffHours}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  modificationCutoffHours: Number(e.target.value),
                }))
              }
            />
            <small>Customers cannot modify reservations within this time</small>
          </div>
        </div>

        <PublicHolidaysSection />
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
