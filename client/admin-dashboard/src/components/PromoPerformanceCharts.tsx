/**
 * Promo Code Performance Charts Component
 * Displays usage trends (line chart) and ROI comparison (bar chart) using SVG
 */

import React from 'react';
import type { PromoCode, PromoCodeMetrics } from '../types';
import './PromoPerformanceCharts.css';

interface PromoPerformanceChartsProps {
  codes: Array<PromoCode & PromoCodeMetrics>;
}

/**
 * Simple Line Chart using SVG
 */
function UsageTrendLineChart({ codes }: { codes: Array<PromoCode & PromoCodeMetrics> }) {
  const chartWidth = 600;
  const chartHeight = 300;
  const padding = 50;
  const innerWidth = chartWidth - padding * 2;
  const innerHeight = chartHeight - padding * 2;

  // Generate mock trend data (in a real app, this would come from an API with daily/weekly data)
  const trendData = codes.map((code) => ({
    name: code.code,
    usage: code.usageCount || 0,
  }));

  // Find max value for scaling
  const maxUsage = Math.max(...trendData.map((d) => d.usage), 1);
  const yScale = innerHeight / maxUsage;

  // Distribute codes evenly across x-axis
  const xStep = innerWidth / (trendData.length + 1);
  const points = trendData
    .map((data, idx) => ({
      x: padding + xStep * (idx + 1),
      y: padding + innerHeight - data.usage * yScale,
      ...data,
    }))
    .filter((p) => p.usage > 0);

  // Create path for line
  const pathData =
    points.length > 1
      ? `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`
      : '';

  return (
    <div className="chart-container">
      <h3>Usage Trend</h3>
      <svg width={chartWidth} height={chartHeight} className="chart">
        {/* Grid lines */}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={`grid-${i}`}
            x1={padding}
            y1={padding + (innerHeight / 4) * i}
            x2={chartWidth - padding}
            y2={padding + (innerHeight / 4) * i}
            stroke="#e9ecef"
            strokeDasharray="4"
          />
        ))}

        {/* Axes */}
        <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="#2c3e50" strokeWidth="2" />
        <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#2c3e50" strokeWidth="2" />

        {/* Y-Axis Labels */}
        {Array.from({ length: 5 }).map((_, i) => {
          const value = Math.round((maxUsage / 4) * i);
          return (
            <text
              key={`y-label-${i}`}
              x={padding - 10}
              y={chartHeight - padding - (innerHeight / 4) * i + 5}
              textAnchor="end"
              fontSize="12"
              fill="#7f8c8d"
            >
              {value}
            </text>
          );
        })}

        {/* Line */}
        {points.length > 1 && (
          <path d={pathData} stroke="#696cff" strokeWidth="3" fill="none" clipPath="url(#clip)" />
        )}

        {/* Points */}
        {points.map((point, idx) => (
          <g key={`point-${idx}`}>
            <circle cx={point.x} cy={point.y} r="5" fill="#696cff" />
            <text x={point.x} y={chartHeight - padding + 20} textAnchor="middle" fontSize="12" fill="#2c3e50">
              {point.name}
            </text>
          </g>
        ))}

        {/* No data message */}
        {points.length === 0 && (
          <text x={chartWidth / 2} y={chartHeight / 2} textAnchor="middle" fontSize="14" fill="#aab3be">
            No usage data available
          </text>
        )}
      </svg>
    </div>
  );
}

/**
 * Simple Bar Chart using SVG
 */
function ROIComparisonBarChart({ codes }: { codes: Array<PromoCode & PromoCodeMetrics> }) {
  // Sort by conversion rate descending
  const sortedCodes = [...codes].sort((a, b) => (b.conversionRate || 0) - (a.conversionRate || 0)).slice(0, 8); // Top 8

  const chartWidth = 600;
  const chartHeight = 300;
  const padding = 50;
  const innerWidth = chartWidth - padding * 2;
  const innerHeight = chartHeight - padding * 2;

  const maxRate = Math.max(...sortedCodes.map((c) => c.conversionRate || 0), 100);
  const yScale = innerHeight / maxRate;

  const barWidth = innerWidth / (sortedCodes.length + 1);
  const barInnerWidth = barWidth * 0.6;

  const bars = sortedCodes.map((code, idx) => ({
    x: padding + (idx + 1) * barWidth - barInnerWidth / 2,
    y: padding + innerHeight - (code.conversionRate || 0) * yScale,
    height: (code.conversionRate || 0) * yScale,
    name: code.code,
    rate: code.conversionRate || 0,
  }));

  return (
    <div className="chart-container">
      <h3>Conversion Rate Comparison (Top 8)</h3>
      <svg width={chartWidth} height={chartHeight} className="chart">
        {/* Grid lines */}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={`grid-${i}`}
            x1={padding}
            y1={padding + (innerHeight / 4) * i}
            x2={chartWidth - padding}
            y2={padding + (innerHeight / 4) * i}
            stroke="#e9ecef"
            strokeDasharray="4"
          />
        ))}

        {/* Axes */}
        <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="#2c3e50" strokeWidth="2" />
        <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#2c3e50" strokeWidth="2" />

        {/* Y-Axis Labels */}
        {Array.from({ length: 5 }).map((_, i) => {
          const value = Math.round((maxRate / 4) * i);
          return (
            <text
              key={`y-label-${i}`}
              x={padding - 10}
              y={chartHeight - padding - (innerHeight / 4) * i + 5}
              textAnchor="end"
              fontSize="12"
              fill="#7f8c8d"
            >
              {value}%
            </text>
          );
        })}

        {/* Bars */}
        {bars.map((bar, idx) => {
          // Color gradient based on rate
          let barColor = '#e74c3c'; // Red for low
          if (bar.rate >= 50) barColor = '#f39c12'; // Orange for medium
          if (bar.rate >= 70) barColor = '#27ae60'; // Green for high

          return (
            <g key={`bar-${idx}`}>
              <rect x={bar.x} y={bar.y} width={barInnerWidth} height={bar.height} fill={barColor} />
              <text
                x={bar.x + barInnerWidth / 2}
                y={chartHeight - padding + 20}
                textAnchor="middle"
                fontSize="12"
                fill="#2c3e50"
              >
                {bar.name}
              </text>
              <text
                x={bar.x + barInnerWidth / 2}
                y={bar.y - 5}
                textAnchor="middle"
                fontSize="11"
                fill="#2c3e50"
                fontWeight={600}
              >
                {bar.rate.toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* Legend */}
        {bars.length === 0 && (
          <text x={chartWidth / 2} y={chartHeight / 2} textAnchor="middle" fontSize="14" fill="#aab3be">
            No conversion data available
          </text>
        )}
      </svg>

      {/* Legend */}
      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#27ae60' }} />
          <span>High (70%+)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#f39c12' }} />
          <span>Medium (50-70%)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#e74c3c' }} />
          <span>Low (&lt;50%)</span>
        </div>
      </div>
    </div>
  );
}

export default function PromoPerformanceCharts({ codes }: PromoPerformanceChartsProps) {
  return (
    <div className="charts-section">
      <div className="charts-grid">
        <UsageTrendLineChart codes={codes} />
        <ROIComparisonBarChart codes={codes} />
      </div>
    </div>
  );
}
