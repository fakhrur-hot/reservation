/**
 * TypeScript interfaces for the Setup Wizard
 * Defines the complete data model for all 8 setup steps
 */

export interface SetupWizardState {
  currentStep: number; // 1–8
  step1: RestaurantProfileData;
  step2: OperatingHoursData;
  step3: SectionsLayoutData;
  step4: AdminAccountData;
  step5: ManagersData;
  step6: SmtpSettingsData | null; // null = skipped
  step7: DepositSettingsData;
}

export interface RestaurantProfileData {
  restaurantName: string;
  branchCode: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
  website?: string;
  timezone: string;
  currency: string;
}

export interface OperatingHoursData {
  schedule: DaySchedule[]; // 7 entries, index 0=Monday
  lastOrderCutoffMinutes: number;
  noShowGraceMinutes: number;
  modificationCutoffHours: number;
}

export interface DaySchedule {
  dayOfWeek: number; // 0=Monday, 1=Tuesday ... 6=Sunday
  isOpen: boolean;
  openTime: string; // HH:MM
  closeTime: string; // HH:MM
}

export interface SectionsLayoutData {
  sections: SectionInput[];
}

export interface SectionInput {
  name: string;
  description?: string;
  type: 'indoor' | 'outdoor';
  tables: TableInput[];
}

export interface TableInput {
  name: string;
  capacity: number;
  tableType: 'standard' | 'booth' | 'bar' | 'private';
}

export interface AdminAccountData {
  fullName: string;
  email: string;
  password: string;
}

export interface ManagersData {
  managers: ManagerInput[];
}

export interface ManagerInput {
  fullName: string;
  email: string;
  temporaryPassword: string;
}

export interface SmtpSettingsData {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  tls: boolean;
}

export interface DepositSettingsData {
  depositAmount: number;
  depositRequired: boolean;
  refundTier1Percent: number; // >72h
  refundTier2Percent: number; // 24-72h
  refundTier3Percent: number; // <24h
}

export interface SetupStatus {
  setupRequired: boolean;
  currentStep?: number;
  partialData?: boolean;
  branchName?: string;
}

export interface SmtpTestResult {
  success: boolean;
  error?: string;
}
