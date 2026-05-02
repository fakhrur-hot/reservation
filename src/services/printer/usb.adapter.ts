/**
 * USB Printer Adapter
 *
 * Connects to a thermal printer over USB using the `usb` package.
 * Falls back to a stub when the native module is unavailable (CI / dev).
 *
 * Requirements: 10.1, 10.2
 */

import { logger } from '../../config/logger.js';
import type { PrinterAdapter, UsbAdapterOptions } from './printer-adapter.interface.js';

export class UsbPrinterAdapter implements PrinterAdapter {
  readonly type = 'usb' as const;

  private readonly vendorId: number;
  private readonly productId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private device: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private endpoint: any = null;

  constructor(options: UsbAdapterOptions) {
    this.vendorId = options.vendorId;
    this.productId = options.productId;
  }

  async connect(): Promise<void> {
    try {
      // Dynamic import — `usb` is an optional native dependency
      const { usb } = await import('usb');
      this.device = usb.findByIds(this.vendorId, this.productId);

      if (!this.device) {
        throw new Error(
          `USB printer not found (vendorId=0x${this.vendorId.toString(16)}, productId=0x${this.productId.toString(16)})`
        );
      }

      this.device.open();
      const iface = this.device.interfaces[0];
      iface.claim();
      this.endpoint = iface.endpoints.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) => e.direction === 'out'
      );

      if (!this.endpoint) {
        throw new Error('No OUT endpoint found on USB printer interface');
      }

      logger.info(
        { adapter: 'usb', vendorId: this.vendorId, productId: this.productId },
        'USB printer connected'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // If the `usb` package is not installed, surface a clear error
      if (msg.includes('Cannot find module')) {
        throw new Error(
          'USB printer adapter requires the "usb" package: npm install usb'
        );
      }
      throw err;
    }
  }

  async print(commands: Buffer): Promise<void> {
    if (!this.endpoint) {
      throw new Error('USB printer not connected — call connect() first');
    }

    await new Promise<void>((resolve, reject) => {
      this.endpoint.transfer(commands, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    logger.info(
      { adapter: 'usb', bytes: commands.length },
      'USB print job sent'
    );
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        this.device.close();
      } catch {
        // Ignore close errors
      }
      this.device = null;
      this.endpoint = null;
      logger.info({ adapter: 'usb' }, 'USB printer disconnected');
    }
  }
}
