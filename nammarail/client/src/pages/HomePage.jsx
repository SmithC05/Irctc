// =============================================================================
// NammaRail — Home Page (Train Search)
// =============================================================================
//
// MOBILE-FIRST CSS APPROACH:
// ─────────────────────────────────────────────────────────────────────────────
// Write base styles for the smallest screen (mobile), then use responsive
// prefixes to override for larger screens:
//   md: = 768px and above (tablets)
//   lg: = 1024px and above (desktop)
//
// Example: className="px-4 md:px-8" means 16px padding on mobile, 32px on tablet+.
// This is better than "desktop-first + overrides" because most web traffic
// is on mobile — start with the constrained case, expand for more space.
//
// DATE INPUT MIN/MAX:
// ─────────────────────────────────────────────────────────────────────────────
// date inputs accept "min" and "max" as YYYY-MM-DD strings.
// We calculate:
//   min = today (can't book in the past)
//   max = today + 60 days (IRCTC's Advance Reservation Period)
// We use toISOString().slice(0,10) to get "2026-06-15" from a Date object.
// =============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getMaxDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString().slice(0, 10);
}

// ─── Swap Icon ────────────────────────────────────────────────────────────────
function SwapIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

// ─── Search Card ──────────────────────────────────────────────────────────────
function SearchForm({ form, onChange, onSwap, onSubmit, error }) {
  return (
    <form
      onSubmit={onSubmit}
      className="card p-6 md:p-8 flex flex-col gap-5"
    >
      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        Find Your Train
      </h2>

      {/* From / Swap / To */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
        <div className="flex-1">
          <label className="form-label">From</label>
          <input
            id="from-station"
            name="from"
            value={form.from}
            onChange={onChange}
            placeholder="e.g. MAS"
            className="form-input uppercase"
            maxLength={6}
          />
        </div>

        {/* Swap button — sits between the two station inputs */}
        <button
          type="button"
          onClick={onSwap}
          title="Swap stations"
          className="
            self-end sm:self-auto mb-0 sm:mb-0
            flex items-center justify-center
            w-10 h-10 rounded-lg border transition-all duration-200
            hover:bg-brand-light flex-shrink-0
          "
          style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}
        >
          <SwapIcon />
        </button>

        <div className="flex-1">
          <label className="form-label">To</label>
          <input
            id="to-station"
            name="to"
            value={form.to}
            onChange={onChange}
            placeholder="e.g. CBE"
            className="form-input uppercase"
            maxLength={6}
          />
        </div>
      </div>

      {/* Date + Class */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Journey Date</label>
          <input
            id="journey-date"
            type="date"
            name="date"
            value={form.date}
            onChange={onChange}
            min={getTodayStr()}
            max={getMaxDateStr()}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Class</label>
          <select
            id="travel-class"
            name="classCode"
            value={form.classCode}
            onChange={onChange}
            className="form-input"
          >
            <option value="">All Classes</option>
            <option value="SL">Sleeper (SL)</option>
            <option value="3A">Third AC (3A)</option>
            <option value="2A">Second AC (2A)</option>
            <option value="1A">First AC (1A)</option>
            <option value="CC">Chair Car (CC)</option>
            <option value="2S">Second Sitting (2S)</option>
          </select>
        </div>
      </div>

      {/* Validation error */}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button type="submit" id="search-trains-btn" className="btn-primary w-full py-3 text-base">
        🔍 Search Trains
      </button>
    </form>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────
function HeroBadge() {
  return (
    <div className="text-center mb-8">
      <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4"
        style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}>
        Book • Travel • Explore
      </div>
      <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
        NammaRail Booking
      </h1>
      <p className="text-base md:text-lg" style={{ color: 'var(--text-secondary)' }}>
        Search trains across India. Book in seconds.
      </p>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    from:      '',
    to:        '',
    date:      getTodayStr(),
    classCode: '',
  });

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  }

  function handleSwap() {
    setForm(prev => ({ ...prev, from: prev.to, to: prev.from }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.from.trim()) return setError('Please enter a departure station');
    if (!form.to.trim())   return setError('Please enter a destination station');
    if (!form.date)        return setError('Please select a journey date');

    // Navigate to search results with query params.
    // React Router's useNavigate handles this cleanly — no manual URL building.
    const params = new URLSearchParams({
      from: form.from.trim().toUpperCase(),
      to:   form.to.trim().toUpperCase(),
      date: form.date,
      ...(form.classCode && { class: form.classCode }),
    });
    navigate(`/search-results?${params.toString()}`);
  }

  return (
    <Layout>
      <div className="min-h-[70vh] flex flex-col items-center justify-center py-8">
        <div className="w-full max-w-2xl">
          <HeroBadge />
          <SearchForm
            form={form}
            onChange={handleChange}
            onSwap={handleSwap}
            onSubmit={handleSubmit}
            error={error}
          />
        </div>
      </div>
    </Layout>
  );
}
