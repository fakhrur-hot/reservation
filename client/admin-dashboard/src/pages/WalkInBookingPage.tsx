/**
 * Walk-In Booking Page — Sneat Dashboard (Staff/Manager)
 *
 * Allows staff to create walk-in reservations directly without prior online booking.
 * 
 * Backed by:
 *  GET  /api/v1/branches/:id/tables
 *  GET  /api/v1/branches/:id/sections
 *  POST /api/walk-in
 */

import { useEffect, useState } from 'react';
import { getAllActiveTables, getSections, createWalkInReservation } from '../api';
import type { Table, Section, WalkInResult } from '../types';

interface WalkInForm {
  tableId: string;
  partySize: number;
  reservationTime: string;
  customerName: string;
  customerPhone: string;
  staffMemberId?: string;
}

export default function WalkInBookingPage() {
  const branchId = localStorage.getItem('branch_id');
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterSection, setFilterSection] = useState<string>('all');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [form, setForm] = useState<WalkInForm>({
    tableId: '',
    partySize: 1,
    reservationTime: new Date().toISOString().substring(0, 16),
    customerName: '',
    customerPhone: '',
    staffMemberId: undefined,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<WalkInResult | null>(null);

  // Load tables and sections
  useEffect(() => {
    async function load() {
      if (!branchId) {
        setError('Branch ID is missing');
        setLoading(false);
        return;
      }
      try {
        const [sectionsData, tablesData] = await Promise.all([
          getSections(branchId),
          getAllActiveTables(branchId),
        ]);
        setSections(sectionsData);
        setTables(tablesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [branchId]);

  // Update form when selected table changes
  useEffect(() => {
    if (selectedTableId) {
      setForm(prev => ({ ...prev, tableId: selectedTableId }));
    }
  }, [selectedTableId]);

  const getAvailableTables = () => {
    return tables.filter(t => {
      if (filterSection !== 'all' && t.section_id !== filterSection) return false;
      return t.status === 'available';
    });
  };

  const groupedSections = sections.map(section => ({
    section,
    tables: getAvailableTables().filter(t => t.section_id === section.id),
  }));

  const selectedTable = tables.find(t => t.id === selectedTableId);

  const handleDateTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, reservationTime: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!branchId) {
      setSubmitError('Branch ID is missing');
      return;
    }

    if (!form.tableId) {
      setSubmitError('Please select a table');
      return;
    }

    if (!form.customerName.trim()) {
      setSubmitError('Customer name is required');
      return;
    }

    if (form.partySize < 1 || (selectedTable && form.partySize > selectedTable.capacity)) {
      setSubmitError(`Party size must be between 1 and ${selectedTable?.capacity || 10}`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await createWalkInReservation(branchId, {
        branch_id: branchId,
        table_id: form.tableId,
        party_size: form.partySize,
        reservation_time: new Date(form.reservationTime).toISOString(),
        customer_name: form.customerName,
        customer_phone: form.customerPhone || undefined,
        staff_member_id: form.staffMemberId || undefined,
      });
      setSuccessMessage(result);
      // Reset form
      setForm({
        tableId: '',
        partySize: 1,
        reservationTime: new Date().toISOString().substring(0, 16),
        customerName: '',
        customerPhone: '',
        staffMemberId: undefined,
      });
      setSelectedTableId(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create walk-in reservation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm({
      tableId: '',
      partySize: 1,
      reservationTime: new Date().toISOString().substring(0, 16),
      customerName: '',
      customerPhone: '',
      staffMemberId: undefined,
    });
    setSelectedTableId(null);
    setSuccessMessage(null);
    setSubmitError(null);
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Walk-In Bookings</h1>
        </div>
        <div className="page-body">Loading tables...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Walk-In Bookings</h1>
        </div>
        <div className="page-body">
          <div className="error-card">
            ⚠️ {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Walk-In Bookings</h1>
          <p className="page-subtitle">Register customers who arrive without prior reservation</p>
        </div>
      </div>

      <div className="page-body">
        <div className="walk-in-container">
          {/* Success Message */}
          {successMessage && (
            <div className="success-card">
              <div className="success-icon">✓</div>
              <h3>Walk-In Created!</h3>
              <p className="success-ref">
                Reference: <strong>{successMessage.reservation.reference_number}</strong>
              </p>
              <p className="success-message">{successMessage.message}</p>
              <button className="btn-secondary" onClick={handleReset}>
                Register Another Walk-In
              </button>
            </div>
          )}

          {/* Booking Form */}
          {!successMessage && (
            <form onSubmit={handleSubmit} className="walk-in-form">
              <h3>New Walk-In Reservation</h3>

              {submitError && (
                <div className="form-error">
                  ⚠️ {submitError}
                </div>
              )}

              {/* Customer Info */}
              <div className="form-section">
                <h4>Customer Information</h4>

                <div className="form-group">
                  <label>
                    Customer Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={e => setForm(prev => ({ ...prev, customerName: e.target.value }))}
                    placeholder="e.g., John Doe"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Customer Phone (optional)</label>
                  <input
                    type="tel"
                    value={form.customerPhone}
                    onChange={e => setForm(prev => ({ ...prev, customerPhone: e.target.value }))}
                    placeholder="+60 12-345 6789"
                  />
                </div>
              </div>

              {/* Reservation Details */}
              <div className="form-section">
                <h4>Reservation Details</h4>

                <div className="form-group">
                  <label>Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={form.reservationTime}
                    onChange={handleDateTimeChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Number of Guests *</label>
                  <div className="party-size-input">
                    <button
                      type="button"
                      className="ps-btn"
                      onClick={() =>
                        setForm(prev => ({ ...prev, partySize: Math.max(1, prev.partySize - 1) }))
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={form.partySize}
                      onChange={e =>
                        setForm(prev => ({ ...prev, partySize: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                      min="1"
                      max="20"
                      required
                    />
                    <button
                      type="button"
                      className="ps-btn"
                      onClick={() =>
                        setForm(prev => ({ ...prev, partySize: prev.partySize + 1 }))
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Table Selection */}
              <div className="form-section">
                <h4>Table Selection</h4>

                <div className="form-group">
                  <label>Filter by Section</label>
                  <select
                    value={filterSection}
                    onChange={e => setFilterSection(e.target.value)}
                    className="form-select"
                  >
                    <option value="all">All Sections</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="table-grid">
                  {groupedSections.length === 0 ? (
                    <p className="no-tables">No available tables. Please try again later.</p>
                  ) : (
                    groupedSections.map(({ section, tables: sectionTables }) => (
                      <div key={section.id} className="table-section">
                        <h5>{section.name}</h5>
                        <div className="table-buttons">
                          {sectionTables.map(table => (
                            <button
                              key={table.id}
                              type="button"
                              className={`table-btn ${selectedTableId === table.id ? 'table-btn--selected' : ''}`}
                              onClick={() => setSelectedTableId(table.id)}
                            >
                              <div className="table-name">{table.name}</div>
                              <div className="table-capacity">👥 {table.capacity} seats</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {selectedTable && (
                  <div className="selected-table-info">
                    <strong>Selected Table:</strong> {selectedTable.name} ({selectedTable.capacity} seats)
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={handleReset}>
                  Clear
                </button>
                <button
                  type="submit"
                  className="btn-confirm"
                  disabled={submitting || !form.tableId || !form.customerName}
                >
                  {submitting ? 'Creating...' : 'Create Walk-In'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
