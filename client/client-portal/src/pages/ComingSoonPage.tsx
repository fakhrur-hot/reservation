import './ComingSoonPage.css';

interface ComingSoonPageProps {
  branchName?: string;
}

export default function ComingSoonPage({ branchName = 'Restaurant' }: ComingSoonPageProps) {
  return (
    <div className="coming-soon-page">
      <div className="coming-soon-container">
        <div className="coming-soon-icon">🍽️</div>
        <h1>Under Maintenance</h1>
        <p className="coming-soon-message">
          This {branchName} is to be open soon.
        </p>
        <p className="coming-soon-subtitle">
          Please check back later to make your reservation.
        </p>
      </div>
    </div>
  );
}
