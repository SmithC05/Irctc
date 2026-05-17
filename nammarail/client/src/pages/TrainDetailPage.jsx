// =============================================================================
// NammaRail — Train Detail Page
// =============================================================================
//
// STICKY POSITIONING:
// ─────────────────────────────────────────────────────────────────────────────
// `position: sticky` pins an element once it reaches a threshold while scrolling.
// It behaves like `position: relative` until the scroll offset hits `top: X`,
// then it acts like `position: fixed` — sticking to that position.
//
// IMPORTANT GOTCHA: sticky only works when:
//   1. The parent container is tall enough (the element needs room to "scroll into").
//   2. No ancestor has overflow:hidden or overflow:auto set on it.
//   3. The element must have top/bottom/left/right set.
//
// TATKAL BOOKING:
// ─────────────────────────────────────────────────────────────────────────────
// Tatkal is IRCTC's premium emergency quota. Tickets go on sale 1 day before
// departure (instead of 60 days). Fares are significantly higher (~30-50% more),
// and there is ZERO refund on cancellation. The UI should make this very clear.
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getTrainDetails } from '../api/trainApi';
import StationTimeline from '../components/trains/StationTimeline';
import Layout from '../components/layout/Layout';
import TrainLoader from '../components/ui/TrainLoader';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLASS_LABELS = {
  '1A': 'First AC',
  '2A': 'Second AC',
  '3A': 'Third AC',
  'SL': 'Sleeper',
  'CC': 'Chair Car',
  '2S': 'Second Sitting',
};

const DAYS_ABBR = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function getAvailBadge(avail) {
  if (!avail) return { text: 'N/A', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800' };
  if (avail.CNF?.available > 0)
    return { text: `CNF ${avail.CNF.available}`, cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' };
  if (avail.RAC?.available > 0)
    return { text: `RAC ${avail.RAC.available}`, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' };
  if (avail.WL?.current > 0)
    return { text: `WL ${avail.WL.current}`, cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' };
  return { text: 'N/A', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800' };
}

// ─── Days-of-week pills ───────────────────────────────────────────────────────

function RunsDays({ dayOfWeek }) {
  // The API returns the specific day this train runs on the searched date.
  // For a real "runs on" schedule we'd need the full week flags from the schedule.
  // For now, display the queried day highlighted.
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const activeIdx = days.findIndex(d => d === dayOfWeek);
  return (
    <div className="flex gap-1.5">
      {DAYS_ABBR.map((d, i) => (
        <div key={i} className={`
          w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold
          ${i === activeIdx
            ? 'text-white'
            : 'border'
          }
        `}
          style={i === activeIdx
            ? { backgroundColor: 'var(--brand)' }
            : { borderColor: 'var(--border)', color: 'var(--text-tertiary)' }
          }>
          {d}
        </div>
      ))}
    </div>
  );
}

// ─── Top info panel ───────────────────────────────────────────────────────────

function TrainInfoPanel({ train, date }) {
  const dateLabel = date
    ? new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="card p-5 md:p-6 mb-5">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {train.trainName}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            #{train.trainNumber} · {dateLabel}
          </p>
        </div>
        <RunsDays dayOfWeek={train.dayOfWeek} />
      </div>

      {/* Time display */}
      <div className="flex items-center gap-3 md:gap-6">
        <div className="text-center">
          <p className="text-2xl md:text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {train.departureTime}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--brand)' }}>
            {train.fromStation}
          </p>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {Math.floor(train.durationMins / 60)}h {String(train.durationMins % 60).padStart(2,'0')}m · {train.distanceKm} km
          </p>
          <div className="w-full flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--brand)' }} />
            <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: 'var(--border)' }} />
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--brand)' }} />
          </div>
        </div>

        <div className="text-center">
          <p className="text-2xl md:text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {train.arrivalTime}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--brand)' }}>
            {train.toStation}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Class Selector ───────────────────────────────────────────────────────────

function ClassSelectorCard({ fares, availability, selectedClass, onSelect, isTatkal, onTatkalToggle, onContinue }) {
  return (
    <div className="card p-5 lg:sticky lg:top-4">
      <p className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Select Class</p>

      <div className="flex flex-col gap-2 mb-5">
        {fares.map(fare => {
          const avail   = availability?.[fare.class_code];
          const badge   = getAvailBadge(avail);
          const price   = isTatkal && fare.tatkal_fare > 0 ? fare.tatkal_fare : fare.total_fare;
          const isChosen = selectedClass === fare.class_code;

          return (
            <button
              key={fare.class_code}
              onClick={() => onSelect(fare.class_code)}
              className={`
                w-full text-left px-4 py-3 rounded-lg border transition-all duration-150
                ${isChosen ? 'ring-2' : 'hover:border-brand'}
              `}
              style={{
                borderColor: isChosen ? 'var(--brand)' : 'var(--border)',
                backgroundColor: isChosen ? 'var(--brand-light)' : 'transparent',
                '--tw-ring-color': 'var(--brand)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {CLASS_LABELS[fare.class_code] ?? fare.class_code}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {fare.class_code}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: 'var(--brand)' }}>₹{price}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${badge.cls}`}>
                    {badge.text}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Tatkal toggle
          Tatkal = premium emergency quota: higher fare, zero refund, opens 1 day before departure. */}
      <label className="flex items-center gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={isTatkal}
          onChange={e => onTatkalToggle(e.target.checked)}
          className="accent-amber-600 w-4 h-4"
        />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Book Tatkal</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Higher fare · 0% refund</p>
        </div>
      </label>

      {isTatkal && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs bg-amber-50 text-amber-800 border border-amber-200
          dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800">
          ⚠️ Tatkal tickets have <strong>no refund</strong> on cancellation and higher charges apply.
        </div>
      )}

      <button
        disabled={!selectedClass}
        onClick={onContinue}
        className="btn-primary w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue to Booking →
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrainDetailPage() {
  const { trainNumber }    = useParams();
  const [searchParams]     = useSearchParams();
  const navigate           = useNavigate();

  const from      = searchParams.get('from')  ?? '';
  const to        = searchParams.get('to')    ?? '';
  const date      = searchParams.get('date')  ?? '';
  const initClass = searchParams.get('class') ?? '';

  const [train,         setTrain]    = useState(null);
  const [isLoading,     setLoading]  = useState(true);
  const [error,         setError]    = useState(null);
  const [selectedClass, setClass]    = useState(initClass);
  const [isTatkal,      setTatkal]   = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await getTrainDetails(trainNumber, from, to, date);
        setTrain(res.data);
      } catch (err) {
        setError(err.response?.data?.error ?? 'Could not load train details.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [trainNumber, from, to, date]);

  function handleContinue() {
    // Use React Router location.state to pass booking details to the next page.
    // This avoids long query strings for complex objects and is not bookmarkable —
    // which is fine for a checkout flow where the user should re-search if they refresh.
    navigate('/passengers', {
      state: {
        trainNumber: train.trainNumber,
        trainName:   train.trainName,
        fromStation: from,
        toStation:   to,
        journeyDate: date,
        classCode:   selectedClass,
        bookingType: isTatkal ? 'tatkal' : 'normal',
        fare:        train.fares?.find(f => f.class_code === selectedClass),
      },
    });
  }

  if (isLoading) return <Layout><TrainLoader message="Loading train details…" size="large" /></Layout>;

  if (error) return (
    <Layout>
      <div className="card p-8 text-center">
        <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
        <button onClick={() => navigate(-1)} className="btn-outline text-sm">← Go back</button>
      </div>
    </Layout>
  );

  if (!train) return null;

  return (
    <Layout>
      <TrainInfoPanel train={train} date={date} />

      {/* Two-column layout on desktop, stacked on mobile */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* Left — station timeline */}
        <div className="flex-1 min-w-0">
          <div className="card p-5">
            <p className="font-bold text-sm mb-5" style={{ color: 'var(--text-primary)' }}>
              Station Stops ({train.stations?.length ?? 0})
            </p>
            <StationTimeline stations={train.stations ?? []} />
          </div>
        </div>

        {/* Right — class selector */}
        <div className="lg:w-80 shrink-0">
          {train.fares?.length > 0 ? (
            <ClassSelectorCard
              fares={train.fares}
              availability={train.availability}
              selectedClass={selectedClass}
              onSelect={setClass}
              isTatkal={isTatkal}
              onTatkalToggle={setTatkal}
              onContinue={handleContinue}
            />
          ) : (
            <div className="card p-5 text-center">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No fare data available.</p>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
