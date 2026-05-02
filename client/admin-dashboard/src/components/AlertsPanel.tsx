import React, { useState, useEffect } from 'react';
import './AlertsPanel.css';

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metric: string;
  threshold: number;
  actual: number;
  timestamp: Date;
  dismissed: boolean;
}

export interface AlertConfig {
  noShowRateThreshold: number; // %
  turnoverRateLow: number; // tables/hour
  turnoverRateHigh: number; // tables/hour
  revenueDeclineThreshold: number; // %
  conversionRateThreshold: number; // %
  averageSessionDurationMax: number; // minutes
}

interface AlertsPanelProps {
  bookingMetrics?: any;
  noShowMetrics?: any;
  revenueMetrics?: any;
  turnoverMetrics?: any;
  promoMetrics?: any;
  onConfigChange?: (config: AlertConfig) => void;
}

const DEFAULT_CONFIG: AlertConfig = {
  noShowRateThreshold: 15,
  turnoverRateLow: 2,
  turnoverRateHigh: 5,
  revenueDeclineThreshold: 10,
  conversionRateThreshold: 5,
  averageSessionDurationMax: 180,
};

/**
 * AlertsPanel Component - Display anomalies and alerts
 */
export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  bookingMetrics,
  noShowMetrics,
  revenueMetrics,
  turnoverMetrics,
  promoMetrics,
  onConfigChange,
}) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [config, setConfig] = useState<AlertConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // Generate alerts based on metrics and configuration
  useEffect(() => {
    const newAlerts: Alert[] = [];
    const now = new Date();
    let alertId = 0;

    // Check no-show rate
    if (noShowMetrics && noShowMetrics.noShowRate > config.noShowRateThreshold) {
      newAlerts.push({
        id: `alert-${alertId++}`,
        severity: 'critical',
        title: 'High No-Show Rate',
        message: `No-show rate is ${noShowMetrics.noShowRate.toFixed(1)}%, exceeding the threshold of ${config.noShowRateThreshold}%.`,
        metric: 'noShowRate',
        threshold: config.noShowRateThreshold,
        actual: noShowMetrics.noShowRate,
        timestamp: now,
        dismissed: false,
      });
    }

    // Check chronic offenders
    if (noShowMetrics?.chronicalOffenders?.length > 0) {
      newAlerts.push({
        id: `alert-${alertId++}`,
        severity: 'warning',
        title: 'Chronic No-Show Offenders',
        message: `${noShowMetrics.chronicalOffenders.length} customer(s) have 3+ no-shows.`,
        metric: 'chronicalOffenders',
        threshold: 3,
        actual: noShowMetrics.chronicalOffenders.length,
        timestamp: now,
        dismissed: false,
      });
    }

    // Check turnover rate (too low)
    if (turnoverMetrics && turnoverMetrics.tablesPerHour < config.turnoverRateLow) {
      newAlerts.push({
        id: `alert-${alertId++}`,
        severity: 'warning',
        title: 'Low Turnover Rate',
        message: `Table turnover is ${turnoverMetrics.tablesPerHour.toFixed(2)} tables/hour, below threshold of ${config.turnoverRateLow}.`,
        metric: 'turnoverRate',
        threshold: config.turnoverRateLow,
        actual: turnoverMetrics.tablesPerHour,
        timestamp: now,
        dismissed: false,
      });
    }

    // Check turnover rate (too high - potential operational stress)
    if (turnoverMetrics && turnoverMetrics.tablesPerHour > config.turnoverRateHigh) {
      newAlerts.push({
        id: `alert-${alertId++}`,
        severity: 'info',
        title: 'High Turnover Rate',
        message: `Table turnover is ${turnoverMetrics.tablesPerHour.toFixed(2)} tables/hour, exceeding typical threshold of ${config.turnoverRateHigh}.`,
        metric: 'turnoverRate',
        threshold: config.turnoverRateHigh,
        actual: turnoverMetrics.tablesPerHour,
        timestamp: now,
        dismissed: false,
      });
    }

    // Check session duration
    if (turnoverMetrics && turnoverMetrics.sessionDurationAverage > config.averageSessionDurationMax) {
      newAlerts.push({
        id: `alert-${alertId++}`,
        severity: 'info',
        title: 'Extended Session Duration',
        message: `Avg session duration is ${turnoverMetrics.sessionDurationAverage.toFixed(0)} minutes, above target of ${config.averageSessionDurationMax} minutes.`,
        metric: 'sessionDuration',
        threshold: config.averageSessionDurationMax,
        actual: turnoverMetrics.sessionDurationAverage,
        timestamp: now,
        dismissed: false,
      });
    }

    // Check revenue decline
    if (revenueMetrics && revenueMetrics.revenueGrowthRate < -config.revenueDeclineThreshold) {
      newAlerts.push({
        id: `alert-${alertId++}`,
        severity: 'critical',
        title: 'Revenue Decline',
        message: `Revenue declined by ${Math.abs(revenueMetrics.revenueGrowthRate).toFixed(1)}%, exceeding decline threshold of ${config.revenueDeclineThreshold}%.`,
        metric: 'revenue',
        threshold: -config.revenueDeclineThreshold,
        actual: revenueMetrics.revenueGrowthRate,
        timestamp: now,
        dismissed: false,
      });
    }

    // Check promo conversion rate
    if (promoMetrics && promoMetrics.conversionRate < config.conversionRateThreshold) {
      newAlerts.push({
        id: `alert-${alertId++}`,
        severity: 'warning',
        title: 'Low Promo Conversion',
        message: `Promo conversion rate is ${promoMetrics.conversionRate.toFixed(1)}%, below threshold of ${config.conversionRateThreshold}%.`,
        metric: 'promoConversion',
        threshold: config.conversionRateThreshold,
        actual: promoMetrics.conversionRate,
        timestamp: now,
        dismissed: false,
      });
    }

    // Check low bookings (info level)
    if (bookingMetrics && bookingMetrics.totalBookings === 0) {
      newAlerts.push({
        id: `alert-${alertId++}`,
        severity: 'info',
        title: 'No Bookings in Period',
        message: 'There are no bookings recorded for the selected date range.',
        metric: 'bookings',
        threshold: 1,
        actual: 0,
        timestamp: now,
        dismissed: false,
      });
    }

    // Filter out dismissed alerts
    const filteredAlerts = newAlerts.filter(a => !dismissedAlerts.has(a.id));
    setAlerts(filteredAlerts);
  }, [bookingMetrics, noShowMetrics, revenueMetrics, turnoverMetrics, promoMetrics, config, dismissedAlerts]);

  const handleDismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => new Set(prev).add(alertId));
  };

  const handleConfigUpdate = (field: keyof AlertConfig, value: number) => {
    const updatedConfig = { ...config, [field]: value };
    setConfig(updatedConfig);
    if (onConfigChange) {
      onConfigChange(updatedConfig);
    }
  };

  const getAlertIcon = (severity: Alert['severity']): string => {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📌';
    }
  };

  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');
  const infoAlerts = alerts.filter(a => a.severity === 'info');

  return (
    <div className="alerts-panel">
      <div className="alerts-header">
        <h2 className="alerts-title">Alerts & Anomalies</h2>
        <button
          className="config-btn"
          onClick={() => setShowConfig(!showConfig)}
          title="Configure alert thresholds"
        >
          ⚙️ Settings
        </button>
      </div>

      {/* Alert Configuration */}
      {showConfig && (
        <div className="alert-config">
          <div className="config-item">
            <label>No-Show Rate Threshold (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={config.noShowRateThreshold}
              onChange={e => handleConfigUpdate('noShowRateThreshold', parseFloat(e.target.value))}
              className="config-input"
            />
          </div>

          <div className="config-item">
            <label>Min Turnover Rate (tables/hour)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.turnoverRateLow}
              onChange={e => handleConfigUpdate('turnoverRateLow', parseFloat(e.target.value))}
              className="config-input"
            />
          </div>

          <div className="config-item">
            <label>Max Turnover Rate (tables/hour)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.turnoverRateHigh}
              onChange={e => handleConfigUpdate('turnoverRateHigh', parseFloat(e.target.value))}
              className="config-input"
            />
          </div>

          <div className="config-item">
            <label>Revenue Decline Threshold (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={config.revenueDeclineThreshold}
              onChange={e => handleConfigUpdate('revenueDeclineThreshold', parseFloat(e.target.value))}
              className="config-input"
            />
          </div>

          <div className="config-item">
            <label>Min Promo Conversion Rate (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={config.conversionRateThreshold}
              onChange={e => handleConfigUpdate('conversionRateThreshold', parseFloat(e.target.value))}
              className="config-input"
            />
          </div>

          <div className="config-item">
            <label>Max Session Duration (minutes)</label>
            <input
              type="number"
              min="0"
              value={config.averageSessionDurationMax}
              onChange={e => handleConfigUpdate('averageSessionDurationMax', parseFloat(e.target.value))}
              className="config-input"
            />
          </div>
        </div>
      )}

      {/* Alert Summary */}
      <div className="alert-summary">
        <div className="summary-item summary-critical">
          <span className="summary-label">Critical</span>
          <span className="summary-count">{criticalAlerts.length}</span>
        </div>
        <div className="summary-item summary-warning">
          <span className="summary-label">Warnings</span>
          <span className="summary-count">{warningAlerts.length}</span>
        </div>
        <div className="summary-item summary-info">
          <span className="summary-label">Info</span>
          <span className="summary-count">{infoAlerts.length}</span>
        </div>
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="no-alerts">
          <p>✅ All metrics are within normal ranges</p>
        </div>
      ) : (
        <div className="alerts-list">
          {/* Critical Alerts */}
          {criticalAlerts.map(alert => (
            <div key={alert.id} className={`alert alert--${alert.severity}`}>
              <div className="alert-icon">{getAlertIcon(alert.severity)}</div>
              <div className="alert-content">
                <h3 className="alert-title">{alert.title}</h3>
                <p className="alert-message">{alert.message}</p>
                <p className="alert-time">
                  {alert.timestamp.toLocaleTimeString()}
                </p>
              </div>
              <button
                className="alert-dismiss"
                onClick={() => handleDismissAlert(alert.id)}
                title="Dismiss alert"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Warning Alerts */}
          {warningAlerts.map(alert => (
            <div key={alert.id} className={`alert alert--${alert.severity}`}>
              <div className="alert-icon">{getAlertIcon(alert.severity)}</div>
              <div className="alert-content">
                <h3 className="alert-title">{alert.title}</h3>
                <p className="alert-message">{alert.message}</p>
                <p className="alert-time">
                  {alert.timestamp.toLocaleTimeString()}
                </p>
              </div>
              <button
                className="alert-dismiss"
                onClick={() => handleDismissAlert(alert.id)}
                title="Dismiss alert"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Info Alerts */}
          {infoAlerts.map(alert => (
            <div key={alert.id} className={`alert alert--${alert.severity}`}>
              <div className="alert-icon">{getAlertIcon(alert.severity)}</div>
              <div className="alert-content">
                <h3 className="alert-title">{alert.title}</h3>
                <p className="alert-message">{alert.message}</p>
                <p className="alert-time">
                  {alert.timestamp.toLocaleTimeString()}
                </p>
              </div>
              <button
                className="alert-dismiss"
                onClick={() => handleDismissAlert(alert.id)}
                title="Dismiss alert"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;
