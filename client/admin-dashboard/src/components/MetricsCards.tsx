/**
 * Metrics Cards Component
 * Displays key performance metrics in card format
 */

import React from 'react';
import './MetricsCards.css';

interface MetricsCardsProps {
  totalUsage: number;
  totalBookings: number;
  totalDiscountGiven: number;
  averageConversionRate: number;
}

export default function MetricsCards({
  totalUsage,
  totalBookings,
  totalDiscountGiven,
  averageConversionRate,
}: MetricsCardsProps) {
  return (
    <div className="metrics-cards">
      {/* Total Usage Card */}
      <div className="metric-card">
        <div className="metric-icon">📊</div>
        <div className="metric-content">
          <div className="metric-label">Total Usage</div>
          <div className="metric-value">{totalUsage.toLocaleString()}</div>
          <div className="metric-subtitle">codes redeemed</div>
        </div>
      </div>

      {/* Total Bookings Card */}
      <div className="metric-card">
        <div className="metric-icon">📅</div>
        <div className="metric-content">
          <div className="metric-label">Total Bookings</div>
          <div className="metric-value">{totalBookings.toLocaleString()}</div>
          <div className="metric-subtitle">reservations created</div>
        </div>
      </div>

      {/* Total Discount Given Card */}
      <div className="metric-card">
        <div className="metric-icon">💰</div>
        <div className="metric-content">
          <div className="metric-label">Total Discount</div>
          <div className="metric-value">MYR {totalDiscountGiven.toFixed(2)}</div>
          <div className="metric-subtitle">discount given out</div>
        </div>
      </div>

      {/* Average Conversion Rate Card */}
      <div className="metric-card">
        <div className="metric-icon">🎯</div>
        <div className="metric-content">
          <div className="metric-label">Avg Conversion</div>
          <div className="metric-value">{averageConversionRate.toFixed(1)}%</div>
          <div className="metric-subtitle">average conversion rate</div>
        </div>
      </div>
    </div>
  );
}
