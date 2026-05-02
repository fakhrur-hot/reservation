/**
 * PrinterAdapter Factory
 *
 * Creates the correct adapter instance based on the branch printer config.
 * Admin configures the active adapter type per branch (Requirement 10.7).
 */

import type { PrinterAdapter, PrinterAdapterConfig } from './printer-adapter.interface.js';
import { UsbPrinterAdapter } from './usb.adapter.js';
import { LanPrinterAdapter } from './lan.adapter.js';
import { BluetoothPrinterAdapter } from './bluetooth.adapter.js';
import type { UsbAdapterOptions, LanAdapterOptions, BluetoothAdapterOptions } from './printer-adapter.interface.js';

export function createPrinterAdapter(config: PrinterAdapterConfig): PrinterAdapter {
  switch (config.type) {
    case 'usb':
      return new UsbPrinterAdapter(config.options as UsbAdapterOptions);
    case 'lan':
    case 'wifi':
      return new LanPrinterAdapter(config.options as LanAdapterOptions);
    case 'bluetooth':
      return new BluetoothPrinterAdapter(config.options as BluetoothAdapterOptions);
    default: {
      const exhaustive: never = config.type;
      throw new Error(`Unknown printer adapter type: ${exhaustive}`);
    }
  }
}
