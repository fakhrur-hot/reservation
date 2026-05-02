import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getActiveTables, acquireLock, createReservation, getDecorationColors, getDecorationPackages, validatePromoCode, getAvailableSlots, type AvailableSlot } from '../api';
import type { Table, ReservationResult, CakeSelection, DecorationColor, DecorationPackage, PromoCodeValidationResult, LockResult } from '../types';
import CakeSelector from '../components/CakeSelector';
import { TimePicker } from '../components/DateTimePicker';
import MenuDialog from '../components/MenuDialog';
import './BookingFlow.css';

// Get session ID - lazily to support SSR/testing environments
const getSessionId = (): string => {
  if (typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem('session_id');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    sessionStorage.setItem('session_id', newId);
    return newId;
  }
  return crypto.randomUUID();
};

// Booking type enum matching backend expectations
export type BookingType = 'standard' | 'decorated';

// Lead time in hours (supports priority promo codes with 1h override)
export type LeadTime = 24 | 48 | 1;

// Step types for the new sequential booking flow
type Step = 
  | 'intro' 
  | 'booking_type'
  | 'pax'
  | 'promo_code' 
  | 'date' 
  | 'time' 
  | 'decoration' 
  | 'color' 
  | 'cake' 
  | 'confirm' 
  | 'success';

type AuthStep = 'email' | 'otp' | 'password';
type AuthMode = 'login' | 'register';

interface BookingFlowProps {
  branchId: string;
  branchName?: string;
  token?: string | null;
  onLogin?: (token: string) => void;
  onLogout?: () => void;
}

export default function BookingFlow({ branchId, branchName = 'Client Portal', token, onLogin, onLogout }: BookingFlowProps) {
  const [step, setStep] = useState<Step>('intro');
  const [showTopButtons, setShowTopButtons] = useState(false);
  
  // Step 1: Booking Type state (new)
  const [bookingType, setBookingType] = useState<BookingType | null>(null);
  const [minLeadTime, setMinLeadTime] = useState<LeadTime | null>(null);
  
  // Step 2: Promo Code state
  const [promoCode, setPromoCode] = useState<string>('');
  const [promoValid, setPromoValid] = useState<boolean | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoResult, setPromoResult] = useState<PromoCodeValidationResult | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoWarning, setPromoWarning] = useState<string | null>(null);
  
  // Step 3: Date Selection state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  // Date picker scroll state (hoisted from renderStep3 to comply with Rules of Hooks)
  const [datePickerIdx, setDatePickerIdx] = useState(0);
  const [datePickerConfirming, setDatePickerConfirming] = useState(false);

  // State Reset Message (Req 11.3)
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetMessageType, setResetMessageType] = useState<'info' | 'warning'>('info');

  // Step 5: Time Selection state (Req 1.7, Req 3.2)
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [sessionDuration, setSessionDuration] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  // Table Lock state (Req 5.1, Req 5.6)
  const [tableLock, setTableLock] = useState<LockResult | null>(null);
  const [lockAcquiring, setLockAcquiring] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockExpiryTime, setLockExpiryTime] = useState<Date | null>(null);
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dateScrollRef = useRef<HTMLDivElement>(null);
  const [lockWarning, setLockWarning] = useState(false);
  
  // Existing state
  const [pax, setPax] = useState<number | null>(null);
  const [specialRequests, setSpecialRequests] = useState('');
  const [cakeSelection, setCakeSelection] = useState<CakeSelection | null>(null);

  // Step 4: Decoration Selection state
  const [isDecorated, setIsDecorated] = useState<boolean | null>(null);
  const [decorationColor, setDecorationColor] = useState<string | null>(null);
  const [cakePreference, setCakePreference] = useState<boolean | null>(null);
  const [occasionType, setOccasionType] = useState<string | null>(null);
  const [decorationNotes, setDecorationNotes] = useState('');

  // Menu dialog state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPage, setMenuPage] = useState(1);

  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ReservationResult | null>(null);

  // Decoration data
  const [decorationColors, setDecorationColors] = useState<DecorationColor[]>([]);
  const [decorationPackages, setDecorationPackages] = useState<DecorationPackage[]>([]);
  const [decorationLoading, setDecorationLoading] = useState(false);

  // Auth modal state
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authStep, setAuthStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Intro animation - now goes to booking_type instead of pax
  useEffect(() => {
    if (step === 'intro') {
      const timer = setTimeout(() => setStep('booking_type'), 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Auto-scroll date picker to keep selected item centered
  useEffect(() => {
    if (dateScrollRef.current) {
      const itemHeight = 52;
      const scrollTop = datePickerIdx * itemHeight;
      dateScrollRef.current.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }
  }, [datePickerIdx]);

  // Show top buttons after 2s if no booking type selected
  useEffect(() => {
    if (step === 'booking_type' && bookingType === null) {
      const timer = setTimeout(() => setShowTopButtons(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [step, bookingType]);

  // Load tables on mount
  useEffect(() => {
    if (!branchId) return;
    const load = async () => {
      try {
        const t = await getActiveTables(branchId);
        setTables(t);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tables');
      }
    };
    load();
  }, [branchId]);

  // Load decoration colors and packages
  useEffect(() => {
    if (!branchId) return;
    const load = async () => {
      setDecorationLoading(true);
      try {
        const [colors, packages] = await Promise.all([
          getDecorationColors(branchId),
          getDecorationPackages(branchId),
        ]);
        setDecorationColors(colors);
        setDecorationPackages(packages);
      } catch (err) {
        // Silently fail - use defaults if API unavailable
        console.error('Failed to load decoration data:', err);
      } finally {
        setDecorationLoading(false);
      }
    };
    load();
  }, [branchId]);

  // Cleanup lock timer on unmount
  useEffect(() => {
    return () => {
      if (lockTimerRef.current) {
        clearInterval(lockTimerRef.current);
      }
    };
  }, []);

  // 
  // State Reset Logic (Req 11)
  // 

  /**
   * Reset date and time selections while preserving other state.
   * Req 11.1, 11.2, 11.3: Display message explaining why reset occurred.
   * Req 11.4: Preserve customer's other selections (Party_Size, Decoration_Details, etc.)
   */
  const resetDateTime = useCallback((reason: 'booking_type' | 'promo_code' | 'decoration') => {
    // Clear date/time state
    setSelectedDate(null);
    setSelectedTime(null);
    setEndTime(null);
    setSessionDuration(null);
    setSelectedSlot(null);
    setAvailableSlots([]);
    setSlotsLoading(false);
    setSlotsError(null);
    // Reset date picker scroll position
    setDatePickerIdx(0);
    setDatePickerConfirming(false);

    // Clear table lock state
    setTableLock(null);
    setLockAcquiring(false);
    setLockError(null);
    setLockExpiryTime(null);
    setLockWarning(false);

    // Clear lock timer
    if (lockTimerRef.current) {
      clearInterval(lockTimerRef.current);
      lockTimerRef.current = null;
    }

    // Set reset message based on reason (Req 11.3)
    const messages = {
      booking_type: 'Booking type changed. Please select a new date and time.',
      promo_code: 'Promo code changed. Please select a new date and time.',
      decoration: 'Decoration preference changed. Please select a new date and time.',
    };

    setResetMessage(messages[reason]);
    setResetMessageType(reason === 'booking_type' ? 'warning' : 'info');

    // Auto-clear message after 5 seconds
    setTimeout(() => {
      setResetMessage(null);
    }, 5000);
  }, []);

  // 
  // Step 1: Booking Type Selection
  // 
  
  const handleBookingTypeSelect = useCallback((type: BookingType) => {
    // Set booking type and corresponding lead time
    setBookingType(type);
    setMinLeadTime(type === 'standard' ? 24 : 48);

    // Reset date/time if booking type changes (State Reset Logic per Req 11.1)
    // Also clear promo code state since lead time may change
    setPromoCode('');
    setPromoValid(null);
    setPromoValidating(false);
    setPromoResult(null);
    setPromoError(null);
    setPromoWarning(null);

    // Reset date/time if booking type changes (State Reset Logic per Req 11.1)
    // Only show the reset message if the user had already selected a date/time 
    // on first selection there is nothing to reset so the message is unnecessary.
    if (selectedDate || selectedTime) {
      resetDateTime('booking_type');
    }

    // Advance to Step 2 (Party Size)
    setTimeout(() => setStep('pax'), 800);
  }, [resetDateTime, selectedDate, selectedTime]);

  const renderStep1 = () => (
    <div className="bf-step bf-fade-in">
      <h2>What type of booking?</h2>
      <p className="bf-step-subtitle">Choose your dining experience</p>

      {/* State Reset Message (Req 11.3) */}
      {resetMessage && (
        <div className={`bf-reset-message bf-reset-message--${resetMessageType}`}>
          <span className="bf-reset-icon">{resetMessageType === 'warning' ? '[!]' : '[i]'}</span>
          <span className="bf-reset-text">{resetMessage}</span>
        </div>
      )}

      <div className="bf-booking-type-options">
        <button
          className="bf-booking-type-btn bf-booking-type-btn--standard"
          onClick={() => handleBookingTypeSelect('standard')}
        >
          <div className="bf-booking-type-icon">
            
          </div>
          <div className="bf-booking-type-content">
            <span className="bf-booking-type-title">Standard Dining</span>
            <span className="bf-booking-type-desc">Regular table reservation</span>
            <span className="bf-booking-type-meta">
              
              24h advance notice
            </span>
          </div>
          <div className="bf-booking-type-arrow"></div>
        </button>

        <button
          className="bf-booking-type-btn bf-booking-type-btn--decorated"
          onClick={() => handleBookingTypeSelect('decorated')}
        >
          <div className="bf-booking-type-icon">
            
          </div>
          <div className="bf-booking-type-content">
            <span className="bf-booking-type-title">Special Occasion</span>
            <span className="bf-booking-type-desc">Table decoration included</span>
            <span className="bf-booking-type-meta">
              
              48h advance notice
            </span>
          </div>
          <div className="bf-booking-type-arrow"></div>
        </button>
      </div>
    </div>
  );

  // 
  // Step 1b: Party Size (PAX) Selection
  // 

  const handlePaxSelect = useCallback((size: number) => {
    setPax(size);
    setTimeout(() => setStep('promo_code'), 600);
  }, []);

  const renderStepPax = () => {
    const options = [1, 2, 3, 4, 5, 6, 7, 8];
    return (
      <div className="bf-step bf-fade-in">
        <h2>How many guests?</h2>
        <p className="bf-step-subtitle">Select your party size</p>
        <div className="bf-pax-grid">
          {options.map(n => (
            <button
              key={n}
              className={`bf-pax-btn ${pax === n ? 'bf-pax-btn--selected' : ''}`}
              onClick={() => handlePaxSelect(n)}
            >
              <span className="bf-pax-number">{n}</span>
              <span className="bf-pax-label">{n === 1 ? 'guest' : 'guests'}</span>
            </button>
          ))}
        </div>
        <button className="bf-back-btn" style={{ marginTop: 24 }}
          onClick={() => setStep('booking_type')}> Back </button>
      </div>
    );
  };

  // 
  // Step 2: Promo Code Input & Validation
  // 
  
  // Validate promo code against backend
  const validatePromo = useCallback(async (code: string) => {
    if (!code.trim() || !bookingType) return;
    
    setPromoValidating(true);
    setPromoError(null);
    setPromoWarning(null);
    
    try {
      const result = await validatePromoCode(branchId, code.trim().toUpperCase(), bookingType, pax || 2);
      setPromoResult(result);
      
      if (result.valid) {
        setPromoValid(true);
        // Apply lead time override if valid promo code provides one
        if (result.overrideLeadTime) {
          setMinLeadTime(result.overrideLeadTime as LeadTime);
        }
      } else {
        setPromoValid(false);
        setPromoError(result.error || 'Invalid promo code');
      }
      
      // Show warning if code is valid but has restrictions
      if (result.warning) {
        setPromoWarning(result.warning);
      }
    } catch (err) {
      // Network or server error - treat as invalid
      setPromoValid(false);
      setPromoError(err instanceof Error ? err.message : 'Validation failed');
      setPromoResult(null);
    } finally {
      setPromoValidating(false);
    }
  }, [branchId, bookingType, pax]);

  // Handle promo code input change with debounced validation
  const handlePromoCodeChange = useCallback((value: string) => {
    setPromoCode(value);
    setPromoValid(null);
    setPromoError(null);
    setPromoWarning(null);
    setPromoResult(null);

    // Clear promo lead time override when code is cleared
    if (value.trim() === '' && bookingType) {
      setMinLeadTime(bookingType === 'standard' ? 24 : 48);
    }

    // Reset date/time if promo code changes (Req 11.2)
    // This handles: entering, clearing, or changing the code
    if (value.trim() !== '' || (value.trim() === '' && bookingType)) {
      // Only reset if we have a date/time selected
      if (selectedDate || selectedTime) {
        resetDateTime('promo_code');
      }
    }
  }, [bookingType, selectedDate, selectedTime, resetDateTime]);

  // Handle form submission
  const handlePromoSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (promoCode.trim()) {
      validatePromo(promoCode);
    }
  }, [promoCode, validatePromo]);

  // Skip promo code and proceed to date selection
  const handleSkipPromo = useCallback(() => {
    // Clear promo state when skipping
    setPromoCode('');
    setPromoValid(null);
    setPromoResult(null);
    setPromoError(null);
    setPromoWarning(null);
    
    // Reset lead time to default based on booking type
    setMinLeadTime(bookingType === 'standard' ? 24 : 48);
    
    // Advance to Step 3 (Date)
    setTimeout(() => setStep('date'), 800);
  }, [bookingType]);

  // Proceed after successful promo validation
  const handlePromoSuccess = useCallback(() => {
    if (promoValid) {
      // Advance to Step 3 (Date)
      setTimeout(() => setStep('date'), 800);
    }
  }, [promoValid]);

  // 
  // Step 3: Date Selection with Lead-Time Validation
  // 

  /**
   * Calculate the minimum allowed date based on lead-time requirements.
   * - Standard booking: T+24h (next day, same time)
   * - Decorated booking: T+48h (2 days later, same time)
   * - Priority promo code: T+1h (1 hour from now)
   */
  const getMinAllowedDate = useCallback((): Date => {
    const now = new Date();
    const leadTimeHours = minLeadTime || (bookingType === 'standard' ? 24 : 48);
    
    // For priority promo codes with 1h lead time, we need to check if it's within the same day
    if (leadTimeHours === 1) {
      // Return 1 hour from now
      const minDate = new Date(now);
      minDate.setHours(minDate.getHours() + 1);
      return minDate;
    }
    
    // For 24h or 48h lead time, return the same time on the future date
    const minDate = new Date(now);
    minDate.setHours(minDate.getHours() + leadTimeHours);
    return minDate;
  }, [minLeadTime, bookingType]);

  /**
   * Check if a date is available based on lead-time rules.
   * Dates that don't meet lead-time requirements are disabled.
   */
  const isDateAvailable = useCallback((dateStr: string): boolean => {
    const selectedDate = new Date(dateStr);
    // Set to midnight for date comparison
    selectedDate.setHours(0, 0, 0, 0);
    
    const minAllowed = getMinAllowedDate();
    minAllowed.setHours(0, 0, 0, 0);
    
    // For same-day bookings with 1h lead time, we need more precise check
    if (minLeadTime === 1) {
      const now = new Date();
      const minDate = new Date(now);
      minDate.setHours(minDate.getHours() + 1);
      
      // If selected date is today, check if time is still available
      const today = now.toISOString().split('T')[0];
      if (dateStr === today) {
        return minDate <= new Date();
      }
    }
    
    return selectedDate >= minAllowed;
  }, [minLeadTime, getMinAllowedDate]);

  /**
   * Fetch available time slots for a selected date.
   * Calls GET /available-slots to check date availability.
   */
  const fetchAvailableSlots = useCallback(async (dateStr: string) => {
    if (!branchId || !bookingType) return;
    
    setSlotsLoading(true);
    setSlotsError(null);
    
    try {
      const slots = await getAvailableSlots({
        branchId,
        date: dateStr,
        partySize: pax || 2,
        isDecorated: bookingType === 'decorated',
        promoCode: promoCode || undefined,
      });
      setAvailableSlots(slots);
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : 'Failed to load time slots');
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [branchId, bookingType, pax, promoCode]);

  /**
   * Handle date confirmation - advance to Step 4 (Decoration).
   */
  const handleDateConfirm = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
    // Fetch available slots for the selected date immediately
    fetchAvailableSlots(dateStr);
    setTimeout(() => setStep('time'), 800);
  }, [fetchAvailableSlots]);

  /**
   * Handle going back to Step 2 (Promo Code).
   */
  const handleBackToPromo = useCallback(() => {
    setSelectedDate(null);
    setAvailableSlots([]);
    setSlotsError(null);
    setTimeout(() => setStep('promo_code'), 400);
  }, []);

  /**
   * Format date for display with lead-time info.
   */
  const formatDateWithLeadTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const minDate = getMinAllowedDate();
    
    // Check if this is the earliest available date
    const isEarliest = date.toDateString() === minDate.toDateString();
    
    let label = date.toLocaleDateString('en-MY', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    
    if (isEarliest && minLeadTime === 1) {
      label += ' (Earliest - 1h notice)';
    } else if (isEarliest) {
      label += ` (${minLeadTime}h notice required)`;
    }
    
    return label;
  };

  /**
   * Render the date selection calendar with lead-time validation.
   * Grey out dates that don't satisfy the current lead-time rule.
   */
  const renderStep3 = () => {
    // Generate available dates (90 days from minimum allowed date)
    const minDate = getMinAllowedDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculate start date based on lead-time
    const startDate = new Date(today);
    if (minLeadTime === 1) {
      // For 1h lead time, start from today
      startDate.setHours(0, 0, 0, 0);
    } else {
      // For 24h/48h, start from the minimum allowed date
      startDate.setTime(minDate.getTime());
      startDate.setHours(0, 0, 0, 0);
    }

    const dateOptions = Array.from({ length: 90 }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      return {
        label: formatDateWithLeadTime(date.toISOString().split('T')[0]),
        value: date.toISOString().split('T')[0],
        available: isDateAvailable(date.toISOString().split('T')[0]),
      };
    }).filter(d => d.available);

    const selectedIdx = datePickerIdx;
    const setSelectedIdx = setDatePickerIdx;
    const isConfirming = datePickerConfirming;
    const setIsConfirming = setDatePickerConfirming;

    const handleConfirm = async () => {
      if (selectedIdx >= dateOptions.length) return;
      
      setIsConfirming(true);
      await new Promise(r => setTimeout(r, 300));
      handleDateConfirm(dateOptions[selectedIdx].value);
      setIsConfirming(false);
    };

    return (
      <div className="bf-step bf-fade-in">
        <h2>Choose a date</h2>
        <p className="bf-step-subtitle">
          {minLeadTime === 1 
            ? 'Priority booking - select your preferred date'
            : `Available dates (${minLeadTime}h advance notice required)`
          }
        </p>
        
        {/* State Reset Message (Req 11.3) */}
        {resetMessage && (
          <div className={`bf-reset-message bf-reset-message--${resetMessageType}`}>
            <span className="bf-reset-icon">{resetMessageType === 'warning' ? '[!]' : '[i]'}</span>
            <span className="bf-reset-text">{resetMessage}</span>
          </div>
        )}

        {/* Lead-time info banner */}
        <div className="bf-lead-time-banner">
          
          <span className="bf-lead-time-text">
            {minLeadTime === 1 
              ? 'Priority code applied - 1 hour minimum notice'
              : `${minLeadTime} hours advance notice required`
            }
            {promoValid === true && promoResult?.overrideLeadTime && (
              <span className="bf-lead-time-override">
                {' '} (reduced from {bookingType === 'standard' ? '24h' : '48h'})
              </span>
            )}
          </span>
        </div>

        {/* Date scroll picker */}
        <div className="bf-date-picker">
          <div className="bf-date-scroll-wrapper">
            <div className="bf-date-highlight" />
            <div className="bf-date-scroll-container" ref={dateScrollRef}>
              {dateOptions.map((dateOption, idx) => (
                <button
                  key={dateOption.value}
                  className={`bf-date-item ${idx === selectedIdx ? 'bf-date-item--selected' : ''}`}
                  onClick={() => setSelectedIdx(idx)}
                  disabled={!dateOption.available}
                >
                  <span className="bf-date-label">{dateOption.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected date display */}
        {dateOptions[selectedIdx] && (
          <div className="bf-selected-date-display">
            <span className="bf-selected-label">Selected:</span>
            <span className="bf-selected-value">
              {dateOptions[selectedIdx].label}
            </span>
          </div>
        )}

        {/* Available slots preview */}
        {selectedDate && (
          <div className="bf-slots-preview">
            <h4>Available times for this date</h4>
            {slotsLoading ? (
              <div className="bf-slots-loading">
                <span className="bf-spinner" /> Loading available times...
              </div>
            ) : slotsError ? (
              <div className="bf-slots-error">
                
                {slotsError}
              </div>
            ) : availableSlots.length > 0 ? (
              <div className="bf-slots-list">
                {availableSlots.slice(0, 5).map((slot, idx) => (
                  <div key={idx} className="bf-slot-item">
                    <span className="bf-slot-time">
                      {slot.startTime} - {slot.endTime}
                    </span>
                    <span className="bf-slot-duration">
                      ({slot.duration / 60}h session)
                    </span>
                    {!slot.available && (
                      <span className="bf-slot-unavailable">Unavailable</span>
                    )}
                  </div>
                ))}
                {availableSlots.length > 5 && (
                  <span className="bf-slots-more">
                    +{availableSlots.length - 5} more times available
                  </span>
                )}
              </div>
            ) : (
              <div className="bf-slots-empty">
                No available times for this date
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="bf-date-actions">
          <button
            className="bf-back-btn"
            onClick={handleBackToPromo}
          > Back </button>
          <button
            className="bf-date-confirm-btn"
            onClick={handleConfirm}
            disabled={isConfirming || dateOptions.length === 0}
          >
            {isConfirming ? 'Recording...' : 'Continue'}
          </button>
        </div>
      </div>
    );
  };

  const renderStep2 = () => (
    <div className="bf-step bf-fade-in">
      <h2>Have a promo code?</h2>
      <p className="bf-step-subtitle">
        Enter your code for discounts, priority booking, or special offers
      </p>

      {/* State Reset Message (Req 11.3) */}
      {resetMessage && (
        <div className={`bf-reset-message bf-reset-message--${resetMessageType}`}>
          <span className="bf-reset-icon">{resetMessageType === 'warning' ? '[!]' : '[i]'}</span>
          <span className="bf-reset-text">{resetMessage}</span>
        </div>
      )}

      <form className="bf-promo-form" onSubmit={handlePromoSubmit}>
        <input
          type="text"
          className={`bf-input bf-promo-input ${promoValid === false ? 'bf-input--error' : ''} ${promoValid === true ? 'bf-input--success' : ''}`}
          placeholder="Enter promo code"
          value={promoCode}
          onChange={(e) => handlePromoCodeChange(e.target.value)}
          autoFocus
          maxLength={20}
          disabled={promoValidating}
        />
        <button 
          type="submit" 
          className="bf-promo-apply-btn"
          disabled={!promoCode.trim() || promoValidating}
        >
          {promoValidating ? 'Checking...' : 'Apply'}
        </button>
      </form>
      
      {/* Success feedback */}
      {promoValid === true && promoResult && (
        <div className="bf-promo-feedback bf-promo-feedback--success">
          
          <div className="bf-feedback-content">
            <span className="bf-feedback-title">Code Applied!</span>
            <span className="bf-feedback-message">
              {promoResult.code}  {promoResult.benefits || 'Promo code is valid'}
            </span>
            {promoResult.overrideLeadTime && (
              <span className="bf-feedback-meta">
                Lead-time reduced to {promoResult.overrideLeadTime}h
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Error feedback */}
      {promoValid === false && promoError && (
        <div className="bf-promo-feedback bf-promo-feedback--error">
          
          <div className="bf-feedback-content">
            <span className="bf-feedback-title">Invalid Code</span>
            <span className="bf-feedback-message">{promoError}</span>
          </div>
        </div>
      )}
      
      {/* Warning feedback (valid but with restrictions) */}
      {promoWarning && (
        <div className="bf-promo-feedback bf-promo-feedback--warning">
          
          <div className="bf-feedback-content">
            <span className="bf-feedback-title">Restriction Applied</span>
            <span className="bf-feedback-message">{promoWarning}</span>
          </div>
        </div>
      )}
      
      {/* Action buttons */}
      <div className="bf-promo-actions">
        {promoValid === true ? (
          <button
            className="bf-promo-continue-btn"
            onClick={handlePromoSuccess}
          >
            Continue 
          </button>
        ) : (
          <button 
            className="bf-skip-btn"
            onClick={handleSkipPromo}
          >
            Skip for now
          </button>
        )}
      </div>
      
      {/* Lead time info */}
      <div className="bf-promo-info">
        
        <span className="bf-info-text">
          Current lead-time: <strong>{minLeadTime}h</strong>
          {promoValid === true && promoResult?.overrideLeadTime && (
            <span className="bf-info-override">
              {' '} (reduced from {bookingType === 'standard' ? '24h' : '48h'})
            </span>
          )}
        </span>
      </div>
    </div>
  );

  // 
  // Auth Handlers
  // 

  const resetAuth = () => {
    setAuthStep('email');
    setEmail('');
    setPassword('');
    setOtp('');
    setName('');
    setPhone('');
    setAuthError('');
  };

  const closeAuth = () => {
    setAuthOpen(false);
    resetAuth();
  };

  const handleAuthIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch('/auth/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.message || 'Failed');
        return;
      }
      setAuthStep(data.challenge === 'password' ? 'password' : 'otp');
    } catch {
      setAuthError('Connection error. Try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch('/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.message || 'Invalid code');
        return;
      }
      localStorage.setItem('customer_token', data.accessToken);
      onLogin?.(data.accessToken);
      closeAuth();
    } catch {
      setAuthError('Connection error. Try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.message || 'Invalid credentials');
        return;
      }
      localStorage.setItem('customer_token', data.accessToken);
      onLogin?.(data.accessToken);
      closeAuth();
    } catch {
      setAuthError('Connection error. Try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.message || 'Registration failed');
        return;
      }
      setAuthMode('login');
      setAuthStep('otp');
    } catch {
      setAuthError('Connection error. Try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // (handlePaxSelect and handleTimeConfirm removed  legacy step flow no longer used)

  // 
  // Step 4: Decoration Selection
  // 

  /**
   * Handle decoration selection (Yes/No).
   * Note: Decoration selection happens AFTER Date selection per design,
   * so it does NOT change the Lead_Time rule (prevents dead ends per Req 1.6).
   */
  const handleDecorationSelect = useCallback((wantsDecoration: boolean) => {
    setIsDecorated(wantsDecoration);

    // Decoration is now selected AFTER time  no need to reset date/time

    // Advance to next step based on selection
    if (wantsDecoration) {
      setTimeout(() => setStep('color'), 800);
    } else {
      setTimeout(() => setStep('cake'), 800);
    }
  }, [selectedDate, selectedTime, resetDateTime]);

  /**
   * Handle color selection for decoration.
   */
  const handleColorSelect = useCallback((color: string) => {
    setDecorationColor(color);
    setTimeout(() => setStep('cake'), 800);
  }, []);

  /**
   * Handle cake preference selection (Yes/No).
   */
  const handleCakePreferenceSelect = useCallback((wantsCake: boolean) => {
    setCakePreference(wantsCake);
    setTimeout(() => setStep('confirm'), 800);
  }, []);

  /**
   * Handle going back from decoration step to time selection.
   */
  const handleBackToTime = useCallback(() => {
    setTimeout(() => setStep('time'), 400);
  }, []);

  // 
  // Step 5: Time Selection with Table Locking (Req 1.7, Req 3.2, Req 5.1, Req 5.6)
  // 

  /**
   * Calculate end time based on start time and session duration.
   * Req 3.2: Display end time prominently (e.g., "7:00 PM - 10:00 PM (3-hour session)")
   */
  const calculateEndTime = useCallback((start: string, durationMinutes: number): string => {
    const [hours, minutes] = start.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
    
    return `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
  }, []);

  /**
   * Format time for display (24h to 12h format with AM/PM).
   */
  const formatTimeDisplay = useCallback((time24: string): string => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
  }, []);

  /**
   * Format duration for display (minutes to human-readable).
   */
  const formatDurationDisplay = useCallback((minutes: number): string => {
    if (minutes >= 60) {
      const hours = minutes / 60;
      return hours === Math.floor(hours) 
        ? `${hours}-hour` 
        : `${hours}-hour`;
    }
    return `${minutes} min`;
  }, []);

  /**
   * Handle time slot selection.
   * Req 5.1: Immediately call POST /tables/:tableId/lock to acquire 30-minute Redis lock.
   */
  const handleTimeSlotSelect = useCallback(async (slot: AvailableSlot) => {
    if (!selectedDate || !bookingType || !branchId) return;
    
    setSelectedTime(slot.startTime);
    setEndTime(slot.endTime);
    setSessionDuration(slot.duration);
    setSelectedSlot(slot);
    setLockAcquiring(true);
    setLockError(null);
    setLockWarning(false);

    try {
      // Find an available table for the selected time slot
      const availableTable = tables.find(
        t => t.is_active && t.capacity >= (pax || 2) && t.status === 'available'
      );

      if (!availableTable) {
        setLockError('No tables available for this time slot');
        setLockAcquiring(false);
        return;
      }

      // Acquire table lock (Req 5.1)
      const sessionId = getSessionId();
      const lockResult = await acquireLock(branchId, availableTable.id, sessionId);

      if (!lockResult.acquired) {
        // Req 5.3: Display error and return to time selection
        setLockError(lockResult.alternatives && lockResult.alternatives.length > 0
          ? 'Table was just taken. Please select another time.'
          : 'Table was just taken. Please select another time.');
        setLockAcquiring(false);
        return;
      }

      // Lock acquired successfully
      setTableLock(lockResult);
      
      // Set lock expiry time (30 minutes from now)
      const expiryTime = new Date(Date.now() + 30 * 60 * 1000);
      setLockExpiryTime(expiryTime);

      // Start lock expiry countdown
      if (lockTimerRef.current) {
        clearInterval(lockTimerRef.current);
      }

      lockTimerRef.current = setInterval(() => {
        const now = new Date();
        const remaining = expiryTime.getTime() - now.getTime();
        
        // Req 5.6: Display warning when lock is about to expire (< 5 minutes remaining)
        if (remaining > 0 && remaining < 5 * 60 * 1000) {
          setLockWarning(true);
        }
        
        // Clear timer if lock expired
        if (remaining <= 0) {
          if (lockTimerRef.current) {
            clearInterval(lockTimerRef.current);
            lockTimerRef.current = null;
          }
          setLockWarning(false);
        }
      }, 1000);

      // Advance to decoration step after successful lock
      setTimeout(() => setStep('decoration'), 800);
    } catch (err) {
      setLockError(err instanceof Error ? err.message : 'Failed to acquire table lock');
    } finally {
      setLockAcquiring(false);
    }
  }, [selectedDate, bookingType, branchId, tables, pax]);

  /**
   * Handle going back from time selection to date selection.
   */
  const handleBackToDate = useCallback(() => {
    setSelectedTime(null);
    setEndTime(null);
    setSessionDuration(null);
    setSelectedSlot(null);
    setTableLock(null);
    setLockError(null);
    setLockWarning(false);
    
    if (lockTimerRef.current) {
      clearInterval(lockTimerRef.current);
      lockTimerRef.current = null;
    }
    
    setTimeout(() => setStep('date'), 400);
  }, []);

  /**
   * Render Step 5: Time Selection UI with available slots.
   * Req 1.7: Display start time, end time, and session duration.
   * Req 5.1: Implement table lock acquisition on time selection.
   * Req 5.6: Display lock expiry warning.
   */
  const renderStep5 = useCallback(() => {
    // Filter available slots only
    const availableTimeSlots = availableSlots.filter(slot => slot.available);

    return (
      <div className="bf-step bf-fade-in">
        <h2>Choose a time</h2>
        <p className="bf-step-subtitle">
          {selectedDate 
            ? `Available times for ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric' })}`
            : 'Select a time for your reservation'
          }
        </p>

        {/* State Reset Message (Req 11.3) */}
        {resetMessage && (
          <div className={`bf-reset-message bf-reset-message--${resetMessageType}`}>
            <span className="bf-reset-icon">{resetMessageType === 'warning' ? '[!]' : '[i]'}</span>
            <span className="bf-reset-text">{resetMessage}</span>
          </div>
        )}

        {/* Session duration info banner */}
        <div className="bf-session-duration-banner">
          
          <span className="bf-session-text">
            {selectedTime && sessionDuration ? (
              <>
                {formatTimeDisplay(selectedTime)} - {formatTimeDisplay(endTime || '')} 
                <span className="bf-session-duration"> ({formatDurationDisplay(sessionDuration)} session)</span>
              </>
            ) : (
              <>
                Daytime: 1.5h | Evening (7PM+): 3h
                {promoValid === true && promoResult?.type === 'vip' && (
                  <span className="bf-session-override"> (VIP: 3h enforced)</span>
                )}
              </>
            )}
          </span>
        </div>

        {/* Lock error display (Req 5.3) */}
        {lockError && (
          <div className="bf-lock-error">
            
            <span className="bf-lock-error-text">{lockError}</span>
          </div>
        )}

        {/* Lock acquiring loading state (Req 5.1) */}
        {lockAcquiring && (
          <div className="bf-lock-loading">
            <span className="bf-spinner" />
            <span>Securing your table...</span>
          </div>
        )}

        {/* Lock expiry warning (Req 5.6) */}
        {lockWarning && lockExpiryTime && (
          <div className="bf-lock-warning">
            
            <div className="bf-warning-content">
              <span className="bf-warning-title">Table lock expiring soon</span>
              <span className="bf-warning-text">
                Complete your booking within {Math.ceil((lockExpiryTime.getTime() - Date.now()) / 60000)} minutes
              </span>
            </div>
          </div>
        )}

        {/* Time slots grid */}
        {availableSlots.length > 0 ? (
          <div className="bf-time-slots-grid">
            {availableSlots.map((slot, idx) => (
              <button
                key={idx}
                className={`bf-time-slot-btn ${!slot.available ? 'bf-time-slot-btn--unavailable' : ''} ${selectedTime === slot.startTime ? 'bf-time-slot-btn--selected' : ''}`}
                onClick={() => slot.available && handleTimeSlotSelect(slot)}
                disabled={!slot.available || lockAcquiring}
              >
                <span className="bf-slot-time-main">
                  {formatTimeDisplay(slot.startTime)}
                </span>
                <span className="bf-slot-time-end">
                  - {formatTimeDisplay(slot.endTime)}
                </span>
                <span className="bf-slot-duration-badge">
                  {formatDurationDisplay(slot.duration)}
                </span>
                {!slot.available && (
                  <span className="bf-slot-unavailable-badge">Taken</span>
                )}
              </button>
            ))}
          </div>
        ) : slotsLoading ? (
          <div className="bf-slots-loading">
            <span className="bf-spinner" />
            <span>Loading available times...</span>
          </div>
        ) : slotsError ? (
          <div className="bf-slots-error">
            
            {slotsError}
          </div>
        ) : (
          <div className="bf-slots-empty">
            No available times for this date
          </div>
        )}

        {/* Action buttons */}
        <div className="bf-time-actions">
          <button
            className="bf-back-btn"
            onClick={handleBackToDate}
            disabled={lockAcquiring}
          > Back </button>
        </div>
      </div>
    );
  }, [selectedDate, availableSlots, slotsLoading, slotsError, selectedTime, endTime, sessionDuration, 
      lockError, lockAcquiring, lockWarning, lockExpiryTime, promoValid, promoResult,
      formatTimeDisplay, formatDurationDisplay, handleTimeSlotSelect, handleBackToDate]);

  /**
   * Render Step 4: Decoration Selection UI.
   * This step allows customers to add table decoration.
   */
  const renderStep4 = useCallback(() => {
    return (
      <div className="bf-step bf-fade-in">
        <h2>Add a special touch?</h2>
        <p className="bf-step-subtitle">
          Enhance your dining experience with our decoration options
        </p>
        
        {/* Decoration options */}
        <div className="bf-decoration-options">
          <button
            className="bf-decoration-btn bf-decoration-btn--yes"
            onClick={() => handleDecorationSelect(true)}
          >
            
            <span className="bf-decoration-text">Yes, add decoration</span>
            <span className="bf-decoration-price">
              {decorationPackages.length > 0 
                ? `+RM ${decorationPackages[0]?.price || 50}`
                : '+RM 50'
              }
            </span>
          </button>
          
          <button
            className="bf-decoration-btn bf-decoration-btn--no"
            onClick={() => handleDecorationSelect(false)}
          >
            
            <span className="bf-decoration-text">No, skip decoration</span>
          </button>
        </div>
        
        {/* Decoration info note */}
        <div className="bf-decoration-info">
          
          <span className="bf-info-text">
            Choose from {decorationColors?.length || 0} color themes available
          </span>
        </div>
        
        {/* Back button */}
        <div className="bf-step-actions">
          <button
            className="bf-back-btn"
            onClick={handleBackToTime}
          >
             Back to Time Selection
          </button>
        </div>
      </div>
    );
  }, [decorationColors?.length, decorationPackages?.length, handleDecorationSelect, handleBackToTime]);

  /**
   * Render Color Selection UI (Step 4a).
   */
  const renderStep4Color = useCallback(() => {
    return (
      <div className="bf-step bf-fade-in">
        <h2>Choose a theme color</h2>
        <p className="bf-step-subtitle">
          Select a color theme for your table decoration
        </p>
        
        <div className="bf-color-grid">
          {decorationLoading ? (
            <p className="bf-loading-text">Loading colors</p>
          ) : decorationColors.length > 0 ? (
            decorationColors.map(color => (
              <button
                key={color.id}
                className="bf-color-btn"
                onClick={() => handleColorSelect(color.name)}
                title={color.name}
                aria-label={`Select ${color.name} color`}
              >
                <div
                  className="bf-color-swatch"
                  style={{ backgroundColor: color.hex_code }}
                />
                <span className="bf-color-name">{color.name}</span>
              </button>
            ))
          ) : (
            // Fallback colors when API unavailable
            [
              { name: 'Pink / Fuchsia', hex: '#E91E63' },
              { name: 'Blue / Turquoise', hex: '#00BCD4' },
              { name: 'Gold', hex: '#FFD700' },
              { name: 'Green', hex: '#4CAF50' },
              { name: 'Pink 1', hex: '#FF69B4' },
              { name: 'Pink 2', hex: '#FFB6C1' },
              { name: 'Light Pink', hex: '#FFC0CB' },
            ].map(color => (
              <button
                key={color.name}
                className="bf-color-btn"
                onClick={() => handleColorSelect(color.name)}
                title={color.name}
                aria-label={`Select ${color.name} color`}
              >
                <div
                  className="bf-color-swatch"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="bf-color-name">{color.name}</span>
              </button>
            ))
          )}
        </div>
        
        <div className="bf-step-actions">
          <button
            className="bf-back-btn"
            onClick={() => setStep('decoration')}
          > Back </button>
        </div>
      </div>
    );
  }, [decorationLoading, decorationColors, handleColorSelect]);

  /**
   * Render Cake Preference UI (Step 4b).
   */
  const renderStep4Cake = useCallback(() => {
    return (
      <div className="bf-step bf-fade-in">
        <h2>Would you like a cake?</h2>
        <p className="bf-step-subtitle">
          Complete your celebration with a special cake
        </p>
        
        <div className="bf-cake-options">
          <button
            className="bf-cake-btn bf-cake-btn--yes"
            onClick={() => handleCakePreferenceSelect(true)}
          >
            
            <span className="bf-cake-text">Yes, add a cake</span>
          </button>
          
          <button
            className="bf-cake-btn bf-cake-btn--no"
            onClick={() => handleCakePreferenceSelect(false)}
          >
            
            <span className="bf-cake-text">No cake needed</span>
          </button>
        </div>
        
        <div className="bf-step-actions">
          <button
            className="bf-back-btn"
            onClick={() => setStep(isDecorated ? 'color' : 'decoration')}
          > Back </button>
        </div>
      </div>
    );
  }, [isDecorated, handleCakePreferenceSelect]);

  // (Legacy handlers removed  use handleDecorationSelect / handleCakePreferenceSelect directly)

  // 
  // Step 6: Confirmation Summary & Submission
  // 

  /**
   * Format date for display.
   */
  const formatDateDisplay = useCallback((dateStr: string): string => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-MY', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }, []);

  /**
   * Handle confirmation button click.
   * Req: Submit reservation via POST /reservations with full booking data.
   */
  const handleConfirmClick = useCallback(async () => {
    // Require authentication for confirmation
    if (!token) {
      setAuthMode('login');
      setAuthOpen(true);
      return;
    }

    // Validate required state
    if (!bookingType || !selectedDate || !selectedTime || !endTime || !sessionDuration || !pax) {
      setError('Missing booking information. Please go back and complete all steps.');
      return;
    }

    if (!tableLock?.acquired) {
      setError('Table lock expired. Please go back and select a time again.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Find an available table for the selected time slot
      const availableTable = tables.find(
        t => t.is_active && t.capacity >= pax && t.status === 'available'
      );

      if (!availableTable) {
        setError('No tables available for your party size');
        setLoading(false);
        return;
      }

      // Create reservation via POST /reservations
      const result = await createReservation(branchId, {
        tableId: availableTable.id,
        sessionId: getSessionId(),
        reservationTime: `${selectedDate}T${selectedTime}:00`,
        partySize: pax,
        tcAcknowledged: true,
        specialRequests: specialRequests || undefined,
        // Decoration
        isDecorated: bookingType === 'decorated',
        has_decoration: isDecorated || false,
        decoration_color: decorationColor || undefined,
        occasion_type: occasionType || undefined,
        decoration_notes: decorationNotes || undefined,
        decoration_amount: isDecorated && decorationPackages.length > 0
          ? Number(decorationPackages[0]?.price || 50)
          : undefined,
        // Cake
        cake_choice: cakeSelection?.type === 'preference' ? cakeSelection.id : undefined,
        cake_menu_id: cakeSelection?.type === 'menu_item' ? cakeSelection.id : undefined,
        cake_custom_notes: cakeSelection?.customNotes || undefined,
        // Promo
        promoCode: promoValid && promoCode ? promoCode : undefined,
        promoCodeDiscount: promoValid && promoResult?.discountValue
          ? promoResult.discountValue
          : undefined,
        // Session / lock
        tableLockId: tableLock ? getSessionId() : undefined,
        sessionDurationMinutes: sessionDuration || undefined,
        endTime: endTime ? `${selectedDate}T${endTime}:00` : undefined,
      });

      setConfirmationResult(result);
      
      // Clear lock timer on successful reservation
      if (lockTimerRef.current) {
        clearInterval(lockTimerRef.current);
        lockTimerRef.current = null;
      }

      // Navigate to success screen
      setTimeout(() => setStep('success'), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reservation');
    } finally {
      setLoading(false);
    }
  }, [token, bookingType, selectedDate, selectedTime, endTime, sessionDuration, pax, 
      tableLock, tables, branchId, cakeSelection, isDecorated, decorationColor, 
      occasionType, decorationNotes, specialRequests]);

  /**
   * Handle going back from confirmation to cake selection.
   */
  const handleBackToCake = useCallback(() => {
    setTimeout(() => setStep('cake'), 400);
  }, []);

  /**
   * Render Step 6: Confirmation Summary.
   * Req: Display complete booking summary including:
   * - Booking_Type, Date, Start_Time, End_Time, Session_Duration
   * - Party_Size, Decoration_Details, Promo_Code (if applied), Deposit_Amount
   */
  const renderStep6 = useCallback(() => {
    const bookingTypeLabel = bookingType === 'standard' ? 'Standard Dining' : 'Special Occasion';
    const depositAmount = 50; // Default deposit amount, would come from API in real implementation

    return (
      <div className="bf-step bf-fade-in">
        <h2>Confirm your reservation</h2>
        <p className="bf-step-subtitle">Please review your booking details</p>

        {/* Booking Summary */}
        <div className="bf-confirm-box">
          {/* Booking Type */}
          <div className="bf-confirm-row">
            <span className="bf-label">Booking Type</span>
            <span className="bf-value">{bookingTypeLabel}</span>
          </div>

          {/* Date */}
          <div className="bf-confirm-row">
            <span className="bf-label">Date</span>
            <span className="bf-value">
              {selectedDate ? formatDateDisplay(selectedDate) : '-'}
            </span>
          </div>

          {/* Time */}
          <div className="bf-confirm-row">
            <span className="bf-label">Time</span>
            <span className="bf-value">
              {selectedTime && endTime 
                ? `${formatTimeDisplay(selectedTime)} - ${formatTimeDisplay(endTime)}`
                : '-'
              }
            </span>
          </div>

          {/* Duration */}
          <div className="bf-confirm-row">
            <span className="bf-label">Duration</span>
            <span className="bf-value">
              {sessionDuration ? formatDurationDisplay(sessionDuration) : '-'}
            </span>
          </div>

          {/* Party Size */}
          <div className="bf-confirm-row">
            <span className="bf-label">Party Size</span>
            <span className="bf-value">{pax ? `${pax} people` : '-'}</span>
          </div>

          {/* Promo Code */}
          {promoValid === true && promoCode && (
            <div className="bf-confirm-row">
              <span className="bf-label">Promo Code</span>
              <span className="bf-value bf-promo-value">{promoCode}</span>
            </div>
          )}

          {/* Decoration Details */}
          {isDecorated && (
            <div className="bf-confirm-row">
              <span className="bf-label">Decoration</span>
              <span className="bf-value">
                {decorationColor || 'Selected'}
                {decorationPackages.length > 0 && (
                  <span className="bf-decoration-fee-inline">
                    {' '}(+RM {decorationPackages[0]?.price || 50})
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Deposit Amount */}
          <div className="bf-confirm-row bf-confirm-row--deposit">
            <span className="bf-label">Deposit Required</span>
            <span className="bf-value bf-deposit-value">RM {depositAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Special Requests */}
        <div className="bf-form-section">
          <label>Special requests (optional)</label>
          <textarea
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            placeholder="Allergies, seating preferences, etc."
            rows={3}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="bf-error">
            
            {error}
          </div>
        )}

        {/* Confirmation Buttons */}
        <div className="bf-confirm-buttons">
          <button
            className="bf-confirm-btn"
            onClick={handleConfirmClick}
            disabled={loading}
          >
            {loading ? 'Confirming...' : 'Confirm Reservation'}
          </button>
          <button 
            className="bf-restart-btn" 
            onClick={handleBackToCake}
            disabled={loading}
          > Back </button>
        </div>

        {/* Deposit Info Note */}
        <div className="bf-deposit-info">
          
          <span className="bf-info-text">
            Deposit will be charged and refunded after your visit
          </span>
        </div>
      </div>
    );
  }, [bookingType, selectedDate, selectedTime, endTime, sessionDuration, pax, 
      promoValid, promoCode, isDecorated, decorationColor, decorationPackages,
      error, loading, specialRequests, formatTimeDisplay, formatDurationDisplay, 
      formatDateDisplay, handleConfirmClick, handleBackToCake]);

  // Legacy handleConfirm removed  use handleConfirmClick instead

  const handleRestart = () => {
    // Clear lock timer
    if (lockTimerRef.current) {
      clearInterval(lockTimerRef.current);
      lockTimerRef.current = null;
    }

    // Reset all booking flow state
    setBookingType(null);
    setMinLeadTime(null);
    // Reset promo code state
    setPromoCode('');
    setPromoValid(null);
    setPromoValidating(false);
    setPromoResult(null);
    setPromoError(null);
    setPromoWarning(null);
    // Reset Step 3 (Date Selection) state
    setSelectedDate(null);
    setAvailableSlots([]);
    setSlotsLoading(false);
    setSlotsError(null);
    setDatePickerIdx(0);
    setDatePickerConfirming(false);
    // Reset Step 5 (Time Selection) state
    setSelectedTime(null);
    setEndTime(null);
    setSessionDuration(null);
    setSelectedSlot(null);
    setTableLock(null);
    setLockAcquiring(false);
    setLockError(null);
    setLockExpiryTime(null);
    setLockWarning(false);
    // Reset Step 4 (Decoration) state
    setIsDecorated(null);
    setDecorationColor(null);
    setCakePreference(null);
    // Reset other state
    setPax(null);
    setSpecialRequests('');
    setCakeSelection(null);
    setOccasionType(null);
    setDecorationNotes('');
    setError(null);
    setConfirmationResult(null);
    setStep('booking_type');
  };

  // Progress indicator helper - Req 14.3
  const getStepNumber = (): number => {
    const stepMap: Record<Step, number> = {
      intro: 0,
      booking_type: 1,
      pax: 2,
      promo_code: 3,
      date: 4,
      decoration: 5,
      color: 5,
      cake: 6,
      time: 6,
      confirm: 7,
      success: 8,
    };
    return stepMap[step];
  };

  const getStepLabel = (): string => {
    const labelMap: Record<Step, string> = {
      intro: 'Welcome',
      booking_type: 'Booking Type',
      pax: 'Party Size',
      promo_code: 'Promo Code',
      date: 'Date',
      decoration: 'Decoration',
      color: 'Color',
      cake: 'Cake',
      time: 'Time',
      confirm: 'Confirm',
      success: 'Done',
    };
    return labelMap[step];
  };

  const progressPercent = (getStepNumber() / 7) * 100;

  return (
    <div className="booking-flow">
      {/* Background */}
      <div className="bf-background" />

      {/* Top buttons */}
      {showTopButtons && (
        <div className="bf-top-buttons">
          <button 
            className="bf-menu-btn"
            onClick={() => setMenuOpen(true)}
          >
            Menu
          </button>
          <button className="bf-login-btn" onClick={() => {
            setAuthMode('login');
            setAuthOpen(true);
          }}>
            {token ? 'Account' : 'Login'}
          </button>
        </div>
      )}

      {/* Progress indicator - Req 14.3 */}
      {step !== 'intro' && step !== 'success' && (
        <>
          <div className="bf-progress-indicator">
            <div className="bf-progress-bar" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="bf-step-indicator">
            <span className="bf-step-number">{getStepNumber()}</span>
            <span className="bf-step-label">{getStepLabel()}</span>
          </div>
        </>
      )}

      {/* Intro */}
      {step === 'intro' && (
        <div className="bf-intro bf-fade-in-out">
          <h1>{branchName}</h1>
          <p>Reserve your table</p>
        </div>
      )}

      {/* Step 1: Booking Type Selection */}
      {step === 'booking_type' && renderStep1()}

      {/* Step 1b: Party Size */}
      {step === 'pax' && renderStepPax()}

      {/* Step 2: Promo Code */}
      {step === 'promo_code' && renderStep2()}

      {/* Step 3: Date Selection */}
      {step === 'date' && renderStep3()}

      {/* Step 4: Time Selection  comes right after date */}
      {step === 'time' && renderStep5()}

      {/* Step 5: Decoration Selection */}
      {step === 'decoration' && renderStep4()}

      {/* Step 5a: Color Selection */}
      {step === 'color' && renderStep4Color()}

      {/* Step 5b: Cake Preference */}
      {step === 'cake' && renderStep4Cake()}

      {/* Step 6: Confirmation Summary */}
      {step === 'confirm' && renderStep6()}

      {/* Success */}
      {step === 'success' && confirmationResult && (
        <div className="bf-step bf-fade-in">
          <div className="bf-success-box">
            <div className="bf-success-icon"></div>
            <h2>Reservation Confirmed!</h2>
            <p className="bf-ref">Ref: {confirmationResult.reservation.reference_number}</p>

            <div className="bf-success-details">
              <div className="bf-detail-row">
                <span>Date & Time</span>
                <span>
                  {new Date(confirmationResult.reservation.reservation_time).toLocaleDateString(
                    'en-MY',
                    { weekday: 'short', day: 'numeric', month: 'short' }
                  )}{' '}
                  at{' '}
                  {new Date(confirmationResult.reservation.reservation_time).toLocaleTimeString(
                    'en-MY',
                    { hour: '2-digit', minute: '2-digit' }
                  )}
                </span>
              </div>
              <div className="bf-detail-row">
                <span>Guests</span>
                <span>{confirmationResult.reservation.party_size}</span>
              </div>
              {confirmationResult.depositRequired && (
                <div className="bf-detail-row">
                  <span>Deposit</span>
                  <span>RM {confirmationResult.depositAmount.toFixed(2)}</span>
                </div>
              )}
              {isDecorated && (
                <div className="bf-detail-row">
                  <span>Decoration</span>
                  <span>{decorationColor} (+RM {decorationPackages[0]?.price || 50})</span>
                </div>
              )}
              {cakeSelection && (
                <div className="bf-detail-row">
                  <span>Cake</span>
                  <span>{cakeSelection.name}</span>
                </div>
              )}
            </div>

            <p className="bf-success-note">
              A confirmation email has been sent to your registered email.
            </p>

            <button className="bf-new-booking-btn" onClick={handleRestart}>
              Make Another Booking
            </button>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {authOpen && (
        <div className="bf-modal-backdrop" onClick={closeAuth}>
          <div className="bf-modal-card" onClick={e => e.stopPropagation()}>
            <button className="bf-modal-close" onClick={closeAuth} aria-label="Close"></button>

            {/* Tabs */}
            <div className="bf-modal-tabs">
              <button
                className={`bf-modal-tab ${authMode === 'login' ? 'bf-modal-tab--active' : ''}`}
                onClick={() => {
                  setAuthMode('login');
                  resetAuth();
                }}
              >
                Log In
              </button>
              <button
                className={`bf-modal-tab ${authMode === 'register' ? 'bf-modal-tab--active' : ''}`}
                onClick={() => {
                  setAuthMode('register');
                  resetAuth();
                }}
              >
                Register
              </button>
            </div>

            {authError && <div className="bf-modal-error">{authError}</div>}

            {/* Login flow */}
            {authMode === 'login' && authStep === 'email' && (
              <form onSubmit={handleAuthIdentify} className="bf-modal-form">
                <label>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
                <button type="submit" className="bf-modal-submit" disabled={authLoading}>
                  {authLoading ? 'Checking...' : 'Continue'}
                </button>
              </form>
            )}

            {authMode === 'login' && authStep === 'otp' && (
              <form onSubmit={handleAuthOtp} className="bf-modal-form">
                <p className="bf-modal-hint">
                  We sent a code to <strong>{email}</strong>
                </p>
                <label>Verification Code</label>
                <input
                  type="text"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  placeholder="123456"
                  required
                  autoFocus
                  maxLength={6}
                  inputMode="numeric"
                />
                <button type="submit" className="bf-modal-submit" disabled={authLoading}>
                  {authLoading ? 'Verifying...' : 'Verify'}
                </button>
                <button
                  type="button"
                  className="bf-modal-back"
                  onClick={() => {
                    setAuthStep('email');
                    setAuthError('');
                  }}
                >
                   Different email
                </button>
              </form>
            )}

            {authMode === 'login' && authStep === 'password' && (
              <form onSubmit={handleAuthPassword} className="bf-modal-form">
                <label>Email</label>
                <input type="email" value={email} disabled />
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder=""
                  required
                  autoFocus
                />
                <button type="submit" className="bf-modal-submit" disabled={authLoading}>
                  {authLoading ? 'Signing in...' : 'Sign In'}
                </button>
                <button
                  type="button"
                  className="bf-modal-back"
                  onClick={() => {
                    setAuthStep('email');
                    setAuthError('');
                  }}
                >
                   Different email
                </button>
              </form>
            )}

            {/* Register flow */}
            {authMode === 'register' && (
              <form onSubmit={handleAuthRegister} className="bf-modal-form">
                <label>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  autoFocus
                />
                <label>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <label>Phone (optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+60 12-345 6789"
                />
                <button type="submit" className="bf-modal-submit" disabled={authLoading}>
                  {authLoading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Menu Dialog */}
      <MenuDialog
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        branchName={branchName}
        currentPage={menuPage}
        onPageChange={setMenuPage}
      />
    </div>
  );
}
