import { useState, useEffect, useCallback } from 'react';
import './AdminSettingsCategory.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColorVar {
  key: string;
  label: string;
  hint: string;
}

interface ColorGroup {
  id: string;
  label: string;
  description: string;
  vars: ColorVar[];
}

// ─── Theme variable definitions ───────────────────────────────────────────────

const COLOR_GROUPS: ColorGroup[] = [
  {
    id: 'accent',
    label: 'Accent & Brand',
    description: 'Primary brand color — buttons, active states, highlights, and focus rings',
    vars: [
      { key: '--accent',       label: 'Primary Accent',  hint: 'Main brand color for buttons and active items' },
      { key: '--accent-hover', label: 'Accent Hover',    hint: 'Lighter shade on button hover' },
      { key: '--border-focus', label: 'Focus Ring',      hint: 'Input focus border colour' },
    ],
  },
  {
    id: 'backgrounds',
    label: 'Backgrounds',
    description: 'Page, panel, input, and interactive state background colours',
    vars: [
      { key: '--bg-base',     label: 'Page Background',  hint: 'Outermost page backdrop' },
      { key: '--bg-surface',  label: 'Card / Panel',     hint: 'Cards, navigation bar, sidebar' },
      { key: '--bg-elevated', label: 'Elevated',         hint: 'Dropdowns, modals, tooltips' },
      { key: '--bg-hover',    label: 'Row Hover',        hint: 'Table row and list item hover' },
      { key: '--bg-active',   label: 'Active / Selected',hint: 'Currently selected nav items' },
      { key: '--bg-input',    label: 'Input Background', hint: 'Text fields and select inputs' },
    ],
  },
  {
    id: 'text',
    label: 'Typography',
    description: 'Text colour hierarchy from primary headings to muted hints',
    vars: [
      { key: '--text-primary',   label: 'Primary Text',   hint: 'Headings and important values' },
      { key: '--text-secondary', label: 'Secondary Text', hint: 'Labels, captions, table cells' },
      { key: '--text-muted',     label: 'Muted Text',     hint: 'Placeholders, helper text, icons' },
    ],
  },
];

// Canonical defaults — mirrors global.css :root
export const THEME_DEFAULTS: Record<string, string> = {
  '--accent':          '#e85d26',
  '--accent-hover':    '#f97316',
  '--border-focus':    '#e85d26',
  '--bg-base':         '#0a0f1e',
  '--bg-surface':      '#0f172a',
  '--bg-elevated':     '#1e293b',
  '--bg-hover':        '#1e2d45',
  '--bg-active':       '#243352',
  '--bg-input':        '#162032',
  '--text-primary':    '#f1f5f9',
  '--text-secondary':  '#94a3b8',
  '--text-muted':      '#475569',
};

const STORAGE_KEY = 'admin_theme_overrides';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a #rrggbb hex colour to rgba(r,g,b,alpha) string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Apply a theme map to :root CSS variables */
function applyTheme(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  // Derive rgba accent variants from the accent base colour
  const accent = vars['--accent'] ?? THEME_DEFAULTS['--accent'];
  root.style.setProperty('--accent-subtle', hexToRgba(accent, 0.15));
  root.style.setProperty('--accent-border', hexToRgba(accent, 0.35));
}

/** Load persisted overrides from localStorage (or return defaults) */
function loadSavedTheme(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...THEME_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...THEME_DEFAULTS };
}

// ─── Minimal pure-JS ZIP writer (no dependencies) ────────────────────────────

function createZipBlob(files: Array<{ name: string; content: string }>): Blob {
  const enc = new TextEncoder();

  // Build CRC-32 lookup table (standard polynomial 0xedb88320)
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c;
  }
  function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const b of data) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function u16(n: number) { return [n & 0xff, (n >> 8) & 0xff]; }
  function u32(n: number) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]; }

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.name);
    const data = enc.encode(file.content);
    const crc = crc32(data);

    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,                 // local file header signature
      0x14, 0x00,                              // version needed: 2.0
      0x00, 0x00,                              // general purpose flags
      0x00, 0x00,                              // compression: stored (no compression)
      0x00, 0x00, 0x00, 0x00,                  // last mod time + date
      ...u32(crc),                             // CRC-32
      ...u32(data.length),                     // compressed size
      ...u32(data.length),                     // uncompressed size
      ...u16(name.length),                     // filename length
      0x00, 0x00,                              // extra field length
      ...name,
    ]);

    const central = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,                 // central directory signature
      0x14, 0x00, 0x14, 0x00,                 // version made by / version needed
      0x00, 0x00,                              // flags
      0x00, 0x00,                              // compression
      0x00, 0x00, 0x00, 0x00,                  // last mod time + date
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      0x00, 0x00,                              // extra field length
      0x00, 0x00,                              // file comment length
      0x00, 0x00,                              // disk number start
      0x00, 0x00,                              // internal file attributes
      0x00, 0x00, 0x00, 0x00,                  // external file attributes
      ...u32(offset),                          // relative offset of local header
      ...name,
    ]);

    localParts.push(local, data);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const cdOffset = offset;
  const cdSize = centralParts.reduce((s, p) => s + p.length, 0);

  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,                   // end of central directory signature
    0x00, 0x00, 0x00, 0x00,                    // disk numbers
    ...u16(files.length), ...u16(files.length),// entries on disk / total entries
    ...u32(cdSize),                            // size of central directory
    ...u32(cdOffset),                          // offset of start of central directory
    0x00, 0x00,                                // zip comment length
  ]);

  return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSettingsTheme() {
  const [colors, setColors] = useState<Record<string, string>>(() => loadSavedTheme());
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Apply live preview whenever colors change
  useEffect(() => {
    applyTheme(colors);
  }, [colors]);

  const handleChange = useCallback((key: string, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveSuccess(false);
  }, []);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
    applyTheme(colors);
    setHasChanges(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleReset = () => {
    setColors({ ...THEME_DEFAULTS });
    setHasChanges(true);
    setSaveSuccess(false);
  };

  const handleExportZip = () => {
    const date = new Date().toISOString().split('T')[0];
    const branchName = localStorage.getItem('branch_name') || 'dashboard';
    const slug = branchName.toLowerCase().replace(/\s+/g, '-');

    // theme-override.css — drop-in CSS file
    const cssLines = [
      `/* ============================================================`,
      `   Theme Override — ${branchName}`,
      `   Exported: ${date}`,
      `   Apply by importing this file after global.css`,
      `   ============================================================ */`,
      '',
      ':root {',
      ...Object.entries(colors).map(([k, v]) => `  ${k}: ${v};`),
      `  --accent-subtle: ${hexToRgba(colors['--accent'] ?? THEME_DEFAULTS['--accent'], 0.15)};`,
      `  --accent-border: ${hexToRgba(colors['--accent'] ?? THEME_DEFAULTS['--accent'], 0.35)};`,
      '}',
    ];
    const cssContent = cssLines.join('\n');

    // theme.json — machine-readable for re-importing
    const jsonContent = JSON.stringify({ version: 1, exported: date, colors }, null, 2);

    // README.txt — instructions
    const readmeContent = [
      `SEJIWA Admin Dashboard — Theme Export`,
      `Exported: ${date}`,
      ``,
      `Files included:`,
      `  theme-override.css  — CSS variable overrides (drop-in stylesheet)`,
      `  theme.json          — Theme data for re-importing via the settings page`,
      ``,
      `To apply theme-override.css:`,
      `  1. Copy theme-override.css to your project`,
      `  2. Import it after global.css in main.tsx:`,
      `     import './theme-override.css';`,
      ``,
      `To import via the admin dashboard:`,
      `  Settings → Theme → (future import feature)`,
    ].join('\n');

    const blob = createZipBlob([
      { name: 'theme-override.css', content: cssContent },
      { name: 'theme.json',         content: jsonContent },
      { name: 'README.txt',         content: readmeContent },
    ]);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-theme-${date}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="settings-category">
      <div className="category-header">
        <h2>Theme & Colours</h2>
        <p>Customise the dashboard colour palette. Changes apply instantly as a live preview.</p>
      </div>

      <div className="category-content">

        {/* ── Color groups ─────────────────────────────────────────────── */}
        {COLOR_GROUPS.map(group => (
          <div key={group.id} className="form-section">
            <h3>{group.label}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, marginTop: -8 }}>
              {group.description}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.vars.map(v => {
                const current = colors[v.key] ?? THEME_DEFAULTS[v.key];
                const isDefault = current === THEME_DEFAULTS[v.key];
                return (
                  <div
                    key={v.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {/* Label + hint */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {v.label}
                        {!isDefault && (
                          <span style={{
                            marginLeft: 8, fontSize: 11, fontWeight: 500,
                            background: hexToRgba(colors['--accent'] ?? '#e85d26', 0.2),
                            color: colors['--accent'] ?? '#e85d26',
                            padding: '1px 6px', borderRadius: 999,
                          }}>
                            modified
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        <code style={{ fontSize: 11, opacity: 0.7 }}>{v.key}</code>
                        {' · '}
                        {v.hint}
                      </div>
                    </div>

                    {/* Hex value */}
                    <input
                      type="text"
                      value={current}
                      onChange={e => handleChange(v.key, e.target.value)}
                      style={{
                        width: 90, fontFamily: 'monospace', fontSize: 12,
                        textAlign: 'center', padding: '6px 8px',
                      }}
                      spellCheck={false}
                    />

                    {/* Color swatch / picker */}
                    <label style={{ position: 'relative', cursor: 'pointer' }} title="Pick colour">
                      <div style={{
                        width: 36, height: 36,
                        borderRadius: 'var(--radius-sm)',
                        background: current,
                        border: '2px solid var(--border-strong)',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                        transition: 'transform 0.1s',
                      }} />
                      <input
                        type="color"
                        value={current.startsWith('#') ? current : THEME_DEFAULTS[v.key]}
                        onChange={e => handleChange(v.key, e.target.value)}
                        style={{
                          position: 'absolute', opacity: 0, width: 36, height: 36,
                          top: 0, left: 0, cursor: 'pointer',
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* ── Live Preview ──────────────────────────────────────────────── */}
        <div className="form-section">
          <h3>Live Preview</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, marginTop: -8 }}>
            How your colour choices look together. Updates in real time.
          </p>

          <div style={{
            background: colors['--bg-base'],
            border: `1px solid ${hexToRgba('#ffffff', 0.08)}`,
            borderRadius: 'var(--radius-md)',
            padding: 20,
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            {/* Card */}
            <div style={{
              background: colors['--bg-surface'],
              border: `1px solid ${hexToRgba('#ffffff', 0.08)}`,
              borderRadius: 'var(--radius-md)',
              padding: 16,
              minWidth: 200,
              flex: '1 1 200px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors['--text-primary'], marginBottom: 4 }}>
                Reservation #R-001
              </div>
              <div style={{ fontSize: 12, color: colors['--text-secondary'], marginBottom: 12 }}>
                Table A1 · 4 guests · 7:00 PM
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none',
                  background: colors['--accent'], color: '#fff',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                  Confirm
                </button>
                <button style={{
                  padding: '7px 14px', borderRadius: 8,
                  background: colors['--bg-elevated'],
                  border: `1px solid ${hexToRgba('#ffffff', 0.14)}`,
                  color: colors['--text-secondary'], fontSize: 12, cursor: 'pointer',
                }}>
                  Details
                </button>
              </div>
            </div>

            {/* Input + muted text */}
            <div style={{
              background: colors['--bg-surface'],
              border: `1px solid ${hexToRgba('#ffffff', 0.08)}`,
              borderRadius: 'var(--radius-md)',
              padding: 16,
              minWidth: 200,
              flex: '1 1 200px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors['--text-secondary'] }}>
                Search Reservations
              </div>
              <div style={{
                background: colors['--bg-input'],
                border: `1px solid ${hexToRgba('#ffffff', 0.14)}`,
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
                color: colors['--text-muted'],
              }}>
                Find by name or reference…
              </div>
              <div style={{ fontSize: 12, color: colors['--text-muted'] }}>
                Showing 24 reservations today
              </div>
            </div>

            {/* Status badges */}
            <div style={{
              background: colors['--bg-surface'],
              border: `1px solid ${hexToRgba('#ffffff', 0.08)}`,
              borderRadius: 'var(--radius-md)',
              padding: 16,
              minWidth: 160,
              flex: '1 1 160px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors['--text-secondary'], marginBottom: 4 }}>
                Accent Variants
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: hexToRgba(colors['--accent'], 0.15),
                color: colors['--accent'], fontSize: 12, fontWeight: 600,
              }}>
                ● Active
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: hexToRgba(colors['--accent-hover'], 0.15),
                color: colors['--accent-hover'], fontSize: 12, fontWeight: 600,
              }}>
                ● Hover
              </div>
              <div style={{
                padding: '6px 10px', borderRadius: 6,
                border: `2px solid ${colors['--border-focus']}`,
                fontSize: 12, color: colors['--text-primary'],
                background: colors['--bg-input'],
              }}>
                Focused input
              </div>
            </div>
          </div>
        </div>

        {/* ── Reset section ─────────────────────────────────────────────── */}
        <div className="form-section">
          <h3>Reset</h3>
          <div style={{
            padding: 14, background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Restore Default Theme
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                Reverts all colours to the original warm-orange dark theme
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={handleReset}>
              Reset to Defaults
            </button>
          </div>
        </div>

      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="category-footer">
        {saveSuccess && (
          <div className="alert alert-success">✓ Theme saved — colours applied across the dashboard</div>
        )}
        {hasChanges && !saveSuccess && (
          <div className="alert alert-info">You have unsaved changes — save to persist across sessions</div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportZip}
            title="Download theme as a ZIP containing CSS and JSON files"
          >
            ↓ Export ZIP
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
          >
            Save Theme
          </button>
        </div>
      </div>
    </div>
  );
}
