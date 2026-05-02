/**
 * FloorPlanPage.tsx
 *
 * Page wrapper for the FloorPlan component.
 * Provides branchId from localStorage and wires up table action handlers.
 *
 * Requirements: 3.4, 8.1–8.6
 */

import { useState } from 'react';
import FloorPlan from '../components/FloorPlan';
import TableDetailModal from '../components/TableDetailModal';
import { clearTable, createWalkIn } from '../api';
import type { Table } from '../types';

export default function FloorPlanPage({ onDataChange }: { onDataChange?: () => void }) {
  const branchId = localStorage.getItem('branch_id') ?? '';
  const staffId = localStorage.getItem('staff_id') ?? '';

  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  // Walk-In dialog state
  const [walkInTableId, setWalkInTableId] = useState<string | null>(null);
  const [walkInPartySize, setWalkInPartySize] = useState(2);
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);

  // ── Clear Table Handler ─────────────────────────────────────────────────────

  const handleClearTable = async (tableId: string) => {
    setError(null);
    try {
      await clearTable(branchId, tableId);
      // Force local refresh
      setRefreshCount(prev => prev + 1);
      // Notify parent to refresh stats
      onDataChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to clear table');
    }
  };

  // ── Walk-In Handler ─────────────────────────────────────────────────────────

  const handleWalkIn = async (tableId: string): Promise<void> => {
    setWalkInTableId(tableId);
    setWalkInPartySize(2);
    setWalkInError(null);
  };

  const handleWalkInConfirm = async () => {
    if (!walkInTableId) return;
    setWalkInSaving(true);
    setWalkInError(null);
    try {
      await createWalkIn(branchId, { table_id: walkInTableId, party_size: walkInPartySize });
      // Force local refresh
      setRefreshCount(prev => prev + 1);
      setWalkInTableId(null);
      onDataChange?.();
    } catch (err: any) {
      setWalkInError(err.message || 'Failed to create walk-in');
    } finally {
      setWalkInSaving(false);
    }
  };

  // ── Table Details Handler ───────────────────────────────────────────────────

  const handleTableDetails = (tableId: string) => {
    // No-op: detail view is handled by the modal opened via onTableSelect
    // This callback is available for future drill-down navigation
    console.log('[FloorPlanPage] Table details requested:', tableId);
  };

  // ── Table Select Handler ────────────────────────────────────────────────────

  const handleTableSelect = (table: Table) => {
    setSelectedTable(table);
  };

  if (!branchId) {
    return (
      <div style={{ padding: 24, color: '#dc2626' }}>
        Branch not configured. Please log in again.
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{
          margin: '16px 24px 0',
          padding: '12px 16px',
          background: '#fee2e2',
          borderLeft: '4px solid #ef4444',
          borderRadius: 4,
          fontSize: 13,
          color: '#dc2626',
        }}>
          ⚠ {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}
          >
            ✕
          </button>
        </div>
      )}

      <FloorPlan
        branchId={branchId}
        onTableSelect={handleTableSelect}
        onClearTable={handleClearTable}
        onTableDetails={handleTableDetails}
        onWalkIn={handleWalkIn}
        refreshTrigger={refreshCount}
      />

      {/* Table Detail Modal */}
      {selectedTable && (
        <TableDetailModal
          table={selectedTable}
          branchId={branchId}
          staffId={staffId}
          onClose={() => setSelectedTable(null)}
          onTableStatusChanged={() => {
            setSelectedTable(null);
            setRefreshCount(prev => prev + 1);
            onDataChange?.();
          }}
        />
      )}

      {/* Walk-In Dialog */}
      {walkInTableId && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={walkInSaving ? undefined : () => setWalkInTableId(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, padding: 28, width: 340,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#1e293b' }}>
              New Walk-In
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
              Table will be marked as occupied immediately.
            </p>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Party Size
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={walkInPartySize}
              onChange={(e) => setWalkInPartySize(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={walkInSaving}
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', fontSize: 15,
                border: '1px solid #d1d5db', borderRadius: 8,
                boxSizing: 'border-box', outline: 'none',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleWalkInConfirm()}
            />

            {walkInError && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>
                {walkInError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setWalkInTableId(null)}
                disabled={walkInSaving}
                style={{
                  padding: '9px 18px', borderRadius: 8,
                  border: '1px solid #e2e8f0', background: '#fff',
                  color: '#475569', fontSize: 14, fontWeight: 600,
                  cursor: walkInSaving ? 'not-allowed' : 'pointer',
                  opacity: walkInSaving ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleWalkInConfirm}
                disabled={walkInSaving}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none',
                  background: '#10b981', color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: walkInSaving ? 'not-allowed' : 'pointer',
                  opacity: walkInSaving ? 0.6 : 1,
                  minWidth: 100,
                }}
              >
                {walkInSaving ? 'Creating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
