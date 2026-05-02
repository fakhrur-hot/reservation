import { useState, useEffect } from 'react';
import { SetupWizardState, RestaurantProfileData, OperatingHoursData, SectionsLayoutData, AdminAccountData, ManagersData, SmtpSettingsData, DepositSettingsData } from '../types/setup.types';
import { useSetupProgress } from '../hooks/useSetupProgress';
import SetupProgressBar from '../components/setup/SetupProgressBar';
import Step1RestaurantProfile from '../components/setup/Step1RestaurantProfile';
import Step2OperatingHours from '../components/setup/Step2OperatingHours';
import Step3SectionsLayout from '../components/setup/Step3SectionsLayout';
import Step4AdminAccount from '../components/setup/Step4AdminAccount';
import Step5AddManager from '../components/setup/Step5AddManager';
import Step6SmtpSettings from '../components/setup/Step6SmtpSettings';
import Step7DepositSettings from '../components/setup/Step7DepositSettings';
import Step8ReviewConfirm from '../components/setup/Step8ReviewConfirm';
import SetupSuccessScreen from '../components/setup/SetupSuccessScreen';
import './SetupWizardPage.css';
import '../components/setup/SetupSteps.css';

const BASE = '';

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const INITIAL_STATE: SetupWizardState = {
  currentStep: 1,
  step1: {
    restaurantName: 'SEJIWA Titiwangsa',
    branchCode: 'SEJWKL01',
    street: 'Lot 123, Jalan Titiwangsa',
    city: 'Kuala Lumpur',
    state: 'Wilayah Persekutuan',
    postcode: '50400',
    country: 'Malaysia',
    phone: '+60 3-4101 0101',
    website: 'https://www.sejiwa.my',
    timezone: 'Asia/Kuala_Lumpur',
    currency: 'MYR',
  },
  step2: {
    schedule: [
      { dayOfWeek: 0, isOpen: true, openTime: '11:00', closeTime: '23:00' },  // Mon
      { dayOfWeek: 1, isOpen: true, openTime: '11:00', closeTime: '23:00' },  // Tue
      { dayOfWeek: 2, isOpen: true, openTime: '11:00', closeTime: '23:00' },  // Wed
      { dayOfWeek: 3, isOpen: true, openTime: '11:00', closeTime: '23:00' },  // Thu
      { dayOfWeek: 4, isOpen: true, openTime: '11:00', closeTime: '23:00' },  // Fri
      { dayOfWeek: 5, isOpen: true, openTime: '10:00', closeTime: '23:00' },  // Sat (11:00 PM)
      { dayOfWeek: 6, isOpen: true, openTime: '10:00', closeTime: '23:00' },  // Sun
    ],
    lastOrderCutoffMinutes: 30,
    noShowGraceMinutes: 15,
    modificationCutoffHours: 24,
  },
  step3: {
    sections: [
      {
        name: 'Main Hall',
        description: 'Spacious main dining area with open layout',
        type: 'indoor',
        tables: [
          { name: 'T1', capacity: 2, tableType: 'standard' },
          { name: 'T2', capacity: 2, tableType: 'standard' },
          { name: 'T3', capacity: 2, tableType: 'standard' },
          { name: 'T4', capacity: 2, tableType: 'standard' },
          { name: 'T5', capacity: 2, tableType: 'standard' },
          { name: 'T6', capacity: 4, tableType: 'standard' },
          { name: 'T7', capacity: 4, tableType: 'standard' },
          { name: 'T8', capacity: 4, tableType: 'standard' },
          { name: 'T9', capacity: 4, tableType: 'standard' },
          { name: 'T10', capacity: 4, tableType: 'standard' },
          { name: 'T11', capacity: 6, tableType: 'standard' },
          { name: 'T12', capacity: 6, tableType: 'standard' },
          { name: 'T13', capacity: 6, tableType: 'standard' },
          { name: 'T14', capacity: 8, tableType: 'standard' },
          { name: 'T15', capacity: 8, tableType: 'standard' },
        ],
      },
      {
        name: 'Private Room',
        description: 'Intimate private dining room for special occasions',
        type: 'indoor',
        tables: [
          { name: 'PR-1', capacity: 12, tableType: 'private' },
          { name: 'PR-2', capacity: 10, tableType: 'private' },
          { name: 'PR-3', capacity: 8, tableType: 'private' },
        ],
      },
      {
        name: 'Garden Lounge',
        description: 'Open-air garden seating with outdoor ambiance',
        type: 'outdoor',
        tables: [
          { name: 'GL-1', capacity: 4, tableType: 'standard' },
          { name: 'GL-2', capacity: 4, tableType: 'standard' },
          { name: 'GL-3', capacity: 5, tableType: 'standard' },
          { name: 'GL-4', capacity: 5, tableType: 'standard' },
          { name: 'GL-5', capacity: 4, tableType: 'standard' },
          { name: 'GL-6', capacity: 4, tableType: 'standard' },
          { name: 'GL-7', capacity: 5, tableType: 'standard' },
          { name: 'GL-8', capacity: 5, tableType: 'standard' },
        ],
      },
      {
        name: 'VIP Booth',
        description: 'Premium booth seating for VIP guests',
        type: 'indoor',
        tables: [
          { name: 'VIP-1', capacity: 10, tableType: 'booth' },
          { name: 'VIP-2', capacity: 10, tableType: 'booth' },
          { name: 'VIP-3', capacity: 10, tableType: 'booth' },
        ],
      },
      {
        name: 'Lounge Bar',
        description: 'Casual lounge seating with bar counter',
        type: 'indoor',
        tables: [
          { name: 'Bar Counter', capacity: 6, tableType: 'bar' },
          { name: 'L-1', capacity: 4, tableType: 'standard' },
          { name: 'L-2', capacity: 4, tableType: 'standard' },
          { name: 'L-3', capacity: 4, tableType: 'standard' },
          { name: 'L-4', capacity: 4, tableType: 'standard' },
        ],
      },
    ],
  },
  step4: {
    fullName: 'SEJIWA Admin',
    email: 'admin@sejiwa.my',
    password: '',
  },
  step5: {
    managers: [
      {
        fullName: 'SEJIWA Manager',
        email: 'manager@sejiwa.my',
        temporaryPassword: 'TempPassword123!',
      },
    ],
  },
  step6: {
    host: 'smtp.gmail.com',
    port: 587,
    username: 'noreply@sejiwa.my',
    password: '',
    fromName: 'SEJIWA Titiwangsa Cafe',
    fromEmail: 'noreply@sejiwa.my',
    tls: true,
  },
  step7: {
    depositAmount: 50.0,
    depositRequired: true,
    refundTier1Percent: 100,
    refundTier2Percent: 50,
    refundTier3Percent: 0,
  },
};

export default function SetupWizardPage({ onComplete }: { onComplete?: () => void } = {}) {
  const [state, setState] = useState<SetupWizardState>(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const { saveProgress, clearProgress, loadProgress } = useSetupProgress();

  // Load saved progress on mount — but only if the server confirms setup is
  // still in progress (not yet complete). If the DB was wiped and reset, any
  // stale localStorage progress is invalid and must be discarded so the wizard
  // always starts from step 1 on a fresh install.
  useEffect(() => {
    async function initProgress() {
      try {
        const res = await fetch('/setup/status');
        const status = await res.json();

        // Fresh install or DB was reset — clear any stale local progress
        if (status.setupRequired === false) {
          clearProgress();
          return;
        }

        // Setup still required — restore local progress only if it exists
        // and has a valid partial step (not step 1, which needs no restoration)
        const saved = loadProgress();
        if (saved && saved.currentStep && saved.currentStep > 1) {
          setState(_prev => ({
            ...INITIAL_STATE,
            ...saved,
            currentStep: saved.currentStep!,
          }));
        } else {
          // No saved progress or already at step 1 — always start fresh
          clearProgress();
          setState(INITIAL_STATE);
        }
      } catch {
        // If status check fails, clear stale progress and start from step 1
        clearProgress();
        setState(INITIAL_STATE);
      }
    }

    initProgress();
  }, []);

  const handleNext = async () => {
    // Validate current step
    const validationError = validateStep(state.currentStep, state);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitError(null);

    // Save progress
    saveProgress(state.currentStep, state);

    // Move to next step
    if (state.currentStep < 8) {
      setState(prev => ({ ...prev, currentStep: prev.currentStep + 1 }));
    }
  };

  const handleBack = () => {
    if (state.currentStep > 1) {
      setState(prev => ({ ...prev, currentStep: prev.currentStep - 1 }));
    }
  };

  const handleSkipSmtp = () => {
    setState(prev => ({ ...prev, step6: null, currentStep: 7 }));
    saveProgress(7, { ...state, step6: null });
  };

  const handleStep1Change = (data: RestaurantProfileData) => {
    setState(prev => ({ ...prev, step1: data }));
  };

  const handleStep2Change = (data: OperatingHoursData) => {
    setState(prev => ({ ...prev, step2: data }));
  };

  const handleStep3Change = (data: SectionsLayoutData) => {
    setState(prev => ({ ...prev, step3: data }));
  };

  const handleStep4Change = (data: AdminAccountData) => {
    setState(prev => ({ ...prev, step4: data }));
  };

  const handleStep5Change = (data: ManagersData) => {
    setState(prev => ({ ...prev, step5: data }));
  };

  const handleStep6Change = (data: SmtpSettingsData | null) => {
    setState(prev => ({ ...prev, step6: data }));
  };

  const handleStep7Change = (data: DepositSettingsData) => {
    setState(prev => ({ ...prev, step7: data }));
  };

  const handleEditStep = (stepNumber: number) => {
    setState(prev => ({ ...prev, currentStep: stepNumber }));
  };

  const handleCompleteSetup = async () => {
    // Final validation
    const validationError = validateStep(8, state);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Build the payload
      const payload = {
        restaurantName: state.step1.restaurantName,
        branchCode: state.step1.branchCode,
        address: `${state.step1.street}, ${state.step1.city}, ${state.step1.state} ${state.step1.postcode}, ${state.step1.country}`,
        phone: state.step1.phone,
        website: state.step1.website || undefined,
        adminEmail: state.step4.email,
        adminPassword: state.step4.password,
        adminName: state.step4.fullName,
        timezone: state.step1.timezone,
        currency: state.step1.currency,
        openingHour: state.step2.schedule.find(s => s.isOpen)?.openTime || '09:00',
        closingHour: state.step2.schedule.find(s => s.isOpen)?.closeTime || '22:00',
        operatingHours: state.step2,
        sections: state.step3.sections,
        managers: state.step5.managers,
        smtpSettings: state.step6,
        depositSettings: state.step7,
      };

      const result = await request<{ branchId: string; adminStaffId: string }>('/setup/complete', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Store branch_id so all subsequent API calls and WebSocket connections
      // have the correct branch context immediately after setup
      if (result.branchId) {
        localStorage.setItem('branch_id', result.branchId);
      }

      // Store branch name for the nav title — fetch from setup/status
      try {
        const statusRes = await fetch('/setup/status');
        const status = await statusRes.json();
        if (status.branchName) {
          localStorage.setItem('branch_name', status.branchName);
        }
      } catch {
        // Non-fatal
      }

      clearProgress();
      setIsSuccess(true);
      if (onComplete) onComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete setup';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return <SetupSuccessScreen onGoToDashboard={onComplete} />;
  }

  return (
    <div className="setup-wizard-page">
      <div className="setup-wizard-container">
        <SetupProgressBar currentStep={state.currentStep} totalSteps={8} />

        <div className="setup-wizard-content">
          {state.currentStep === 1 && (
            <Step1RestaurantProfile
              data={state.step1}
              onChange={handleStep1Change}
              error={submitError}
            />
          )}

          {state.currentStep === 2 && (
            <Step2OperatingHours
              data={state.step2}
              onChange={handleStep2Change}
              error={submitError}
            />
          )}

          {state.currentStep === 3 && (
            <Step3SectionsLayout
              data={state.step3}
              onChange={handleStep3Change}
              error={submitError}
            />
          )}

          {state.currentStep === 4 && (
            <Step4AdminAccount
              data={state.step4}
              onChange={handleStep4Change}
              error={submitError}
            />
          )}

          {state.currentStep === 5 && (
            <Step5AddManager
              data={state.step5}
              onChange={handleStep5Change}
              error={submitError}
            />
          )}

          {state.currentStep === 6 && (
            <Step6SmtpSettings
              data={state.step6}
              onChange={handleStep6Change}
              onSkip={handleSkipSmtp}
              error={submitError}
            />
          )}

          {state.currentStep === 7 && (
            <Step7DepositSettings
              data={state.step7}
              onChange={handleStep7Change}
              error={submitError}
            />
          )}

          {state.currentStep === 8 && (
            <Step8ReviewConfirm
              state={state}
              onEditStep={handleEditStep}
              error={submitError}
            />
          )}
        </div>

        <div className="setup-wizard-actions">
          {state.currentStep > 1 && (
            <button className="btn btn-secondary" onClick={handleBack}>
              Back
            </button>
          )}

          {state.currentStep < 8 && (
            <button className="btn btn-primary" onClick={handleNext}>
              Next
            </button>
          )}

          {state.currentStep === 6 && (
            <button className="btn btn-link" onClick={handleSkipSmtp}>
              Skip for now
            </button>
          )}

          {state.currentStep === 8 && (
            <button
              className="btn btn-primary"
              onClick={handleCompleteSetup}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Completing Setup...' : 'Complete Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function validateStep(step: number, state: SetupWizardState): string | null {
  switch (step) {
    case 1: {
      const s1 = state.step1;
      if (!s1.restaurantName?.trim()) return 'Restaurant name is required';
      if (!s1.branchCode?.trim()) return 'Branch code is required';
      if (!s1.street?.trim()) return 'Street address is required';
      if (!s1.city?.trim()) return 'City is required';
      if (!s1.state?.trim()) return 'State is required';
      if (!s1.postcode?.trim()) return 'Postcode is required';
      if (!s1.country?.trim()) return 'Country is required';
      if (!s1.phone?.trim()) return 'Phone number is required';
      if (!/^[A-Z0-9]+$/.test(s1.branchCode)) return 'Branch code must contain only uppercase letters and digits';
      return null;
    }

    case 2: {
      const s2 = state.step2;
      const openDays = s2.schedule.filter(d => d.isOpen);
      if (openDays.length === 0) return 'At least one day must be open';
      for (const day of openDays) {
        if (!day.openTime || !day.closeTime) return 'All open days must have opening and closing times';
        if (day.closeTime <= day.openTime) return 'Closing time must be after opening time';
      }
      if (s2.lastOrderCutoffMinutes < 0) return 'Last order cutoff must be non-negative';
      if (s2.noShowGraceMinutes < 0) return 'No-show grace period must be non-negative';
      if (s2.modificationCutoffHours < 0) return 'Modification cutoff must be non-negative';
      return null;
    }

    case 3: {
      const s3 = state.step3;
      if (!s3.sections || s3.sections.length === 0) return 'At least one section is required';
      for (const section of s3.sections) {
        if (!section.name?.trim()) return 'Section name is required';
        if (!section.tables || section.tables.length === 0) return 'Each section must have at least one table';
        for (const table of section.tables) {
          if (!table.name?.trim()) return 'Table name is required';
          if (table.capacity < 1) return 'Table capacity must be at least 1';
        }
      }
      return null;
    }

    case 4: {
      const s4 = state.step4;
      if (!s4.fullName?.trim()) return 'Admin full name is required';
      if (!s4.email?.trim()) return 'Admin email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s4.email)) return 'Invalid email format';
      if (!s4.password || s4.password.length < 8) return 'Password must be at least 8 characters';
      return null;
    }

    case 5: {
      const s5 = state.step5;
      if (!s5.managers || s5.managers.length === 0) return 'At least one manager is required';
      for (const manager of s5.managers) {
        if (!manager.fullName?.trim()) return 'Manager full name is required';
        if (!manager.email?.trim()) return 'Manager email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manager.email)) return 'Invalid manager email format';
        if (!manager.temporaryPassword?.trim()) return 'Manager temporary password is required';
        // Manager email cannot be the same as admin email
        if (manager.email.toLowerCase() === state.step4.email.toLowerCase()) {
          return 'Manager email cannot be the same as the admin email';
        }
      }
      // Manager emails must be unique among themselves
      const emails = s5.managers.map(m => m.email.toLowerCase());
      if (new Set(emails).size !== emails.length) return 'Manager emails must be unique';
      return null;
    }

    case 7: {
      const s7 = state.step7;
      if (s7.depositAmount < 0) return 'Deposit amount must be non-negative';
      if (s7.refundTier1Percent < 0 || s7.refundTier1Percent > 100) return 'Refund tier 1 must be 0-100%';
      if (s7.refundTier2Percent < 0 || s7.refundTier2Percent > 100) return 'Refund tier 2 must be 0-100%';
      if (s7.refundTier3Percent < 0 || s7.refundTier3Percent > 100) return 'Refund tier 3 must be 0-100%';
      return null;
    }

    case 8:
      // Final validation - all steps must be valid
      for (let i = 1; i <= 7; i++) {
        const err = validateStep(i, state);
        if (err) return err;
      }
      return null;

    default:
      return null;
  }
}
