// =============================================================================
// NammaRail — Station Timeline Component
// =============================================================================

import { useState } from 'react';

// ─── Individual stop row ──────────────────────────────────────────────────────

function StopRow({ stop, isFirst, isLast }) {
  const isEndpoint = isFirst || isLast;

  return (
    <div className="flex gap-4">
      {/* Timeline track */}
      <div className="flex flex-col items-center w-6 flex-shrink-0">
        {/* Connector line above dot */}
        <div className={`w-px flex-1 ${isFirst ? 'opacity-0' : ''}`}
          style={{ backgroundColor: 'var(--border)' }} />
        {/* Dot */}
        <div className={`
          rounded-full flex-shrink-0 my-1
          ${isEndpoint
            ? 'w-4 h-4 border-2'
            : 'w-2.5 h-2.5 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700'
          }
        `}
          style={isEndpoint ? { backgroundColor: 'var(--brand)', borderColor: 'var(--brand)' } : {}}
        />
        {/* Connector line below dot */}
        <div className={`w-px flex-1 ${isLast ? 'opacity-0' : ''}`}
          style={{ backgroundColor: 'var(--border)' }} />
      </div>

      {/* Stop content */}
      <div className={`pb-5 ${isLast ? 'pb-0' : ''} min-w-0`}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`font-bold text-sm ${isEndpoint ? '' : 'font-medium'}`}
            style={{ color: isEndpoint ? 'var(--brand)' : 'var(--text-primary)' }}>
            {stop.station_code}
          </span>
          <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {stop.station_name}
          </span>
          {stop.day_count > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
              style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}>
              Day {stop.day_count}
            </span>
          )}
        </div>
        <div className="flex gap-3 mt-0.5">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {stop.arrival_time !== '--' ? `Arr: ${stop.arrival_time}` : 'Origin'}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {stop.departure_time !== '--' ? `Dep: ${stop.departure_time}` : 'Dest'}
          </span>
          {stop.distance_from_origin > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {stop.distance_from_origin} km
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StationTimeline({ stations }) {
  const [expanded, setExpanded] = useState(false);

  if (!stations?.length) return null;

  const first  = stations[0];
  const last   = stations[stations.length - 1];
  const middle = stations.slice(1, -1);
  const hiddenCount = middle.length > 2 && !expanded ? middle.length - 2 : 0;

  // In compact mode (collapsed): show first, up to 2 middle stops, last
  const visibleMiddle = expanded ? middle : middle.slice(0, 2);
  const visible       = [first, ...visibleMiddle, last];

  return (
    <div>
      {visible.map((stop, idx) => (
        <StopRow
          key={`${stop.station_code}-${idx}`}
          stop={stop}
          isFirst={idx === 0}
          isLast={idx === visible.length - 1}
        />
      ))}

      {/* Expand / collapse toggle */}
      {middle.length > 2 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 ml-10 text-xs font-semibold transition-colors"
          style={{ color: 'var(--brand)' }}
        >
          {expanded
            ? '▲ Show fewer stops'
            : `▼ Show ${hiddenCount} more stop${hiddenCount !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}
