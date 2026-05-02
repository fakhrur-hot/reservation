import { useState, useEffect } from 'react';
import { getSections, getAllTables, createSection, createTable, updateTable } from '../../api';
import type { Section as APISection, Table as APITable, CreateSectionPayload, CreateTablePayload, UpdateTablePayload } from '../../types';
import './AdminSettingsCategory.css';

function getBranchId() {
  return localStorage.getItem('branch_id') ?? '';
}

interface LocalTable {
  id?: string;
  name: string;
  capacity: number;
  tableType: 'standard' | 'booth' | 'bar' | 'private';
  supportsDecoration: boolean;
  sectionId?: string;
}

interface LocalSection {
  id?: string;
  name: string;
  description?: string;
  type: 'indoor' | 'outdoor';
  sortOrder?: number;
  tables: LocalTable[];
}

export default function AdminSettingsSectionsLayout() {
  const branchId = getBranchId();
  const [sections, setSections] = useState<LocalSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<number | null>(null);
  const [savingTable, setSavingTable] = useState<{ sectionIdx: number; tableIdx: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load sections and tables on mount
  useEffect(() => {
    const load = async () => {
      if (!branchId) return;
      setLoading(true);
      try {
        const [sectionsData, tablesData] = await Promise.all([
          getSections(branchId),
          getAllTables(branchId),
        ]);

        // Group tables by section
        const groupedSections: LocalSection[] = sectionsData.map(section => ({
          id: section.id,
          name: section.name,
          description: section.description,
          type: 'indoor', // API doesn't currently return type, default to indoor
          sortOrder: section.sort_order,
          tables: tablesData
            .filter(t => t.section_id === section.id)
            .map(t => ({
              id: t.id,
              name: t.name,
              capacity: t.capacity,
              tableType: (t.table_type || 'standard') as 'standard' | 'booth' | 'bar' | 'private',
              supportsDecoration: t.supports_decoration || false,
              sectionId: t.section_id,
            })),
        }));

        setSections(groupedSections);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sections and tables');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [branchId]);

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        name: 'New Section',
        type: 'indoor',
        description: '',
        tables: [],
      },
    ]);
  };

  const removeSection = (idx: number) => {
    if (confirm(`Remove section "${sections[idx].name}" and all its tables?`)) {
      setSections((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const updateSection = (idx: number, field: string, value: any) => {
    setSections((prev) =>
      prev.map((sec, i) => (i === idx ? { ...sec, [field]: value } : sec))
    );
  };

  const addTable = (sectionIdx: number) => {
    setSections((prev) =>
      prev.map((sec, i) =>
        i === sectionIdx
            ? {
                ...sec,
                tables: [
                  ...sec.tables,
                  { name: `Table ${sec.tables.length + 1}`, capacity: 4, tableType: 'standard', supportsDecoration: false },
                ],
              }
          : sec
      )
    );
  };

  const removeTable = (sectionIdx: number, tableIdx: number) => {
    setSections((prev) =>
      prev.map((sec, i) =>
        i === sectionIdx
          ? { ...sec, tables: sec.tables.filter((_, ti) => ti !== tableIdx) }
          : sec
      )
    );
  };

  const updateTableField = (sectionIdx: number, tableIdx: number, field: string, value: any) => {
    setSections((prev) =>
      prev.map((sec, i) =>
        i === sectionIdx
          ? {
              ...sec,
              tables: sec.tables.map((tbl, ti) =>
                ti === tableIdx ? { ...tbl, [field]: value } : tbl
              ),
            }
          : sec
      )
    );
  };

  const handleSaveSection = async (sectionIdx: number) => {
    if (!branchId) return;
    const section = sections[sectionIdx];
    
    setSavingSection(sectionIdx);
    setError(null);

    try {
      // Create new section if no ID
      if (!section.id) {
        const payload: CreateSectionPayload = {
          name: section.name,
          description: section.description,
          sort_order: sectionIdx,
        };
        await createSection(branchId, payload);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      
      // Reload data
      const [sectionsData, tablesData] = await Promise.all([
        getSections(branchId),
        getAllTables(branchId),
      ]);
      const groupedSections: LocalSection[] = sectionsData.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        type: 'indoor',
        sortOrder: s.sort_order,
        tables: tablesData
          .filter(t => t.section_id === s.id)
          .map(t => ({
            id: t.id,
            name: t.name,
            capacity: t.capacity,
            tableType: (t.table_type || 'standard') as 'standard' | 'booth' | 'bar' | 'private',
            supportsDecoration: t.supports_decoration || false,
            sectionId: t.section_id,
          })),
      }));
      setSections(groupedSections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save section');
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveTable = async (sectionIdx: number, tableIdx: number) => {
    if (!branchId || !sections[sectionIdx]?.id) {
      setError('Section must be saved first');
      return;
    }

    const section = sections[sectionIdx];
    const table = section.tables[tableIdx];

    setSavingTable({ sectionIdx, tableIdx });
    setError(null);

    try {
      if (!table.id) {
        // Create new table
        const payload: CreateTablePayload = {
          section_id: section.id as string,
          name: table.name,
          capacity: table.capacity,
          table_type: table.tableType,
          supports_decoration: table.supportsDecoration,
        };
        await createTable(branchId, payload);
      } else {
        // Update existing table
        const payload: UpdateTablePayload = {
          name: table.name,
          capacity: table.capacity,
          section_id: section.id as string,
          table_type: table.tableType,
          supports_decoration: table.supportsDecoration,
        };
        await updateTable(branchId, table.id, payload);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);

      // Reload data
      const [sectionsData, tablesData] = await Promise.all([
        getSections(branchId),
        getAllTables(branchId),
      ]);
      const groupedSections: LocalSection[] = sectionsData.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        type: 'indoor',
        sortOrder: s.sort_order,
        tables: tablesData
          .filter(t => t.section_id === s.id)
          .map(t => ({
            id: t.id,
            name: t.name,
            capacity: t.capacity,
            tableType: (t.table_type || 'standard') as 'standard' | 'booth' | 'bar' | 'private',
            supportsDecoration: t.supports_decoration || false,
            sectionId: t.section_id,
          })),
      }));
      setSections(groupedSections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save table');
    } finally {
      setSavingTable(null);
    }
  };

  return (
    <div className="settings-category">
      <div className="category-header">
        <h2>Sections & Tables</h2>
        <p>Manage your dining areas and table layout</p>
      </div>

      <div className="category-content">
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
            Loading sections and tables...
          </div>
        ) : sections.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
            No sections created yet
          </div>
        ) : (
          sections.map((section, sectionIdx) => (
            <div key={section.id || sectionIdx} className="form-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3>{section.name}</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleSaveSection(sectionIdx)}
                    disabled={savingSection === sectionIdx}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      background: '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: savingSection === sectionIdx ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {savingSection === sectionIdx ? 'Saving...' : 'Save Section'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(sectionIdx)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    Remove Section
                  </button>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Section Name *</label>
                  <input
                    type="text"
                    value={section.name}
                    onChange={(e) => updateSection(sectionIdx, 'name', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Type *</label>
                  <select
                    value={section.type}
                    onChange={(e) => updateSection(sectionIdx, 'type', e.target.value)}
                  >
                    <option value="indoor">Indoor</option>
                    <option value="outdoor">Outdoor</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={section.description || ''}
                  onChange={(e) => updateSection(sectionIdx, 'description', e.target.value)}
                  placeholder="e.g., Main dining area"
                />
              </div>

              <div style={{ marginTop: '20px', marginBottom: '16px' }}>
                <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
                  Tables ({section.tables.length})
                </h4>

                {section.tables.length > 0 ? (
                  <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Name</th>
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600 }}>Capacity</th>
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600 }}>Type</th>
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600 }}>Decoration</th>
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.tables.map((table, tableIdx) => (
                          <tr key={table.id || tableIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={table.name}
                                onChange={(e) =>
                                  updateTableField(sectionIdx, tableIdx, 'name', e.target.value)
                                }
                                style={{ width: '100%', padding: '4px' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center', padding: '8px' }}>
                              <input
                                type="number"
                                min="1"
                                value={table.capacity}
                                onChange={(e) =>
                                  updateTableField(sectionIdx, tableIdx, 'capacity', Number(e.target.value))
                                }
                                style={{ width: '60px', padding: '4px' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center', padding: '8px' }}>
                              <select
                                value={table.tableType}
                                onChange={(e) =>
                                  updateTableField(sectionIdx, tableIdx, 'tableType', e.target.value)
                                }
                                style={{ width: '100%', padding: '4px' }}
                              >
                                <option value="standard">Standard</option>
                                <option value="booth">Booth</option>
                                <option value="bar">Bar</option>
                                <option value="private">Private</option>
                              </select>
                            </td>
                            <td style={{ textAlign: 'center', padding: '8px' }}>
                              <input
                                type="checkbox"
                                checked={table.supportsDecoration}
                                onChange={(e) =>
                                  updateTableField(sectionIdx, tableIdx, 'supportsDecoration', e.target.checked)
                                }
                              />
                            </td>
                            <td style={{ textAlign: 'center', padding: '8px' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleSaveTable(sectionIdx, tableIdx)}
                                  disabled={savingTable?.sectionIdx === sectionIdx && savingTable?.tableIdx === tableIdx}
                                  style={{
                                    background: '#10b981',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                  }}
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeTable(sectionIdx, tableIdx)}
                                  style={{
                                    background: '#fee2e2',
                                    color: '#991b1b',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '6px', fontSize: '13px', color: '#64748b' }}>
                    No tables added yet
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => addTable(sectionIdx)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  + Add Table
                </button>
              </div>
            </div>
          ))
        )}

        <button
          type="button"
          onClick={addSection}
          className="btn btn-secondary"
          style={{ marginTop: '16px' }}
        >
          + Add Section
        </button>
      </div>

      <div className="category-footer">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">Changes saved successfully</div>}
      </div>
    </div>
  );
}
