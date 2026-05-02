/**
 * Export utility functions for downloading files
 */

export interface ExportOptions {
  branchId: string;
  startDate: string;
  endDate: string;
  format: 'csv' | 'pdf';
}

/**
 * Trigger a file download from a URL
 */
function downloadFile(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export bookings to CSV
 */
export async function exportBookingsToCSV(options: ExportOptions): Promise<void> {
  try {
    const params = new URLSearchParams({
      branchId: options.branchId,
      startDate: options.startDate,
      endDate: options.endDate,
    });

    const response = await fetch(`/admin/v1/export/bookings?${params}`);
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const filename = `bookings-${options.branchId}-${options.startDate}.csv`;
    
    downloadFile(url, filename);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting bookings:', error);
    throw error;
  }
}

/**
 * Export metrics to CSV
 */
export async function exportMetricsToCSV(options: ExportOptions): Promise<void> {
  try {
    const params = new URLSearchParams({
      branchId: options.branchId,
      startDate: options.startDate,
      endDate: options.endDate,
    });

    const response = await fetch(`/admin/v1/export/metrics?${params}`);
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const filename = `metrics-${options.branchId}-${options.startDate}.csv`;
    
    downloadFile(url, filename);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting metrics:', error);
    throw error;
  }
}

/**
 * Export no-shows to CSV
 */
export async function exportNoShowsToCSV(options: ExportOptions): Promise<void> {
  try {
    const params = new URLSearchParams({
      branchId: options.branchId,
      startDate: options.startDate,
      endDate: options.endDate,
    });

    const response = await fetch(`/admin/v1/export/no-shows?${params}`);
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const filename = `no-shows-${options.branchId}-${options.startDate}.csv`;
    
    downloadFile(url, filename);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting no-shows:', error);
    throw error;
  }
}

/**
 * Convert metrics to JSON (for integration with other systems)
 */
export function convertMetricsToJSON(metrics: any): string {
  return JSON.stringify(metrics, null, 2);
}

/**
 * Copy metrics data to clipboard
 */
export async function copyMetricsToClipboard(metrics: any): Promise<void> {
  try {
    const json = convertMetricsToJSON(metrics);
    await navigator.clipboard.writeText(json);
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    throw error;
  }
}
