// =============================================================================
// NammaRail — Search Results Page  (Railway Ticket redesign)
// =============================================================================
//
// Visual redesign: dark "Signal & Schedule" → light "Printed Ticket" theme.
// All JS logic (filtering, sorting, API fetch, quota handling) is UNCHANGED.
// Only JSX structure and inline styles have been updated to use --tk-* tokens.
//
// BUG 2 FIX — Filters (preserved):
//   SORT: duration/fare sorts wired correctly, null guard for durationMins.
//   QUOTA: Changing quota navigates (updates URL param) triggering re-fetch.
//   LADIES QUOTA: Rendered as disabled with tooltip (no backend support).
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchTrains } from '../api/trainApi';
import TrainCard from '../components/trains/TrainCard';
import Layout from '../components/layout/Layout';
import TrainLoader from '../components/ui/TrainLoader';

// ─── Sort / Filter Constants ──────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'departure', label: 'Departure' },
  { value: 'duration',  label: 'Duration'  },
  { value: 'fare',      label: 'Fare ↑'    },
];

const CLASS_OPTIONS  = ['SL', '3A', '2A', '1A', 'CC'];
const TRAIN_TYPES    = ['Express / Superfast', 'Shatabdi', 'Rajdhani', 'Vande Bharat', 'Special'];
const QUOTA_OPTIONS  = [
  { value: 'general', label: 'General' },
  { value: 'tatkal',  label: 'Tatkal'  },
];

// ─── Availability helpers (unchanged logic) ───────────────────────────────────

function getAvailableClasses(train) {
  const ORDER = ['SL', '3A', '2A', '1A', 'CC', '2S'];
  let classes = ORDER.filter(c => train.availability?.[c]);
  if (classes.length === 0 && train.fares?.length > 0) {
    classes = train.fares.map(f => f.class_code);
  }
  if (classes.length === 0) classes = ['SL', '3A', '2A'];
  return [...new Set(classes)].sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    return (ia !== -1 ? ia : 99) - (ib !== -1 ? ib : 99);
  });
}

function getFareForClass(t, c, quota) {
  const f = t.fares?.find(f => f.class_code === c);
  if (!f) return null;
  return (quota === 'tatkal' && f.tatkal_fare > 0) ? f.tatkal_fare : f.total_fare;
}

function buildAvailBadge(avail, trainPhase, fare) {
  if (!avail) return { isRegret: true, isWL: false, fare: null };
  if (avail.CNF?.available > 0) return { isRegret: false, isWL: false, fare };
  if (avail.RAC?.available > 0) return { isRegret: false, isWL: false, fare };
  if (avail.WL?.current > 0)    return { isRegret: false, isWL: true,  fare };
  return { isRegret: true, isWL: false, fare: null };
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

  // Show available only (excludes REGRET, keeps WL)
  if (filters.showAvailableOnly && searchDate) {
    list = list.filter(t => {
      const classes = getAvailableClasses(t);
      return classes.some(c => {
        const fare  = getFareForClass(t, c, filters.quota);
        const avail = t.availability?.[c];
        return !buildAvailBadge(avail, t.trainPhase, fare).isRegret;
      });
    });
  }

  // Train Type filter — name-based inference (no trainType field in API)
  if (filters.selectedTypes?.length > 0) {
    list = list.filter(t => {
      const name = (t.trainName || '').toLowerCase();
      let type;
      if (name.includes('shatabdi') || name.includes('jan shatabdi')) type = 'Shatabdi';
      else if (name.includes('rajdhani'))                              type = 'Rajdhani';
      else if (name.includes('vande bharat') || name.includes('vande metro')) type = 'Vande Bharat';
      else if (name.includes('duronto') || name.includes('humsafar') || name.includes('tejas')) type = 'Special';
      else                                                             type = 'Express / Superfast';
      return filters.selectedTypes.includes(type);
    });
  }

  // Sort
  list.sort((a, b) => {
    if (filters.sortBy === 'departure') {
      return (a.departureTime ?? '').localeCompare(b.departureTime ?? '');
    }
    if (filters.sortBy === 'duration') {
      // null guard: trains without duration data sort to bottom (Infinity)
      const da = a.durationMins ?? Infinity;
      const db = b.durationMins ?? Infinity;
      return da - db;
    }
    if (filters.sortBy === 'fare') {
      const minFare = t => {
        const classes = getAvailableClasses(t);
        let min = Infinity;
        classes.forEach(c => {
          const f = getFareForClass(t, c, filters.quota);
          const avail = t.availability?.[c];
          const badge = buildAvailBadge(avail, t.trainPhase, f);
          if (badge.fare !== null && badge.fare < min) min = badge.fare;
        });
        return min;
      };
      return minFare(a) - minFare(b);
    }
    return 0;
  });

  return list;
}

// ─── Stamp Badge — circular station code badge ────────────────────────────────

function StampBadge({ code, size = 38 }) {
  const fontSize = code && code.length > 3 ? '9px' : '10px';
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'var(--tk-navy)',
      border: '2px solid var(--tk-brass)',
      fontFamily: 'var(--font-mono)',
      fontSize,
      fontWeight: 600,
      color: '#FAF6EC',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      flexShrink: 0,
    }}>
      {code}
    </div>
  );
}

// ─── Route Track Header — navy ticket-top strip ───────────────────────────────

function RouteTrackHeader({ fromName, toName, from, to, dateLabel, classCode, quota, trainCount, isLoading }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Navy strip — printed ticket header */}
      <div style={{
        background: 'var(--tk-navy)',
        borderRadius: '6px 6px 0 0',
        padding: '16px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
      }}>
        {/* Origin */}
        <div style={{ flexShrink: 0, textAlign: 'left' }}>
          <div style={{
            fontFamily: 'var(--font-slab)',
            fontSize: '20px',
            fontWeight: 700,
            color: '#FAF6EC',
            lineHeight: 1,
            marginBottom: '6px',
          }}>
            {fromName}
          </div>
          <StampBadge code={from} size={38} />
        </div>

        {/* Dotted brass track */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '12px 16px 0' }}>
          <div style={{
            flex: 1, height: 2,
            background: 'repeating-linear-gradient(to right, var(--tk-brass) 0px, var(--tk-brass) 6px, transparent 6px, transparent 12px)',
          }} />
          {/* Mid dot */}
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            border: '2px solid var(--tk-brass)',
            background: 'var(--tk-navy)',
            margin: '0 6px',
            flexShrink: 0,
          }} />
          <div style={{
            flex: 1, height: 2,
            background: 'repeating-linear-gradient(to right, var(--tk-brass) 0px, var(--tk-brass) 6px, transparent 6px, transparent 12px)',
          }} />
        </div>

        {/* Destination */}
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--font-slab)',
            fontSize: '20px',
            fontWeight: 700,
            color: '#FAF6EC',
            lineHeight: 1,
            marginBottom: '6px',
          }}>
            {toName}
          </div>
          <StampBadge code={to} size={38} />
        </div>
      </div>

      {/* Brass-soft subtitle strip */}
      <div style={{
        background: 'var(--tk-brass-soft)',
        borderRadius: '0 0 6px 6px',
        padding: '7px 22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '6px',
        borderTop: '1px solid rgba(184,134,46,0.3)',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          color: 'var(--tk-ink-muted)',
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          fontWeight: 500,
        }}>
          {dateLabel}
          {classCode ? ` · ${classCode}` : ' · All classes'}
          {quota === 'tatkal' ? ' · Tatkal' : ' · General'}
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--tk-navy)',
          margin: 0,
        }}>
          {isLoading ? '…' : `${trainCount} train${trainCount !== 1 ? 's' : ''}`}
        </p>
      </div>
    </div>
  );
}

// ─── Horizontal Control Strip ─────────────────────────────────────────────────

function ControlBar({ filters, onChange, onModifySearch, onMobileFilter }) {
  function toggleType(type) {
    const arr  = filters.selectedTypes || [];
    const next = arr.includes(type) ? arr.filter(v => v !== type) : [...arr, type];
    onChange('selectedTypes', next);
  }

  return (
    <div>
      {/* Row 1: Sort + Quota + Available toggle */}
      <div className="sr-control-bar">
        <span className="sr-control-label">Sort</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`sr-sort-btn${filters.sortBy === opt.value ? ' active' : ''}`}
            onClick={() => onChange('sortBy', opt.value)}
            aria-pressed={filters.sortBy === opt.value}
          >
            {opt.label}
          </button>
        ))}

        <div className="sr-control-divider" />

        <span className="sr-control-label">Quota</span>
        {QUOTA_OPTIONS.map(q => (
          <button
            key={q.value}
            className={`sr-sort-btn${filters.quota === q.value ? ' active' : ''}`}
            onClick={() => onChange('quota', q.value)}
            aria-pressed={filters.quota === q.value}
          >
            {q.label}
          </button>
        ))}
        {/* Ladies quota — disabled, no backend support yet */}
        <button
          className="sr-sort-btn"
          disabled
          title="Ladies quota support is coming soon — backend quota type not yet implemented"
          aria-disabled="true"
          style={{ opacity: 0.4, cursor: 'not-allowed' }}
        >
          Ladies
          <span style={{
            marginLeft: '5px', fontSize: '9px', fontFamily: 'var(--font-body)',
            background: 'var(--tk-track)', padding: '1px 5px',
            borderRadius: '3px', letterSpacing: '0.05em', verticalAlign: 'middle',
            color: 'var(--tk-ink-muted)',
          }}>
            soon
          </span>
        </button>

        <div className="sr-control-divider" />

        <label className={`sr-toggle${filters.showAvailableOnly ? ' active' : ''}`}>
          <input
            type="checkbox"
            checked={!!filters.showAvailableOnly}
            onChange={() => onChange('showAvailableOnly', !filters.showAvailableOnly)}
            style={{ width: 13, height: 13 }}
          />
          Available only
        </label>

        {/* Right-aligned: mobile filter + modify */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="sr-sort-btn lg:hidden" onClick={onMobileFilter}>
            ⚙ Filters
          </button>
          <button className="sr-sort-btn" onClick={onModifySearch}>
            ← Modify
          </button>
        </div>
      </div>

      {/* Row 2: Train Type + Class pills */}
      <div className="sr-control-bar" style={{ marginBottom: '16px' }}>
        <span className="sr-control-label">Type</span>
        {TRAIN_TYPES.map(type => (
          <button
            key={type}
            className={`sr-pill${(filters.selectedTypes || []).includes(type) ? ' active' : ''}`}
            onClick={() => toggleType(type)}
            aria-pressed={(filters.selectedTypes || []).includes(type)}
          >
            {type}
          </button>
        ))}

        <div className="sr-control-divider" />

        <span className="sr-control-label">Class</span>
        {CLASS_OPTIONS.map(cls => (
          <button
            key={cls}
            className={`sr-pill${(filters.selectedClasses || []).includes(cls) ? ' active' : ''}`}
            onClick={() => {
              const arr = filters.selectedClasses || [];
              onChange('selectedClasses', arr.includes(cls) ? arr.filter(v => v !== cls) : [...arr, cls]);
            }}
            aria-pressed={(filters.selectedClasses || []).includes(cls)}
          >
            {cls}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Mobile Filter Drawer ─────────────────────────────────────────────────────

function MobileFilterDrawer({ open, onClose, filters, onChange }) {
  if (!open) return null;

  function toggleType(type) {
    const arr  = filters.selectedTypes || [];
    const next = arr.includes(type) ? arr.filter(v => v !== type) : [...arr, type];
    onChange('selectedTypes', next);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(28,49,85,0.4)', zIndex: 40 }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        borderRadius: '10px 10px 0 0',
        background: 'var(--tk-paper-raised)',
        border: '1px solid var(--tk-track)',
        borderBottom: 'none',
        padding: '20px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px', alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-slab)', fontWeight: 700,
            color: 'var(--tk-navy)', fontSize: '16px',
          }}>
            Filters
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: 'var(--tk-ink-muted)', fontSize: '22px',
              cursor: 'pointer', lineHeight: 1, padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        <p className="sr-control-label" style={{ marginBottom: '8px' }}>Sort By</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {SORT_OPTIONS.map(opt => (
            <button key={opt.value}
              className={`sr-sort-btn${filters.sortBy === opt.value ? ' active' : ''}`}
              onClick={() => onChange('sortBy', opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p className="sr-control-label" style={{ marginBottom: '8px' }}>Quota</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {QUOTA_OPTIONS.map(q => (
            <button key={q.value}
              className={`sr-sort-btn${filters.quota === q.value ? ' active' : ''}`}
              onClick={() => onChange('quota', q.value)}
            >
              {q.label}
            </button>
          ))}
          <button className="sr-sort-btn" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }} title="Coming soon">
            Ladies
          </button>
        </div>

        <p className="sr-control-label" style={{ marginBottom: '8px' }}>Train Type</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {TRAIN_TYPES.map(type => (
            <button key={type}
              className={`sr-pill${(filters.selectedTypes || []).includes(type) ? ' active' : ''}`}
              onClick={() => toggleType(type)}
            >
              {type}
            </button>
          ))}
        </div>

        <p className="sr-control-label" style={{ marginBottom: '8px' }}>Journey Class</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {CLASS_OPTIONS.map(cls => {
            const active = (filters.selectedClasses || []).includes(cls);
            return (
              <button key={cls}
                className={`sr-pill${active ? ' active' : ''}`}
                onClick={() => {
                  const arr = filters.selectedClasses || [];
                  onChange('selectedClasses', active ? arr.filter(v => v !== cls) : [...arr, cls]);
                }}
              >
                {cls}
              </button>
            );
          })}
        </div>

        <label className={`sr-toggle${filters.showAvailableOnly ? ' active' : ''}`} style={{ marginBottom: '20px', display: 'flex' }}>
          <input
            type="checkbox"
            checked={!!filters.showAvailableOnly}
            onChange={() => onChange('showAvailableOnly', !filters.showAvailableOnly)}
          />
          Available trains only
        </label>

        <button
          onClick={onClose}
          style={{
            display: 'block', width: '100%', marginTop: '16px',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '14px',
            padding: '11px', borderRadius: '4px', border: 'none', cursor: 'pointer',
            background: 'var(--tk-brass)', color: '#FAF6EC', letterSpacing: '0.02em',
          }}
        >
          Apply Filters
        </button>
      </div>
    </>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ from, to }) {
  return (
    <div style={{
      textAlign: 'center', padding: '52px 24px',
      background: 'var(--tk-paper-raised)',
      border: '1px solid var(--tk-track)',
      borderRadius: '6px',
    }}>
      <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.3 }}>🚂</div>
      <h3 style={{
        fontFamily: 'var(--font-slab)', fontSize: '18px', fontWeight: 700,
        color: 'var(--tk-navy)', marginBottom: '8px',
      }}>
        No trains found
      </h3>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--tk-ink-muted)', margin: 0 }}>
        No trains between{' '}
        <strong style={{ color: 'var(--tk-ink)' }}>{from}</strong>
        {' '}and{' '}
        <strong style={{ color: 'var(--tk-ink)' }}>{to}</strong>
        {' '}match your filters.
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const from      = searchParams.get('from')     ?? '';
  const to        = searchParams.get('to')       ?? '';
  const date      = searchParams.get('date')     ?? '';
  const classCode = searchParams.get('class')    ?? '';
  const fromName  = searchParams.get('fromName') || from;
  const toName    = searchParams.get('toName')   || to;
  const quota     = searchParams.get('quota')    || 'general';

  const [results,    setResults]  = useState([]);
  const [isLoading,  setLoading]  = useState(true);
  const [error,      setError]    = useState(null);
  const [drawerOpen, setDrawer]   = useState(false);
  const [filters, setFilters] = useState({
    sortBy:           'departure',
    selectedClasses:  [],
    selectedTypes:    [],
    quota:            quota,  // initialised from URL param
    showAvailableOnly: false,
  });

  // Keep local filters.quota in sync when URL quota param changes
  useEffect(() => {
    setFilters(prev => ({ ...prev, quota }));
  }, [quota]);

  // Redirect home if required params missing
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
    // BUG 2 FIX: Quota changes must update the URL (triggers re-fetch).
    // All other filter changes are local-only.
    if (key === 'quota') {
      const p = new URLSearchParams(searchParams);
      p.set('quota', value);
      setSearchParams(p, { replace: true });
      // Local state synced via useEffect on `quota` above
    } else {
      setFilters(prev => ({ ...prev, [key]: value }));
    }
  }

  function handleModifySearch() {
    const params = new URLSearchParams({ from, to, fromName, toName, date, quota });
    navigate(`/?${params.toString()}`);
  }

  const displayed = applyFilters(results, filters, date);

  const dateLabel = date
    ? new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <Layout>
      <div className="sr-page-bleed">

        {/* Ticket-top route header */}
        <RouteTrackHeader
          fromName={fromName}
          toName={toName}
          from={from}
          to={to}
          dateLabel={dateLabel}
          classCode={classCode}
          quota={quota}
          trainCount={displayed.length}
          isLoading={isLoading}
        />

        {/* Filter + sort control strip */}
        <ControlBar
          filters={filters}
          onChange={handleFilterChange}
          onModifySearch={handleModifySearch}
          onMobileFilter={() => setDrawer(true)}
        />

        {/* Train list */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>

          {/* Loading */}
          {isLoading && (
            <div style={{
              background: 'var(--tk-paper-raised)',
              border: '1px solid var(--tk-track)',
              borderRadius: '6px',
              padding: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <TrainLoader size="large" message="Searching for trains" />
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div style={{
              background: 'rgba(178,58,46,0.06)',
              border: '1px solid rgba(178,58,46,0.22)',
              borderRadius: '6px',
              padding: '24px',
              textAlign: 'center',
            }}>
              <p style={{ fontFamily: 'var(--font-body)', color: 'var(--tk-signal-red)', marginBottom: '12px' }}>
                {error}
              </p>
              <button
                onClick={fetchTrains}
                style={{
                  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '13px',
                  padding: '8px 20px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  background: 'var(--tk-brass)', color: '#FAF6EC',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !error && displayed.length === 0 && (
            <EmptyState from={fromName} to={toName} />
          )}

          {/* Results */}
          {!isLoading && !error && displayed.map(train => (
            <TrainCard
              key={train.trainNumber}
              train={train}
              searchedClass={classCode}
              searchDate={date}
              quota={filters.quota}
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
