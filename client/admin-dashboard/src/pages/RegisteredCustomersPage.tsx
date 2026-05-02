import { useState, useEffect } from 'react';
import { deleteCustomer } from '../api';
import './ReservationsPage.css';

interface RegisteredCustomer {
  id: string;
  email: string;
  name: string;
  phone: string;
  loyalty_points: number;
  total_reservations: number;
  created_at: string;
}

const BASE = '/api';
function getHeaders(): HeadersInit {
  const token = localStorage.getItem('staff_token');
  const branchId = localStorage.getItem('branch_id');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(branchId ? { 'X-Branch-ID': branchId } : {}),
  };
}

export default function RegisteredCustomersPage() {
  const branchId = localStorage.getItem('branch_id') ?? '';
  const [customers, setCustomers] = useState<RegisteredCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [emailSort, setEmailSort] = useState<'asc' | 'desc'>('asc');
  const [revealedPhones, setRevealedPhones] = useState<Set<string>>(new Set());

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<RegisteredCustomer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId) return;
    loadCustomers();
  }, [branchId]);

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BASE}/admin/v1/branches/${branchId}/customers/registered`,
        { headers: getHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCustomer(branchId, deleteTarget.id);
      setDeleteTarget(null);
      setCustomers((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete customer');
    } finally {
      setDeleting(false);
    }
  };

  const filteredAndSorted = customers
    .filter((c) =>
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const comparison = a.email.localeCompare(b.email);
      return emailSort === 'asc' ? comparison : -comparison;
    });

  const togglePhoneReveal = (customerId: string) => {
    setRevealedPhones((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
      }
      return newSet;
    });
  };

  const maskPhone = (phone: string): string => {
    if (phone.length < 4) return phone;
    return '●●●●' + phone.slice(-4);
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1>Registered Customers</h1>
            <p className="page-subtitle">Manage your registered customer database</p>
          </div>
        </div>
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading customers…
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Registered Customers</h1>
          <p className="page-subtitle">
            {filteredAndSorted.length} customer{filteredAndSorted.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <input
            type="text"
            placeholder="Search by email or name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                <th
                  onClick={() => setEmailSort(emailSort === 'asc' ? 'desc' : 'asc')}
                  style={{
                    textAlign: 'left',
                    padding: '11px 14px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  Email {emailSort === 'asc' ? '↑' : '↓'}
                </th>
                <th style={{ textAlign: 'left', padding: '11px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                  Name
                </th>
                <th style={{ textAlign: 'left', padding: '11px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                  Phone
                </th>
                <th style={{ textAlign: 'center', padding: '11px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                  Reservations
                </th>
                <th style={{ textAlign: 'center', padding: '11px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                  Loyalty Points
                </th>
                <th style={{ textAlign: 'center', padding: '11px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {searchQuery ? 'No customers match your search' : 'No registered customers yet'}
                  </td>
                </tr>
              ) : (
                filteredAndSorted.map((customer) => (
                  <tr key={customer.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                      {customer.email}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                      {customer.name}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>
                        {revealedPhones.has(customer.id) ? customer.phone : maskPhone(customer.phone)}
                      </span>
                      <button
                        onClick={() => togglePhoneReveal(customer.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '0', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}
                        title={revealedPhones.has(customer.id) ? 'Hide phone' : 'Show phone'}
                      >
                        {revealedPhones.has(customer.id) ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {customer.total_reservations}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: '14px' }}>
                      <span style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                        {customer.loyalty_points}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        onClick={() => { setDeleteTarget(customer); setDeleteError(null); }}
                        style={{
                          padding: '5px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid #fca5a5',
                          background: '#fef2f2',
                          color: '#dc2626',
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
          onClick={deleting ? undefined : () => setDeleteTarget(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#1e293b' }}>
              Delete Customer?
            </h3>
            <p style={{ margin: '0 0 6px', fontSize: 14, color: '#475569' }}>
              <strong>{deleteTarget.name}</strong> ({deleteTarget.email})
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#dc2626', background: '#fef2f2', padding: '10px 12px', borderRadius: 8, lineHeight: 1.5 }}>
              This permanently deletes the customer and all their reservation history. This cannot be undone.
            </p>

            {deleteError && (
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#dc2626', background: '#fee2e2', padding: '8px 12px', borderRadius: 6 }}>
                {deleteError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 14, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1, minWidth: 110 }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
