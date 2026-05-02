import './MenuDialog.css';

interface MenuDialogProps {
  isOpen: boolean;
  onClose: () => void;
  branchName?: string;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export default function MenuDialog({ isOpen, onClose, branchName = 'Sejiwa Titiwangsa', currentPage, onPageChange }: MenuDialogProps) {
  const totalPages = 31;

  if (!isOpen) return null;

  const handlePrevPage = () => {
    onPageChange(Math.max(1, currentPage - 1));
  };

  const handleNextPage = () => {
    onPageChange(Math.min(totalPages, currentPage + 1));
  };

  return (
    <div className="menu-dialog-backdrop" onClick={onClose}>
      <div className="menu-dialog-card" onClick={e => e.stopPropagation()}>
        {/* Top Bar - Thin with close button only */}
        <div className="menu-dialog-header">
          <button className="menu-dialog-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Menu Image - Fixed height, no scroll */}
        <div className="menu-dialog-content">
          <img
            src={`/menu_pages/page_${String(currentPage).padStart(2, '0')}.png`}
            alt={`Menu Page ${currentPage}`}
            className="menu-dialog-image"
          />
        </div>

        {/* Bottom Bar - Navigation */}
        <div className="menu-dialog-footer">
          <button
            className="menu-nav-btn"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
          >
            ← Previous
          </button>

          <span className="menu-page-info">Page {currentPage}</span>

          <button
            className="menu-nav-btn"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
