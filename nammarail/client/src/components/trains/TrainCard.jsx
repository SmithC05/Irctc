// =============================================================================
// NammaRail — Train Card Component
// =============================================================================
//
// PHASE-AWARE DESIGN:
// ─────────────────────────────────────────────────────────────────────────────
// Every train card reads phase context from the search API response.
// The card adjusts its display based on trainPhase from the server — the client
// NEVER computes phase independently (Agent Constitution rule).
//
// Phase-aware UI changes:
//  ARP_OPEN      → Normal display. Book Now enabled.
//  TATKAL_OPEN   → "⚡ Tatkal Open" banner shown. Normal + Tatkal available.
//  CHART_PENDING → Warning banner: "Chart preparing at T-4h"
//  CHART_PREPARED→ "CURR_AVL: N seats" shown. No WL/RAC.
//  DEPARTED      → Card grayed out, no booking button.
//  BOOKING_UNAVAILABLE → ARP not open, grayed out.
// =============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Zap, Clock, CheckCircle } from 'lucide-react';
import { getAvailabilityGrid } from '../../api/trainApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function getUIForStatus(item) {
  if (!item) return { label: 'N/A', color: 'bg-gray-100 text-gray-400', isRegret: true };

  switch (item.status) {
    case 'AVAILABLE':
      return { label: `AVAIL-${item.count}`, color: 'bg-green-600 text-white', isRegret: false };
    case 'RAC':
      return { label: `RAC/${item.count}`, color: 'bg-amber-600 text-white', isRegret: false };
    case 'WL':
      return { label: `WL/${item.count}`, color: 'bg-red-600 text-white', isRegret: false };
    case 'REGRET':
    case 'DEPARTED':
      return { label: 'REGRET', color: 'text-gray-500 bg-gray-100 dark:bg-gray-800', isRegret: true };
    case 'CHART_PREPARED':
      return { label: 'CURR_AVL 0', color: 'bg-gray-400 text-white', isRegret: true };
    case 'NOT_YET':
      return { label: 'NOT OPEN', color: 'text-gray-500 bg-gray-100 dark:bg-gray-800', isRegret: true };
    case 'TATKAL_NOT_YET':
      return { label: 'TATKAL WAIT', color: 'bg-amber-100 text-amber-800 border-amber-300', isRegret: true };
    default:
      return { label: 'N/A', color: 'bg-gray-100 text-gray-400', isRegret: true };
  }
}

function TatkalTimer({ minsUntilOpen, onComplete }) {
  const [timeLeft, setTimeLeft] = useState(minsUntilOpen * 60);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [minsUntilOpen, onComplete]);

  if (timeLeft <= 0) return <div className="text-[10px] text-amber-600 mt-1">Opening...</div>;
  
  const h = Math.floor(timeLeft / 3600);
  const m = Math.floor((timeLeft % 3600) / 60);
  const s = Math.floor(timeLeft % 60);
  const display = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  
  return (
    <div className="flex flex-col items-center mt-1">
      <span className="text-[9px] text-amber-600">Opens in</span>
      <span className="text-[10px] font-bold text-amber-700">{display}</span>
    </div>
  );
}

function getNextSixDays(startDateStr) {
  const dates = [];
  const start = startDateStr ? new Date(startDateStr) : new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isoDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().split('T')[0];
    dates.push({
      iso:   isoDate,
      label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
    });
  }
  return dates;
}

// ─── Phase Banner ─────────────────────────────────────────────────────────────

function PhaseBanner({ trainPhase, tatkalStatus, currAvlCount }) {
  if (!trainPhase || trainPhase === 'ARP_OPEN') return null;

  const configs = {
    TATKAL_OPEN: {
      icon:    <Zap size={13} className="inline mr-1" />,
      text:    'Tatkal booking is open',
      cls:     'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700',
    },
    CHART_PENDING: {
      icon:    <Clock size={13} className="inline mr-1" />,
      text:    'Chart preparing soon — no new Tatkal',
      cls:     'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700',
    },
    CHART_PREPARED: {
      icon:    <CheckCircle size={13} className="inline mr-1" />,
      text:    `Chart prepared — ${currAvlCount} CURR_AVL seat${currAvlCount !== 1 ? 's' : ''} available`,
      cls:     'bg-teal-50 text-teal-800 border-teal-300 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-700',
    },
    DEPARTED: {
      icon:    null,
      text:    'Train has departed — no booking possible',
      cls:     'bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400',
    },
    BOOKING_UNAVAILABLE: {
      icon:    null,
      text:    'Booking not yet open (outside 60-day ARP window)',
      cls:     'bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400',
    },
  };

  const cfg = configs[trainPhase];
  if (!cfg) return null;

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b ${cfg.cls}`}>
      {cfg.icon}
      {cfg.text}
    </div>
  );
}

// ─── TrainHeader ──────────────────────────────────────────────────────────────

function TrainHeader({ train, searchDate }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dateObj = searchDate ? new Date(searchDate) : new Date();
  let dayIdx = dateObj.getDay() - 1;
  if (dayIdx === -1) dayIdx = 6;

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 sm:p-4 bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
      <div className="flex items-center gap-3">
        <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{train.trainName}</h3>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>({train.trainNumber})</span>
      </div>
      <div className="flex items-center gap-1 mt-2 sm:mt-0">
        <span className="text-[10px] text-[var(--text-tertiary)] mr-1">Runs:</span>
        {days.map((day, idx) => (
          <span
            key={idx}
            className={idx === dayIdx
              ? 'text-[var(--brand)] font-extrabold text-sm'
              : 'text-[var(--text-tertiary)] text-xs'}
          >
            {day}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── RouteStrip ───────────────────────────────────────────────────────────────

function RouteStrip({ train }) {
  return (
    <div className="flex items-center justify-between p-4 pb-2">
      <div className="text-center min-w-[80px]">
        <p className="text-xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{train.departureTime}</p>
        <p className="text-xs font-bold mt-1" style={{ color: 'var(--text-secondary)' }}>{train.fromStation}</p>
      </div>
      <div className="flex-1 flex flex-col items-center px-4">
        <span className="text-xs mb-1 font-bold" style={{ color: 'var(--text-tertiary)' }}>{formatDuration(train.durationMins)}</span>
        <div className="w-full flex items-center gap-1">
          <div className="w-2 h-2 rounded-full border-2 flex-shrink-0" style={{ borderColor: 'var(--brand)' }} />
          <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: 'var(--border)' }} />
          <div className="w-2 h-2 rounded-full border-2 flex-shrink-0" style={{ borderColor: 'var(--brand)' }} />
        </div>
      </div>
      <div className="text-center min-w-[80px]">
        <p className="text-xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{train.arrivalTime}</p>
        <p className="text-xs font-bold mt-1" style={{ color: 'var(--text-secondary)' }}>{train.toStation}</p>
      </div>
    </div>
  );
}

// ─── AvailabilityGrid ─────────────────────────────────────────────────────────
//
// Fetches REAL availability from the API for each date in the 6-day window.
// Replaces the old generateMockAvailability() function.

function AvailabilityGrid({ searchDate, train, activeClass, trainPhase, tatkalStatus, onBook }) {
  const [loading,      setLoading]      = useState(true);
  const [data,         setData]         = useState([]);
  const [selectedDate, setSelectedDate] = useState(searchDate);

  async function fetchAvailability() {
    setLoading(true);
    try {
      // Find what quota to use. Let's default to general unless tatkal is open and we want to book tatkal?
      // For now, always 'general', the backend handles status correctly.
      const response = await getAvailabilityGrid(
        train.trainNumber,
        activeClass,
        searchDate || new Date().toISOString().split('T')[0],
        6,
        'general',
        train.fromStation,
        train.toStation
      );
      setData(response.data || []);
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClass, searchDate]);

  const selectedItem  = data.find(d => d.date === selectedDate) || null;
  const isSelectedRegret = selectedItem ? !selectedItem.isBookable : true;

  const isBookingDisabled =
    trainPhase === 'DEPARTED' ||
    trainPhase === 'BOOKING_UNAVAILABLE';

  return (
    <div className="bg-[var(--bg-tertiary)] p-3 rounded-b-sm border border-[var(--border)] mt-[-1px]">
      {loading ? (
        <div className="flex items-center justify-center h-[76px]">
          <div className="w-6 h-6 border-2 border-t-[var(--brand)] border-[var(--border)] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex overflow-x-auto gap-2 pb-2" style={{ scrollbarWidth: 'thin' }}>
          {data.map((item, i) => {
            const ui         = getUIForStatus(item);
            const isSelected = selectedDate === item.date;

            let containerClasses = `flex-shrink-0 border rounded-sm p-2 min-w-[120px] text-center transition-all ${
              isSelected
                ? 'border-[var(--brand)] bg-[var(--brand-glow)] shadow-sm'
                : 'border-[var(--border)] bg-[var(--bg-secondary)]'
            }`;
            if (ui.isRegret) {
              containerClasses += ' opacity-50';
              if (item.status !== 'TATKAL_NOT_YET') {
                 containerClasses += ' cursor-not-allowed';
              }
            } else {
              containerClasses += ' cursor-pointer hover:border-[var(--brand)] hover:shadow-sm';
            }

            return (
              <div
                key={i}
                className={containerClasses}
                onClick={() => { if (!ui.isRegret) setSelectedDate(item.date); }}
              >
                <p className="text-[11px] font-bold text-[var(--text-secondary)] mb-1 uppercase">{item.label}</p>
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded inline-block ${ui.color}`}>
                  {ui.label}
                </div>
                {item.status === 'TATKAL_NOT_YET' && (
                  <TatkalTimer minsUntilOpen={item.minsUntilOpen} onComplete={fetchAvailability} />
                )}
                {item.status !== 'TATKAL_NOT_YET' && (
                  <p className="text-xs font-bold text-[var(--text-primary)] mt-1">
                    {item.fare ? `₹${item.fare}` : '—'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => onBook(selectedDate)}
          className={`btn-primary ${isSelectedRegret || loading || isBookingDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={loading || isSelectedRegret || isBookingDisabled}
        >
          Book Now
        </button>
      </div>
    </div>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

const CLASS_ORDER = ['SL', '3A', '2A', '1A', 'CC', '2S'];

export default function TrainCard({ train, searchedClass, searchDate }) {
  const navigate = useNavigate();

  // Derive available classes from the API availability object.
  let availableClasses = CLASS_ORDER.filter(c => train.availability?.[c]);
  if (availableClasses.length === 0 && train.fares?.length > 0) {
    availableClasses = CLASS_ORDER.filter(c => train.fares.some(f => f.class_code === c));
  }
  if (availableClasses.length === 0) availableClasses = ['SL', '3A', '2A'];

  const initialClass = availableClasses.includes(searchedClass) ? searchedClass : availableClasses[0];
  const [activeClass, setActiveClass] = useState(initialClass);

  // Phase context comes from the server — never computed on the client.
  const trainPhase   = train.trainPhase   ?? 'ARP_OPEN';
  const tatkalStatus = train.tatkalStatus ?? {};
  const currAvlCount = train.currAvlCount ?? 0;

  const isPhaseBlocked =
    trainPhase === 'DEPARTED' || trainPhase === 'BOOKING_UNAVAILABLE';

  function handleBook(bookingDate) {
    const params = new URLSearchParams({
      from:  train.fromStation,
      to:    train.toStation,
      date:  bookingDate,
      class: activeClass,
    });
    navigate(`/train/${train.trainNumber}?${params}`);
  }

  return (
    <div className={`card overflow-hidden transition-all duration-200 mb-4 bg-[var(--bg-secondary)] ${isPhaseBlocked ? 'opacity-60' : ''}`}>
      <TrainHeader train={train} searchDate={searchDate} />

      {/* Phase-aware banner */}
      <PhaseBanner
        trainPhase={trainPhase}
        tatkalStatus={tatkalStatus}
        currAvlCount={currAvlCount}
      />

      <RouteStrip train={train} />

      {/* Class Tabs + Availability Grid */}
      <div className="p-4 pt-2">
        <div className="flex flex-wrap gap-2 relative z-10">
          {availableClasses.map(cls => (
            <button
              key={cls}
              onClick={() => setActiveClass(cls)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-t-sm border border-b-0 text-sm font-bold transition-colors
                ${activeClass === cls
                  ? 'bg-[var(--bg-tertiary)] border-[var(--border)] text-[var(--brand)]'
                  : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}
              `}
              style={{ marginBottom: '-1px' }}
            >
              {cls}
              <RefreshCw size={14} className={activeClass === cls ? 'text-[var(--brand)]' : 'text-gray-400'} />
            </button>
          ))}
        </div>

        {activeClass && (
          <AvailabilityGrid
            searchDate={searchDate}
            train={train}
            activeClass={activeClass}
            trainPhase={trainPhase}
            tatkalStatus={tatkalStatus}
            onBook={handleBook}
          />
        )}
      </div>
    </div>
  );
}
