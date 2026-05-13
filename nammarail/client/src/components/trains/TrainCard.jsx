// =============================================================================
// NammaRail — Train Card Component
// =============================================================================
// Used by SearchResultsPage to render one train result.
// Extracted into its own file so SearchResultsPage stays focused on
// data-fetching / filtering, not rendering details.
// =============================================================================

import { useNavigate } from 'react-router-dom';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts total minutes into "8h 30m" format.
 * Math.floor(475 / 60) = 7 hours
 * 475 % 60            = 55 minutes
 * Result: "7h 55m"
 */
function formatDuration(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Derives a human-readable status label for a class availability object.
 * availability[cls] shape: { CNF: {available}, RAC: {available}, WL: {current} }
 */
function getAvailabilityLabel(avail) {
  if (!avail) return null;
  if (avail.CNF?.available > 0) return { label: 'CNF',  style: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' };
  if (avail.RAC?.available > 0) return { label: 'RAC',  style: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' };
  if (avail.WL?.current  > 0)   return { label: `WL/${avail.WL.current}`, style: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' };
  return { label: 'N/A', style: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-500' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ClassPill({ cls, avail, isHighlighted }) {
  const info = getAvailabilityLabel(avail);
  if (!info) return null;
  return (
    <span className={`
      inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold
      ${info.style}
      ${isHighlighted ? 'ring-2 ring-offset-1 ring-amber-400' : ''}
    `}>
      {cls} · {info.label}
    </span>
  );
}

function RouteStrip({ train }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {/* Departure */}
      <div className="text-center min-w-[52px]">
        <p className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
          {train.departureTime}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{train.fromStation}</p>
      </div>

      {/* Duration line */}
      <div className="flex-1 flex flex-col items-center">
        <span className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>
          {formatDuration(train.durationMins)}
        </span>
        <div className="w-full flex items-center gap-1">
          <div className="w-2 h-2 rounded-full border-2 flex-shrink-0" style={{ borderColor: 'var(--brand)' }} />
          <div className="flex-1 border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
          <div className="w-2 h-2 rounded-full border-2 flex-shrink-0" style={{ borderColor: 'var(--brand)' }} />
        </div>
        <span className="text-[11px] mt-1 hidden sm:block" style={{ color: 'var(--text-tertiary)' }}>
          {train.distanceKm} km
        </span>
      </div>

      {/* Arrival */}
      <div className="text-center min-w-[52px]">
        <p className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
          {train.arrivalTime}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{train.toStation}</p>
      </div>
    </div>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

const CLASS_ORDER = ['SL', '3A', '2A', '1A', 'CC', '2S'];

export default function TrainCard({ train, searchedClass, searchDate }) {
  const navigate = useNavigate();

  const lowestFare = train.fares?.length
    ? Math.min(...train.fares.map(f => f.total_fare))
    : null;

  function handleBook(e) {
    e.stopPropagation();
    const params = new URLSearchParams({
      from:  train.fromStation,
      to:    train.toStation,
      date:  searchDate,
      ...(searchedClass && { class: searchedClass }),
    });
    navigate(`/booking/${train.trainNumber}?${params}`);
  }

  return (
    <div
      onClick={handleBook}
      className="
        card p-4 md:p-5 cursor-pointer
        transition-all duration-200
        hover:shadow-card-hover hover:-translate-y-px
        hover:border-brand
      "
    >
      {/* Top row — name + fare */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
            {train.trainName}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            #{train.trainNumber}
          </p>
        </div>
        {lowestFare && (
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-sm" style={{ color: 'var(--brand)' }}>₹{lowestFare}</p>
            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>onwards</p>
          </div>
        )}
      </div>

      {/* Middle — route */}
      <RouteStrip train={train} />

      {/* Bottom — availability pills + book button */}
      <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {CLASS_ORDER.map(cls =>
            train.availability?.[cls] ? (
              <ClassPill
                key={cls}
                cls={cls}
                avail={train.availability[cls]}
                isHighlighted={cls === searchedClass}
              />
            ) : null
          )}
        </div>
        <button
          onClick={handleBook}
          className="hidden sm:block btn-primary text-xs px-4 py-1.5 flex-shrink-0"
        >
          Book Now
        </button>
      </div>
    </div>
  );
}
