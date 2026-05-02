/**
 * ReservationTimeline
 *
 * Gantt-style horizontal timeline showing all tables as rows,
 * with reservation blocks positioned proportionally across a time window.
 *
 * Layout:
 *   [Table label] | [──────── time axis ────────]
 *                 |  [block]      [block]
 *
 * Props:
 *   tables       – all tables for the branch (with status)
 *   reservations – list of reservations for the selected date
 *   selectedDate – ISO date string (YYYY-MM-DD)
 *   openTime     – "HH:MM" branch opening time
 *   closeTime    – "HH:MM" branch closing time
 *   onSlotClick  – called when user clicks an empty slot (table + time)
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Table } from '../types';
import { TooltipPortal, STATUS_COLORS, useTooltipAnchor } from './ReservationTooltip';
import './ReservationTimeline.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimelineReservation {
  id: string;
  reference_number: string;
  table_id: string;
  reservation_time: string;   // ISO 8601
  party_size: number;
  status: 'confirmed' | 'seated' | 'closed' | 'cancelled' | 'no_show';
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  duration_minutes?: number;  // default 90
  // Decoration
  has_decoration?: boolean;
  occasion_type?: string | null;
  decoration_color?: string | null;
  decoration_notes?: string | null;
  // Cake
  cake_choice?: string | null;
  cake_custom_notes?: string | null;
  // Promo
  promo_code?: string | null;
}

interface ReservationTimelineProps {
  tables: Table[];
  reservations: TimelineReservation[];
  selectedDate: string;       // YYYY-MM-DD
  openTime?: string;          // HH:MM, default "09:00"
  closeTime?: string;         // HH:MM, default "23:00"
  onSlotClick?: (tableId: string, time: Date) => void;
  onBlockClick?: (res: TimelineReservation) => void;
  loading?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DURATION = 90; // minutes per reservation slot
const SLOT_INTERVAL    = 60; // minutes between time markers (every hour)
const ROW_HEIGHT       = 64; // px per table row
const LABEL_WIDTH      = 120; // px for table name column

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHHMM(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

function toMinutes(hhmm: string): number {
  const { h, m } = parseHHMM(hhmm);
  return h * 60 + m;
}

function formatHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  // Show minutes only when non-zero
  if (m === 0) return `${displayH}${period}`;
  return `${displayH}:${String(m).padStart(2, '0')}${period}`;
}

function getTimeFromDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Now Indicator ────────────────────────────────────────────────────────────

function NowIndicator({
  openMin,
  totalMin,
  trackWidth,
  selectedDate,
}: {
  openMin: number;
  totalMin: number;
  trackWidth: number;
  selectedDate: string;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = now.toISOString().split('T')[0];
  if (today !== selectedDate) return null;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < openMin || nowMin > openMin + totalMin) return null;

  const left = ((nowMin - openMin) / totalMin) * trackWidth;

  return (
    <div
      className="tl-now-indicator"
      style={{ left: `${left}px` }}
      title={`Now: ${formatHHMM(nowMin)}`}
    >
      <div className="tl-now-dot" />
      <div className="tl-now-line" />
    </div>
  );
}

// ─── Overlap detection & stacking ──────────────────────────────────────────

function detectOverlaps(reservations: TimelineReservation[]): Map<string, number> {
  const stackMap = new Map<string, number>();

  // Sort by start time
  const sorted = [...reservations].sort((a, b) => {
    const aStart = new Date(a.reservation_time).getTime();
    const bStart = new Date(b.reservation_time).getTime();
    return aStart - bStart;
  });

  for (const res of sorted) {
    const resStart = new Date(res.reservation_time).getTime();
    const resEnd = resStart + (res.duration_minutes ?? DEFAULT_DURATION) * 60_000;

    let stackLevel = 0;
    // Check which stack levels are occupied by overlapping reservations
    const occupiedLevels = new Set<number>();
    for (const other of sorted) {
      if (other.id === res.id) break;
      const otherStart = new Date(other.reservation_time).getTime();
      const otherEnd = otherStart + (other.duration_minutes ?? DEFAULT_DURATION) * 60_000;

      // Check if they overlap
      if (resStart < otherEnd && resEnd > otherStart) {
        const otherLevel = stackMap.get(other.id) ?? 0;
        occupiedLevels.add(otherLevel);
      }
    }

    // Find first available level
    while (occupiedLevels.has(stackLevel)) {
      stackLevel++;
    }
    stackMap.set(res.id, stackLevel);
  }

  return stackMap;
}

// ─── Reservation Block ────────────────────────────────────────────────────────

function ReservationBlock({
  res,
  openMin,
  totalMin,
  trackWidth,
  stackLevel,
  totalLevels,
  stackHeight,
}: {
  res: TimelineReservation;
  openMin: number;
  totalMin: number;
  trackWidth: number;
  stackLevel: number;
  totalLevels: number;
  totalLevels: number;
  stackHeight: number;
  onClick?: (res: TimelineReservation) => void;
}) {
  const { ref, hovered, anchorRect, onMouseEnter, onMouseLeave } = useTooltipAnchor();

  const dt = new Date(res.reservation_time);
  const startMin = dt.getHours() * 60 + dt.getMinutes();
  const duration = res.duration_minutes ?? DEFAULT_DURATION;

  const left  = Math.max(0, ((startMin - openMin) / totalMin) * trackWidth);
  const width = Math.min(
    (duration / totalMin) * trackWidth,
    trackWidth - left
  );

  if (width < 4) return null;

  const colors = STATUS_COLORS[res.status] ?? STATUS_COLORS.confirmed;
  const padding = 6;
  const usablePx = stackHeight - padding * 2;
  const blockHeight = Math.floor(usablePx / totalLevels);
  const top = padding + stackLevel * blockHeight;

  const isInactive = ['no_show', 'cancelled', 'closed'].includes(res.status);

  return (
    <>
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={`tl-block ${isInactive ? 'tl-block--inactive' : ''}`}
        style={{
          left:        `${left}px`,
          width:       `${Math.max(width - 2, 4)}px`,
          top:         `${top}px`,
          height:      `${blockHeight - 2}px`,
          background:  colors.bg,
          borderColor: colors.border,
          color:       colors.text,
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(res);
        }}
      >
        <span className="tl-block-ref">{res.reference_number}</span>
        {res.customer_name && (
          <span className="tl-block-name">{res.customer_name}</span>
        )}
        <span className="tl-block-guests">👥{res.party_size}</span>
      </div>

      <TooltipPortal
        res={res}
        anchorRect={anchorRect}
        visible={hovered}
        durationMinutes={duration}
      />
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReservationTimeline({
  tables,
  reservations,
  selectedDate,
  openTime  = '09:00',
  closeTime = '23:00',
  onSlotClick,
  onBlockClick,
  loading = false,
}: ReservationTimelineProps) {
  const trackRef  = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(800);

  // Measure track width on mount and resize
  useEffect(() => {
    const measure = () => {
      if (trackRef.current) {
        setTrackWidth(trackRef.current.clientWidth);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);

  const openMin  = toMinutes(openTime);
  const closeMin = toMinutes(closeTime);
  const totalMin = closeMin - openMin;

  // Build time markers every SLOT_INTERVAL minutes
  const timeMarkers = useMemo(() => {
    const markers: number[] = [];
    for (let m = openMin; m <= closeMin; m += SLOT_INTERVAL) {
      markers.push(m);
    }
    return markers;
  }, [openMin, closeMin]);

  // Index reservations by table_id
  const resByTable = useMemo(() => {
    const map: Record<string, TimelineReservation[]> = {};
    for (const r of reservations) {
      if (!map[r.table_id]) map[r.table_id] = [];
      map[r.table_id].push(r);
    }
    return map;
  }, [reservations]);

  // Handle click on empty track area
  const handleTrackClick = (e: React.MouseEvent, tableId: string) => {
    if (!onSlotClick || !trackRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickedMin = openMin + (x / trackWidth) * totalMin;
    // Snap to nearest 30-min slot
    const snapped = Math.round(clickedMin / 30) * 30;
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setMinutes(snapped);
    onSlotClick(tableId, d);
  };

  const activeTables = tables.filter(t => t.is_active);

  return (
    <div className="tl-root">
      {/* Header */}
      <div className="tl-header">
        <div className="tl-header-label">Table</div>
        <div className="tl-header-track" ref={trackRef}>
          {timeMarkers.map((min) => {
            const left = ((min - openMin) / totalMin) * trackWidth;
            return (
              <div
                key={min}
                className="tl-marker"
                style={{ left: `${left}px` }}
              >
                {formatHHMM(min)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="tl-body">
        {loading && (
          <div className="tl-loading">Loading reservations…</div>
        )}

        {!loading && activeTables.length === 0 && (
          <div className="tl-empty">No active tables found</div>
        )}

        {!loading && activeTables.map((table) => {
          const tableRes = resByTable[table.id] ?? [];
          const hasReservations = tableRes.length > 0;
          const stackMap = detectOverlaps(tableRes);
          // Total stack levels needed for this row
          const maxLevel = tableRes.length > 0
            ? Math.max(...tableRes.map(r => stackMap.get(r.id) ?? 0)) + 1
            : 1;
          // Row height grows with stack depth
          const rowPx = Math.max(ROW_HEIGHT, maxLevel * 28 + 12);

          return (
            <div key={table.id} className="tl-row" style={{ minHeight: `${rowPx}px` }}>
              {/* Table label */}
              <div className="tl-row-label">
                <span className="tl-table-name">{table.name}</span>
                <span className="tl-table-cap">👥{table.capacity}</span>
              </div>

              {/* Track */}
              <div
                className="tl-track"
                onClick={(e) => handleTrackClick(e, table.id)}
              >
                {/* Grid lines */}
                {timeMarkers.map((min) => {
                  const left = ((min - openMin) / totalMin) * trackWidth;
                  return (
                    <div
                      key={min}
                      className="tl-grid-line"
                      style={{ left: `${left}px` }}
                    />
                  );
                })}

                {/* Now indicator */}
                <NowIndicator
                  openMin={openMin}
                  totalMin={totalMin}
                  trackWidth={trackWidth}
                  selectedDate={selectedDate}
                />

                {/* Reservation blocks */}
                {tableRes.map((res) => (
                  <ReservationBlock
                    key={res.id}
                    res={res}
                    openMin={openMin}
                    totalMin={totalMin}
                    trackWidth={trackWidth}
                    stackLevel={stackMap.get(res.id) ?? 0}
                    totalLevels={maxLevel}
                    stackHeight={rowPx}
                    onClick={onBlockClick}
                  />
                ))}

                {/* Empty hint */}
                {!hasReservations && (
                  <div className="tl-empty-row">Available all day</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="tl-legend">
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <span key={status} className="tl-legend-item">
            <span
              className="tl-legend-dot"
              style={{ background: colors.border }}
            />
            {status.replace('_', ' ')}
          </span>
        ))}
        <span className="tl-legend-item">
          <span className="tl-legend-now" />
          Now
        </span>
      </div>
    </div>
  );
}
