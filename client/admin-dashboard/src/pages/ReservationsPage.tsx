import React, { useState, useEffect, useCallback } from 'react';
import ReservationTimeline from '../components/ReservationTimeline';
import OrderDialog from '../components/OrderDialog';
import { TooltipPortal, STATUS_COLORS as TL_STATUS_COLORS, useTooltipAnchor } from '../components/ReservationTooltip';
import { getReservationsForDate, getAllActiveTables } from '../api';
import type { TimelineReservation, Table } from '../types';
import './ReservationsPage.css';

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  seated:    'Seated',
  closed:    'Closed',
  cancelled: 'Cancelled',
  no_show:   'No Show',
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#3b82f6',
  seated:    '#22c55e',
  closed:    '#64748b',
  cancelled: '#ef4444',
  no_show:   '#f59e0b',
};

// ─── Hoverable status badge for the list table ───────────────────────────────

function StatusBadge({ reservation }: { reservation: TimelineReservation }) {
  const { ref, hovered, anchorRect, onMouseEnter, onMouseLeave } = useTooltipAnchor();
  const colors = TL_STATUS_COLORS[reservation.status] ?? TL_STATUS_COLORS.confirmed;

  return (
    <>
      <span
        ref={ref as React.RefObject<HTMLSpanElement>}
        className="res-status-badge res-status-badge--hoverable"
        style={{
          background:   `${colors.border}22`,
          color:        colors.border,
          borderColor:  `${colors.border}44`,
          cursor:       'default',
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {STATUS_LABELS[reservation.status]}
      </span>
      <TooltipPortal
        res={reservation}
        anchorRect={anchorRect}
        visible={hovered}
      />
    </>
  );
}

export default function ReservationsPage() {
  const branchId = localStorage.getItem('branch_id');

  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [reservations, setReservations] = useState<TimelineReservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRes, setSelectedRes] = useState<TimelineReservation | null>(null);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);

  const load = useCallback(async (date: string) => {
    if (!branchId || !branchId.trim()) {
      setError('Branch context not available. Please log in again.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [res, tbls] = await Promise.all([
        getReservationsForDate(branchId, date),
        getAllActiveTables(branchId),
      ]);
      setReservations(res);
      setTables(tbls);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reservations');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { load(selectedDate); }, [selectedDate, load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => load(selectedDate), 30_000);
    return () => clearInterval(id);
  }, [selectedDate, load]);

  const stepDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const filtered = statusFilter === 'all'
    ? reservations
    : reservations.filter(r => r.status === statusFilter);

  // Summary counts
  const counts = reservations.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const totalGuests = reservations
    .filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
    .reduce((sum, r) => sum + r.party_size, 0);

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Reservations</h1>
          <p className="page-subtitle">Timeline view of all bookings across tables</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="res-summary">
        <div className="res-summary-card res-summary-card--total">
          <span className="res-summary-value">{reservations.length}</span>
          <span className="res-summary-label">Total bookings</span>
        </div>
        <div className="res-summary-card res-summary-card--guests">
          <span className="res-summary-value">{totalGuests}</span>
          <span className="res-summary-label">Expected guests</span>
        </div>
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <div
            key={status}
            className={`res-summary-card res-summary-card--status ${statusFilter === status ? 'active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            style={{ cursor: 'pointer', borderColor: statusFilter === status ? STATUS_COLORS[status] : undefined }}
          >
            <span
              className="res-summary-value"
              style={{ color: STATUS_COLORS[status] }}
            >
              {counts[status] ?? 0}
            </span>
            <span className="res-summary-label">{label}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="res-error">
          ⚠️ {error}
          <button onClick={() => load(selectedDate)}>Retry</button>
        </div>
      )}

      {/* Timeline Controls (Date Nav) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div className="res-date-nav">
          <button className="res-nav-btn" onClick={() => stepDate(-1)}>‹</button>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="res-date-input"
          />
          <button className="res-nav-btn" onClick={() => stepDate(1)}>›</button>
          {!isToday && (
            <button
              className="res-nav-btn res-today-btn"
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            >
              Today
            </button>
          )}
          <button
            className="res-nav-btn res-refresh-btn"
            onClick={() => load(selectedDate)}
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="res-timeline-wrap">
        <ReservationTimeline
          tables={tables}
          reservations={filtered}
          selectedDate={selectedDate}
          openTime="09:00"
          closeTime="23:00"
          loading={loading}
          onBlockClick={(res) => {
            setSelectedRes(res);
            setIsOrderDialogOpen(true);
          }}
        />
      </div>

      <OrderDialog
        isOpen={isOrderDialogOpen}
        onClose={() => setIsOrderDialogOpen(false)}
        reservationTitle={selectedRes ? `Order for ${selectedRes.customer_name ?? 'Guest'} (${selectedRes.reference_number})` : ''}
        branchId={branchId ?? ''}
        tableId={selectedRes?.table_id ?? ''}
      />

      {/* List view below timeline */}
      {!loading && filtered.length > 0 && (
        <div className="res-list">
          <h3 className="res-list-title">
            {statusFilter === 'all' ? 'All reservations' : STATUS_LABELS[statusFilter]}
            <span className="res-list-count">{filtered.length}</span>
          </h3>
          <div className="res-table-wrap">
            <table className="res-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Time</th>
                  <th>Table</th>
                  <th>Guest</th>
                  <th>Party</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice()
                  .sort((a, b) => new Date(a.reservation_time).getTime() - new Date(b.reservation_time).getTime())
                  .map(r => {
                    const dt = new Date(r.reservation_time);
                    const table = tables.find(t => t.id === r.table_id);
                    return (
                      <tr key={r.id}>
                        <td className="res-ref">{r.reference_number}</td>
                        <td>{dt.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{table?.name ?? '—'}</td>
                        <td>{r.customer_name ?? '—'}</td>
                        <td>{r.party_size}</td>
                        <td>
                          <StatusBadge reservation={r} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="res-empty">
          No {statusFilter !== 'all' ? STATUS_LABELS[statusFilter].toLowerCase() : ''} reservations on{' '}
          {new Date(selectedDate).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      )}
    </div>
  );
}
