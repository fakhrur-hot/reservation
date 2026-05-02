import { useState, useEffect, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NagerCountry {
  countryCode: string;
  name: string;
}

interface NagerHoliday {
  date: string;
  name: string;
  localName: string;
  global: boolean;
  counties: string[] | null;
  types: string[];
}

interface HolidayRow extends NagerHoliday {
  is_open: boolean;
}

// ─── Malaysia state codes (region dropdown always shows all 16 states) ───────

const MY_STATE_CODES = [
  'MY-01','MY-02','MY-03','MY-04','MY-05','MY-06','MY-07','MY-08',
  'MY-09','MY-10','MY-11','MY-12','MY-13','MY-14','MY-15','MY-16',
];

// ─── Countries that Nager.Date supports via PublicHolidays but omits from
//     AvailableCountries. Merged with the API list so they always appear. ──────

const SUPPLEMENTAL_COUNTRIES: NagerCountry[] = [
  { countryCode: 'MY', name: 'Malaysia' },
  { countryCode: 'SG', name: 'Singapore' },
  { countryCode: 'PH', name: 'Philippines' },
  { countryCode: 'VN', name: 'Vietnam' },
  { countryCode: 'KH', name: 'Cambodia' },
  { countryCode: 'MM', name: 'Myanmar' },
  { countryCode: 'LA', name: 'Laos' },
  { countryCode: 'BN', name: 'Brunei' },
  { countryCode: 'PK', name: 'Pakistan' },
  { countryCode: 'LK', name: 'Sri Lanka' },
  { countryCode: 'NP', name: 'Nepal' },
  { countryCode: 'KW', name: 'Kuwait' },
  { countryCode: 'QA', name: 'Qatar' },
  { countryCode: 'OM', name: 'Oman' },
  { countryCode: 'BH', name: 'Bahrain' },
  { countryCode: 'JO', name: 'Jordan' },
  { countryCode: 'LB', name: 'Lebanon' },
  { countryCode: 'MA', name: 'Morocco' },
  { countryCode: 'TN', name: 'Tunisia' },
  { countryCode: 'GH', name: 'Ghana' },
  { countryCode: 'KE', name: 'Kenya' },
  { countryCode: 'NG', name: 'Nigeria' },
  { countryCode: 'TZ', name: 'Tanzania' },
  { countryCode: 'UG', name: 'Uganda' },
  { countryCode: 'ZW', name: 'Zimbabwe' },
];

// ─── Region name lookup (ISO 3166-2 subdivision codes) ───────────────────────

const REGION_NAMES: Record<string, string> = {
  // Malaysia
  'MY-01': 'Johor', 'MY-02': 'Kedah', 'MY-03': 'Kelantan', 'MY-04': 'Melaka',
  'MY-05': 'Negeri Sembilan', 'MY-06': 'Pahang', 'MY-07': 'Pulau Pinang',
  'MY-08': 'Perak', 'MY-09': 'Perlis', 'MY-10': 'Selangor', 'MY-11': 'Terengganu',
  'MY-12': 'Sabah', 'MY-13': 'Sarawak', 'MY-14': 'Kuala Lumpur (WP)',
  'MY-15': 'Labuan (WP)', 'MY-16': 'Putrajaya (WP)',
  // United States
  'US-AL': 'Alabama', 'US-AK': 'Alaska', 'US-AZ': 'Arizona', 'US-AR': 'Arkansas',
  'US-CA': 'California', 'US-CO': 'Colorado', 'US-CT': 'Connecticut',
  'US-DE': 'Delaware', 'US-FL': 'Florida', 'US-GA': 'Georgia', 'US-HI': 'Hawaii',
  'US-ID': 'Idaho', 'US-IL': 'Illinois', 'US-IN': 'Indiana', 'US-IA': 'Iowa',
  'US-KS': 'Kansas', 'US-KY': 'Kentucky', 'US-LA': 'Louisiana', 'US-ME': 'Maine',
  'US-MD': 'Maryland', 'US-MA': 'Massachusetts', 'US-MI': 'Michigan',
  'US-MN': 'Minnesota', 'US-MS': 'Mississippi', 'US-MO': 'Missouri',
  'US-MT': 'Montana', 'US-NE': 'Nebraska', 'US-NV': 'Nevada',
  'US-NH': 'New Hampshire', 'US-NJ': 'New Jersey', 'US-NM': 'New Mexico',
  'US-NY': 'New York', 'US-NC': 'North Carolina', 'US-ND': 'North Dakota',
  'US-OH': 'Ohio', 'US-OK': 'Oklahoma', 'US-OR': 'Oregon',
  'US-PA': 'Pennsylvania', 'US-RI': 'Rhode Island', 'US-SC': 'South Carolina',
  'US-SD': 'South Dakota', 'US-TN': 'Tennessee', 'US-TX': 'Texas', 'US-UT': 'Utah',
  'US-VT': 'Vermont', 'US-VA': 'Virginia', 'US-WA': 'Washington',
  'US-WV': 'West Virginia', 'US-WI': 'Wisconsin', 'US-WY': 'Wyoming',
  'US-DC': 'District of Columbia',
  // Australia
  'AU-NSW': 'New South Wales', 'AU-VIC': 'Victoria', 'AU-QLD': 'Queensland',
  'AU-WA': 'Western Australia', 'AU-SA': 'South Australia', 'AU-TAS': 'Tasmania',
  'AU-ACT': 'Australian Capital Territory', 'AU-NT': 'Northern Territory',
  // United Kingdom
  'GB-ENG': 'England', 'GB-NIR': 'Northern Ireland', 'GB-SCT': 'Scotland', 'GB-WLS': 'Wales',
  // Canada
  'CA-AB': 'Alberta', 'CA-BC': 'British Columbia', 'CA-MB': 'Manitoba',
  'CA-NB': 'New Brunswick', 'CA-NL': 'Newfoundland and Labrador',
  'CA-NS': 'Nova Scotia', 'CA-ON': 'Ontario', 'CA-PE': 'Prince Edward Island',
  'CA-QC': 'Quebec', 'CA-SK': 'Saskatchewan', 'CA-NT': 'Northwest Territories',
  'CA-NU': 'Nunavut', 'CA-YT': 'Yukon',
  // Germany
  'DE-BB': 'Brandenburg', 'DE-BE': 'Berlin', 'DE-BW': 'Baden-Württemberg',
  'DE-BY': 'Bavaria', 'DE-HB': 'Bremen', 'DE-HE': 'Hesse', 'DE-HH': 'Hamburg',
  'DE-MV': 'Mecklenburg-Vorpommern', 'DE-NI': 'Lower Saxony',
  'DE-NW': 'North Rhine-Westphalia', 'DE-RP': 'Rhineland-Palatinate',
  'DE-SH': 'Schleswig-Holstein', 'DE-SL': 'Saarland', 'DE-SN': 'Saxony',
  'DE-ST': 'Saxony-Anhalt', 'DE-TH': 'Thuringia',
  // India
  'IN-AN': 'Andaman & Nicobar', 'IN-AP': 'Andhra Pradesh',
  'IN-AR': 'Arunachal Pradesh', 'IN-AS': 'Assam', 'IN-BR': 'Bihar',
  'IN-CH': 'Chandigarh', 'IN-CT': 'Chhattisgarh', 'IN-DL': 'Delhi',
  'IN-GA': 'Goa', 'IN-GJ': 'Gujarat', 'IN-HR': 'Haryana',
  'IN-HP': 'Himachal Pradesh', 'IN-JK': 'Jammu & Kashmir', 'IN-JH': 'Jharkhand',
  'IN-KA': 'Karnataka', 'IN-KL': 'Kerala', 'IN-LA': 'Ladakh',
  'IN-MP': 'Madhya Pradesh', 'IN-MH': 'Maharashtra', 'IN-MN': 'Manipur',
  'IN-ML': 'Meghalaya', 'IN-MZ': 'Mizoram', 'IN-NL': 'Nagaland',
  'IN-OR': 'Odisha', 'IN-PY': 'Puducherry', 'IN-PB': 'Punjab',
  'IN-RJ': 'Rajasthan', 'IN-SK': 'Sikkim', 'IN-TN': 'Tamil Nadu',
  'IN-TG': 'Telangana', 'IN-TR': 'Tripura', 'IN-UP': 'Uttar Pradesh',
  'IN-UT': 'Uttarakhand', 'IN-WB': 'West Bengal',
  // Indonesia
  'ID-AC': 'Aceh', 'ID-BA': 'Bali', 'ID-JK': 'DKI Jakarta',
  'ID-JA': 'Jambi', 'ID-JB': 'West Java', 'ID-JT': 'Central Java',
  'ID-JI': 'East Java', 'ID-KB': 'West Kalimantan', 'ID-KS': 'South Kalimantan',
  'ID-KT': 'Central Kalimantan', 'ID-KI': 'East Kalimantan',
  'ID-KU': 'North Kalimantan', 'ID-LA': 'Lampung', 'ID-MA': 'Maluku',
  'ID-MU': 'Maluku Utara', 'ID-NB': 'West Nusa Tenggara',
  'ID-NT': 'East Nusa Tenggara', 'ID-PA': 'Papua', 'ID-PB': 'West Papua',
  'ID-RI': 'Riau', 'ID-SN': 'South Sulawesi', 'ID-ST': 'Central Sulawesi',
  'ID-SG': 'Southeast Sulawesi', 'ID-SA': 'North Sulawesi',
  'ID-SR': 'West Sulawesi', 'ID-SB': 'West Sumatra', 'ID-SS': 'South Sumatra',
  'ID-SU': 'North Sumatra', 'ID-YO': 'Yogyakarta',
  // Thailand
  'TH-10': 'Bangkok',
};

function regionName(code: string): string {
  return REGION_NAMES[code] ?? code;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const NAGER_BASE = 'https://date.nager.at/api/v3';
const BACKEND_BASE = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('staff_token');
  const branchId = localStorage.getItem('branch_id');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(branchId ? { 'X-Branch-ID': branchId } : {}),
  };
}

// A holiday is "nationwide" if it has no counties restriction at all,
// OR if it is flagged global. Nager.Date sometimes expresses nationwide
// holidays as global:false with all states listed in counties (e.g. Malaysia).
function isNationwide(h: NagerHoliday): boolean {
  return h.global || h.counties === null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PublicHolidaysSection() {
  const branchId = localStorage.getItem('branch_id') ?? '';
  const currentYear = new Date().getFullYear();

  // Selectors
  const [countries, setCountries] = useState<NagerCountry[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('MY');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // ALL holidays loaded from Nager.Date for the current country+year
  // Region filter is applied as a derived (useMemo) view — no re-fetch needed.
  const [rawHolidays, setRawHolidays] = useState<HolidayRow[]>([]);
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);

  // UI state
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Saved overrides from backend (date → is_open map, used to pre-fill toggles)
  const [savedOverrides, setSavedOverrides] = useState<Map<string, boolean>>(new Map());

  // ── Displayed list = raw filtered by selected region ──────────────────────
  // When no region selected: show ALL (including state-specific ones)
  // When region selected: show nationwide + that region's holidays
  const displayedHolidays = useMemo((): HolidayRow[] => {
    if (!selectedRegion) return rawHolidays;
    return rawHolidays.filter(h =>
      isNationwide(h) || (h.counties != null && h.counties.includes(selectedRegion))
    );
  }, [rawHolidays, selectedRegion]);

  // ── Load countries + saved preference on mount ─────────────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        const [countriesRes, settingsRes] = await Promise.all([
          fetch(`${NAGER_BASE}/AvailableCountries`),
          fetch(`${BACKEND_BASE}/admin/v1/branches/${branchId}/holiday-settings`, { headers: getHeaders() }),
        ]);

        if (countriesRes.ok) {
          const list: NagerCountry[] = await countriesRes.json();
          // Merge supplemental countries that Nager.Date omits from AvailableCountries
          // but does support in the PublicHolidays endpoint (e.g. Malaysia).
          const codes = new Set(list.map(c => c.countryCode));
          const merged = [
            ...list,
            ...SUPPLEMENTAL_COUNTRIES.filter(c => !codes.has(c.countryCode)),
          ];
          setCountries(merged.sort((a, b) => a.name.localeCompare(b.name)));
        } else {
          // Fall back to the supplemental list so the UI isn't completely empty
          setCountries(SUPPLEMENTAL_COUNTRIES.sort((a, b) => a.name.localeCompare(b.name)));
          setCountriesError('Could not load country list from Nager.Date API — showing partial list');
        }

        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.countryCode) setSelectedCountry(settings.countryCode);
          if (settings.regionCode) setSelectedRegion(settings.regionCode);
          if (settings.savedHolidays?.length > 0) {
            const map = new Map<string, boolean>();
            for (const h of settings.savedHolidays) map.set(h.override_date, h.is_open);
            setSavedOverrides(map);
          }
        }
      } catch {
        setCountriesError('Network error loading country list');
      } finally {
        setLoadingCountries(false);
      }
    };
    if (branchId) init();
  }, [branchId]);

  // ── Load ALL holidays for country+year from Nager.Date ──────────────────────
  // Region filter is applied in useMemo above — no re-fetch on region change.

  const loadHolidays = useCallback(async () => {
    setLoadingHolidays(true);
    setError(null);
    setLoaded(false);
    setRawHolidays([]);

    try {
      let raw: NagerHoliday[];

      if (selectedCountry === 'MY') {
        // Malaysia: use our backend proxy (scrapes officeholidays.com)
        const params = new URLSearchParams({ year: String(selectedYear) });
        if (selectedRegion) params.set('state', selectedRegion);
        const res = await fetch(
          `${BACKEND_BASE}/admin/v1/holidays/MY?${params}`,
          { headers: getHeaders() }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        raw = data.holidays ?? [];

        // For Malaysia, regions are always the 16 states
        setAvailableRegions(
          MY_STATE_CODES.sort((a, b) => regionName(a).localeCompare(regionName(b)))
        );
      } else {
        // All other countries: use Nager.Date — read as text to guard empty bodies
        const res = await fetch(`${NAGER_BASE}/PublicHolidays/${selectedYear}/${selectedCountry}`);
        const text = res.ok ? await res.text() : '';
        if (!text.trim().startsWith('[')) {
          throw new Error(
            `No holiday data available for ${selectedCountry} in ${selectedYear}. ` +
            `This country may not be supported by Nager.Date.`
          );
        }
        raw = JSON.parse(text) as NagerHoliday[];

        // Derive available regions from county codes in the response
        const allCounties = new Set<string>();
        for (const h of raw) {
          if (h.counties) for (const c of h.counties) allCounties.add(c);
        }
        setAvailableRegions(
          [...allCounties].sort((a, b) => regionName(a).localeCompare(regionName(b)))
        );
      }

      if (raw.length === 0) {
        setLoaded(true);
        return;
      }

      // Merge with saved overrides (saved value takes priority for is_open toggle)
      setRawHolidays(raw.map(h => ({
        ...h,
        is_open: savedOverrides.has(h.date) ? savedOverrides.get(h.date)! : false,
      })));

      setLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load holidays');
    } finally {
      setLoadingHolidays(false);
    }
  }, [selectedCountry, selectedYear, selectedRegion, savedOverrides]);

  // ── Toggle / bulk actions ─────────────────────────────────────────────────

  const toggleHoliday = (date: string, is_open: boolean) => {
    setRawHolidays(prev => prev.map(h => h.date === date ? { ...h, is_open } : h));
    setSuccess(false);
  };

  const markAll = (is_open: boolean) => {
    // Only affect the currently displayed (filtered) holidays
    const displayedDates = new Set(displayedHolidays.map(h => h.date));
    setRawHolidays(prev => prev.map(h => displayedDates.has(h.date) ? { ...h, is_open } : h));
    setSuccess(false);
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (displayedHolidays.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(
        `${BACKEND_BASE}/admin/v1/branches/${branchId}/holiday-settings`,
        {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            countryCode: selectedCountry,
            regionCode: selectedRegion || null,
            holidays: displayedHolidays.map(h => ({ date: h.date, is_open: h.is_open, name: h.name })),
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // Update local saved-overrides map
      const newMap = new Map(savedOverrides);
      for (const h of displayedHolidays) newMap.set(h.date, h.is_open);
      setSavedOverrides(newMap);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save holidays');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
  const savedCount = displayedHolidays.filter(h => savedOverrides.has(h.date)).length;
  const nationwideCount = displayedHolidays.filter(h => isNationwide(h)).length;
  const stateCount = displayedHolidays.filter(h => !isNationwide(h)).length;

  return (
    <div className="form-section" style={{ marginTop: 32 }}>
      <h3 style={{ marginBottom: 4 }}>Public Holidays</h3>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
        Fetch public holidays from the open-source{' '}
        <a href="https://date.nager.at" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
          Nager.Date
        </a>{' '}
        registry (100+ countries) and mark each as open or closed for your business.
        Saved holidays override the weekly schedule on those specific dates.
      </p>

      {countriesError && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
          {countriesError}
        </div>
      )}

      {/* ── Selectors ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14, marginBottom: 16 }}>

        {/* Year */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Year</label>
          <select
            value={selectedYear}
            onChange={e => { setSelectedYear(Number(e.target.value)); setLoaded(false); setRawHolidays([]); }}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Country */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Country</label>
          <select
            value={selectedCountry}
            onChange={e => {
              setSelectedCountry(e.target.value);
              setSelectedRegion('');
              setLoaded(false);
              setRawHolidays([]);
              setAvailableRegions([]);
            }}
            disabled={loadingCountries}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          >
            {loadingCountries
              ? <option>Loading…</option>
              : countries.map(c => <option key={c.countryCode} value={c.countryCode}>{c.name}</option>)
            }
          </select>
        </div>

        {/* Region / State */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
            State / Region
            <span style={{ fontWeight: 400, marginLeft: 4, color: '#94a3b8' }}>(optional)</span>
          </label>
          <select
            value={selectedRegion}
            onChange={e => {
              setSelectedRegion(e.target.value);
              // For Malaysia, state changes affect which holidays the backend returns;
              // reset loaded so the user re-clicks Load Holidays to get the new set.
              if (selectedCountry === 'MY') { setLoaded(false); setRawHolidays([]); }
              setSuccess(false);
            }}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          >
            <option value="">All holidays (no filter)</option>
            {availableRegions.map(r => (
              <option key={r} value={r}>{regionName(r)}</option>
            ))}
          </select>
          {loaded && availableRegions.length === 0 && selectedCountry !== 'MY' && (
            <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>No state-specific holidays for this country</span>
          )}
          {selectedCountry === 'MY' && (
            <span style={{ fontSize: 11, color: '#3b82f6', marginTop: 4, display: 'block' }}>
              {selectedRegion
                ? 'Reload after changing state to fetch state-specific holidays'
                : 'Select a state then click Load Holidays to include state-specific dates'}
            </span>
          )}
          {loaded && availableRegions.length > 0 && !selectedRegion && selectedCountry !== 'MY' && (
            <span style={{ fontSize: 11, color: '#3b82f6', marginTop: 4, display: 'block' }}>
              Select a state to see state-specific holidays too
            </span>
          )}
        </div>

        {/* Load button */}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            type="button"
            onClick={loadHolidays}
            disabled={loadingHolidays || loadingCountries}
            style={{
              width: '100%', padding: '9px 14px', borderRadius: 6, border: 'none',
              background: loadingHolidays ? '#94a3b8' : '#1d4ed8',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loadingHolidays ? 'not-allowed' : 'pointer',
            }}
          >
            {loadingHolidays ? 'Loading…' : 'Load Holidays'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#dc2626', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* ── Holiday Table ───────────────────────────────────────────────── */}
      {loaded && displayedHolidays.length === 0 && (
        <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          No public holidays found for <strong>{selectedCountry}</strong> in <strong>{selectedYear}</strong>.
          This country may not yet be supported by Nager.Date.
        </div>
      )}

      {displayedHolidays.length > 0 && (
        <>
          {/* Summary + bulk actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              <strong>{displayedHolidays.length}</strong> holiday{displayedHolidays.length !== 1 ? 's' : ''}
              {selectedRegion
                ? <> — {nationwideCount} nationwide + {stateCount} for {regionName(selectedRegion)}</>
                : <> — all states</>
              }
              {savedCount > 0 && (
                <span style={{ marginLeft: 8, padding: '2px 8px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                  {savedCount} saved
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => markAll(true)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid #d1d5db', background: '#f0fdf4', color: '#166534', cursor: 'pointer' }}>
                Mark All Open
              </button>
              <button type="button" onClick={() => markAll(false)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                Mark All Closed
              </button>
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Holiday</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: 110 }}>Applies To</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayedHolidays.map((h, idx) => {
                  const isSaved = savedOverrides.has(h.date);
                  const nationwide = isNationwide(h);
                  return (
                    <tr key={h.date} style={{ borderBottom: idx < displayedHolidays.length - 1 ? '1px solid #e2e8f0' : 'none', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDate(h.date)}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#1e293b', fontWeight: 500 }}>
                        {h.name}
                        {h.localName !== h.name && (
                          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginTop: 1 }}>{h.localName}</div>
                        )}
                        {isSaved && (
                          <span style={{ marginLeft: 6, padding: '1px 6px', background: '#dcfce7', color: '#166534', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>SAVED</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>
                        {nationwide
                          ? <span style={{ color: '#0369a1', fontWeight: 500 }}>Nationwide</span>
                          : h.counties!.map(c => regionName(c)).join(', ')
                        }
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                          <button
                            type="button"
                            onClick={() => toggleHoliday(h.date, true)}
                            style={{
                              padding: '5px 14px', fontSize: 12, fontWeight: 600, border: 'none',
                              background: h.is_open ? '#10b981' : '#f1f5f9',
                              color: h.is_open ? '#fff' : '#64748b',
                              cursor: 'pointer', transition: 'all 0.15s',
                            }}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleHoliday(h.date, false)}
                            style={{
                              padding: '5px 14px', fontSize: 12, fontWeight: 600, border: 'none',
                              borderLeft: '1px solid #e2e8f0',
                              background: !h.is_open ? '#ef4444' : '#f1f5f9',
                              color: !h.is_open ? '#fff' : '#64748b',
                              cursor: 'pointer', transition: 'all 0.15s',
                            }}
                          >
                            Closed
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Save bar */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '9px 24px', borderRadius: 8, border: 'none',
                background: saving ? '#94a3b8' : '#1d4ed8',
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : `Save Holiday Schedule (${displayedHolidays.length})`}
            </button>
            {success && (
              <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                Holiday schedule saved successfully
              </span>
            )}
            {error && (
              <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
