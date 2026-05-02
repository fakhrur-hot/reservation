import React, { useEffect, useRef } from 'react';
import './MetricsCharts.css';

interface MetricsChartsProps {
  bookingMetrics?: any;
  noShowMetrics?: any;
  revenueMetrics?: any;
  turnoverMetrics?: any;
  promoMetrics?: any;
}

/**
 * Simple line chart renderer using Canvas API
 * For production, use Chart.js, Recharts, or similar library
 */
const LineChart: React.FC<{ data: number[]; labels: string[]; title: string; color?: string }> = ({
  data,
  labels,
  title,
  color = '#3b82f6',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;

    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    if (data.length === 0) return;

    const maxValue = Math.max(...data, 1);
    const minValue = Math.min(...data, 0);
    const range = maxValue - minValue || 1;

    // Draw axes
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw grid lines and labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    // Plot points and lines
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((value, index) => {
      const x = padding + (index / (data.length - 1 || 1)) * graphWidth;
      const y = height - padding - ((value - minValue) / range) * graphHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Plot points
    ctx.fillStyle = color;
    data.forEach((value, index) => {
      const x = padding + (index / (data.length - 1 || 1)) * graphWidth;
      const y = height - padding - ((value - minValue) / range) * graphHeight;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // X-axis labels (every 3rd label to avoid clutter)
    labels.forEach((label, index) => {
      if (index % Math.ceil(labels.length / 5) === 0) {
        const x = padding + (index / (data.length - 1 || 1)) * graphWidth;
        ctx.fillStyle = '#6b7280';
        ctx.fillText(label, x, height - padding + 20);
      }
    });
  }, [data, labels, color]);

  return (
    <div className="chart-container">
      <h3 className="chart-title">{title}</h3>
      <canvas ref={canvasRef} width={400} height={250} className="chart-canvas" />
    </div>
  );
};

/**
 * Bar chart component
 */
const BarChart: React.FC<{ data: Record<string, number>; title: string; color?: string }> = ({
  data,
  title,
  color = '#10b981',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    const entries = Object.entries(data);
    if (entries.length === 0) return;

    const maxValue = Math.max(...entries.map(([, v]) => v), 1);
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;
    const barWidth = graphWidth / entries.length * 0.7;
    const spacing = graphWidth / entries.length;

    // Draw axes
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw bars
    ctx.fillStyle = color;
    entries.forEach(([label, value], index) => {
      const x = padding + index * spacing + (spacing - barWidth) / 2;
      const barHeight = (value / maxValue) * graphHeight;
      const y = height - padding - barHeight;

      ctx.fillRect(x, y, barWidth, barHeight);

      // Draw label
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barWidth / 2, height - padding + 15);

      // Draw value on top of bar
      ctx.fillStyle = '#1f2937';
      ctx.fillText(value.toString(), x + barWidth / 2, y - 5);
    });
  }, [data, color]);

  return (
    <div className="chart-container">
      <h3 className="chart-title">{title}</h3>
      <canvas ref={canvasRef} width={400} height={250} className="chart-canvas" />
    </div>
  );
};

/**
 * Pie chart component
 */
const PieChart: React.FC<{ data: Record<string, number>; title: string }> = ({ data, title }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 40;

    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    const entries = Object.entries(data);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);

    if (total === 0) return;

    const colors = [
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#14b8a6',
      '#f97316',
    ];

    let currentAngle = -Math.PI / 2;

    entries.forEach(([label, value], index) => {
      const sliceAngle = (value / total) * Math.PI * 2;

      // Draw slice
      ctx.fillStyle = colors[index % colors.length];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.lineTo(centerX, centerY);
      ctx.fill();

      // Draw label
      const labelAngle = currentAngle + sliceAngle / 2;
      const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
      const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

      ctx.fillStyle = 'white';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const percentage = ((value / total) * 100).toFixed(0);
      ctx.fillText(`${percentage}%`, labelX, labelY);

      currentAngle += sliceAngle;
    });

    // Draw legend
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    const legendY = Math.min(height - 120, centerY + radius + 20);

    entries.forEach(([label, value], index) => {
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(10, legendY + index * 18, 12, 12);
      ctx.fillStyle = '#374151';
      ctx.fillText(`${label}: ${value}`, 28, legendY + index * 18 + 9);
    });
  }, [data]);

  return (
    <div className="chart-container">
      <h3 className="chart-title">{title}</h3>
      <canvas ref={canvasRef} width={400} height={350} className="chart-canvas" />
    </div>
  );
};

/**
 * MetricsCharts Component - Display charts for metrics data
 */
export const MetricsCharts: React.FC<MetricsChartsProps> = ({
  bookingMetrics,
  noShowMetrics,
  revenueMetrics,
  turnoverMetrics,
  promoMetrics,
}) => {
  return (
    <div className="metrics-charts">
      <h2 className="charts-section-title">Visual Analytics</h2>

      <div className="charts-grid">
        {/* Booking Trend Line Chart */}
        {bookingMetrics?.peakTimes && (
          <LineChart
            data={bookingMetrics.peakTimes.map((t: any) => t.bookings)}
            labels={bookingMetrics.peakTimes.map((t: any) => `${t.hour}:00`)}
            title="Peak Booking Times"
            color="#3b82f6"
          />
        )}

        {/* Booking By Type Bar Chart */}
        {bookingMetrics?.bookingsByType && (
          <BarChart
            data={bookingMetrics.bookingsByType}
            title="Bookings by Type"
            color="#10b981"
          />
        )}

        {/* Booking By Time Window Pie Chart */}
        {bookingMetrics?.bookingsByTimeWindow && (
          <PieChart
            data={bookingMetrics.bookingsByTimeWindow}
            title="Bookings by Time Window"
          />
        )}

        {/* Turnover Trend */}
        {turnoverMetrics?.turnoverTrend && (
          <LineChart
            data={turnoverMetrics.turnoverTrend.map((t: any) => t.turnover)}
            labels={turnoverMetrics.turnoverTrend.map((t: any) => `${t.hour}:00`)}
            title="Table Turnover by Hour"
            color="#f59e0b"
          />
        )}

        {/* Turnover by Section */}
        {turnoverMetrics?.turnoverBySection && (
          <BarChart
            data={turnoverMetrics.turnoverBySection}
            title="Turnover by Section"
            color="#f59e0b"
          />
        )}

        {/* Revenue by Booking Type */}
        {revenueMetrics?.revenueByBookingType && (
          <BarChart
            data={revenueMetrics.revenueByBookingType}
            title="Revenue by Booking Type"
            color="#8b5cf6"
          />
        )}

        {/* Promo Performance Pie */}
        {promoMetrics?.roiByPromo && promoMetrics.roiByPromo.length > 0 && (
          <PieChart
            data={Object.fromEntries(
              promoMetrics.roiByPromo
                .slice(0, 6)
                .map((p: any) => [p.promoCode, Math.round(p.roi)])
            )}
            title="Promo Code ROI Distribution"
          />
        )}

        {/* No-Show Rate by Time Window */}
        {noShowMetrics?.noShowsByTimeWindow && (
          <BarChart
            data={noShowMetrics.noShowsByTimeWindow}
            title="No-Shows by Time Window"
            color="#dc2626"
          />
        )}
      </div>
    </div>
  );
};

export default MetricsCharts;
