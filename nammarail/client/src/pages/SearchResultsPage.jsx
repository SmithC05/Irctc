// =============================================================================
// NammaRail — Search Results Page
// =============================================================================
//
// SKELETON LOADING vs SPINNER:
// ─────────────────────────────────────────────────────────────────────────────
// A spinner says "something is loading, no idea what or how many items".
// A skeleton says "here are roughly 3 train cards loading right now".
// Skeleton loading reduces perceived wait time because users can see the
// layout taking shape before content arrives — their brain starts reading
// the structure, making the actual content feel like it "fills in" quickly.
// Use skeleton loading for lists/grids. Use spinners for single-value lookups.
//
// useSearchParams:
// ─────────────────────────────────────────────────────────────────────────────
// React Router's hook for reading ?key=value pairs from the URL.
// Returns a URLSearchParams object. Call .get('key') to read values.
// This means users can bookmark /search-results?from=MAS&to=CBE&date=...
// and land directly on their search — the URL IS the state.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchTrains } from '../api/trainApi';
import TrainCard from '../components/trains/TrainCard';
import Layout from '../components/layout/Layout';

import TrainLoader from '../components/ui/TrainLoader';

/**
 * Converts raw availability object from the API into display-ready data.
 * Used for filtering and sorting logic locally.
 */
function buildAvailBadge(avail, trainPhase, fare) {
  if (!avail) return { label: 'N/A', color: 'bg-gray-100 text-gray-400', isRegret: true, fare: null };

  if (trainPhase === 'CHART_PREPARED' && avail.CURR_AVL) {
    const n = avail.CURR_AVL.available;
    if (n > 0)
      return { label: `CURR_AVL ${n}`, color: 'bg-teal-600 text-white', isRegret: false, fare };
    return { label: 'CURR_AVL 0', color: 'bg-gray-400 text-white', isRegret: true, fare: null };
  }

  if (avail.CNF?.available > 0)
    return { label: `AVAIL-${avail.CNF.available}`, color: 'bg-green-600 text-white', isRegret: false, fare };
  if (avail.RAC?.available > 0)
    return { label: `RAC/${avail.RAC.available}`, color: 'bg-amber-600 text-white', isRegret: false, fare };
  if (avail.WL?.current > 0)
    return { label: `WL/${avail.WL.current}`, color: 'bg-red-600 text-white', isRegret: false, fare };

  return { label: 'REGRET', color: 'text-gray-500 bg-gray-100 dark:bg-gray-800', isRegret: true, fare: null };
}

// ─── Filter Panel content ─────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'departure', label: 'Departure Time' },
  { value: 'duration',  label: 'Journey Duration' },
  { value: 'fare',      label: 'Fare (Low to High)' },
];
const CLASS_OPTIONS = ['SL', '3A', '2A', '1A', 'CC'];
const TRAIN_TYPES = ['Express / Superfast', 'Shatabdi', 'Rajdhani', 'Vande Bharat', 'Special'];
const QUOTA_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'tatkal', label: 'Tatkal' },
  { value: 'ladies', label: 'Ladies' },
];

function FilterSection({ title, children }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-bold uppercase mb-2" style={{ color: 'var(--text-primary)' }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function FilterContent({ filters, onChange }) {
  function toggle(key, value) {
    onChange(key, value);
  }

  function toggleArrayItem(key, val) {
    const arr = filters[key] || [];
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    toggle(key, next);
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <FilterSection title="Sort By">
        {SORT_OPTIONS.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 mb-1.5 cursor-pointer">
            <input
              type="radio"
              name="sortBy"
              value={opt.value}
              checked={filters.sortBy === opt.value}
              onChange={() => toggle('sortBy', opt.value)}
              style={{ accentColor: 'var(--brand)' }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>{opt.label}</span>
          </label>
        ))}
      </FilterSection>

      <FilterSection title="Journey Class">
        {CLASS_OPTIONS.map(cls => (
          <label key={cls} className="flex items-center gap-2 mb-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={(filters.selectedClasses || []).includes(cls)}
              onChange={() => toggleArrayItem('selectedClasses', cls)}
              style={{ accentColor: 'var(--brand)' }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>{cls}</span>
          </label>
        ))}
      </FilterSection>

      <FilterSection title="Train Type">
        {TRAIN_TYPES.map(type => (
          <label key={type} className="flex items-center gap-2 mb-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={(filters.selectedTypes || []).includes(type)}
              onChange={() => toggleArrayItem('selectedTypes', type)}
              style={{ accentColor: 'var(--brand)' }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>{type}</span>
          </label>
        ))}
      </FilterSection>

      <FilterSection title="Quota">
        {QUOTA_OPTIONS.map(q => (
          <label key={q.value} className="flex items-center gap-2 mb-1.5 cursor-pointer">
            <input
              type="radio"
              name="quotaFilter"
              value={q.value}
              checked={filters.quota === q.value}
              onChange={() => toggle('quota', q.value)}
              style={{ accentColor: 'var(--brand)' }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>{q.label}</span>
          </label>
        ))}
      </FilterSection>

      <FilterSection title="Availability">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!filters.showAvailableOnly}
            onChange={() => toggle('showAvailableOnly', !filters.showAvailableOnly)}
            style={{ accentColor: 'var(--brand)' }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>Available trains only</span>
        </label>
      </FilterSection>
    </div>
  );
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

function FilterSidebar({ filters, onChange }) {
  return (
    <aside className="hidden lg:block lg:w-60 shrink-0">
      <div className="card p-4 sticky top-4">
        {/* sticky top-4: the card follows the viewport as you scroll.
            IMPORTANT: sticky only works when the parent does NOT have overflow:hidden. */}
        <p className="font-bold text-sm mb-4 pb-3 border-b border-gray-200 dark:border-gray-700" style={{ color: 'var(--text-primary)' }}>Filters</p>
        <FilterContent filters={filters} onChange={onChange} />
      </div>
    </aside>
  );
}

// ─── Mobile Filter Drawer ─────────────────────────────────────────────────────
// A "drawer" is a panel that slides in from the bottom of the screen.
// It uses position:fixed so it overlays all page content.
// z-index:50 keeps it above the Navbar (z-index:50 on sticky nav).
// The semi-transparent backdrop behind it closes the drawer on click.

function MobileFilterDrawer({ open, onClose, filters, onChange }) {
  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between mb-5">
          <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Filters</p>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: 'var(--text-tertiary)' }}>×</button>
        </div>
        <FilterContent filters={filters} onChange={onChange} />
        <button onClick={onClose} className="btn-primary w-full mt-4">Apply Filters</button>
      </div>
    </>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ from, to }) {
  return (
    <div className="card p-10 text-center">
      <svg className="w-20 h-20 mx-auto mb-4 opacity-30" viewBox="0 0 80 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="15" width="70" height="20" rx="4" fill="currentColor"/>
        <rect x="2" y="22" width="6" height="8" rx="1" fill="currentColor" opacity=".6"/>
        <rect x="72" y="22" width="6" height="8" rx="1" fill="currentColor" opacity=".6"/>
        <circle cx="18" cy="35" r="5" fill="white" stroke="currentColor" strokeWidth="2"/>
        <circle cx="62" cy="35" r="5" fill="white" stroke="currentColor" strokeWidth="2"/>
        <rect x="15" y="5" width="12" height="10" rx="2" fill="currentColor" opacity=".4"/>
        <rect x="35" y="5" width="12" height="10" rx="2" fill="currentColor" opacity=".4"/>
      </svg>
      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No trains found</h3>
      <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
        No trains found between <strong>{from}</strong> and <strong>{to}</strong>.
      </p>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        Try a different date or check the station codes.
      </p>
    </div>
  );
}

// ─── Apply sorting & filtering ────────────────────────────────────────────────

function getAvailableClasses(train) {
  const CLASS_ORDER = ['SL', '3A', '2A', '1A', 'CC', '2S'];
  let classes = CLASS_ORDER.filter(c => train.availability?.[c]);
  if (classes.length === 0) {
    if (train.fares && train.fares.length > 0) {
      classes = train.fares.map(f => f.class_code);
    } else {
      classes = ['SL', '3A', '2A'];
    }
  }
  return [...new Set(classes)].sort((a, b) => {
    const idxA = CLASS_ORDER.indexOf(a);
    const idxB = CLASS_ORDER.indexOf(b);
    return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
  });
}

function getFareForClass(t, c, quota) {
  const fareObj = t.fares?.find(f => f.class_code === c);
  if (!fareObj) return null;
  const isTatkal = quota === 'tatkal';
  return isTatkal && fareObj.tatkal_fare > 0 ? fareObj.tatkal_fare : fareObj.total_fare;
}

function applyFilters(trains, filters, searchDate) {
  let list = [...trains];

  // Journey Class filter
  if (filters.selectedClasses?.length > 0) {
    list = list.filter(t => {
      const classes = getAvailableClasses(t);
      return classes.some(c => filters.selectedClasses.includes(c));
    });
  }

  // Filter: showAvailableOnly
  // Keep trains where at least one class on the selected date is not REGRET or WL
  if (filters.showAvailableOnly && searchDate) {
    list = list.filter(t => {
      const classes = getAvailableClasses(t);
      return classes.some(c => {
        const fare = getFareForClass(t, c, filters.quota);
        const avail = t.availability?.[c];
        const badge = buildAvailBadge(avail, t.trainPhase, fare);
        return !badge.isRegret && !badge.label.includes('WL');
      });
    });
  }

  // Filter: Train Type
  if (filters.selectedTypes?.length > 0) {
    list = list.filter(t => {
      let type = t.trainType;
      if (!type) {
        const name = t.trainName.toLowerCase();
        if (name.includes('shatabdi') || name.includes('jan shatabdi')) type = 'Shatabdi';
        else if (name.includes('rajdhani')) type = 'Rajdhani';
        else if (name.includes('vande bharat') || name.includes('vande metro')) type = 'Vande Bharat';
        else if (name.includes('duronto') || name.includes('humsafar') || name.includes('tejas')) type = 'Special';
        else type = 'Express / Superfast';
      }
      return filters.selectedTypes.includes(type);
    });
  }

  // Sort
  list.sort((a, b) => {
    if (filters.sortBy === 'departure') return a.departureTime.localeCompare(b.departureTime);
    if (filters.sortBy === 'duration')  return (a.durationMins ?? 0) - (b.durationMins ?? 0);
    if (filters.sortBy === 'fare') {
      const getMinFare = (t) => {
        if (!searchDate) return Infinity;
        const classes = getAvailableClasses(t);
        let minF = Infinity;
        classes.forEach(c => {
          const fare = getFareForClass(t, c, filters.quota);
          const avail = t.availability?.[c];
          const badge = buildAvailBadge(avail, t.trainPhase, fare);
          if (badge.fare !== null && badge.fare < minF) {
            minF = badge.fare;
          }
        });
        return minF;
      };
      
      const fa = getMinFare(a);
      const fb = getMinFare(b);
      return fa - fb;
    }
    return 0;
  });

  return list;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();

  const from      = searchParams.get('from')     ?? '';
  const to        = searchParams.get('to')       ?? '';
  const date      = searchParams.get('date')     ?? '';
  const classCode = searchParams.get('class')    ?? '';
  // fromName / toName are passed by HomePage so we can display full station names
  // without a second API call. We fall back to station codes if names are missing
  // (e.g. when the user navigates directly via a bookmarked URL).
  const fromName  = searchParams.get('fromName') || from;
  const toName    = searchParams.get('toName')   || to;
  const quota     = searchParams.get('quota')    || 'general';

  const [results,      setResults]   = useState([]);
  const [isLoading,    setLoading]   = useState(true);
  const [error,        setError]     = useState(null);
  const [drawerOpen,   setDrawer]    = useState(false);
  const [filters, setFilters] = useState({
    sortBy: 'departure',
    selectedClasses: [],
    selectedTypes: [],
    quota: searchParams.get('quota') || 'general',
    showAvailableOnly: false,
  });

  // Redirect home if required params are missing
  useEffect(() => {
    if (!from || !to || !date) navigate('/', { replace: true });
  }, [from, to, date, navigate]);

  const fetchTrains = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchTrains(from, to, date, classCode);
      setResults(res.data.trains ?? []);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to load trains. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [from, to, date, classCode]);

  useEffect(() => { fetchTrains(); }, [fetchTrains]);

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  const displayed = applyFilters(results, filters, date);

  // Format the date for display, e.g. "Mon, 15 Jun 2026"
  const dateLabel = date
    ? new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {fromName} → {toName}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {dateLabel}
            {classCode ? ` · ${classCode}` : ' · All classes'}
            {quota === 'tatkal' ? ' · ⚡ Tatkal' : ' · General'}
            {' · '}
            {isLoading ? '…' : `${displayed.length} train${displayed.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Modify Search button */}
          <button 
            onClick={() => {
              const params = new URLSearchParams({
                from,
                to,
                fromName,
                toName,
                date,
                quota,
              });
              navigate(`/?${params.toString()}`);
            }} 
            className="btn-outline text-sm px-4 py-2"
          >
            Modify Search
          </button>

          {/* Mobile: filter button */}
          <button
            onClick={() => setDrawer(true)}
            className="lg:hidden btn-primary text-sm flex items-center gap-2 px-4 py-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 10h12M10 16h4"/>
            </svg>
            Filters
          </button>
        </div>
      </div>

      {/* Main layout: sidebar + cards */}
      <div className="flex flex-col lg:flex-row gap-5">
        <FilterSidebar filters={filters} onChange={handleFilterChange} />

        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Loading state */}
          {isLoading && (
            <div className="card p-10">
              <TrainLoader size="large" message="Searching for trains" />
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="card p-6 text-center">
              <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
              <button onClick={fetchTrains} className="btn-primary text-sm">Retry</button>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !error && displayed.length === 0 && (
            <EmptyState from={from} to={to} />
          )}

          {/* Results */}
          {!isLoading && !error && displayed.map(train => (
            <TrainCard
              key={train.trainNumber}
              train={train}
              searchedClass={classCode}
              searchDate={date}
              quota={quota}
            />
          ))}
        </div>
      </div>

      {/* Mobile filter drawer */}
      <MobileFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawer(false)}
        filters={filters}
        onChange={handleFilterChange}
      />
    </Layout>
  );
}
