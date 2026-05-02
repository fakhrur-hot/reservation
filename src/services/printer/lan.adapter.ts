/**
 * LAN / WiFi Printer Adapter
 *
 * Connects to a network-attached thermal printer via a raw TCP socket.
 * Works for both wired LAN and WiFi printers that expose a TCP port
 * (typically port 9100 for ESC/POS printers).
 *
 * Requirements: 10.1, 10.2
 */

import net from 'net';
import { logger } from '../../config/logger.js';
import type { PrinterAdapter, LanAdapterOptions } from './printer-adapter.interface.js';

const DEFAULT_PORT = 9100;
const DEFAULT_TIMEOUT_MS = 5000;

export class LanPrinterAdapter implements PrinterAdapter {
  readonly type = 'lan' as const;

  private readonly host: string;
  private readonly port: number;
  private readonly timeout: number;
  private socket: net.Socket | null = null;

  constructor(options: LanAdapterOptions) {
    this.host = options.host;
    this.port = options.port ?? DEFAULT_PORT;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(this.timeout);

      socket.once('connect', () => {
        this.socket = socket;
        logger.info(
          { adapter: 'lan', host: this.host, port: this.port },
          'LAN/WiFi printer connected'
        );
        resolve();
      });

      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error(`LAN printer connection timed out (${this.host}:${this.port})`));
      });

      socket.once('error', (err) => {
        reject(err);
      });

      socket.connect(this.port, this.host);
    });
  }

  async print(commands: Buffer): Promise<void> {
    if (!this.socket) {
      throw new Error('LAN printer not connected — call connect() first');
    }

    return new Promise((resolve, reject) => {
      this.socket!.write(commands, (err) => {
        if (err) {
          reject(err);
        } else {
          logger.info(
            { adapter: 'lan', host: this.host, port: this.port, bytes: commands.length },
            'LAN/WiFi print job sent'
          );
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      logger.info(
        { adapter: 'lan', host: this.host, port: this.port },
        'LAN/WiFi printer disconnected'
      );
    }
  }
}
