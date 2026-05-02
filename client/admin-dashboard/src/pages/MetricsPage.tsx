import React, { useState, useEffect } from 'react';
import { exportBookingsToCSV, exportMetricsToCSV, exportNoShowsToCSV } from '../utils/exportUtils';
import './MetricsPage.css';

interface MetricsPageProps {
  branchId: string;
  onExport?: (format: 'csv' | 'pdf') => void;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

export const MetricsPage: React.FC<MetricsPageProps> = ({ branchId, onExport }) => {
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const [bookingMetrics, setBookingMetrics] = useState<any>(null);
  const [noShowMetrics, setNoShowMetrics] = useState<any>(null);
  const [turnoverMetrics, setTurnoverMetrics] = useState<any>(null);
  const [promoMetrics, setPromoMetrics] = useState<any>(null);
  const [revenueMetrics, setRevenueMetrics] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          branchId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        });

        const [bookings, noShows, turnover, promo, revenue] = await Promise.all([
          fetch(`/admin/v1/metrics/bookings?${params}`).then(r => r.json()),
          fetch(`/admin/v1/metrics/no-shows?${params}`).then(r => r.json()),
          fetch(`/admin/v1/metrics/turnover?${params}`).then(r => r.json()),
          fetch(`/admin/v1/metrics/promo?${params}`).then(r => r.json()),
          fetch(`/admin/v1/metrics/revenue?${params}`).then(r => r.json()),
        ]);

        setBookingMetrics(bookings);
        setNoShowMetrics(noShows);
        setTurnoverMetrics(turnover);
        setPromoMetrics(promo);
        setRevenueMetrics(revenue);
      } catch (err) {
        setError('Failed to load metrics');
        console.error('Error loading metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [branchId, dateRange]);

  const handleDateRangeChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleExport = (format: 'csv' | 'pdf') => {
    if (format === 'csv') {
      exportMetricsToCSV({
        branchId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        format: 'csv',
      }).catch(err => {
        setError('Failed to export metrics: ' + err.message);
      });
    } else if (format === 'pdf') {
      // PDF export would require additional library
      alert('PDF export is coming soon. For now, please use CSV export.');
    }
  };

  if (loading && !bookingMetrics) {
    return <div className="metrics-page">Loading metrics...</div>;
  }

  return (
    <div className="metrics-page">
      <div className="metrics-header">
        <h1>Analytics & Metrics Dashboard</h1>
        <div className="metrics-controls">
          <div className="date-range-inputs">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={e => handleDateRangeChange('startDate', e.target.value)}
              className="date-input"
            />
            <span className="date-range-separator">to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={e => handleDateRangeChange('endDate', e.target.value)}
              className="date-input"
            />
          </div>
          <div className="export-buttons">
            <button className="export-btn export-btn--csv" onClick={() => handleExport('csv')}>
              📊 Export Metrics (CSV)
            </button>
            <button 
              className="export-btn export-btn--secondary"
              onClick={() => {
                exportBookingsToCSV({
                  branchId,
                  startDate: dateRange.startDate,
                  endDate: dateRange.endDate,
                  format: 'csv',
                }).catch(err => {
                  setError('Failed to export bookings: ' + err.message);
                });
              }}
            >
              📝 Export Bookings (CSV)
            </button>
            <button 
              className="export-btn export-btn--secondary"
              onClick={() => {
                exportNoShowsToCSV({
                  branchId,
                  startDate: dateRange.startDate,
                  endDate: dateRange.endDate,
                  format: 'csv',
                }).catch(err => {
                  setError('Failed to export no-shows: ' + err.message);
                });
              }}
            >
              ⚠️ Export No-Shows (CSV)
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="metrics-grid">
        {/* Booking Metrics */}
        <div className="metrics-card">
          <h2>Booking Overview</h2>
          {bookingMetrics && (
            <div className="metrics-content">
              <div className="metric-stat">
                <span className="metric-label">Total Bookings</span>
                <span className="metric-value">{bookingMetrics.totalBookings}</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Avg Party Size</span>
                <span className="metric-value">{bookingMetrics.averagePartySize?.toFixed(1)}</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Growth Rate</span>
                <span className={`metric-value ${bookingMetrics.growthRate >= 0 ? 'positive' : 'negative'}`}>
                  {bookingMetrics.growthRate?.toFixed(1)}%
                </span>
              </div>
              <div className="booking-by-type">
                <h3>By Type</h3>
                <div className="stat-row">
                  <span>Standard: {bookingMetrics.bookingsByType?.standard || 0}</span>
                </div>
                <div className="stat-row">
                  <span>Decorated: {bookingMetrics.bookingsByType?.decorated || 0}</span>
                </div>
              </div>
              <div className="booking-by-window">
                <h3>By Time Window</h3>
                <div className="stat-row">
                  <span>Morning (6-12): {bookingMetrics.bookingsByTimeWindow?.morning || 0}</span>
                </div>
                <div className="stat-row">
                  <span>Afternoon (12-17): {bookingMetrics.bookingsByTimeWindow?.afternoon || 0}</span>
                </div>
                <div className="stat-row">
                  <span>Evening (17-21): {bookingMetrics.bookingsByTimeWindow?.evening || 0}</span>
                </div>
                <div className="stat-row">
                  <span>Late Night: {bookingMetrics.bookingsByTimeWindow?.lateNight || 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* No-Show Metrics */}
        <div className="metrics-card">
          <h2>No-Show Analysis</h2>
          {noShowMetrics && (
            <div className="metrics-content">
              <div className="metric-stat">
                <span className="metric-label">Total No-Shows</span>
                <span className="metric-value">{noShowMetrics.totalNoShows}</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">No-Show Rate</span>
                <span className="metric-value">{noShowMetrics.noShowRate?.toFixed(1)}%</span>
              </div>
              {noShowMetrics.chronicalOffenders && noShowMetrics.chronicalOffenders.length > 0 && (
                <div className="chronic-offenders">
                  <h3>Chronic Offenders (3+ no-shows)</h3>
                  {noShowMetrics.chronicalOffenders.slice(0, 5).map((offender: any, idx: number) => (
                    <div key={idx} className="offender-row">
                      <span>{offender.customerName}</span>
                      <span className="offender-badge">{offender.noShowCount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Revenue Metrics */}
        <div className="metrics-card">
          <h2>Revenue Summary</h2>
          {revenueMetrics && (
            <div className="metrics-content">
              <div className="metric-stat">
                <span className="metric-label">Total Revenue</span>
                <span className="metric-value">${revenueMetrics.totalRevenue?.toFixed(2)}</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Total Deposits</span>
                <span className="metric-value">${revenueMetrics.totalDeposits?.toFixed(2)}</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Net Revenue</span>
                <span className="metric-value">${revenueMetrics.netRevenue?.toFixed(2)}</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Growth Rate</span>
                <span className={`metric-value ${revenueMetrics.revenueGrowthRate >= 0 ? 'positive' : 'negative'}`}>
                  {revenueMetrics.revenueGrowthRate?.toFixed(1)}%
                </span>
              </div>
              <div className="revenue-per-table">
                <span className="metric-label">Revenue Per Table</span>
                <span className="metric-value">${revenueMetrics.revenuePerTable?.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Turnover Metrics */}
        <div className="metrics-card">
          <h2>Table Turnover</h2>
          {turnoverMetrics && (
            <div className="metrics-content">
              <div className="metric-stat">
                <span className="metric-label">Avg Session Duration</span>
                <span className="metric-value">{turnoverMetrics.sessionDurationAverage?.toFixed(0)} min</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Avg Turnaround Time</span>
                <span className="metric-value">{turnoverMetrics.averageTurnaroundTime?.toFixed(0)} min</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Tables Per Hour</span>
                <span className="metric-value">{turnoverMetrics.tablesPerHour?.toFixed(2)}</span>
              </div>
              <div className="peak-hours">
                <h3>Peak Turnover Hours</h3>
                <div className="hour-list">
                  {turnoverMetrics.peakTurnoverHours?.slice(0, 5).map((hour: number, idx: number) => (
                    <span key={idx} className="hour-badge">
                      {hour}:00
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Promo Metrics */}
        <div className="metrics-card">
          <h2>Promo Code Performance</h2>
          {promoMetrics && (
            <div className="metrics-content">
              <div className="metric-stat">
                <span className="metric-label">Total Promo Use</span>
                <span className="metric-value">{promoMetrics.totalPromoUse}</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Conversion Rate</span>
                <span className="metric-value">{promoMetrics.conversionRate?.toFixed(1)}%</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Total Discount Given</span>
                <span className="metric-value">${promoMetrics.totalDiscountGiven?.toFixed(2)}</span>
              </div>
              <div className="metric-stat">
                <span className="metric-label">Avg Discount/Booking</span>
                <span className="metric-value">${promoMetrics.averageDiscountPerBooking?.toFixed(2)}</span>
              </div>
              <div className="top-promos">
                <h3>Top Performing Promos</h3>
                <div className="promo-list">
                  {promoMetrics.topPerformingPromos?.slice(0, 5).map((code: string, idx: number) => (
                    <span key={idx} className="promo-badge">{code}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricsPage;
