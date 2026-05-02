import './MaintenancePage.css';

export default function MaintenancePage() {
  return (
    <div className="maintenance-page">
      <div className="maintenance-container">
        <div className="maintenance-icon">🔧</div>
        <h1>Under Maintenance</h1>
        <p className="maintenance-message">
          The admin dashboard is currently under maintenance while the restaurant setup is being completed.
        </p>
        <p className="maintenance-subtitle">
          Please check back shortly.
        </p>
      </div>
    </div>
  );
}
