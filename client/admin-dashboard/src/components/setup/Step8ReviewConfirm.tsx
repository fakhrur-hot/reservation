import { SetupWizardState } from '../../types/setup.types';

interface Step8ReviewConfirmProps {
  state: SetupWizardState;
  onEditStep: (stepNumber: number) => void;
  error?: string | null;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function Step8ReviewConfirm({
  state,
  onEditStep,
  error,
}: Step8ReviewConfirmProps) {
  const formatAddress = () => {
    const s1 = state.step1;
    return `${s1.street}, ${s1.city}, ${s1.state} ${s1.postcode}, ${s1.country}`;
  };

  const formatSchedule = () => {
    const openDays = state.step2.schedule.filter(d => d.isOpen);
    if (openDays.length === 0) return 'Closed';
    if (openDays.length === 7) {
      return `Daily: ${openDays[0].openTime}–${openDays[0].closeTime}`;
    }
    const dayNames = openDays.map(d => DAY_NAMES[d.dayOfWeek].substring(0, 3)).join(', ');
    return `${dayNames}: ${openDays[0].openTime}–${openDays[0].closeTime}`;
  };

  const totalTables = state.step3.sections.reduce((sum, s) => sum + s.tables.length, 0);

  return (
    <div className="setup-step">
      <h2>Review & Confirm</h2>
      <p className="step-description">Review all your settings before completing setup</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="review-sections">
        {/* Step 1 */}
        <div className="review-section">
          <div className="review-header">
            <h4>Restaurant Profile</h4>
            <button className="btn btn-link" onClick={() => onEditStep(1)}>
              Edit →
            </button>
          </div>
          <div className="review-content">
            <div className="review-row">
              <span className="label">Restaurant Name:</span>
              <span className="value">{state.step1.restaurantName}</span>
            </div>
            <div className="review-row">
              <span className="label">Branch Code:</span>
              <span className="value">{state.step1.branchCode}</span>
            </div>
            <div className="review-row">
              <span className="label">Address:</span>
              <span className="value">{formatAddress()}</span>
            </div>
            <div className="review-row">
              <span className="label">Phone:</span>
              <span className="value">{state.step1.phone}</span>
            </div>
            <div className="review-row">
              <span className="label">Timezone:</span>
              <span className="value">{state.step1.timezone}</span>
            </div>
            <div className="review-row">
              <span className="label">Currency:</span>
              <span className="value">{state.step1.currency}</span>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="review-section">
          <div className="review-header">
            <h4>Operating Hours</h4>
            <button className="btn btn-link" onClick={() => onEditStep(2)}>
              Edit →
            </button>
          </div>
          <div className="review-content">
            <div className="review-row">
              <span className="label">Schedule:</span>
              <span className="value">{formatSchedule()}</span>
            </div>
            <div className="review-row">
              <span className="label">Last Order Cutoff:</span>
              <span className="value">{state.step2.lastOrderCutoffMinutes} minutes</span>
            </div>
            <div className="review-row">
              <span className="label">No-Show Grace Period:</span>
              <span className="value">{state.step2.noShowGraceMinutes} minutes</span>
            </div>
            <div className="review-row">
              <span className="label">Modification Cutoff:</span>
              <span className="value">{state.step2.modificationCutoffHours} hours</span>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="review-section">
          <div className="review-header">
            <h4>Sections & Tables</h4>
            <button className="btn btn-link" onClick={() => onEditStep(3)}>
              Edit →
            </button>
          </div>
          <div className="review-content">
            <div className="review-row">
              <span className="label">Total Sections:</span>
              <span className="value">{state.step3.sections.length}</span>
            </div>
            <div className="review-row">
              <span className="label">Total Tables:</span>
              <span className="value">{totalTables}</span>
            </div>
            {state.step3.sections.map((section, idx) => (
              <div key={idx} className="review-row">
                <span className="label">{section.name}:</span>
                <span className="value">{section.tables.length} tables ({section.type})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step 4 */}
        <div className="review-section">
          <div className="review-header">
            <h4>Admin Account</h4>
            <button className="btn btn-link" onClick={() => onEditStep(4)}>
              Edit →
            </button>
          </div>
          <div className="review-content">
            <div className="review-row">
              <span className="label">Name:</span>
              <span className="value">{state.step4.fullName}</span>
            </div>
            <div className="review-row">
              <span className="label">Email:</span>
              <span className="value">{state.step4.email}</span>
            </div>
            <div className="review-row">
              <span className="label">Role:</span>
              <span className="value">Admin</span>
            </div>
          </div>
        </div>

        {/* Step 5 */}
        <div className="review-section">
          <div className="review-header">
            <h4>Managers</h4>
            <button className="btn btn-link" onClick={() => onEditStep(5)}>
              Edit →
            </button>
          </div>
          <div className="review-content">
            <div className="review-row">
              <span className="label">Total Managers:</span>
              <span className="value">{state.step5.managers.length}</span>
            </div>
            {state.step5.managers.map((manager, idx) => (
              <div key={idx} className="review-row">
                <span className="label">{manager.fullName}:</span>
                <span className="value">{manager.email}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step 6 */}
        <div className="review-section">
          <div className="review-header">
            <h4>Email Settings</h4>
            <button className="btn btn-link" onClick={() => onEditStep(6)}>
              Edit →
            </button>
          </div>
          <div className="review-content">
            {state.step6 ? (
              <>
                <div className="review-row">
                  <span className="label">SMTP Host:</span>
                  <span className="value">{state.step6.host}</span>
                </div>
                <div className="review-row">
                  <span className="label">From:</span>
                  <span className="value">{state.step6.fromName} &lt;{state.step6.fromEmail}&gt;</span>
                </div>
              </>
            ) : (
              <div className="review-row">
                <span className="label">Status:</span>
                <span className="value" style={{ color: '#ffc107' }}>Skipped</span>
              </div>
            )}
          </div>
        </div>

        {/* Step 7 */}
        <div className="review-section">
          <div className="review-header">
            <h4>Deposit Settings</h4>
            <button className="btn btn-link" onClick={() => onEditStep(7)}>
              Edit →
            </button>
          </div>
          <div className="review-content">
            <div className="review-row">
              <span className="label">Deposit Amount:</span>
              <span className="value">{state.step1.currency} {state.step7.depositAmount.toFixed(2)}</span>
            </div>
            <div className="review-row">
              <span className="label">Required:</span>
              <span className="value">{state.step7.depositRequired ? 'Yes' : 'No'}</span>
            </div>
            <div className="review-row">
              <span className="label">Refund Tiers:</span>
              <span className="value">
                {state.step7.refundTier1Percent}% / {state.step7.refundTier2Percent}% / {state.step7.refundTier3Percent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="info-box" style={{ marginTop: '24px' }}>
        <strong>Ready to go!</strong> Click "Complete Setup" below to finalize your restaurant configuration.
      </div>
    </div>
  );
}
