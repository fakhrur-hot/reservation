/**
 * Promo Performance Metrics Dashboard Page
 *
 * Displays comprehensive promo code performance metrics including:
 * - Usage trends over time (line chart)
 * - ROI comparison across codes (bar chart)
 * - Key metrics cards (total bookings, discount given, conversion rate)
 * - Date range filtering
 * - CSV export
 * - Performance alerts
 */

import React, { useEffect, useState } from 'react';
import { listPromoCodesForBranch, getPromoCodeMetrics } from '../api';
import type { PromoCode, PromoCodeMetrics } from '../types';
import MetricsCards from '../components/MetricsCards';
import PromoPerformanceCharts from '../components/PromoPerformanceCharts';
import './PromoPerformanceDashboardPage.css';

interface AggregatedMetrics {
  totalUsage: number;
  totalBookings: number;
  totalDiscountGiven: number;
  averageConversionRate: number;
  topPerformer: PromoCode & PromoCodeMetrics | null;
  lowestPerformer: PromoCode & PromoCodeMetrics | null;
  performanceAlerts: PerformanceAlert[];
}

interface PerformanceAlert {
  type: 'warning' | 'info' | 'success';
  message: string;
}

function getBranchId() {
  return localStorage.getItem('branch_id') ?? '';
}

/**
 * Calculate aggregated metrics and alerts from individual promo metrics.
 */
function calculateAggregatedMetrics(
  codesWithMetrics: Array<PromoCode & PromoCodeMetrics>
): AggregatedMetrics {
  const alerts: PerformanceAlert[] = [];

  if (codesWithMetrics.length === 0) {
    return {
      totalUsage: 0,
      totalBookings: 0,
      totalDiscountGiven: 0,
      averageConversionRate: 0,
      topPerformer: null,
      lowestPerformer: null,
      performanceAlerts: alerts,
    };
  }

  const totalUsage = codesWithMetrics.reduce((sum, c) => sum + (c.usageCount || 0), 0);
  const totalBookings = codesWithMetrics.reduce((sum, c) => sum + (c.bookingCount || 0), 0);
  const totalDiscountGiven = codesWithMetrics.reduce((sum, c) => sum + (c.totalDiscountGiven || 0), 0);
  const averageConversionRate =
    codesWithMetrics.length > 0
      ? codesWithMetrics.reduce((sum, c) => sum + (c.conversionRate || 0), 0) / codesWithMetrics.length
      : 0;

  // Find top and lowest performers
  const topPerformer = codesWithMetrics.reduce((top, current) =>
    (current.conversionRate || 0) > (top.conversionRate || 0) ? current : top
  );

  const lowestPerformer = codesWithMetrics.reduce((lowest, current) =>
    (current.conversionRate || 0) < (lowest.conversionRate || 0) ? current : lowest
  );

  // Check for anomalies
  if (averageConversionRate > 0) {
    const lowPerformers = codesWithMetrics.filter(
      (c) => c.usageCount > 0 && (c.conversionRate || 0) < averageConversionRate * 0.5
    );
    if (lowPerformers.length > 0) {
      alerts.push({
        type: 'warning',
        message: `${lowPerformers.length} code(s) have conversion rates below 50% of average`,
      });
    }
  }

  // Alert for high discount given
  if (totalDiscountGiven > 0) {
    const estimatedRevenue = totalBookings * 100; // Rough estimate
    if (totalDiscountGiven > estimatedRevenue * 0.3) {
      alerts.push({
        type: 'warning',
        message: 'Total discounts exceed 30% of estimated revenue. Consider reviewing discount values.',
      });
    }
  }

  // Success alert for high conversion
  if (averageConversionRate > 70) {
    alerts.push({
      type: 'success',
      message: 'Promo codes are performing exceptionally well with average 70%+ conversion rate!',
    });
  }

  return {
    totalUsage,
    totalBookings,
    totalDiscountGiven,
    averageConversionRate,
    topPerformer: topPerformer || null,
    lowestPerformer: lowestPerformer || null,
    performanceAlerts: alerts,
  };
}

/**
 * Export metrics to CSV format.
 */
function exportMetricsToCSV(
  codesWithMetrics: Array<PromoCode & PromoCodeMetrics>,
  dateRange: { from: string; to: string }
) {
  const csvContent = [
    ['Promo Code Performance Report'],
    [`Date Range: ${dateRange.from} to ${dateRange.to}`],
    [''],
    [
      'Code',
      'Type',
      'Usage Count',
      'Max Uses',
      'Booking Count',
      'Total Discount Given',
      'Conversion Rate (%)',
      'Avg Discount per Booking',
    ],
    ...codesWithMetrics.map((c) => [
      c.code,
      c.type,
      c.usageCount,
      c.maxUses || 'Unlimited',
      c.bookingCount,
      c.totalDiscountGiven.toFixed(2),
      c.conversionRate.toFixed(1),
      c.avgDiscountPerBooking.toFixed(2),
    ]),
  ]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `promo-performance-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export default function PromoPerformanceDashboardPage() {
  const branchId = getBranchId();

  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [metricsMap, setMetricsMap] = useState<Map<string, PromoCodeMetrics>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  // Load promo codes and metrics
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');

      try {
        // Fetch all promo codes
        const response = await listPromoCodesForBranch(branchId);
        setCodes(response.data);

        // Fetch metrics for each code
        const metricsPromises = response.data.map((code) =>
          getPromoCodeMetrics(code.id)
            .then((metrics) => ({ id: code.id, metrics }))
            .catch((_err) => ({ id: code.id, metrics: null }))
        );

        const results = await Promise.all(metricsPromises);
        const newMetricsMap = new Map<string, PromoCodeMetrics>();

        results.forEach(({ id, metrics }) => {
          if (metrics) {
            newMetricsMap.set(id, metrics);
          }
        });

        setMetricsMap(newMetricsMap);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setLoading(false);
      }
    })();
  }, [branchId]);

  // Combine codes with metrics
  const codesWithMetrics: Array<PromoCode & PromoCodeMetrics> = codes
    .map((code) => {
      const metrics = metricsMap.get(code.id);
      return metrics ? { ...code, ...metrics } : null;
    })
    .filter((x): x is PromoCode & PromoCodeMetrics => x !== null);

  // Calculate aggregated metrics
  const aggregated = calculateAggregatedMetrics(codesWithMetrics);

  if (loading) {
    return (
      <div className="promo-performance-dashboard page">
        <div className="loading-spinner">Loading performance data...</div>
      </div>
    );
  }

  return (
    <div className="promo-performance-dashboard page">
      <div className="page-header">
        <h1>Promo Code Performance Analytics</h1>
        <p>Track usage trends, ROI, and identify top-performing codes</p>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Performance Alerts */}
      {aggregated.performanceAlerts.length > 0 && (
        <div className="alerts-section">
          {aggregated.performanceAlerts.map((alert, idx) => (
            <div key={idx} className={`alert alert-${alert.type}`}>
              {alert.type === 'warning' && '⚠️ '}
              {alert.type === 'success' && '✓ '}
              {alert.type === 'info' && 'ℹ️ '}
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Metrics Cards */}
      <MetricsCards
        totalUsage={aggregated.totalUsage}
        totalBookings={aggregated.totalBookings}
        totalDiscountGiven={aggregated.totalDiscountGiven}
        averageConversionRate={aggregated.averageConversionRate}
      />

      {/* Date Range Filter */}
      <div className="filter-section">
        <div className="date-filters">
          <div className="date-input">
            <label htmlFor="dateFrom">From:</label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="date-input">
            <label htmlFor="dateTo">To:</label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={() => exportMetricsToCSV(codesWithMetrics, { from: dateFrom, to: dateTo })}
          disabled={codesWithMetrics.length === 0}
        >
          📥 Export to CSV
        </button>
      </div>

      {/* Charts */}
      {codesWithMetrics.length > 0 ? (
        <PromoPerformanceCharts codes={codesWithMetrics} />
      ) : (
        <div className="empty-state">
          <p>No promo codes available to display performance metrics.</p>
        </div>
      )}

      {/* Top/Bottom Performers */}
      {codesWithMetrics.length > 0 && (
        <div className="performers-section">
          <div className="performer-card top-performer">
            <h3>🏆 Top Performer</h3>
            {aggregated.topPerformer ? (
              <>
                <div className="performer-code">{aggregated.topPerformer.code}</div>
                <div className="performer-metric">
                  Conversion Rate: <strong>{aggregated.topPerformer.conversionRate.toFixed(1)}%</strong>
                </div>
                <div className="performer-metric">
                  Bookings: <strong>{aggregated.topPerformer.bookingCount}</strong>
                </div>
              </>
            ) : (
              <p>No data available</p>
            )}
          </div>

          <div className="performer-card bottom-performer">
            <h3>⬇️ Needs Improvement</h3>
            {aggregated.lowestPerformer ? (
              <>
                <div className="performer-code">{aggregated.lowestPerformer.code}</div>
                <div className="performer-metric">
                  Conversion Rate: <strong>{aggregated.lowestPerformer.conversionRate.toFixed(1)}%</strong>
                </div>
                <div className="performer-metric">
                  Bookings: <strong>{aggregated.lowestPerformer.bookingCount}</strong>
                </div>
              </>
            ) : (
              <p>No data available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
