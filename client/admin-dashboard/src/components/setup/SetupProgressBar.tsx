import './SetupProgressBar.css';

interface SetupProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

const STEP_LABELS = [
  'Restaurant Profile',
  'Operating Hours',
  'Sections & Tables',
  'Admin Account',
  'Add Manager',
  'Email Settings',
  'Deposit Settings',
  'Review & Confirm',
];

export default function SetupProgressBar({ currentStep, totalSteps }: SetupProgressBarProps) {
  return (
    <div className="setup-progress-bar">
      <div className="progress-steps">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isComplete = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          const isPending = stepNum > currentStep;

          return (
            <div
              key={stepNum}
              className={`progress-step ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}
            >
              <div className="step-indicator">
                {isComplete ? (
                  <span className="step-icon">✓</span>
                ) : (
                  <span className="step-number">{stepNum}</span>
                )}
              </div>
              <div className="step-label">{STEP_LABELS[i]}</div>
            </div>
          );
        })}
      </div>

      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{
            width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%`,
          }}
        />
      </div>

      <div className="progress-text">
        Step {currentStep} of {totalSteps}
      </div>
    </div>
  );
}
