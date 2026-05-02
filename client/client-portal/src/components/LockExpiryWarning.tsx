/**
 * LockExpiryWarning Component
 * 
 * Displays a warning when a table lock is about to expire (< 5 minutes remaining).
 * Shows a countdown timer in MM:SS format with a yellow background and warning icon.
 * 
 * Requirements:
 * - THE Booking_Flow SHALL display a lock expiry warning when the lock is about to expire (< 5 minutes remaining)
 * - WHEN the lock is about to expire, THE system SHALL prompt the customer to either complete the booking or release the lock
 */

import { useEffect, useState, useCallback } from 'react';
import './LockExpiryWarning.css';

interface LockExpiryWarningProps {
  /** ISO timestamp when the lock expires */
  lockExpiresAt: string;
  /** Callback when the user chooses to release the lock */
  onReleaseLock: () => void;
  /** Callback when the user chooses to complete the booking */
  onCompleteBooking: () => void;
  /** Optional: custom class name for additional styling */
  className?: string;
}

/**
 * Calculate remaining time in milliseconds until lock expiry
 * @param expiryTime - ISO timestamp of lock expiry
 * @returns Remaining time in milliseconds, or 0 if expired
 */
function calculateRemainingMs(expiryTime: string): number {
  const expiry = new Date(expiryTime).getTime();
  const now = Date.now();
  return Math.max(0, expiry - now);
}

/**
 * Format milliseconds to MM:SS display string
 * @param ms - Time in milliseconds
 * @returns Formatted string in MM:SS format
 */
function formatTimeDisplay(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Determine if warning should be shown based on remaining time
 * @param remainingMs - Remaining time in milliseconds
 * @returns True if warning should be displayed (< 5 minutes)
 */
function shouldShowWarning(remainingMs: number): boolean {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  return remainingMs > 0 && remainingMs < FIVE_MINUTES_MS;
}

export default function LockExpiryWarning({
  lockExpiresAt,
  onReleaseLock,
  onCompleteBooking,
  className = ''
}: LockExpiryWarningProps) {
  // Track remaining time in milliseconds
  const [remainingMs, setRemainingMs] = useState<number>(() => 
    calculateRemainingMs(lockExpiresAt)
  );

  // Update remaining time every second
  useEffect(() => {
    // Calculate initial value
    const initialRemaining = calculateRemainingMs(lockExpiresAt);
    setRemainingMs(initialRemaining);

    // Skip if already expired
    if (initialRemaining <= 0) return;

    // Update every second
    const intervalId = setInterval(() => {
      const newRemaining = calculateRemainingMs(lockExpiresAt);
      setRemainingMs(newRemaining);

      // Clear interval when expired
      if (newRemaining <= 0) {
        clearInterval(intervalId);
      }
    }, 1000);

    // Cleanup on unmount
    return () => clearInterval(intervalId);
  }, [lockExpiresAt]);

  // Determine if warning should be shown
  const showWarning = shouldShowWarning(remainingMs);

  // Handle case where lock has already expired
  const isExpired = remainingMs <= 0;

  // Don't render if warning shouldn't be shown and not expired
  if (!showWarning && !isExpired) {
    return null;
  }

  // Combine CSS classes
  const containerClass = `lock-expiry-warning ${isExpired ? 'lock-expiry-warning--expired' : ''} ${className}`.trim();

  return (
    <div className={containerClass} role="alert" aria-live="polite">
      {/* Warning Icon */}
      <div className="lock-expiry-warning__icon" aria-hidden="true">
        {isExpired ? '🔒' : '⚠️'}
      </div>

      {/* Message Content */}
      <div className="lock-expiry-warning__content">
        <div className="lock-expiry-warning__title">
          {isExpired ? 'Lock Expired' : 'Table Lock Expiring Soon'}
        </div>
        
        <div className="lock-expiry-warning__message">
          {isExpired ? (
            <p>Your table lock has expired. Please select a new time slot.</p>
          ) : (
            <>
              <p>Your table is reserved for <strong>{formatTimeDisplay(remainingMs)}</strong> more.</p>
              <p>Please complete your booking or release the lock for other customers.</p>
            </>
          )}
        </div>

        {/* Countdown Timer (only show when not expired) */}
        {!isExpired && (
          <div className="lock-expiry-warning__timer" aria-label={`Time remaining: ${formatTimeDisplay(remainingMs)}`}>
            <span className="lock-expiry-warning__timer-value">{formatTimeDisplay(remainingMs)}</span>
            <span className="lock-expiry-warning__timer-label">remaining</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="lock-expiry-warning__actions">
          <button
            type="button"
            className="lock-expiry-warning__btn lock-expiry-warning__btn--primary"
            onClick={onCompleteBooking}
            disabled={isExpired}
          >
            {isExpired ? 'Select New Time' : 'Complete Booking'}
          </button>
          <button
            type="button"
            className="lock-expiry-warning__btn lock-expiry-warning__btn--secondary"
            onClick={onReleaseLock}
          >
            Release Lock
          </button>
        </div>
      </div>
    </div>
  );
}

// Export helper functions for testing
export { calculateRemainingMs, formatTimeDisplay, shouldShowWarning };