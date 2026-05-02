/**
 * Floor Plan Component
 *
 * Displays a visual representation of all tables in the restaurant.
 * Each table shows:
 * - Name, capacity, status badge
 * - Decoration indicator
 * - Color-coded status (green=available, yellow=locked, blue=reserved, red=occupied)
 * - "Clear Table" button (for occupied tables)
 *
 * Features:
 * - Real-time updates via WebSocket
 * - Section filtering
 * - Responsive layout (mobile/tablet)
 * - Click to view table details
 * - Loading and error states
 *
 * Requirements: 3.4
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getAllActiveTables } from '../api';
import { useTableStatus } from '../hooks/useTableStatus';
import TableCard, { STATUS_CONFIG } from './TableCard';
import type { Table } from '../types';
import './FloorPlan.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FloorPlanProps {
  branchId: string;
  onTableSelect?: (table: Table) => void;
  onClearTable?: (tableId: string) => Promise<void>;
  onTableDetails?: (tableId: string) => void;
  onWalkIn?: (tableId: string) => Promise<void>;
  /** Optional trigger to force a silent refresh from parent */
  refreshTrigger?: number;
}

interface TableWithStatus extends Table {
  status: 'available' | 'locked' | 'reserved' | 'occupied';
  colour: string;
  lastUpdated: string;
}

// ─── Status Configuration ──────────────────────────────────────────────────────

// Re-exported from TableCard for use in legend rendering
export { STATUS_CONFIG };

// ─── Component ─────────────────────────────────────────────────────────────────

export default function FloorPlan({
  branchId,
  onTableSelect,
  onClearTable,
  onTableDetails,
  onWalkIn,
  refreshTrigger = 0,
}: FloorPlanProps) {
  const [allTables, setAllTables] = useState<Table[]>([]);
  const [filteredSection, setFilteredSection] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearingTableId, setClearingTableId] = useState<string | null>(null);
  const [walkingInTableId, setWalkingInTableId] = useState<string | null>(null);
  const { tables: tableStatuses, isConnected, error: wsError } = useTableStatus(branchId);
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>([]);

  // ── Load Tables Data ────────────────────────────────────────────────────────

  const loadTables = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const fetchedTables = await getAllActiveTables(branchId);
      setAllTables(fetchedTables);

      // Extract unique sections
      const uniqueSections = Array.from(
        new Map(fetchedTables.map((t) => [t.section_id, t.section_name ?? t.section_id])).entries()
      ).map(([id, name]) => ({ id, name: name as string }));
      setSections(uniqueSections);
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to load tables');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // Silent refresh when WebSocket reports a change OR parent triggers it
  useEffect(() => {
    if (tableStatuses.size > 0 || refreshTrigger > 0) {
      loadTables(true);
    }
  }, [tableStatuses, loadTables, refreshTrigger]);

  // ── Merge Table Data with Status ────────────────────────────────────────────

  const tablesWithStatus: TableWithStatus[] = allTables.map((table) => {
    // WebSocket status takes priority over initial REST API status
    const statusData = tableStatuses.get(table.id);
    const resolvedStatus: TableWithStatus['status'] =
      statusData?.status ?? table.status ?? 'available';
    const resolvedConfig = STATUS_CONFIG[resolvedStatus];
    return {
      ...table,
      status: resolvedStatus,
      colour: statusData?.colour ?? resolvedConfig.borderColor,
      lastUpdated: statusData?.lastUpdated ?? new Date().toISOString(),
    };
  });

  // ── Filter Tables by Section ────────────────────────────────────────────────

  const filteredTables =
    filteredSection === 'all'
      ? tablesWithStatus
      : tablesWithStatus.filter((t) => t.section_id === filteredSection);

  // Group tables by section (preserving section order from sections array)
  const tablesBySection: Array<{ section: { id: string; name: string }; tables: TableWithStatus[] }> =
    sections
      .map((section) => ({
        section,
        tables: filteredTables.filter((t) => t.section_id === section.id),
      }))
      .filter((group) => group.tables.length > 0);

  // ── Handle Clear Table ──────────────────────────────────────────────────────

  const handleClearTable = async (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();

    if (!onClearTable) return;

    setClearingTableId(tableId);
    try {
      await onClearTable(tableId);
    } catch (err: any) {
      setError(err.message || 'Failed to clear table');
    } finally {
      setClearingTableId(null);
    }
  };

  // ── Handle Walk-In ─────────────────────────────────────────────────────────

  const handleWalkIn = async (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();

    if (!onWalkIn) return;

    setWalkingInTableId(tableId);
    try {
      await onWalkIn(tableId);
    } catch (err: any) {
      setError(err.message || 'Failed to create walk-in');
    } finally {
      setWalkingInTableId(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="floor-plan floor-plan--loading">Loading tables...</div>;
  }

  return (
    <div className="floor-plan">
      {/* Header with WebSocket Status */}
      <div className="floor-plan-header">
        <div>
          <h2>Floor Plan</h2>
          <p className="floor-plan-subtitle">
            {filteredTables.length} table{filteredTables.length !== 1 ? 's' : ''} in
            {filteredSection === 'all' ? ' all sections' : ` ${sections.find((s) => s.id === filteredSection)?.name || 'section'}`}
          </p>        </div>
        <div className="floor-plan-status">
          <div className={`ws-indicator ${isConnected ? 'ws-indicator--connected' : 'ws-indicator--disconnected'}`}>
            <span className="ws-dot" />
            {isConnected ? 'Live' : 'Offline'}
          </div>
        </div>
      </div>

      {/* Section Filter */}
      <div className="floor-plan-filters">
        <div className="filter-group">
          <label>Section</label>
          <div className="filter-pills">
            <button
              className={`pill ${filteredSection === 'all' ? 'pill--active' : ''}`}
              onClick={() => setFilteredSection('all')}
            >
              All
            </button>
            {sections.map((section) => (
              <button
                key={section.id}
                className={`pill ${filteredSection === section.id ? 'pill--active' : ''}`}
                onClick={() => setFilteredSection(section.id)}
              >
                {section.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status Legend */}
      <div className="floor-plan-legend">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <div key={status} className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: config.borderColor }} />
            <span className="legend-label">{config.label}</span>
          </div>
        ))}
      </div>

      {/* Error Messages */}
      {error && (
        <div className="floor-plan-error">
          <span>⚠ {error}</span>
          <button onClick={loadTables}>Retry</button>
        </div>
      )}
      {wsError && (
        <div className="floor-plan-warning">
          <span>⚠ WebSocket connection issue - using cached data. {wsError}</span>
        </div>
      )}

      {/* Empty State */}
      {filteredTables.length === 0 && (
        <div className="floor-plan-empty">
          <p>No tables available for this section.</p>
        </div>
      )}

      {/* Table Grid — grouped by section */}
      {tablesBySection.length === 0 ? null : (
        <div className="floor-plan-sections">
          {tablesBySection.map(({ section, tables: sectionTables }) => (
            <div key={section.id} className="floor-plan-section-block">
              <div className="floor-plan-section-header">
                <h3 className="floor-plan-section-name">{section.name}</h3>
                <span className="floor-plan-section-count">
                  {sectionTables.length} table{sectionTables.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="floor-plan-grid">
                {sectionTables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    onClick={() => onTableSelect?.(table)}
                    onClear={onClearTable ? handleClearTable : undefined}
                    isClearing={clearingTableId === table.id}
                    onWalkIn={onWalkIn ? handleWalkIn : undefined}
                    isWalkingIn={walkingInTableId === table.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
