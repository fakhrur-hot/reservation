/**
 * ReservationTooltip
 *
 * Shared portal-based tooltip for reservation details.
 * Renders into document.body (z-index 99999) so it's never clipped.
 * Used by both ReservationTimeline blocks and the list status badges.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { TimelineReservation } from '../types';

// ─── Status colours (shared) ─────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  confirmed: { bg: 'rgba(59,130,246,0.25)',  border: '#3b82f6', text: '#93c5fd' },
  seated:    { bg: 'rgba(34,197,94,0.25)',   border: '#22c55e', text: '#86efac' },
  closed:    { bg: 'rgba(100,116,139,0.2)',  border: '#64748b', text: '#94a3b8' },
  cancelled: { bg: 'rgba(239,68,68,0.15)',   border: '#ef4444', text: '#fca5a5' },
  no_show:   { bg: 'rgba(245,158,11,0.2)',   border: '#f59e0b', text: '#fcd34d' },
};

const OCCASION_ICONS: Record<string, string> = {
  birthday:     '🎂',
  anniversary:  '💍',
  bachelorette: '🥂',
};

function formatHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  if (m === 0) return `${displayH}${period}`;
  return `${displayH}:${String(m).padStart(2, '0')}${period}`;
}

// ─── Portal Tooltip ───────────────────────────────────────────────────────────

interface TooltipPortalProps {
  res: TimelineReservation;
  anchorRect: DOMRect;
  visible: boolean;
  durationMinutes?: number;
}

export function TooltipPortal({ res, anchorRect, visible, durationMinutes = 90 }: TooltipPortalProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, above: true });

  useEffect(() => {
    if (!visible || !tooltipRef.current) return;
    const tip = tooltipRef.current;
    const tipH = tip.offsetHeight || 240;
    const tipW = tip.offsetWidth  || 260;
    const vp   = { w: window.innerWidth, h: window.innerHeight };

    const spaceAbove = anchorRect.top;
    const above = spaceAbove >= tipH + 12;

    let top = above
      ? anchorRect.top - tipH - 10
      : anchorRect.bottom + 10;

    let left = anchorRect.left + anchorRect.width / 2 - tipW / 2;
    left = Math.max(8, Math.min(left, vp.w - tipW - 8));

    setPos({ top, left, above });
  }, [visible, anchorRect]);

  if (!visible) return null;

  const colors = STATUS_COLORS[res.status] ?? STATUS_COLORS.confirmed;

  const cakeLabel = res.cake_choice === 'custom_request'
    ? `Custom${res.cake_custom_notes ? ` — ${res.cake_custom_notes}` : ''}`
    : res.cake_choice ?? null;

  const dt = new Date(res.reservation_time);
  const startMin = dt.getHours() * 60 + dt.getMinutes();
  const endMin = startMin + durationMinutes;

  const content = (
    <div
      ref={tooltipRef}
      className="tl-tooltip-portal tl-tooltip--zoom"
      style={{ top: pos.top, left: pos.left }}
      data-above={pos.above}
    >
      {/* Header */}
      <div className="tl-tooltip-header" style={{ borderLeftColor: colors.border }}>
        <span className="tl-tooltip-ref">{res.reference_number}</span>
        <span
          className="tl-tooltip-status-badge"
          style={{ background: colors.bg, color: colors.border, borderColor: colors.border }}
        >
          {res.status.replace('_', ' ')}
        </span>
      </div>

      {/* Customer */}
      {res.customer_name && (
        <div className="tl-tooltip-section">
          <div className="tl-tooltip-row tl-tooltip-row--name">
            <span>👤</span>
            <span className="tl-tooltip-customer-name">{res.customer_name}</span>
          </div>
          {res.customer_email && (
            <div className="tl-tooltip-row">
              <span>✉️</span>
              <span>{res.customer_email}</span>
            </div>
          )}
          {res.customer_phone && (
            <div className="tl-tooltip-row">
              <span>📞</span>
              <span>{res.customer_phone}</span>
            </div>
          )}
        </div>
      )}

      {/* Time + party */}
      <div className="tl-tooltip-section">
        <div className="tl-tooltip-row">
          <span>🕐</span>
          <span>
            {dt.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
            {' → '}
            {formatHHMM(endMin)}
          </span>
        </div>
        <div className="tl-tooltip-row">
          <span>👥</span>
          <span>{res.party_size} guest{res.party_size !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Decoration */}
      {res.has_decoration && (
        <div className="tl-tooltip-section tl-tooltip-section--deco">
          <div className="tl-tooltip-row tl-tooltip-row--highlight">
            <span>{res.occasion_type ? OCCASION_ICONS[res.occasion_type] ?? '🎉' : '🎉'}</span>
            <span>
              {res.occasion_type
                ? res.occasion_type.charAt(0).toUpperCase() + res.occasion_type.slice(1)
                : 'Decoration'}
              {res.decoration_color ? ` · ${res.decoration_color}` : ''}
            </span>
          </div>
          {res.decoration_notes && (
            <div className="tl-tooltip-row tl-tooltip-row--notes">
              <span>📝</span>
              <span>{res.decoration_notes}</span>
            </div>
          )}
        </div>
      )}

      {/* Cake */}
      {cakeLabel && (
        <div className="tl-tooltip-section tl-tooltip-section--cake">
          <div className="tl-tooltip-row tl-tooltip-row--highlight">
            <span>🎂</span>
            <span>{cakeLabel}</span>
          </div>
        </div>
      )}

      {/* Promo */}
      {res.promo_code && (
        <div className="tl-tooltip-section">
          <div className="tl-tooltip-row">
            <span>🏷️</span>
            <span className="tl-tooltip-promo">{res.promo_code}</span>
          </div>
        </div>
      )}

      {/* Arrow */}
      <div className={`tl-tooltip-arrow ${pos.above ? 'tl-tooltip-arrow--below' : 'tl-tooltip-arrow--above'}`} />
    </div>
  );

  return createPortal(content, document.body);
}

// ─── Hook: useTooltipAnchor ───────────────────────────────────────────────────
// Attach to any element to get hover state + anchor rect for TooltipPortal.

export function useTooltipAnchor() {
  const ref = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect>(new DOMRect());

  const onMouseEnter = useCallback(() => {
    if (ref.current) setAnchorRect(ref.current.getBoundingClientRect());
    setHovered(true);
  }, []);

  const onMouseLeave = useCallback(() => setHovered(false), []);

  return { ref, hovered, anchorRect, onMouseEnter, onMouseLeave };
}
