import React, { useState, useEffect, useCallback } from 'react';
import { 
  getMenuSections, 
  createMenuSection, 
  updateMenuSection, 
  deleteMenuSection, 
  createMenuItem, 
  updateMenuItem, 
  deleteMenuItem,
  initializeDefaultMenu
} from '../api';
import { MenuSection, MenuItem } from '../types';
import './MenuPage.css';

// Stunning color palette for menu items if no image is provided
const FALLBACK_COLORS = [
  'linear-gradient(135deg, #FF6B6B 0%, #EE5253 100%)',
  'linear-gradient(135deg, #4834D4 0%, #686DE0 100%)',
  'linear-gradient(135deg, #6AB04C 0%, #BADC58 100%)',
  'linear-gradient(135deg, #F0932B 0%, #FFBE76 100%)',
  'linear-gradient(135deg, #E056FD 0%, #BE2EDD 100%)',
];

export default function MenuPage() {
  const [sections, setSections] = useState<MenuSection[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionType, setNewSectionType] = useState('standard');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [modalInput, setModalInput] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [editTag, setEditTag] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [uploadingItem, setUploadingItem] = useState<MenuItem | null>(null);
  
  // Custom Confirmation Modal State
  const [modal, setModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    requireText?: string;
    showInput?: boolean;
    inputPlaceholder?: string;
    onInputChange?: (val: string) => void;
    inputValue?: string;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const closeModal = () => {
    setModal(prev => ({ ...prev, show: false }));
    setModalInput('');
  };

  const branchId = localStorage.getItem('branch_id') || '';
  const staffRole = localStorage.getItem('staff_role');

  useEffect(() => {
    setIsAdmin(staffRole === 'admin' || staffRole === 'superadmin');
  }, [staffRole]);

  const loadMenu = useCallback(async () => {
    if (!branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let data = await getMenuSections(branchId);
      setSections(data);
      
      setActiveTab(prev => {
        if (data.length > 0 && (!prev || prev === '')) {
          return data[0].id;
        }
        return prev;
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim()) return;
    try {
      await createMenuSection(branchId, { 
        name: newSectionName, 
        sort_order: sections.length,
        section_type: newSectionType
      });
      setNewSectionName('');
      setNewSectionType('standard');
      setIsAddingSection(false);
      loadMenu();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateSection = (sectionId: string, currentName: string) => {
    let newName = currentName;
    setModal({
      show: true,
      title: 'Rename Category',
      message: 'Enter the new name for this category:',
      showInput: true,
      inputValue: currentName,
      inputPlaceholder: 'Category name...',
      onInputChange: (val) => { newName = val; },
      onConfirm: async () => {
        // We'll use the tracked state or local ref
        const finalName = newName || currentName;
        if (!finalName.trim()) {
          closeModal();
          return;
        }
        try {
          await updateMenuSection(branchId, sectionId, { name: newName });
          loadMenu();
          closeModal();
        } catch (err: any) {
          alert(err.message);
        }
      }
    });
  };

  const handleDeleteSection = (sectionId: string) => {
    let confirmText = '';
    setModal({
      show: true,
      title: 'Delete Category',
      message: 'Are you sure you want to delete this section and all its items?',
      requireText: 'CONFIRM',
      showInput: true,
      inputPlaceholder: 'Type CONFIRM to proceed',
      onInputChange: (val) => setModalInput(val),
      onConfirm: async () => {
        console.log('Attempting to delete section:', sectionId, 'for branch:', branchId);
        try {
          await deleteMenuSection(branchId, sectionId);
          if (activeTab === sectionId) {
            const remaining = sections.filter(s => s.id !== sectionId);
            setActiveTab(remaining.length > 0 ? remaining[0].id : '');
          }
          loadMenu();
          closeModal();
        } catch (err: any) {
          alert(err.message);
        }
      }
    });
  };

  const handleAddItem = (sectionId: string) => {
    let name = '';
    let price = 0;

    setModal({
      show: true,
      title: 'Add New Offering',
      message: 'Enter the item details below:',
      showInput: true,
      inputPlaceholder: 'Item name...',
      onInputChange: (val) => { name = val; },
      onConfirm: async () => {
        if (!name.trim()) {
          // If they didn't type anything in the modal input, try to use a fallback or alert
          alert('Please enter a name for the item.');
          return;
        }
        
        // After name, we need price. For simplicity in a single modal, 
        // we'll default price to 0 and let them edit it in the table.
        // Or we could chain modals, but let's keep it clean.
        try {
          await createMenuItem(branchId, {
            section_id: sectionId,
            name,
            price: 0,
            sort_order: 0
          });
          loadMenu();
          closeModal();
        } catch (err: any) {
          alert(err.message);
        }
      }
    });
  };

  const handleUpdateItem = async (item: MenuItem, field: keyof MenuItem, value: any) => {
    try {
      await updateMenuItem(branchId, item.id, { [field]: value });
      loadMenu();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const startEditing = (item: MenuItem) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditPrice(item.price);
    setEditTag(item.special_tag || "Chef's Special");
    setEditDesc(item.description || '');
  };

  const saveEdit = async (item: MenuItem) => {
    try {
      await updateMenuItem(branchId, item.id, { 
        name: editName, 
        price: editPrice,
        special_tag: editTag,
        description: editDesc
      });
      setEditingItemId(null);
      loadMenu();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    // Legacy single delete - keeping internal logic but UI will use bulk
    try {
      await deleteMenuItem(branchId, itemId);
      loadMenu();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkDelete = () => {
    if (selectedItemIds.length === 0) return;
    
    let confirmText = '';
    setModal({
      show: true,
      title: 'Bulk Delete Items',
      message: `Are you sure you want to delete ${selectedItemIds.length} selected items?`,
      requireText: 'CONFIRM',
      showInput: true,
      inputPlaceholder: 'Type CONFIRM to proceed',
      onInputChange: (val) => setModalInput(val),
      onConfirm: async () => {
        console.log('Attempting bulk delete:', selectedItemIds, 'for branch:', branchId);
        setLoading(true);
        try {
          await Promise.all(selectedItemIds.map(id => deleteMenuItem(branchId, id)));
          setSelectedItemIds([]);
          loadMenu();
          closeModal();
        } catch (err: any) {
          alert('Some items could not be deleted: ' + err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleInitializeDefaults = () => {
    if (!branchId) {
      alert('Branch ID not found. Please refresh or select a branch.');
      return;
    }
    
    let confirmText = '';
    setModal({
      show: true,
      title: 'Initialize Default Menu',
      message: 'This will add default sections and items to your current menu.',
      requireText: 'CONFIRM',
      showInput: true,
      inputPlaceholder: 'Type CONFIRM to proceed',
      onInputChange: (val) => setModalInput(val),
      onConfirm: async () => {
        console.log('Attempting to initialize defaults for branch:', branchId);
        setLoading(true);
        try {
          await initializeDefaultMenu(branchId);
          loadMenu();
          closeModal();
        } catch (err: any) {
          alert(err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const activeSection = sections.find(s => s.id === activeTab);

  return (
    <div className="menu-page">
      <div className="menu-tabs">
        {sections.map(section => (
          <button
            key={section.id}
            className={`menu-tab-button ${activeTab === section.id ? 'active' : ''}`}
            onClick={() => setActiveTab(section.id)}
          >
            <span style={{ fontSize: '18px' }}>
              {section.section_type === 'cakes' ? '🎂' :
               (section.name || '').toLowerCase().includes('drink') ? '🥤' : 
               (section.name || '').toLowerCase().includes('main') ? '🍽️' : 
               (section.name || '').toLowerCase().includes('dessert') ? '🍰' : '📄'}
            </span>
            {section.name}
          </button>
        ))}
        
        {isAdmin && (
          <button
            className={`menu-tab-button menu-tab-button--settings ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span style={{ fontSize: '18px' }}>⚙️</span> Settings
          </button>
        )}
      </div>

      <div className="menu-content">
        {error ? (
          <div className="error-state">
            <div className="empty-menu-icon">⚠️</div>
            <h3>Something went wrong</h3>
            <p>{error}</p>
            <button className="btn-primary" style={{ marginTop: '20px' }} onClick={loadMenu}>
              Try Again
            </button>
          </div>
        ) : loading && sections.length === 0 ? (
          <div className="empty-menu-state">
            <div className="loading-spinner"></div>
            <p>Loading your premium menu...</p>
          </div>
        ) : activeTab === 'settings' ? (
          <div className="menu-settings-container">
            <div className="settings-header">
              <div className="settings-title">
                <h2>Menu Architecture</h2>
                <p>Design your categories and culinary offerings</p>
              </div>
              <div className="action-buttons">
                <button className="btn-secondary" onClick={handleInitializeDefaults} style={{ marginRight: '8px' }}>
                  ✨ Default Schema
                </button>
                {!isAddingSection ? (
                  <button className="btn-primary" onClick={() => setIsAddingSection(true)}>+ New Section</button>
                ) : (
                  <form onSubmit={handleAddSection} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      className="price-input" 
                      style={{ width: '200px', paddingLeft: '12px' }}
                      placeholder="Section name..."
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      autoFocus
                    />
                    <select 
                      className="price-input"
                      style={{ width: '120px' }}
                      value={newSectionType}
                      onChange={(e) => setNewSectionType(e.target.value)}
                    >
                      <option value="standard">Standard</option>
                      <option value="cakes">Cakes</option>
                    </select>
                    <button type="submit" className="btn-primary">Add</button>
                    <button type="button" className="btn-secondary" onClick={() => setIsAddingSection(false)}>Cancel</button>
                  </form>
                )}
              </div>
            </div>

            <div className="settings-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {sections.length === 0 && !isAddingSection && (
              <div className="empty-menu-state">
                <div className="empty-menu-icon">🍱</div>
                <h3>Start Building Your Menu</h3>
                <p>Create sections like "Main Courses" or "Drinks" to begin.</p>
                <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => setIsAddingSection(true)}>
                  Create First Section
                </button>
              </div>
            )}

            {sections.map((section, idx) => (
              <div key={section.id} className="section-management-card" style={{ animationDelay: `${idx * 0.1}s` }}>
                <div className="section-management-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      width: '8px', 
                      height: '24px', 
                      background: 'var(--primary)', 
                      borderRadius: '4px' 
                    }}></div>
                    <h3>{section.name}</h3>
                    <span className="section-type-badge" style={{ 
                      fontSize: '10px', 
                      background: section.section_type === 'cakes' ? '#fde68a' : '#e5e7eb',
                      color: section.section_type === 'cakes' ? '#92400e' : '#374151',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      textTransform: 'uppercase',
                      fontWeight: 700
                    }}>
                      {section.section_type}
                    </span>
                  </div>
                  <div className="action-buttons">
                    <button className="icon-btn" onClick={() => handleUpdateSection(section.id, section.name)} title="Rename">✏️</button>
                    <button className="icon-btn icon-btn--delete" onClick={() => handleDeleteSection(section.id)} title="Remove Section">🗑️</button>
                    <button className="btn-secondary" onClick={() => handleAddItem(section.id)}>+ Add Offering</button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Item Name</th>
                        <th style={{ width: '35%' }}>Description</th>
                        <th style={{ width: '10%' }}>Price (RM)</th>
                        <th style={{ width: '12%' }}>Badge/Tag</th>
                        <th style={{ width: '13%' }}>Status</th>
                          <th style={{ width: '15%', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                              <button 
                                className={`icon-btn icon-btn--delete ${selectedItemIds.length > 0 ? 'active' : 'disabled'}`}
                                onClick={handleBulkDelete}
                                disabled={selectedItemIds.length === 0}
                                title="Delete Selected"
                                style={{ 
                                  width: 'auto', 
                                  padding: '0 10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '13px'
                                }}
                              >
                                🗑️ {selectedItemIds.length > 0 && `(${selectedItemIds.length})`}
                              </button>
                            </div>
                          </th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items?.map(item => (
                          <tr key={item.id} className={editingItemId === item.id ? 'row-editing' : ''}>
                            <td>
                              <input 
                                type="text" 
                                className="price-input" 
                                style={{ 
                                  width: '100%', 
                                  paddingLeft: '12px', 
                                  background: editingItemId === item.id ? 'var(--bg-input)' : 'transparent', 
                                  border: editingItemId === item.id ? '1px solid var(--accent-warm)' : 'none',
                                  color: 'var(--text-primary)',
                                  borderRadius: '4px'
                                }}
                                value={editingItemId === item.id ? editName : item.name}
                                onChange={(e) => setEditName(e.target.value)}
                                readOnly={editingItemId !== item.id}
                              />
                            </td>
                            <td>
                              <input 
                                type="text" 
                                className="price-input" 
                                style={{ 
                                  width: '100%', 
                                  paddingLeft: '12px', 
                                  background: editingItemId === item.id ? 'var(--bg-input)' : 'transparent', 
                                  border: editingItemId === item.id ? '1px solid var(--accent-warm)' : 'none',
                                  color: 'var(--text-secondary)',
                                  borderRadius: '4px',
                                  fontSize: '13px'
                                }}
                                value={editingItemId === item.id ? editDesc : (item.description || '')}
                                onChange={(e) => setEditDesc(e.target.value)}
                                readOnly={editingItemId !== item.id}
                                placeholder="Describe this offering..."
                              />
                            </td>
                            <td>
                              <div className="price-input-wrapper">
                                <input 
                                  type="number" 
                                  step="0.01"
                                  className="price-input"
                                  style={{ 
                                    paddingLeft: '8px', 
                                    width: '80px',
                                    background: editingItemId === item.id ? 'var(--bg-input)' : 'transparent',
                                    border: editingItemId === item.id ? '1px solid var(--accent-warm)' : 'none',
                                    borderRadius: '4px'
                                  }}
                                  value={editingItemId === item.id ? editPrice : item.price}
                                  onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                                  readOnly={editingItemId !== item.id}
                                />
                              </div>
                            </td>
                            <td>
                              <input 
                                type="text" 
                                className="price-input" 
                                style={{ 
                                  width: '100%', 
                                  paddingLeft: '12px', 
                                  background: editingItemId === item.id ? 'var(--bg-input)' : 'transparent', 
                                  border: editingItemId === item.id ? '1px solid var(--accent-warm)' : 'none',
                                  color: 'var(--primary)',
                                  fontWeight: 600,
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}
                                value={editingItemId === item.id ? editTag : (item.special_tag || "Chef's Special")}
                                onChange={(e) => setEditTag(e.target.value)}
                                readOnly={editingItemId !== item.id}
                                placeholder="Tag..."
                              />
                            </td>
                            <td>
                              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <button 
                                  className={`menu-item-status ${item.is_available ? 'status--available' : 'status--unavailable'}`}
                                  onClick={() => handleUpdateItem(item, 'is_available', !item.is_available)}
                                  style={{ transform: 'scale(0.9)', originX: 'left' }}
                                >
                                  {item.is_available ? 'Active' : 'Sold Out'}
                                </button>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                                {editingItemId === item.id ? (
                                  <button 
                                    className="icon-btn" 
                                    onClick={() => saveEdit(item)}
                                    style={{ color: '#28a745', fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer' }}
                                    title="Save Changes"
                                  >
                                    ✅
                                  </button>
                                ) : (
                                  <button 
                                    className="icon-btn" 
                                    onClick={() => startEditing(item)}
                                    style={{ opacity: 0.6, fontSize: '16px', background: 'none', border: 'none', cursor: 'pointer' }}
                                    title="Edit Item"
                                  >
                                    ✏️
                                  </button>
                                )}
                                <button 
                                  className="icon-btn" 
                                  onClick={() => setUploadingItem(item)}
                                  style={{ opacity: 0.6, fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer' }}
                                  title="Upload Image"
                                >
                                  🖼️
                                </button>
                                <input 
                                  type="checkbox" 
                                  checked={selectedItemIds.includes(item.id)}
                                  onChange={() => toggleItemSelection(item.id)}
                                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                              </div>
                            </td>
                          </tr>
                      ))}
                      {(!section.items || section.items.length === 0) && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                            No items in this category yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            </div>
          </div>
        ) : activeSection ? (
          <div className="menu-items-grid">
            {activeSection.items?.map((item, idx) => (
              <div key={item.id} className="menu-item-card" style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="menu-item-image">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} loading="lazy" />
                  ) : (
                    <div style={{ 
                      width: '100%', 
                      height: '100%', 
                      background: FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '64px'
                    }}>
                      {activeSection.section_type === 'cakes' ? '🎂' :
                       (activeSection.name || '').toLowerCase().includes('drink') ? '🍹' : 
                       (activeSection.name || '').toLowerCase().includes('main') ? '🍱' : '🍽️'}
                    </div>
                  )}
                  <div className="menu-item-price-tag">RM {Number(item.price).toFixed(2)}</div>
                </div>
                <div className="menu-item-info">
                  <h4 className="menu-item-name">{item.name}</h4>
                  <p className="menu-item-desc">
                    {item.description || `Exquisite ${item.name} prepared with the finest ingredients and culinary precision.`}
                  </p>
                  <div className="menu-item-card-footer">
                    <div className={`menu-item-status ${item.is_available ? 'status--available' : 'status--unavailable'}`}>
                      {item.is_available ? 'Available' : 'Unavailable'}
                    </div>
                    {item.is_available && (
                      <span className="menu-item-tag-text">
                        {item.special_tag || "Chef's Special"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(!activeSection.items || activeSection.items.length === 0) && (
              <div className="empty-menu-state" style={{ gridColumn: '1/-1' }}>
                <div className="empty-menu-icon">🍽️</div>
                <h3>Awaiting Creations</h3>
                <p>Items added in settings will appear here with premium visuals.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-menu-state">
            <div className="empty-menu-icon">📜</div>
            <h3>Menu Not Yet Configured</h3>
            {isAdmin ? (
              <>
                <p>Initialize your menu categories in the Settings tab.</p>
                <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => setActiveTab('settings')}>
                  Open Settings
                </button>
              </>
            ) : (
              <p>Please contact an administrator to set up the menu.</p>
            )}
          </div>
        )}
      </div>

      {modal.show && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>{modal.title}</h3>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-content" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>{modal.message}</p>
              {modal.showInput && (
                <input 
                  type="text" 
                  className="price-input" 
                  style={{ width: '100%', paddingLeft: '12px', background: 'var(--bg-input)' }}
                  placeholder={modal.inputPlaceholder}
                  defaultValue={modal.inputValue}
                  onChange={(e) => {
                    setModalInput(e.target.value);
                    modal.onInputChange?.(e.target.value);
                  }}
                  autoFocus
                />
              )}
              {modal.requireText && (
                <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Please type <strong>{modal.requireText}</strong> to confirm.
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button 
                className="btn-primary" 
                onClick={modal.onConfirm}
                disabled={modal.requireText ? modalInput !== modal.requireText : false}
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadingItem && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>🖼️</span>
                <h3 style={{ margin: 0 }}>Update Image</h3>
              </div>
              <button className="modal-close" onClick={() => setUploadingItem(null)}>&times;</button>
            </div>
            <div className="modal-content" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '4px', fontWeight: 600 }}>{uploadingItem.name}</p>
              <p style={{ marginBottom: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>Select a premium photo to display in the menu catalog.</p>
              
              <div className="upload-dropzone" style={{ 
                border: '2px dashed var(--border-color)', 
                borderRadius: '12px', 
                padding: '32px', 
                textAlign: 'center',
                background: 'var(--bg-light)',
                marginBottom: '20px'
              }}>
                <input 
                  type="file" 
                  accept="image/jpeg,image/png,image/webp" 
                  id="menu-item-upload"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 800 * 1024) {
                        alert('File too large. Maximum size is 800KB.');
                        return;
                      }
                      console.log('File selected:', file.name);
                      alert('Success! Image "' + file.name + '" selected.\n(In production, this would upload to the server)');
                      setUploadingItem(null);
                    }
                  }}
                />
                <label htmlFor="menu-item-upload" style={{ cursor: 'pointer' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>📁</div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>Click to browse</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>JPEG, PNG or WebP formats</div>
                </label>
              </div>

              <div style={{ background: 'rgba(54, 162, 235, 0.1)', padding: '12px', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--primary)' }}>💡 Upload Guidance</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <li>Recommended Resolution: <b>600 x 400 px</b></li>
                  <li>Aspect Ratio: <b>3:2 (Horizontal)</b></li>
                  <li>Maximum File Size: <b>800 KB</b></li>
                </ul>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setUploadingItem(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => document.getElementById('menu-item-upload')?.click()}>
                Browse Local
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
