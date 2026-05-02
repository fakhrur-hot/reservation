import '../pages/ComingSoonPage.css';

interface SetupRequiredPageProps {
  branchName?: string;
}

export default function SetupRequiredPage({ branchName = 'Restaurant' }: SetupRequiredPageProps) {
  return (
    <div className="coming-soon-page">
      <div className="coming-soon-container">
        <div className="coming-soon-icon">🍽️</div>
        <h1>Coming Soon</h1>
        <p className="coming-soon-message">
          {branchName} will be back soon.
        </p>
        <p className="coming-soon-subtitle">
          We're setting things up to serve you better. Please check back later.
        </p>
      </div>
    </div>
  );
}
