import { useState, useEffect } from 'react';
import './AdminSettingsCategory.css';

interface StaffAccount {
  id?: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'waiter';
  is_active: boolean;
}

interface CreateStaffForm {
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'waiter';
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

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'var(--accent-subtle)', text: 'var(--accent)' },
  manager: { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' },
  waiter: { bg: 'rgba(34, 197, 94, 0.15)', text: '#4ade80' },
};

export default function AdminSettingsStaffAccounts() {
  const branchId = localStorage.getItem('branch_id') ?? '';
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creatingStaff, setCreatingStaff] = useState(false);

  const [createForm, setCreateForm] = useState<CreateStaffForm>({
    name: '',
    email: '',
    role: 'waiter',
  });

  useEffect(() => {
    if (!branchId) return;
    loadStaff();
  }, [branchId]);

  const loadStaff = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/staff`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      setStaff(data.staff || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.email.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setCreatingStaff(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`${BASE}/admin/v1/branches/${branchId}/staff`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          role: createForm.role,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      setSuccess(true);
      setCreateForm({ name: '', email: '', role: 'waiter' });
      setShowCreateForm(false);
      await loadStaff();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff');
    } finally {
      setCreatingStaff(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-category">
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="settings-category">
      <div className="category-header">
        <h2>Staff Accounts</h2>
        <p>Manage admin and staff accounts for this branch</p>
      </div>

      <div className="category-content">
        {error && <div className="alert alert-error">{error}</div>}
        {success && (
          <div className="alert alert-success">Staff account created successfully</div>
        )}

        <div className="form-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Active Staff</h3>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateForm(!showCreateForm)}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              {showCreateForm ? '✕ Cancel' : '+ Add Staff Member'}
            </button>
          </div>

          {showCreateForm && (
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <form onSubmit={handleCreateStaff}>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, name: e.target.value })
                    }
                    placeholder="e.g., John Smith"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, email: e.target.value })
                    }
                    placeholder="e.g., john@sejiwa.my"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Role *</label>
                  <select
                    value={createForm.role}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        role: e.target.value as 'admin' | 'manager' | 'waiter',
                      })
                    }
                  >
                    <option value="waiter">Waiter</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <small>
                    • <strong>Waiter:</strong> Can take orders, mark tables as seated/closed
                  </small>
                  <small style={{ display: 'block' }}>
                    • <strong>Manager:</strong> Waiter + can manage staff, view reports
                  </small>
                  <small style={{ display: 'block' }}>
                    • <strong>Admin:</strong> Full system access (use with caution)
                  </small>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creatingStaff}
                  >
                    {creatingStaff ? 'Creating…' : 'Create Account'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCreateForm(false)}
                    disabled={creatingStaff}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '12px',
                      fontWeight: 600,
                      fontSize: '14px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '12px',
                      fontWeight: 600,
                      fontSize: '14px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Email
                  </th>
                  <th
                    style={{
                      textAlign: 'center',
                      padding: '12px',
                      fontWeight: 600,
                      fontSize: '14px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Role
                  </th>
                  <th
                    style={{
                      textAlign: 'center',
                      padding: '12px',
                      fontWeight: 600,
                      fontSize: '14px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s, idx) => {
                  const roleColor = ROLE_COLORS[s.role] || ROLE_COLORS.waiter;
                  return (
                    <tr key={s.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{s.name}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{s.email}</td>
                      <td style={{ textAlign: 'center', padding: '12px', fontSize: '14px' }}>
                        <span
                          style={{
                            background: roleColor.bg,
                            color: roleColor.text,
                            padding: '2px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          {s.role}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px', fontSize: '14px' }}>
                        <span
                          style={{
                            background: s.is_active
                              ? 'rgba(34, 197, 94, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                            color: s.is_active ? '#4ade80' : '#f87171',
                            padding: '2px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {staff.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                      }}
                    >
                      No staff found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
