/**
 * Bluetooth Printer Adapter
 *
 * Connects to a Bluetooth thermal printer via RFCOMM serial profile.
 * Requires the optional `@abandonware/bluetooth-serial-port` package.
 *
 * Requirements: 10.1, 10.2
 */

import { logger } from '../../config/logger.js';
import type { PrinterAdapter, BluetoothAdapterOptions } from './printer-adapter.interface.js';

const DEFAULT_CHANNEL = 1;

export class BluetoothPrinterAdapter implements PrinterAdapter {
  readonly type = 'bluetooth' as const;

  private readonly address: string;
  private readonly channel: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private serialPort: any = null;

  constructor(options: BluetoothAdapterOptions) {
    this.address = options.address;
    this.channel = options.channel ?? DEFAULT_CHANNEL;
  }

  async connect(): Promise<void> {
    try {
      // Dynamic import — optional native dependency
      const btModule = await import('@abandonware/bluetooth-serial-port');
      const BluetoothSerialPort = btModule.BluetoothSerialPort ?? btModule.default;
      const port = new BluetoothSerialPort();

      await new Promise<void>((resolve, reject) => {
        port.connect(
          this.address,
          this.channel,
          () => {
            this.serialPort = port;
            logger.info(
              { adapter: 'bluetooth', address: this.address, channel: this.channel },
              'Bluetooth printer connected'
            );
            resolve();
          },
          (err: Error) => reject(err)
        );
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Cannot find module')) {
        throw new Error(
          'Bluetooth printer adapter requires the "@abandonware/bluetooth-serial-port" package: ' +
          'npm install @abandonware/bluetooth-serial-port'
        );
      }
      throw err;
    }
  }

  async print(commands: Buffer): Promise<void> {
    if (!this.serialPort) {
      throw new Error('Bluetooth printer not connected — call connect() first');
    }

    await new Promise<void>((resolve, reject) => {
      this.serialPort.write(commands, (err: Error | null, bytesWritten: number) => {
        if (err) {
          reject(err);
        } else {
          logger.info(
            { adapter: 'bluetooth', address: this.address, bytes: bytesWritten },
            'Bluetooth print job sent'
          );
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.serialPort) {
      try {
        this.serialPort.close();
      } catch {
        // Ignore close errors
      }
      this.serialPort = null;
      logger.info(
        { adapter: 'bluetooth', address: this.address },
        'Bluetooth printer disconnected'
      );
    }
  }
}
