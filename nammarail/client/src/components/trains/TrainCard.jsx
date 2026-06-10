// =============================================================================
// NammaRail — Train Card Component (IRCTC Redesign)
// =============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function getNextSixDays(startDateStr) {
  const dates = [];
  const start = startDateStr ? new Date(startDateStr) : new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    // Create ISO string YYYY-MM-DD
    const isoDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    dates.push({
      iso: isoDate,
      label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    });
  }
  return dates;
}

export function generateMockAvailability(trainNumber, classCode, dateStr, quota) {
  // Simple string hash function to seed the randomizer
  const seedStr = `${trainNumber}-${classCode}-${dateStr}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = Math.imul(31, hash) + seedStr.charCodeAt(i) | 0;
  }
  
  // Pseudo-random number generator between 0 and 1
  const random = () => {
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  };

  // Status distribution: 40% AVAILABLE, 20% RAC, 20% WL, 20% REGRET
  const rStatus = random();
  let statusStr = '';
  let colorClass = '';
  let count = 0;

  if (rStatus < 0.4) {
    count = Math.floor(random() * (200 - 5 + 1)) + 5;
    statusStr = `AVAILABLE-${String(count).padStart(4, '0')}`;
    colorClass = 'bg-green-600 text-white';
  } else if (rStatus < 0.6) {
    count = Math.floor(random() * (40 - 1 + 1)) + 1;
    statusStr = `RAC/${count}`;
    colorClass = 'bg-amber-600 text-white';
  } else if (rStatus < 0.8) {
    count = Math.floor(random() * (40 - 1 + 1)) + 1;
    statusStr = `WL/${count}`;
    colorClass = 'bg-red-600 text-white';
  } else {
    statusStr = 'REGRET';
    colorClass = 'text-gray-500 bg-gray-100 dark:bg-gray-800'; // muted gray
  }

  // Base Fares
  let baseFare = 0;
  switch(classCode) {
    case 'SL': baseFare = Math.floor(random() * (650 - 450 + 1)) + 450; break;
    case '3A': baseFare = Math.floor(random() * (1200 - 850 + 1)) + 850; break;
    case '2A': baseFare = Math.floor(random() * (1800 - 1200 + 1)) + 1200; break;
    case '1A': baseFare = Math.floor(random() * (3500 - 2200 + 1)) + 2200; break;
    case 'CC': baseFare = Math.floor(random() * (1000 - 700 + 1)) + 700; break;
    default:   baseFare = Math.floor(random() * (500 - 200 + 1)) + 200; break;
  }

  // Adjust for Quota
  let fare = baseFare;
  if (quota === 'tatkal') {
    fare = Math.round((baseFare * 1.3) / 10) * 10;
  }

  // Nullify fare if REGRET
  if (statusStr === 'REGRET') {
    fare = null;
  }

  return {
    status: { label: statusStr, color: colorClass },
    fare: fare,
    isRegret: statusStr === 'REGRET'
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrainHeader({ train, searchDate }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // Mock running days if not present
  const runningDays = train.runningDays || [true, true, true, false, true, true, true];
  
  // Calculate day index (Monday = 0, Sunday = 6)
  const dateObj = searchDate ? new Date(searchDate) : new Date();
  let dayIdx = dateObj.getDay() - 1; // getDay(): Sun=0, Mon=1...
  if (dayIdx === -1) dayIdx = 6; // Sunday

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 sm:p-4 bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
      <div className="flex items-center gap-3">
        <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{train.trainName}</h3>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>({train.trainNumber})</span>
      </div>
      <div className="flex items-center gap-6 mt-2 sm:mt-0 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] text-[var(--text-tertiary)]">Runs On:</span>
          {days.map((day, idx) => {
            const isRunning = runningDays[idx];
            const isToday = idx === dayIdx;
            
            let classes = '';
            if (!isRunning) {
              classes = 'text-gray-300 dark:text-gray-600 line-through';
            } else if (isToday) {
              classes = 'text-[var(--brand)] font-extrabold text-sm';
            } else {
              classes = 'text-[var(--text-secondary)]';
            }

            return (
              <span key={idx} className={classes}>
                {day}
              </span>
            );
          })}
        </div>
        <a href="#" onClick={(e) => e.preventDefault()} className="text-[var(--brand)] hover:underline capitalize tracking-normal">Train Schedule</a>
      </div>
    </div>
  );
}

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
          <div className="flex-1 border-t-2 border-dashed relative" style={{ borderColor: 'var(--border)' }}>
             <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-[var(--border)] border-b-[4px] border-b-transparent" />
          </div>
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

function AvailabilityGrid({ searchDate, trainNumber, searchedClass, quota, onBook }) {
  const dates = getNextSixDays(searchDate);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(searchDate);

  const loadData = () => {
    setLoading(true);
    // Simulate API delay for a realistic loading state inside the specific grid
    setTimeout(() => {
      const mock = dates.map(dObj => generateMockAvailability(trainNumber, searchedClass, dObj.iso, quota));
      setData(mock);
      setLoading(false);
    }, 1200);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedClass, searchDate, quota]);

  // Find if currently selected date is regret
  const selectedIndex = dates.findIndex(d => d.iso === selectedDate);
  const selectedItem = data[selectedIndex];
  const isSelectedRegret = selectedItem?.isRegret;

  return (
    <div className="bg-[var(--bg-tertiary)] p-3 rounded-b-sm border border-[var(--border)] mt-[-1px]">
      {loading ? (
        <div className="flex items-center justify-center h-[76px]">
          <div className="w-6 h-6 border-2 border-t-[var(--brand)] border-[var(--border)] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex overflow-x-auto gap-2 pb-2" style={{ scrollbarWidth: 'thin' }}>
          {data.map((item, i) => {
            const dObj = dates[i];
            const isSelected = selectedDate === dObj.iso;
            const isRegret = item.isRegret;
            
            let containerClasses = `flex-shrink-0 border rounded-sm p-2 min-w-[120px] text-center transition-all ${
              isSelected ? 'border-[var(--brand)] bg-[var(--brand-glow)] shadow-sm' : 'border-[var(--border)] bg-[var(--bg-secondary)]'
            }`;
            
            if (isRegret) {
              containerClasses += ' opacity-40 cursor-not-allowed';
            } else {
              containerClasses += ' cursor-pointer hover:border-[var(--brand)] hover:shadow-sm';
            }

            return (
              <div 
                key={i} 
                className={containerClasses}
                onClick={() => {
                  if (!isRegret) setSelectedDate(dObj.iso);
                }}
              >
                <p className="text-[11px] font-bold text-[var(--text-secondary)] mb-1 uppercase">{dObj.label}</p>
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded inline-block ${item.status.color}`}>{item.status.label}</div>
                <p className="text-xs font-bold text-[var(--text-primary)] mt-1">
                  {item.fare !== null ? `₹${item.fare}` : '—'}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <button 
          onClick={() => onBook(selectedDate)} 
          className={`btn-primary ${isSelectedRegret || loading ? 'opacity-50 cursor-not-allowed' : ''}`} 
          disabled={loading || isSelectedRegret}
        >
          Book Now
        </button>
      </div>
    </div>
  );
}

// ─── Main Card ────────────────────────────────────────────────────────────────

const CLASS_ORDER = ['SL', '3A', '2A', '1A', 'CC', '2S'];

export default function TrainCard({ train, searchedClass, searchDate, quota }) {
  const navigate = useNavigate();
  // Default active tab to the searched class, or the first available class
  let availableClasses = CLASS_ORDER.filter(c => train.availability?.[c]);
  
  // If availability object is missing on this train, infer classes from fares
  if (availableClasses.length === 0) {
    if (train.fares && train.fares.length > 0) {
      availableClasses = train.fares.map(f => f.class);
    } else {
      // Fallback if fares are also missing
      availableClasses = ['SL', '3A', '2A'];
    }
  }
  
  // Deduplicate and sort by standard CLASS_ORDER
  availableClasses = [...new Set(availableClasses)].sort((a, b) => {
    const idxA = CLASS_ORDER.indexOf(a);
    const idxB = CLASS_ORDER.indexOf(b);
    return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
  });

  const initialClass = availableClasses.includes(searchedClass) ? searchedClass : availableClasses[0];
  const [activeClass, setActiveClass] = useState(initialClass);

  function handleBook(bookingDate) {
    const params = new URLSearchParams({
      from:  train.fromStation,
      to:    train.toStation,
      date:  bookingDate,
      class: activeClass,
      quota: quota,
    });
    navigate(`/booking/${train.trainNumber}?${params}`);
  }

  // Use the lowest fare found for the train as a base price for mocks
  const basePrice = train.fares?.length ? Math.min(...train.fares.map(f => f.total_fare)) : 500;

  return (
    <div className="card overflow-hidden transition-all duration-200 mb-4 bg-[var(--bg-secondary)]">
      {/* IRCTC Style Header */}
      <TrainHeader train={train} searchDate={searchDate} />
      
      {/* Route and Timings */}
      <RouteStrip train={train} />

      {/* Interactive Class Tabs and Availability Grid */}
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
            trainNumber={train.trainNumber}
            searchedClass={activeClass}
            quota={quota}
            onBook={handleBook}
          />
        )}
      </div>
    </div>
  );
}
