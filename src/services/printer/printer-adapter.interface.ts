/**
 * PrinterAdapter Interface
 *
 * Common contract for all printer connection types (USB, LAN/WiFi, Bluetooth).
 * Admin configures the active adapter per branch via branch settings.
 *
 * Requirements: 10.1, 10.2, 10.7
 */

export type PrinterConnectionType = 'usb' | 'lan' | 'wifi' | 'bluetooth';

export interface PrinterAdapterConfig {
  type: PrinterConnectionType;
  /** USB: vendor/product IDs. LAN/WiFi: host + port. Bluetooth: device address. */
  options: UsbAdapterOptions | LanAdapterOptions | BluetoothAdapterOptions;
}

export interface UsbAdapterOptions {
  vendorId: number;
  productId: number;
}

export interface LanAdapterOptions {
  host: string;
  port: number;
  /** Connection timeout in ms (default: 5000) */
  timeout?: number;
}

export interface BluetoothAdapterOptions {
  /** RFCOMM device address, e.g. "00:11:22:33:44:55" */
  address: string;
  /** RFCOMM channel (default: 1) */
  channel?: number;
}

/**
 * Common interface all printer adapters must implement.
 */
export interface PrinterAdapter {
  readonly type: PrinterConnectionType;

  /** Open the connection to the printer. */
  connect(): Promise<void>;

  /** Send raw ESC/POS command buffer to the printer. */
  print(commands: Buffer): Promise<void>;

  /** Close the connection. */
  disconnect(): Promise<void>;
}
