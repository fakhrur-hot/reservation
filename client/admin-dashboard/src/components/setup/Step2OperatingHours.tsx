import { OperatingHoursData, DaySchedule } from '../../types/setup.types';

interface Step2OperatingHoursProps {
  data: OperatingHoursData;
  onChange: (data: OperatingHoursData) => void;
  error?: string | null;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function Step2OperatingHours({
  data,
  onChange,
  error,
}: Step2OperatingHoursProps) {
  const handleDayChange = (index: number, updates: Partial<DaySchedule>) => {
    const newSchedule = [...data.schedule];
    newSchedule[index] = { ...newSchedule[index], ...updates };
    onChange({ ...data, schedule: newSchedule });
  };

  const handleApplyToAllDays = () => {
    const firstOpenDay = data.schedule.find(d => d.isOpen);
    if (!firstOpenDay) return;

    const newSchedule = data.schedule.map(day => ({
      ...day,
      isOpen: true,
      openTime: firstOpenDay.openTime,
      closeTime: firstOpenDay.closeTime,
    }));
    onChange({ ...data, schedule: newSchedule });
  };

  return (
    <div className="setup-step">
      <h2>Operating Hours</h2>
      <p className="step-description">Set your restaurant's operating schedule</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="operating-hours-grid">
        <div className="grid-header">
          <div>Day</div>
          <div>Status</div>
          <div>Opening Time</div>
          <div>Closing Time</div>
        </div>

        {data.schedule.map((day, index) => (
          <div key={index} className="grid-row">
            <div className="day-name">{DAY_NAMES[index]}</div>
            <div className="day-toggle">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={day.isOpen}
                  onChange={e => handleDayChange(index, { isOpen: e.target.checked })}
                />
                <span>{day.isOpen ? 'Open' : 'Closed'}</span>
              </label>
            </div>
            <div className="time-input">
              <input
                type="time"
                value={day.openTime}
                onChange={e => handleDayChange(index, { openTime: e.target.value })}
                disabled={!day.isOpen}
              />
            </div>
            <div className="time-input">
              <input
                type="time"
                value={day.closeTime}
                onChange={e => handleDayChange(index, { closeTime: e.target.value })}
                disabled={!day.isOpen}
              />
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-secondary" onClick={handleApplyToAllDays} style={{ marginTop: '16px' }}>
        Apply to All Days
      </button>

      <div className="form-group" style={{ marginTop: '30px' }}>
        <label>
          Last Order Cutoff (minutes before closing) <span className="required">*</span>
        </label>
        <input
          type="number"
          value={data.lastOrderCutoffMinutes}
          onChange={e => onChange({ ...data, lastOrderCutoffMinutes: parseInt(e.target.value) || 0 })}
          min="0"
          placeholder="e.g., 30"
        />
        <small>Guests cannot place new orders within this time before closing</small>
      </div>

      <div className="form-group">
        <label>
          No-Show Grace Period (minutes) <span className="required">*</span>
        </label>
        <input
          type="number"
          value={data.noShowGraceMinutes}
          onChange={e => onChange({ ...data, noShowGraceMinutes: parseInt(e.target.value) || 0 })}
          min="0"
          placeholder="e.g., 15"
        />
        <small>Time allowed after reservation time before marking as no-show</small>
      </div>

      <div className="form-group">
        <label>
          Modification Cutoff (hours before reservation) <span className="required">*</span>
        </label>
        <input
          type="number"
          value={data.modificationCutoffHours}
          onChange={e => onChange({ ...data, modificationCutoffHours: parseInt(e.target.value) || 0 })}
          min="0"
          placeholder="e.g., 24"
        />
        <small>Guests cannot modify reservations within this time</small>
      </div>
    </div>
  );
}
