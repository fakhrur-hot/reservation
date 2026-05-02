/**
 * Default branch data with placeholder values.
 * These values are used when seeding a fresh database.
 * All placeholder values must be replaced via the setup wizard before going live.
 */

export interface DefaultBranchData {
  name: string;
  code: string;
  address: string;
  phone: string;
  adminEmail: string;
  adminName: string;
  timezone: string;
  currency: string;
  operatingMode: string;
  depositAmount?: number;
}

export const DEFAULT_BRANCH: DefaultBranchData = {
  name: 'SEJIWA Titiwangsa',
  code: 'SEJWKL01',
  address: 'Lot 123, Jalan Titiwangsa, 50400 Kuala Lumpur',
  phone: '+60 3-4101 0101',
  adminEmail: 'admin@sejiwa.my',
  adminName: 'SEJIWA Admin',
  timezone: 'Asia/Kuala_Lumpur',
  currency: 'MYR',
  operatingMode: 'FULL',
  depositAmount: 50.0, // RM50 default deposit
};
