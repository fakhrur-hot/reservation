import { DepositSettingsData } from '../../types/setup.types';

interface Step7DepositSettingsProps {
  data: DepositSettingsData;
  onChange: (data: DepositSettingsData) => void;
  error?: string | null;
}

export default function Step7DepositSettings({
  data,
  onChange,
  error,
}: Step7DepositSettingsProps) {
  return (
    <div className="setup-step">
      <h2>Booking Deposit Settings</h2>
      <p className="step-description">Configure deposit requirements and refund policies</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-group">
        <label>
          Deposit Amount <span className="required">*</span>
        </label>
        <div className="input-with-currency">
          <input
            type="number"
            value={data.depositAmount}
            onChange={e => onChange({ ...data, depositAmount: parseFloat(e.target.value) || 0 })}
            min="0"
            step="0.01"
            placeholder="e.g., 50.00"
          />
          <span className="currency">MYR</span>
        </div>
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={data.depositRequired}
            onChange={e => onChange({ ...data, depositRequired: e.target.checked })}
          />
          <span>Deposit is required for all reservations</span>
        </label>
      </div>

      <div className="refund-tiers" style={{ marginTop: '30px' }}>
        <h4>Refund Policy Tiers</h4>
        <p className="tier-description">Set refund percentages based on cancellation timing</p>

        <div className="tier-card">
          <div className="tier-label">Tier 1: More than 72 hours before reservation</div>
          <div className="form-group">
            <input
              type="number"
              value={data.refundTier1Percent}
              onChange={e => onChange({ ...data, refundTier1Percent: parseInt(e.target.value) || 0 })}
              min="0"
              max="100"
              placeholder="0-100"
            />
            <span className="percent-sign">%</span>
          </div>
        </div>

        <div className="tier-card">
          <div className="tier-label">Tier 2: 24-72 hours before reservation</div>
          <div className="form-group">
            <input
              type="number"
              value={data.refundTier2Percent}
              onChange={e => onChange({ ...data, refundTier2Percent: parseInt(e.target.value) || 0 })}
              min="0"
              max="100"
              placeholder="0-100"
            />
            <span className="percent-sign">%</span>
          </div>
        </div>

        <div className="tier-card">
          <div className="tier-label">Tier 3: Less than 24 hours before reservation</div>
          <div className="form-group">
            <input
              type="number"
              value={data.refundTier3Percent}
              onChange={e => onChange({ ...data, refundTier3Percent: parseInt(e.target.value) || 0 })}
              min="0"
              max="100"
              placeholder="0-100"
            />
            <span className="percent-sign">%</span>
          </div>
        </div>
      </div>

      <div className="info-box" style={{ marginTop: '24px' }}>
        <strong>Example:</strong> If deposit is RM 50 and a guest cancels 48 hours before:
        <ul>
          <li>Tier 2 applies (24-72 hours)</li>
          <li>Refund = RM 50 × 50% = RM 25</li>
          <li>Restaurant keeps = RM 25</li>
        </ul>
      </div>
    </div>
  );
}
