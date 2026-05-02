// Type declarations for optional native hardware modules
// These are dynamically imported at runtime and may not be installed

declare module 'usb' {
  export const usb: {
    findByIds(vendorId: number, productId: number): any;
  };
}

declare module '@abandonware/bluetooth-serial-port' {
  export class BluetoothSerialPort {
    connect(address: string, channel: number, success: () => void, error: (err: Error) => void): void;
    write(buffer: Buffer, callback: (err: Error | null, bytesWritten: number) => void): void;
    close(): void;
  }
  export default BluetoothSerialPort;
}
