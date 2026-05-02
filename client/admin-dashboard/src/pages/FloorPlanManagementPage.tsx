import React, { useState, useEffect, useCallback } from 'react';
import FloorPlanPage from './FloorPlanPage';
import TableSetupPage from './TableSetupPage';
import { getAllTables } from '../api';
import type { Table } from '../types';
import './FloorPlanManagementPage.css';

function getBranchId() {
  return localStorage.getItem('branch_id') ?? '';
}

export default function FloorPlanManagementPage() {
  const [activeTab, setActiveTab] = useState<'visual' | 'setup'>('visual');
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const branchId = getBranchId();
    if (!branchId) return;
    
    try {
      const data = await getAllTables(branchId);
      setTables(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load table stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const stats = {
    total: tables.filter(t => t.is_active).length,
    available: tables.filter(t => t.status === 'available').length,
    occupied: tables.filter(t => t.status === 'occupied' || t.status === 'reserved').length,
    inactive: tables.filter(t => !t.is_active).length,
    decorated: tables.filter(t => t.has_decoration && (t.status === 'reserved' || t.status === 'occupied')).length,
  };

  return (
    <div className="floor-plan-management">
      {/* ── Global Stats ── */}
      <div className="global-stats-header">
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Active Tables</span>
          </div>
          <div className="stat-card">
            <span className="stat-value stat-green">{stats.available}</span>
            <span className="stat-label">Available Now</span>
          </div>
          <div className="stat-card">
            <span className="stat-value stat-red">{stats.occupied}</span>
            <span className="stat-label">In Use</span>
          </div>
          <div className="stat-card">
            <span className="stat-value stat-purple">{stats.decorated}</span>
            <span className="stat-label">With Decoration</span>
          </div>
          <div className="stat-card">
            <span className="stat-value stat-muted">{stats.inactive}</span>
            <span className="stat-label">Inactive</span>
          </div>
        </div>
      </div>

      {/* ── Tab Selection ── */}
      <div className="floor-plan-tabs">
        <button
          className={`tab-button ${activeTab === 'visual' ? 'active' : ''}`}
          onClick={() => setActiveTab('visual')}
        >
          📍 Visual Floor Plan
        </button>
        <button
          className={`tab-button ${activeTab === 'setup' ? 'active' : ''}`}
          onClick={() => setActiveTab('setup')}
        >
          ⚙️ Table Setup
        </button>
      </div>

      {/* ── Page Content ── */}
      <div className="floor-plan-content">
        {activeTab === 'visual' ? (
          <FloorPlanPage onDataChange={loadStats} />
        ) : (
          <TableSetupPage onDataChange={loadStats} />
        )}
      </div>
    </div>
  );
}
