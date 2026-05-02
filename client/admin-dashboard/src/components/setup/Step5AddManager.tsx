import { ManagersData, ManagerInput } from '../../types/setup.types';

interface Step5AddManagerProps {
  data: ManagersData;
  onChange: (data: ManagersData) => void;
  error?: string | null;
}

export default function Step5AddManager({
  data,
  onChange,
  error,
}: Step5AddManagerProps) {
  const addManager = () => {
    const newManager: ManagerInput = {
      fullName: '',
      email: '',
      temporaryPassword: '',
    };
    onChange({
      managers: [...data.managers, newManager],
    });
  };

  const removeManager = (index: number) => {
    if (data.managers.length > 1) {
      onChange({
        managers: data.managers.filter((_, i) => i !== index),
      });
    }
  };

  const updateManager = (index: number, updates: Partial<ManagerInput>) => {
    const newManagers = [...data.managers];
    newManagers[index] = { ...newManagers[index], ...updates };
    onChange({ managers: newManagers });
  };

  return (
    <div className="setup-step">
      <h2>Add Manager</h2>
      <p className="step-description">Add at least one manager account</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="managers-list">
        {data.managers.map((manager, index) => (
          <div key={index} className="manager-card">
            <div className="manager-header">
              <h4>Manager {index + 1}</h4>
              {data.managers.length > 1 && (
                <button
                  className="btn btn-link"
                  onClick={() => removeManager(index)}
                  style={{ color: '#dc3545' }}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="form-group">
              <label>
                Full Name <span className="required">*</span>
              </label>
              <input
                type="text"
                value={manager.fullName}
                onChange={e => updateManager(index, { fullName: e.target.value })}
                placeholder="e.g., Jane Smith"
              />
            </div>

            <div className="form-group">
              <label>
                Email Address <span className="required">*</span>
              </label>
              <input
                type="email"
                value={manager.email}
                onChange={e => updateManager(index, { email: e.target.value })}
                placeholder="e.g., manager@sejiwa.com"
              />
            </div>

            <div className="form-group">
              <label>
                Temporary Password <span className="required">*</span>
              </label>
              <input
                type="password"
                value={manager.temporaryPassword}
                onChange={e => updateManager(index, { temporaryPassword: e.target.value })}
                placeholder="Temporary password for first login"
              />
              <small>Manager will be prompted to change this on first login</small>
            </div>

            <div className="form-group">
              <label>Role</label>
              <input
                type="text"
                value="Manager"
                disabled
                title="Fixed role"
              />
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-secondary" onClick={addManager} style={{ marginTop: '16px', width: '100%' }}>
        + Add Another Manager
      </button>

      <div className="info-box" style={{ marginTop: '24px' }}>
        <strong>Note:</strong> Managers can manage day-to-day operations but cannot access admin settings.
      </div>
    </div>
  );
}

