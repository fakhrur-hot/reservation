/**
 * Table Selection Page â€” sejiwa Portal (Guests & Registered Customers)
 *
 * Step in the booking flow after authentication:
 *  1. Customer picks a section filter (optional)
 *  2. Sees all active tables with live status colour coding
 *  3. Selects a table â†’ acquires a 30-min Redis lock
 *  4. Fills in party size, date/time, special requests
 *  5. Confirms â†’ reservation created
 *
 * Backed by:
 *  GET  /api/v1/branches/:id/tables
 *  GET  /api/v1/branches/:id/sections
 *  POST /api/v1/branches/:id/tables/:tableId/lock
 *  POST /api/v1/reservations
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getSections, getActiveTables, acquireLock, createReservation, getDecorationColors, getDecorationPackages, validatePromoCode, lookupCustomer } from '../api';
import type { Section, Table, ReservationResult, CakeSelection, DecorationColor, DecorationPackage } from '../types';
import CakeSelector from '../components/CakeSelector';
import './TableSelectionPage.css';

const SESSION_ID = sessionStorage.getItem('session_id') ?? crypto.randomUUID();

const STATUS_CONFIG = {
  available: { label: 'Available',  color: '#22c55e', bg: '#f0fdf4', selectable: true  },
  locked:    { label: 'Held',       color: '#f59e0b', bg: '#fffbeb', selectable: false },
  reserved:  { label: 'Reserved',   color: '#3b82f6', bg: '#eff6ff', selectable: false },
  occupied:  { label: 'Occupied',   color: '#ef4444', bg: '#fef2f2', selectable: false },
} as const;

// â”€â”€â”€ Lock Timer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function LockTimer({ expiresAt, onExpire }: { expiresAt: Date; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const tick = () => {
      const secs = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setRemaining(secs);
      if (secs === 0) { clearInterval(ref.current); onExpire(); }
    };
    tick();
    ref.current = setInterval(tick, 1000);
    return () => clearInterval(ref.current);
  }, [expiresAt, onExpire]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const urgent = remaining < 120;

  return (
    <span className={`lock-timer ${urgent ? 'lock-timer--urgent' : ''}`}>
      â± {mins}:{String(secs).padStart(2, '0')} remaining
    </span>
  );
}

// â”€â”€â”€ Table Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TableCard({
  table,
  selected,
  onClick,
}: {
  table: Table;
  selected: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.available;

  return (
    <button
      className={`table-card ${selected ? 'table-card--selected' : ''} ${!cfg.selectable ? 'table-card--disabled' : ''}`}
      style={{ '--status-color': cfg.color, '--status-bg': cfg.bg } as React.CSSProperties}
      onClick={cfg.selectable ? onClick : undefined}
      disabled={!cfg.selectable}
      aria-pressed={selected}
      aria-label={`Table ${table.name}, ${table.capacity} seats, ${cfg.label}`}
    >
      <div className="tc-status-dot" />
      <div className="tc-name">{table.name}</div>
      <div className="tc-capacity">ðŸ‘¥ {table.capacity}</div>
      {table.has_window_view && <div className="tc-tag">ðŸªŸ Window</div>}
      {table.is_wheelchair_accessible && <div className="tc-tag">â™¿</div>}
      <div className="tc-status-label">{cfg.label}</div>
    </button>
  );
}

// â”€â”€â”€ Booking Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BookingForm({
  branchId,
  table,
  lockExpiresAt,
  onLockExpired,
  onConfirm,
  onCancel,
}: {
  branchId: string;
  table: Table;
  lockExpiresAt: Date;
  onLockExpired: () => void;
  onConfirm: (data: {
    partySize: number;
    reservationTime: string;
    specialRequests: string;
    cakeSelection: CakeSelection | null;
    hasDecoration: boolean | null;
    decorationColor: string | null;
    decorationNotes: string;
    promoCode?: string;
    promoCodeDiscount?: number;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [cakeSelection, setCakeSelection] = useState<CakeSelection | null>(null);
  const [hasDecoration, setHasDecoration] = useState<boolean | null>(null);
  const [decorationColor, setDecorationColor] = useState<string | null>(null);
  const [decorationNotes, setDecorationNotes] = useState('');
  const [decorationColors, setDecorationColors] = useState<DecorationColor[]>([]);
  const [decorationPackages, setDecorationPackages] = useState<DecorationPackage[]>([]);
  const [decorationLoading, setDecorationLoading] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoCodeDiscount, setPromoCodeDiscount] = useState<number | undefined>(undefined);
  const [promoCodeError, setPromoCodeError] = useState('');
  const [promoCodeValidating, setPromoCodeValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Default date to today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
    setTime('19:00');
  }, []);

  // Load decoration colors and packages
  useEffect(() => {
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
        // Silently fail - decorations optional
        console.error('Failed to load decoration data:', err);
      } finally {
        setDecorationLoading(false);
      }
    };
    load();
  }, [branchId]);

  // Validate promo code when the user blurs the input field
  const handlePromoCodeBlur = async () => {
    if (!promoCode.trim()) {
      setPromoCodeError('');
      setPromoCodeDiscount(undefined);
      return;
    }

    setPromoCodeValidating(true);
    setPromoCodeError('');
    try {
      const response = await validatePromoCode(branchId, {
        code: promoCode.toUpperCase(),
        branchId,
        bookingType: hasDecoration ? 'decorated' : 'standard',
        partySize,
        selectedDate: date,
        selectedTime: time,
      });

      if (!response.valid) {
        setPromoCodeError(response.error || 'Invalid promo code');
        setPromoCodeDiscount(undefined);
      } else if (response.details?.discountValue) {
        setPromoCodeDiscount(response.details.discountValue);
        setPromoCodeError('');
      } else {
        setPromoCodeError('');
        setPromoCodeDiscount(undefined);
      }
    } catch (err: any) {
      setPromoCodeError('Failed to validate promo code');
      setPromoCodeDiscount(undefined);
    } finally {
      setPromoCodeValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) { setError('Please select a date and time'); return; }
    if (partySize < 1 || partySize > table.capacity) {
      setError(`Party size must be between 1 and ${table.capacity}`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm({
        partySize,
        reservationTime: `${date}T${time}:00`,
        specialRequests,
        cakeSelection,
        hasDecoration,
        decorationColor,
        decorationNotes,
        promoCode: promoCode.trim() || undefined,
        promoCodeDiscount: promoCodeDiscount,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="booking-panel">
      <div className="booking-panel-header">
        <div>
          <h3>Complete Your Booking</h3>
          <p className="booking-table-info">
            Table <strong>{table.name}</strong> Â· up to {table.capacity} guests
          </p>
        </div>
        <LockTimer expiresAt={lockExpiresAt} onExpire={onLockExpired} />
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bf-row">
          <div className="bf-group">
            <label>Date *</label>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>
          <div className="bf-group">
            <label>Time *</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="bf-group">
          <label>Number of Guests *</label>
          <div className="party-size-control">
            <button
              type="button"
              className="ps-btn"
              onClick={() => setPartySize(p => Math.max(1, p - 1))}
            >âˆ’</button>
            <span className="ps-value">{partySize}</span>
            <button
              type="button"
              className="ps-btn"
              onClick={() => setPartySize(p => Math.min(table.capacity, p + 1))}
            >+</button>
            <span className="ps-max">of {table.capacity} max</span>
          </div>
        </div>

        <div className="bf-group">
          <label>Special Requests</label>
          <textarea
            value={specialRequests}
            onChange={e => setSpecialRequests(e.target.value)}
            placeholder="Allergies, occasion, seating preferencesâ€¦"
            rows={3}
          />
        </div>
        {/* Decoration selection */}
        <div className="bf-group">
          <label>Decoration</label>
          <div className="decoration-options">
            <button
              type="button"
              className={`decoration-btn ${hasDecoration === true ? 'decoration-btn--active' : ''}`}
              onClick={() => setHasDecoration(hasDecoration === true ? null : true)}
            >
              âœ¨ Yes, add decoration
              {decorationPackages.length > 0 && (
                <span className="decoration-price">+RM {decorationPackages[0]?.price || 50}</span>
              )}
            </button>
            <button
              type="button"
              className={`decoration-btn ${hasDecoration === false ? 'decoration-btn--active' : ''}`}
              onClick={() => setHasDecoration(hasDecoration === false ? null : false)}
            >
              âœ" No, skip
            </button>
          </div>
        </div>

        {hasDecoration && (
          <>
            <div className="bf-group">
              <label>Decoration Color</label>
              <div className="color-grid">
                {decorationLoading ? (
                  <p>Loading colorsâ€¦</p>
                ) : decorationColors.length > 0 ? (
                  decorationColors.map(color => (
                    <button
                      key={color.id}
                      type="button"
                      className={`color-btn ${decorationColor === color.name ? 'color-btn--active' : ''}`}
                      onClick={() => setDecorationColor(color.name)}
                      title={color.name}
                    >
                      <div
                        className="color-swatch"
                        style={{ backgroundColor: color.hex_code }}
                      />
                      <span className="color-name">{color.name}</span>
                    </button>
                  ))
                ) : (
                  // Fallback colors
                  [
                    { id: '1', name: 'Pink', hex_code: '#E91E63', sort_order: 1 },
                    { id: '2', name: 'Blue', hex_code: '#00BCD4', sort_order: 2 },
                    { id: '3', name: 'Gold', hex_code: '#FFD700', sort_order: 3 },
                    { id: '4', name: 'Green', hex_code: '#4CAF50', sort_order: 4 },
                  ].map(color => (
                    <button
                      key={color.id}
                      type="button"
                      className={`color-btn ${decorationColor === color.name ? 'color-btn--active' : ''}`}
                      onClick={() => setDecorationColor(color.name)}
                      title={color.name}
                    >
                      <div
                        className="color-swatch"
                        style={{ backgroundColor: color.hex_code }}
                      />
                      <span className="color-name">{color.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="bf-group">
              <label>Decoration Notes (optional)</label>
              <textarea
                value={decorationNotes}
                onChange={e => setDecorationNotes(e.target.value)}
                placeholder="Any special requests for your decoration?"
                rows={2}
              />
            </div>
          </>
        )}
        {/* Promo code section */}
        <div className="bf-group">
          <label>Promo Code (optional)</label>
          <div className="promo-code-input-wrapper">
            <input
              type="text"
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              onBlur={handlePromoCodeBlur}
              placeholder="Enter promo code"
              disabled={promoCodeValidating}
              className={promoCodeError ? 'promo-code-error' : ''}
            />
            {promoCodeValidating && <span className="promo-code-status">✓ Validating...</span>}
            {promoCodeError && <span className="promo-code-error-text">⚠ {promoCodeError}</span>}
            {promoCodeDiscount && !promoCodeError && (
              <span className="promo-code-discount">✓ Save RM {promoCodeDiscount.toFixed(2)}</span>
            )}
          </div>
        </div>
        {/* Cake selection (Req 27.1â€“27.5) */}
        <CakeSelector
          branchId={branchId}
          operatingMode="TABLE_ONLY"
          value={cakeSelection}
          onChange={setCakeSelection}
        />

        {error && <p className="bf-error">âš  {error}</p>}

        <div className="bf-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            â† Change Table
          </button>
          <button type="submit" className="btn-confirm" disabled={submitting}>
            {submitting ? 'Confirmingâ€¦' : 'Confirm Reservation'}
          </button>
        </div>
      </form>
    </div>
  );
}

// â”€â”€â”€ Confirmation Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ConfirmationScreen({
  result,
  onDone,
}: {
  result: ReservationResult;
  onDone: () => void;
}) {
  const { reservation } = result;
  const dt = new Date(reservation.reservation_time);

  return (
    <div className="confirmation-screen">
      <div className="confirmation-card">
        <div className="confirmation-icon">âœ“</div>
        <h2>Reservation Confirmed!</h2>
        <p className="confirmation-ref">Ref: <strong>{reservation.reference_number}</strong></p>

        <div className="confirmation-details">
          <div className="cd-row">
            <span>Date & Time</span>
            <span>{dt.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at {dt.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="cd-row">
            <span>Guests</span>
            <span>{reservation.party_size}</span>
          </div>
          <div className="cd-row">
            <span>Status</span>
            <span className="cd-status">Confirmed</span>
          </div>
          {result.depositRequired && (
            <div className="cd-row">
              <span>Deposit</span>
              <span>RM {result.depositAmount.toFixed(2)}</span>
            </div>
          )}
          {reservation.promo_code && (
            <div className="cd-row">
              <span>Promo Code</span>
              <span>🎟 {reservation.promo_code}</span>
            </div>
          )}
          {reservation.promo_code_discount && (
            <div className="cd-row">
              <span>Discount</span>
              <span className="cd-discount">-RM {reservation.promo_code_discount.toFixed(2)}</span>
            </div>
          )}
          {reservation.cake_name && (
            <div className="cd-row">
              <span>Cake</span>
              <span>ðŸŽ‚ {reservation.cake_name}</span>
            </div>
          )}
          {reservation.cake_notes && (
            <div className="cd-row">
              <span>Cake Notes</span>
              <span>{reservation.cake_notes}</span>
            </div>
          )}
        </div>

        <p className="confirmation-note">
          A confirmation email has been sent to your registered email address.
        </p>

        <button className="btn-confirm" onClick={onDone}>
          Make Another Booking
        </button>
      </div>
    </div>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Step = 'select' | 'book' | 'done';

interface TableSelectionPageProps {
  branchId: string;
  token?: string | null;
  onLoginRequired?: () => void;
}

export default function TableSelectionPage({ branchId, token, onLoginRequired }: TableSelectionPageProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterSection, setFilterSection] = useState<string>('all');
  const [filterCapacity, setFilterCapacity] = useState<number>(1);

  const [step, setStep] = useState<Step>('select');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [lockExpiresAt, setLockExpiresAt] = useState<Date | null>(null);
  const [lockError, setLockError] = useState('');
  const [alternatives, setAlternatives] = useState<Table[]>([]);
  const [confirmationResult, setConfirmationResult] = useState<ReservationResult | null>(null);

  const [acquiring, setAcquiring] = useState<string | null>(null); // tableId being locked

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, t] = await Promise.all([
        getSections(branchId),
        getActiveTables(branchId),
      ]);
      setSections(s);
      setTables(t);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh table statuses every 15s
  useEffect(() => {
    const id = setInterval(() => {
      if (step === 'select') load();
    }, 15000);
    return () => clearInterval(id);
  }, [step, load]);

  const handleSelectTable = async (table: Table) => {
    // Gate: must be logged in to hold a table
    if (!token) {
      if (onLoginRequired) onLoginRequired();
      return;
    }
    setLockError('');
    setAlternatives([]);
    setAcquiring(table.id);
    try {
      const result = await acquireLock(branchId, table.id, SESSION_ID);
      if (result.acquired) {
        setSelectedTable(table);
        setLockExpiresAt(new Date(Date.now() + 30 * 60 * 1000));
        setStep('book');
      } else {
        setLockError(`Table ${table.name} was just taken. Choose another.`);
        setAlternatives(result.alternatives ?? []);
        await load(); // refresh statuses
      }
    } catch (err: any) {
      setLockError(err.message);
    } finally {
      setAcquiring(null);
    }
  };

  const handleConfirm = async (data: {
    partySize: number;
    reservationTime: string;
    specialRequests: string;
    cakeSelection: CakeSelection | null;
    hasDecoration: boolean | null;
    decorationColor: string | null;
    decorationNotes: string;
    promoCode?: string;
    promoCodeDiscount?: number;
  }) => {
    if (!selectedTable) return;
    const result = await createReservation(branchId, {
      tableId: selectedTable.id,
      sessionId: SESSION_ID,
      reservationTime: data.reservationTime,
      partySize: data.partySize,
      specialRequests: data.specialRequests || undefined,
      cakePreferenceId: data.cakeSelection?.type === 'preference' ? data.cakeSelection.id : undefined,
      cakeMenuItemId: data.cakeSelection?.type === 'menu_item' ? data.cakeSelection.id : undefined,
      cakeNotes: data.cakeSelection?.customNotes || undefined,
      hasDecoration: data.hasDecoration || undefined,
      decorationColor: data.decorationColor || undefined,
      decorationNotes: data.decorationNotes || undefined,
      promoCode: data.promoCode,
      promoCodeDiscount: data.promoCodeDiscount,
      isDecorated: data.hasDecoration,
    });
    setConfirmationResult(result);
    setStep('done');
  };

  const handleLockExpired = () => {
    setSelectedTable(null);
    setLockExpiresAt(null);
    setStep('select');
    setLockError('Your table hold expired. Please select again.');
    load();
  };

  const handleReset = () => {
    setStep('select');
    setSelectedTable(null);
    setLockExpiresAt(null);
    setConfirmationResult(null);
    setLockError('');
    load();
  };

  // Filter tables
  const filtered = tables.filter(t => {
    if (filterSection !== 'all' && t.section_id !== filterSection) return false;
    if (t.capacity < filterCapacity) return false;
    return true;
  });

  // Group by section
  const grouped = sections
    .map(s => ({ section: s, tables: filtered.filter(t => t.section_id === s.id) }))
    .filter(g => g.tables.length > 0);

  const availableCount = tables.filter(t => t.status === 'available').length;

  // â”€â”€ Render â”€â”€

  if (step === 'done' && confirmationResult) {
    return <ConfirmationScreen result={confirmationResult} onDone={handleReset} />;
  }

  return (
    <div className="portal-page">
      {/* â”€â”€ Hero â”€â”€ */}
      <div className="portal-hero">
        <h1>Reserve Your Table</h1>
        <p>{availableCount} table{availableCount !== 1 ? 's' : ''} available right now</p>
      </div>

      <div className="portal-body">
        {step === 'select' && (
          <>
            {/* â”€â”€ Filters â”€â”€ */}
            <div className="portal-filters">
              <div className="filter-group">
                <label>Section</label>
                <div className="filter-pills">
                  <button
                    className={`pill ${filterSection === 'all' ? 'pill--active' : ''}`}
                    onClick={() => setFilterSection('all')}
                  >
                    All
                  </button>
                  {sections.map(s => (
                    <button
                      key={s.id}
                      className={`pill ${filterSection === s.id ? 'pill--active' : ''}`}
                      onClick={() => setFilterSection(s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <label>Min. Guests</label>
                <div className="filter-pills">
                  {[1, 2, 4, 6, 8].map(n => (
                    <button
                      key={n}
                      className={`pill ${filterCapacity === n ? 'pill--active' : ''}`}
                      onClick={() => setFilterCapacity(n)}
                    >
                      {n}+
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* â”€â”€ Legend â”€â”€ */}
            <div className="legend">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <span key={key} className="legend-item">
                  <span className="legend-dot" style={{ background: cfg.color }} />
                  {cfg.label}
                </span>
              ))}
            </div>

            {/* â”€â”€ Lock error â”€â”€ */}
            {lockError && (
              <div className="lock-error">
                âš  {lockError}
                {alternatives.length > 0 && (
                  <span> Suggested: {alternatives.slice(0, 3).map(t => t.name).join(', ')}</span>
                )}
              </div>
            )}

            {/* â”€â”€ Table grid â”€â”€ */}
            {loading && <div className="portal-loading">Loading tablesâ€¦</div>}
            {error && (
              <div className="portal-error">
                âš  {error} <button onClick={load}>Retry</button>
              </div>
            )}

            {!loading && !error && grouped.length === 0 && (
              <div className="portal-empty">
                No tables match your filters. Try adjusting the section or guest count.
              </div>
            )}

            {!loading && !error && grouped.map(({ section, tables: sectionTables }) => (
              <div key={section.id} className="portal-section">
                <h2 className="portal-section-name">{section.name}</h2>
                <div className="portal-table-grid">
                  {sectionTables.map(table => (
                    <div key={table.id} className="portal-table-wrap">
                      <TableCard
                        table={table}
                        selected={selectedTable?.id === table.id}
                        onClick={() => handleSelectTable(table)}
                      />
                      {acquiring === table.id && (
                        <div className="acquiring-overlay">Holdingâ€¦</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {step === 'book' && selectedTable && lockExpiresAt && (
          <BookingForm
            branchId={branchId}
            table={selectedTable}
            lockExpiresAt={lockExpiresAt}
            onLockExpired={handleLockExpired}
            onConfirm={handleConfirm}
            onCancel={() => { setStep('select'); setSelectedTable(null); }}
          />
        )}
      </div>
    </div>
  );
}

