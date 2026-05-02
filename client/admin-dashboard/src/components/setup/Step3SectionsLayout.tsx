import { useState } from 'react';
import { SectionsLayoutData, SectionInput, TableInput } from '../../types/setup.types';

interface Step3SectionsLayoutProps {
  data: SectionsLayoutData;
  onChange: (data: SectionsLayoutData) => void;
  error?: string | null;
}

export default function Step3SectionsLayout({
  data,
  onChange,
  error,
}: Step3SectionsLayoutProps) {
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [editingTableIndex, setEditingTableIndex] = useState<number | null>(null);

  const addSection = () => {
    const newSection: SectionInput = {
      name: '',
      description: '',
      type: 'indoor',
      tables: [],
    };
    onChange({
      sections: [...data.sections, newSection],
    });
    setEditingSectionIndex(data.sections.length);
  };

  const removeSection = (index: number) => {
    if (confirm(`Remove section "${data.sections[index].name}" and all its tables?`)) {
      onChange({
        sections: data.sections.filter((_, i) => i !== index),
      });
    }
  };

  const updateSection = (index: number, updates: Partial<SectionInput>) => {
    const newSections = [...data.sections];
    newSections[index] = { ...newSections[index], ...updates };
    onChange({ sections: newSections });
  };

  const addTable = (sectionIndex: number) => {
    const newTable: TableInput = {
      name: '',
      capacity: 2,
      tableType: 'standard',
    };
    const newSections = [...data.sections];
    newSections[sectionIndex].tables.push(newTable);
    onChange({ sections: newSections });
  };

  const removeTable = (sectionIndex: number, tableIndex: number) => {
    const newSections = [...data.sections];
    newSections[sectionIndex].tables = newSections[sectionIndex].tables.filter(
      (_, i) => i !== tableIndex
    );
    onChange({ sections: newSections });
  };

  const updateTable = (
    sectionIndex: number,
    tableIndex: number,
    updates: Partial<TableInput>
  ) => {
    const newSections = [...data.sections];
    newSections[sectionIndex].tables[tableIndex] = {
      ...newSections[sectionIndex].tables[tableIndex],
      ...updates,
    };
    onChange({ sections: newSections });
  };

  const totalTables = data.sections.reduce((sum, s) => sum + s.tables.length, 0);

  return (
    <div className="setup-step">
      <h2>Dining Sections & Table Layout</h2>
      <p className="step-description">Define your restaurant's sections and tables</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="sections-container">
        {data.sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="section-card">
            <div className="section-header">
              <div className="section-title">
                <strong>{section.name || 'Unnamed Section'}</strong>
                <span className="section-type">{section.type}</span>
              </div>
              <button
                className="btn btn-link"
                onClick={() => removeSection(sectionIndex)}
                style={{ color: '#dc3545' }}
              >
                Remove
              </button>
            </div>

            <div className="section-form">
              <div className="form-group">
                <label>Section Name</label>
                <input
                  type="text"
                  value={section.name}
                  onChange={e => updateSection(sectionIndex, { name: e.target.value })}
                  placeholder="e.g., Indoor Dining"
                />
              </div>

              <div className="form-group">
                <label>Description (Optional)</label>
                <input
                  type="text"
                  value={section.description || ''}
                  onChange={e => updateSection(sectionIndex, { description: e.target.value })}
                  placeholder="e.g., Main dining area with window view"
                />
              </div>

              <div className="form-group">
                <label>Section Type</label>
                <select
                  value={section.type}
                  onChange={e => updateSection(sectionIndex, { type: e.target.value as 'indoor' | 'outdoor' })}
                >
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                </select>
              </div>
            </div>

            <div className="tables-section">
              <h4>Tables ({section.tables.length})</h4>

              {section.tables.map((table, tableIndex) => (
                <div key={tableIndex} className="table-row">
                  <input
                    type="text"
                    value={table.name}
                    onChange={e => updateTable(sectionIndex, tableIndex, { name: e.target.value })}
                    placeholder="Table name/number"
                    className="table-name"
                  />
                  <input
                    type="number"
                    value={table.capacity}
                    onChange={e => updateTable(sectionIndex, tableIndex, { capacity: parseInt(e.target.value) || 1 })}
                    min="1"
                    className="table-capacity"
                    placeholder="Capacity"
                  />
                  <select
                    value={table.tableType}
                    onChange={e => updateTable(sectionIndex, tableIndex, { tableType: e.target.value as any })}
                    className="table-type"
                  >
                    <option value="standard">Standard</option>
                    <option value="booth">Booth</option>
                    <option value="bar">Bar</option>
                    <option value="private">Private</option>
                  </select>
                  <button
                    className="btn btn-link"
                    onClick={() => removeTable(sectionIndex, tableIndex)}
                    style={{ color: '#dc3545', padding: '4px 8px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                className="btn btn-secondary"
                onClick={() => addTable(sectionIndex)}
                style={{ marginTop: '8px', width: '100%' }}
              >
                + Add Table
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-secondary" onClick={addSection} style={{ marginTop: '16px', width: '100%' }}>
        + Add Section
      </button>

      <div className="summary-box" style={{ marginTop: '24px' }}>
        <strong>Summary:</strong> {data.sections.length} section{data.sections.length !== 1 ? 's' : ''} · {totalTables} table{totalTables !== 1 ? 's' : ''} total
      </div>
    </div>
  );
}
