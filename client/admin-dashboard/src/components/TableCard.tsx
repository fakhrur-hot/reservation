/**
 * TableCard Component
 *
 * Displays a single restaurant table as a card with:
 * - Table name and capacity
 * - Color-coded status badge (available/locked/reserved/occupied)
 * - Decoration indicator (occasion type + color swatch)
 * - Window view and wheelchair accessibility badges
 * - "Clear Table" button (occupied tables only)
 * - "Select" button (available tables, when onSelect provided)
 * - Click handler to show table details
 * - Hover effects
 *
 * Requirements: 3.5
 */

import React from 'react';
import type { Table } from '../types';
import './TableCard.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TableCardProps {
  /** The table data to display */
  table: Table & {
    status: 'available' | 'locked' | 'reserved' | 'occupied';
  };
  /** Called when the card is clicked (show details) */
  onClick?: (tableId: string) => void;
  /** Called when "Clear Table" is clicked (occupied tables only) */
  onClear?: (e: React.MouseEvent, tableId: string) => void;
  /** Whether a clear operation is in progress for this table */
  isClearing?: boolean;
  /** Called when "Walk-In" is clicked (available tables only) */
  onWalkIn?: (e: React.MouseEvent, tableId: string) => void;
  /** Whether a walk-in creation is in progress for this table */
  isWalkingIn?: boolean;
}

// ─── Status Configuration ─────────────────────────────────────────────────────

export const STATUS_CONFIG = {
  available: {
    label: 'Available',
    bgColor: '#f0fdf4',
    borderColor: '#22c55e',
    textColor: '#16a34a',
  },
  locked: {
    label: 'Held',
    bgColor: '#fffbeb',
    borderColor: '#f59e0b',
    textColor: '#d97706',
  },
  reserved: {
    label: 'Reserved',
    bgColor: '#eff6ff',
    borderColor: '#3b82f6',
    textColor: '#2563eb',
  },
  occupied: {
    label: 'Occupied',
    bgColor: '#fef2f2',
    borderColor: '#ef4444',
    textColor: '#dc2626',
  },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function TableCard({
  table,
  onClick,
  onClear,
  isClearing = false,
  onWalkIn,
  isWalkingIn = false,
}: TableCardProps) {
  const statusConfig = STATUS_CONFIG[table.status];
  const isOccupied = table.status === 'occupied';
  const isAvailable = table.status === 'available';

  return (
    <div
      className={`table-card table-card--${table.status}`}
      style={{
        borderColor: statusConfig.borderColor,
        backgroundColor: statusConfig.bgColor,
      }}
      data-table-name={table.name}
      onClick={() => onClick?.(table.id)}
      role="button"
      tabIndex={0}
      aria-label={`Table ${table.name}, ${statusConfig.label}, ${table.capacity} seats`}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(table.id)}
    >
      {/* ── Feature Badges (top-right) ─────────────────────────────────────── */}
      {table.has_window_view && (
        <div className="table-card-badge table-card-badge--window" aria-label="Window view">
          🪟 Window
        </div>
      )}
      {table.is_wheelchair_accessible && (
        <div className="table-card-badge table-card-badge--accessible" aria-label="Wheelchair accessible">
          ♿
        </div>
      )}

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <div className="table-card-content">
        {/* Name */}
        <h3 className="table-card-name">{table.name}</h3>

        {/* Capacity */}
        <p className="table-card-capacity">👥 {table.capacity} seats</p>

        {/* Status Badge */}
        <div
          className="table-card-status"
          style={{ color: statusConfig.textColor }}
          aria-label={`Status: ${statusConfig.label}`}
        >
          {statusConfig.label}
        </div>

        {/* Decoration Indicator */}
        {table.has_decoration && (
          <div className="table-card-decoration" aria-label="Decorated table">
            <span className="table-card-decoration-icon">🎀</span>
            {table.occasion_type && (
              <span className="table-card-decoration-label">{table.occasion_type}</span>
            )}
            {table.decoration_color && (
              <span
                className="table-card-decoration-dot"
                style={{ backgroundColor: table.decoration_color }}
                title={table.decoration_color}
                aria-hidden="true"
              />
            )}
          </div>
        )}

        {/* Walk-In Button — available tables only */}
        {isAvailable && onWalkIn && (
          <button
            className="table-card-walkin"
            onClick={(e) => onWalkIn(e, table.id)}
            disabled={isWalkingIn}
            aria-label={`Walk-in for table ${table.name}`}
          >
            {isWalkingIn ? 'Creating…' : '+ Walk-In'}
          </button>
        )}

        {/* Clear Table Button — occupied tables only */}
        {isOccupied && onClear && (
          <button
            className="table-card-clear"
            onClick={(e) => onClear(e, table.id)}
            disabled={isClearing}
            aria-label={`Clear table ${table.name}`}
          >
            {isClearing ? 'Clearing…' : 'Clear Table'}
          </button>
        )}
      </div>
    </div>
  );
}
