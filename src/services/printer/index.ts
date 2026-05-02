/**
 * Printer module barrel export
 */

export type { PrinterAdapter, PrinterAdapterConfig, PrinterConnectionType } from './printer-adapter.interface.js';
export type { ReservationSlipPayload } from './escpos.renderer.js';
export type { PrintJobType, PrintJobResult } from './print-job.service.js';

export { createPrinterAdapter } from './printer-adapter.factory.js';
export { renderReservationSlip, hasCroffleAddOn } from './escpos.renderer.js';
export { triggerReservationSlipPrint, printReservationSlip } from './print-job.service.js';
