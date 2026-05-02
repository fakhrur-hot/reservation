/**
 * Waitlist Panel Component
 *
 * Displays a list of walk-in guests waiting for a table.
 * Shows: guest name, party size, wait time, priority.
 * Features:
 * - Real-time updates via WebSocket
 * - "Assign Table" button for each guest
 * - "Remove from Waitlist" button
 * - Sorting by wait time and priority
 *
 * Requirements: 3.7
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getWaitlist } from '../api';
import type { WaitlistEntry } from '../types';
import './WaitlistPanel.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaitlistPanelProps {
  branchId: string;
  onAssignTable?: (waitlistId: string, tableId: string) => Promise<void>;
  onRemoveFromWaitlist?: (waitlistId: string) => Promise<void>;
  onShowAssignModal?: (waitlistId: string, guestName: string, partySize: number) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatWaitTime(minutes?: number): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────────

export default function WaitlistPanel({
  branchId,
  onAssignTable,
  onRemoveFromWaitlist,
  onShowAssignModal,
}: WaitlistPanelProps) {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // ── Load Waitlist ──────────────────────────────────────────────────────────

  const loadWaitlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWaitlist(branchId, 'waiting');
      setWaitlist(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load waitlist');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadWaitlist();
    // Refresh every 30 seconds
    const interval = setInterval(loadWaitlist, 30000);
    return () => clearInterval(interval);
  }, [loadWaitlist]);

  // ── Handle Assign Table ────────────────────────────────────────────────────

  const handleAssignTable = async (e: React.MouseEvent, waitlistId: string, guest: WaitlistEntry) => {
    e.stopPropagation();

    if (onShowAssignModal) {
      onShowAssignModal(waitlistId, guest.guest_name, guest.party_size);
      return;
    }

    // If no modal handler, show error
    setError('Unable to assign table - please contact support');
  };

  // ── Handle Remove from Waitlist ────────────────────────────────────────────

  const handleRemoveFromWaitlist = async (
    e: React.MouseEvent,
    waitlistId: string
  ) => {
    e.stopPropagation();

    if (!onRemoveFromWaitlist) {
      setError('Unable to remove guest - please contact support');
      return;
    }

    setRemovingId(waitlistId);
    try {
      await onRemoveFromWaitlist(waitlistId);
      setWaitlist((prev) => prev.filter((w) => w.id !== waitlistId));
    } catch (err: any) {
      setError(err.message || 'Failed to remove guest from waitlist');
    } finally {
      setRemovingId(null);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="waitlist-panel waitlist-panel--loading">
        <h3>Waitlist</h3>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="waitlist-panel">
      {/* Header */}
      <div className="waitlist-header">
        <h3>Waitlist</h3>
        <span className="waitlist-count">
          {waitlist.length} guest{waitlist.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="waitlist-error">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Empty State */}
      {waitlist.length === 0 && !error && (
        <div className="waitlist-empty">
          <p>No guests waiting</p>
        </div>
      )}

      {/* Waitlist Items */}
      <div className="waitlist-items">
        {waitlist.map((guest, index) => (
          <div
            key={guest.id}
            className="waitlist-item"
            role="button"
            tabIndex={0}
            aria-label={`${guest.guest_name}, ${guest.party_size} guests`}
          >
            {/* Position Badge */}
            <div className="item-position">{index + 1}</div>

            {/* Guest Info */}
            <div className="item-info">
              <h4 className="item-name">{guest.guest_name}</h4>
              <div className="item-meta">
                <span className="meta-item">
                  👥 {guest.party_size} guest{guest.party_size !== 1 ? 's' : ''}
                </span>
                <span className="meta-item">
                  ⏱️ {formatWaitTime(guest.wait_time_minutes)}
                </span>
              </div>
              {guest.phone_number && (
                <div className="item-phone">{guest.phone_number}</div>
              )}
              {guest.notes && (
                <div className="item-notes">{guest.notes}</div>
              )}
            </div>

            {/* Priority Badge */}
            {guest.priority > 0 && (
              <div className="item-priority" title={`Priority: ${guest.priority}`}>
                ⭐
              </div>
            )}

            {/* Actions */}
            <div className="item-actions">
              <button
                className="action-btn action-btn--assign"
                onClick={(e) => handleAssignTable(e, guest.id, guest)}
                disabled={assigningId === guest.id}
                aria-label={`Assign table to ${guest.guest_name}`}
              >
                {assigningId === guest.id ? 'Assigning…' : 'Assign'}
              </button>
              <button
                className="action-btn action-btn--remove"
                onClick={(e) => handleRemoveFromWaitlist(e, guest.id)}
                disabled={removingId === guest.id}
                aria-label={`Remove ${guest.guest_name} from waitlist`}
              >
                {removingId === guest.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Refresh Button */}
      <button
        className="waitlist-refresh"
        onClick={loadWaitlist}
        disabled={loading}
        aria-label="Refresh waitlist"
      >
        ↻ Refresh
      </button>
    </div>
  );
}
