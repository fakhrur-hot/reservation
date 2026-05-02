/**
 * Operating modes for the system.
 * TABLE_ONLY is the only mode supported in Stage 1.
 */
export const OPERATING_MODES = ['TABLE_ONLY', 'MENU_READY', 'FULL'] as const;

export type OperatingMode = (typeof OPERATING_MODES)[number];
