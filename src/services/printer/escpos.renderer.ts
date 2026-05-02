/**
 * ESC/POS Renderer
 *
 * Converts a ReservationSlipPayload into a raw ESC/POS command Buffer
 * suitable for any thermal receipt printer.
 *
 * ESC/POS command reference used:
 *   ESC @       — Initialize printer
 *   ESC a n     — Justification (0=left, 1=center, 2=right)
 *   ESC ! n     — Select print mode (bit 3 = double-height, bit 4 = double-width)
 *   GS ! n      — Select character size
 *   LF          — Line feed
 *   GS V m      — Cut paper (m=66 = partial cut)
 *
 * Requirements: 10.3, 10.4
 */

// ─── ESC/POS byte constants ───────────────────────────────────────────────────

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

const CMD = {
  INIT:           Buffer.from([ESC, 0x40]),
  ALIGN_LEFT:     Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER:   Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT:    Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON:        Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:       Buffer.from([ESC, 0x45, 0x00]),
  /** Double-height + double-width */
  SIZE_LARGE:     Buffer.from([GS,  0x21, 0x11]),
  /** Normal size */
  SIZE_NORMAL:    Buffer.from([GS,  0x21, 0x00]),
  LINE_FEED:      Buffer.from([LF]),
  /** Partial cut */
  CUT:            Buffer.from([GS,  0x56, 0x42, 0x00]),
} as const;

// ─── Payload ──────────────────────────────────────────────────────────────────

export interface ReservationSlipPayload {
  branchName: string;
  referenceNumber: string;
  /** ISO 8601 string */
  reservationTime: string;
  tableName: string;
  guestName: string;
  partySize: number;
  // Optional decoration / occasion fields
  has_decoration?: boolean;
  occasion_type?: string | null;
  decoration_color?: string | null;
  cake_choice?: string | null;
  decoration_notes?: string | null;
  decoration_amount?: number;
  // Cake menu integration
  cake_menu_name?: string | null;
  cake_menu_price?: number | null;
  cake_custom_notes?: string | null;
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

const PAPER_WIDTH = 32; // characters at normal size (58mm paper)
const DIVIDER = '-'.repeat(PAPER_WIDTH);

function text(str: string): Buffer {
  return Buffer.from(str + '\n', 'utf8');
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-MY', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
  const time = d.toLocaleTimeString('en-MY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${date}  ${time}`;
}

function labelValue(label: string, value: string): Buffer {
  const padded = label.padEnd(14);
  return text(`${padded}: ${value}`);
}

/**
 * Detect whether decoration notes indicate a croffle add-on.
 * Triggered when notes contain "birthday" or "croffle" (case-insensitive).
 * Requirements: 22.10
 */
export function hasCroffleAddOn(notes: string | null | undefined): boolean {
  if (!notes) return false;
  const lower = notes.toLowerCase();
  return lower.includes('birthday') || lower.includes('croffle');
}

/**
 * Render a ReservationSlipPayload to an ESC/POS command Buffer.
 * Requirements: 10.3
 */
export function renderReservationSlip(payload: ReservationSlipPayload): Buffer {
  const parts: Buffer[] = [
    CMD.INIT,

    // ── Header ──────────────────────────────────────────────────────────────
    CMD.ALIGN_CENTER,
    CMD.SIZE_LARGE,
    CMD.BOLD_ON,
    text(payload.branchName),
    CMD.SIZE_NORMAL,
    CMD.BOLD_OFF,
    CMD.LINE_FEED,

    CMD.BOLD_ON,
    text('RESERVATION SLIP'),
    CMD.BOLD_OFF,
    text(DIVIDER),
    CMD.LINE_FEED,

    // ── Details ─────────────────────────────────────────────────────────────
    CMD.ALIGN_LEFT,
    labelValue('Reference', payload.referenceNumber),
    labelValue('Date & Time', formatDateTime(payload.reservationTime)),
    labelValue('Table', payload.tableName),
    labelValue('Guest', payload.guestName),
    labelValue('Party Size', String(payload.partySize)),
    CMD.LINE_FEED,

  ];

  // ── Decoration section (optional) ─────────────────────────────────────────
  if (payload.has_decoration === true) {
    parts.push(
      CMD.ALIGN_LEFT,
      text(DIVIDER),
      CMD.BOLD_ON,
      text('OCCASION DECORATION'),
      CMD.BOLD_OFF,
      labelValue('Occasion Type', payload.occasion_type ?? '-'),
      labelValue('Color Theme',   payload.decoration_color ?? '-'),
      labelValue('Cake', payload.cake_menu_name
        ? `${payload.cake_menu_name} (RM ${(payload.cake_menu_price ?? 0).toFixed(2)})`
        : payload.cake_choice
          ? payload.cake_choice
          : '-'),
      labelValue('Decoration Fee', `RM ${(payload.decoration_amount ?? 50).toFixed(2)}`),
    );

    if (payload.decoration_notes) {
      const isCroffle = hasCroffleAddOn(payload.decoration_notes);
      parts.push(
        CMD.BOLD_ON,
        text('Special Notes:'),
        CMD.BOLD_OFF,
        text(isCroffle ? `⭐ ${payload.decoration_notes}` : payload.decoration_notes),
      );
      if (isCroffle) {
        parts.push(
          CMD.BOLD_ON,
          text('⭐ CROFFLE ADD-ON'),
          CMD.BOLD_OFF,
        );
      }
    }

    if (payload.cake_custom_notes) {
      parts.push(
        CMD.BOLD_ON,
        text('Cake Notes:'),
        CMD.BOLD_OFF,
        text(payload.cake_custom_notes),
      );
    }

    parts.push(CMD.LINE_FEED);
  }

  parts.push(
    // ── Footer ──────────────────────────────────────────────────────────────
    CMD.ALIGN_CENTER,
    text(DIVIDER),
    text('Thank you for your reservation!'),
    text('Please arrive on time.'),
    CMD.LINE_FEED,
    CMD.LINE_FEED,
    CMD.LINE_FEED,

    // ── Cut ─────────────────────────────────────────────────────────────────
    CMD.CUT,
  );

  return Buffer.concat(parts);
}
