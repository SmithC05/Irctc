// =============================================================================
// NammaRail — Train Card Component  (Railway Ticket redesign)
// =============================================================================
//
// Complete visual rework: dark "Signal & Schedule" → light "Printed Ticket".
// Card is now a two-zone ticket stub: LEFT (train identity) | PERF | RIGHT (route + booking).
//
// All logic preserved:
//   - Phase detection (ARP_OPEN / TATKAL_OPEN / CHART_PENDING / CHART_PREPARED / DEPARTED)
//   - Tatkal countdown timer
//   - Lazy availability fetch per class/date/quota
//   - Split-flap date strip with flip animation (gated by dataLoaded)
//   - Approximate fare fallback (cross-train) with ~ prefix
//   - Bug 1 Fix: any tile selectable; isBookable drives Book Now, not selection
//
// Token changes: all --sr-* colors → --tk-* from the ticket design system.
// =============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Clock, CheckCircle } from 'lucide-react';
import { getAvailabilityGrid } from '../../api/trainApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Maps an availability grid item status to ticket-theme display properties.
 * Returns { dotColor, textColor, label, isBookable, strikethrough }.
 */
function statusToSignal(item) {
  if (!item) return {
    dotColor: 'var(--tk-track)', textColor: 'var(--tk-ink-muted)',
    label: 'N/A', isBookable: false, strikethrough: false,
  };
  switch (item.status) {
    case 'AVAILABLE':
      return {
        dotColor: 'var(--tk-signal-green)', textColor: 'var(--tk-signal-green)',
        label: `AVAIL ${item.count}`, isBookable: true, strikethrough: false,
      };
    case 'RAC':
      return {
        dotColor: 'var(--tk-ink-muted)', textColor: 'var(--tk-ink-muted)',
        label: `RAC/${item.count}`, isBookable: true, strikethrough: false,
      };
    case 'WL':
      return {
        dotColor: 'var(--tk-signal-red)', textColor: 'var(--tk-signal-red)',
        label: `WL/${item.count}`, isBookable: true, strikethrough: false,
      };
    case 'REGRET':
    case 'DEPARTED':
      return {
        dotColor: 'var(--tk-signal-red)', textColor: 'var(--tk-ink-muted)',
        label: 'REGRET', isBookable: false, strikethrough: true,
      };
    case 'CHART_PREPARED':
      return {
        dotColor: 'var(--tk-signal-green)', textColor: 'var(--tk-signal-green)',
        label: 'CURR AVL', isBookable: item.isBookable, strikethrough: false,
      };
    case 'NOT_YET':
      return {
        dotColor: 'var(--tk-track)', textColor: 'var(--tk-ink-muted)',
        label: 'NOT OPEN', isBookable: false, strikethrough: false,
      };
    case 'TATKAL_NOT_YET':
      return {
        dotColor: 'var(--tk-brass)', textColor: 'var(--tk-brass)',
        label: 'TATKAL WAIT', isBookable: false, strikethrough: false,
      };
    default:
      return {
        dotColor: 'var(--tk-track)', textColor: 'var(--tk-ink-muted)',
        label: 'N/A', isBookable: false, strikethrough: false,
      };
  }
}

/**
 * Derives a signal dot color for a class tab from the initial availability
 * object (from search API response). Gives at-a-glance status before grid fetch.
 */
function classAvailToSignal(avail) {
  if (!avail) return 'var(--tk-track)';
  if (avail.CNF?.available > 0) return 'var(--tk-signal-green)';
  if (avail.RAC?.available > 0) return 'var(--tk-ink-muted)';
  if (avail.WL?.current > 0)    return 'var(--tk-signal-red)';
  return 'var(--tk-track)';
}

// ─── Phase Banner ─────────────────────────────────────────────────────────────

function PhaseBanner({ trainPhase, currAvlCount }) {
  if (!trainPhase || trainPhase === 'ARP_OPEN') return null;

  const configs = {
    TATKAL_OPEN: {
      icon: <Zap size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />,
      text: 'Tatkal booking is open',
      style: {
        background: 'rgba(184,134,46,0.10)',
        color: 'var(--tk-brass)',
        borderBottom: '1px solid rgba(184,134,46,0.2)',
      },
    },
    CHART_PENDING: {
      icon: <Clock size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />,
      text: 'Chart preparing soon — no new Tatkal',
      style: {
        background: 'rgba(216,210,192,0.45)',
        color: 'var(--tk-ink-muted)',
        borderBottom: '1px solid var(--tk-track)',
      },
    },
    CHART_PREPARED: {
      icon: <CheckCircle size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />,
      text: `Chart prepared — ${currAvlCount} CURR_AVL seat${currAvlCount !== 1 ? 's' : ''} available`,
      style: {
        background: 'rgba(47,107,79,0.07)',
        color: 'var(--tk-signal-green)',
        borderBottom: '1px solid rgba(47,107,79,0.15)',
      },
    },
    DEPARTED: {
      icon: null,
      text: 'Train has departed — no booking possible',
      style: {
        background: 'var(--tk-track)',
        color: 'var(--tk-ink-muted)',
        fontStyle: 'italic',
        borderBottom: '1px solid rgba(216,210,192,0.6)',
      },
    },
    BOOKING_UNAVAILABLE: {
      icon: null,
      text: 'Booking not yet open (outside 60-day ARP window)',
      style: {
        background: 'rgba(216,210,192,0.45)',
        color: 'var(--tk-ink-muted)',
        borderBottom: '1px solid var(--tk-track)',
      },
    },
  };

  const cfg = configs[trainPhase];
  if (!cfg) return null;

  return (
    <div style={{
      ...cfg.style,
      padding: '5px 16px',
      fontSize: '11px',
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
    }}>
      {cfg.icon}
      {cfg.text}
    </div>
  );
}

// ─── TatkalTimer ──────────────────────────────────────────────────────────────

function TatkalTimer({ minsUntilOpen, opensInDays, opensOnDate, opensAt, onComplete }) {
  if (opensInDays > 0) {
    return (
      <div style={{ marginTop: '4px', textAlign: 'center' }}>
        <span style={{ display: 'block', fontSize: '9px', color: 'var(--tk-brass)', fontFamily: 'var(--font-body)' }}>Opens on</span>
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--tk-brass)', fontFamily: 'var(--font-mono)' }}>{opensOnDate}</span>
        <span style={{ display: 'block', fontSize: '9px', color: 'var(--tk-brass)', fontFamily: 'var(--font-body)' }}>at {opensAt}</span>
      </div>
    );
  }

  const [timeLeft, setTimeLeft] = useState(minsUntilOpen * 60);
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(interval); onComplete(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [minsUntilOpen, onComplete]);

  if (timeLeft <= 0) return (
    <div style={{ fontSize: '10px', color: 'var(--tk-brass)', marginTop: '4px', fontFamily: 'var(--font-body)' }}>
      Opening...
    </div>
  );

  const h = Math.floor(timeLeft / 3600);
  const m = Math.floor((timeLeft % 3600) / 60);
  const s = Math.floor(timeLeft % 60);
  const display = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;

  return (
    <div style={{ marginTop: '4px', textAlign: 'center' }}>
      <span style={{ display: 'block', fontSize: '9px', color: 'var(--tk-brass)', fontFamily: 'var(--font-body)' }}>Opens in</span>
      <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--tk-brass)', fontFamily: 'var(--font-mono)' }}>{display}</span>
    </div>
  );
}

// ─── Route Strip — horizontal track with dep/arr times ───────────────────────

function RouteStrip({ train }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '14px 18px',
      gap: 0,
      borderBottom: '1px solid var(--tk-track)',
      background: 'var(--tk-paper-raised)',
    }}>
      {/* Departure */}
      <div style={{ textAlign: 'left', minWidth: '64px', flexShrink: 0 }}>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '24px',
          fontWeight: 600,
          color: 'var(--tk-ink)',
          lineHeight: 1,
          margin: 0,
          letterSpacing: '-0.02em',
        }}>
          {train.departureTime}
        </p>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--tk-ink-muted)',
          marginTop: '3px',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          margin: '3px 0 0',
        }}>
          {train.fromStation}
        </p>
      </div>

      {/* Track with duration */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 10px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          fontWeight: 500,
          color: 'var(--tk-ink-muted)',
          marginBottom: '5px',
          letterSpacing: '0.03em',
        }}>
          {formatDuration(train.durationMins)}
        </span>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
          {/* Origin station dot */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            border: '2px solid var(--tk-brass)',
            background: 'var(--tk-paper-raised)',
            flexShrink: 0,
          }} />
          {/* Dotted brass track */}
          <div style={{
            flex: 1, height: 2,
            background: 'repeating-linear-gradient(to right, var(--tk-brass) 0px, var(--tk-brass) 5px, transparent 5px, transparent 10px)',
            margin: '0 2px',
          }} />
          {/* Destination station dot */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            border: '2px solid var(--tk-brass)',
            background: 'var(--tk-paper-raised)',
            flexShrink: 0,
          }} />
        </div>
      </div>

      {/* Arrival */}
      <div style={{ textAlign: 'right', minWidth: '64px', flexShrink: 0 }}>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '24px',
          fontWeight: 600,
          color: 'var(--tk-ink)',
          lineHeight: 1,
          margin: 0,
          letterSpacing: '-0.02em',
        }}>
          {train.arrivalTime}
        </p>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--tk-ink-muted)',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          margin: '3px 0 0',
        }}>
          {train.toStation}
        </p>
      </div>
    </div>
  );
}

// ─── Availability Grid — split-flap date strip ────────────────────────────────
//
// Bug 1 Fix preserved: onClick is not gated by status.
// Any tile is selectable; isBookable on the selected tile drives Book Now.
// dataLoaded gates the flip animation — clicking a tile does NOT retrigger it.

function AvailabilityGrid({ searchDate, train, activeClass, trainPhase, quota = 'general', onBook }) {
  const navigate = useNavigate();
  const [loading,      setLoading]     = useState(true);
  const [data,         setData]        = useState([]);
  const [selectedDate, setSelectedDate] = useState(searchDate);
  // dataLoaded gates the flip animation — set true on first fetch resolve, never reset on click
  const [dataLoaded,   setDataLoaded]  = useState(false);

  async function fetchAvailability() {
    setLoading(true);
    setDataLoaded(false);
    try {
      const response = await getAvailabilityGrid(
        train.trainNumber,
        activeClass,
        searchDate || new Date().toISOString().split('T')[0],
        6,
        quota,
        train.fromStation,
        train.toStation
      );
      setData(response.data || []);
      requestAnimationFrame(() => setDataLoaded(true));
    } catch (err) {
      console.error(err);
      setData([]);
      setDataLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClass, searchDate, quota]);

  // Resolve selected item — pin to first if selected date not in new data
  const selectedItem = data.find(d => d.date === selectedDate) ?? (data.length > 0 ? data[0] : null);
  useEffect(() => {
    if (!loading && data.length > 0 && !data.find(d => d.date === selectedDate)) {
      setSelectedDate(data[0].date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading]);

  const isBookingDisabled = trainPhase === 'DEPARTED' || trainPhase === 'BOOKING_UNAVAILABLE';
  const bookNowDisabled   = loading || isBookingDisabled || !(selectedItem?.isBookable);

  return (
    <div style={{ background: 'var(--tk-paper)', padding: '10px 14px 14px' }}>
      {/* Date strip */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80px', gap: '8px' }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid var(--tk-track)',
            borderTopColor: 'var(--tk-brass)',
            animation: 'spin 0.7s linear infinite',
          }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--tk-ink-muted)' }}>
            Loading availability…
          </span>
        </div>
      ) : (
        /* tile-data-loaded gates the CSS flip animation */
        <div
          className={dataLoaded ? 'tile-data-loaded' : ''}
          style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'thin' }}
        >
          {data.map((item, i) => {
            const sig        = statusToSignal(item);
            const isSelected = selectedDate === item.date;
            const [, , dd]   = item.date.split('-');
            const dayLabel   = item.label?.slice(0, 3) ?? '';

            return (
              <div
                key={item.date}
                className="sr-tile"
                role="button"
                tabIndex={0}
                aria-label={`${item.label} — ${sig.label}${item.fare ? `, ₹${item.fare}` : ''}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedDate(item.date)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDate(item.date); }
                }}
                style={{
                  flexShrink: 0,
                  minWidth: '80px',
                  border: isSelected ? '1px solid var(--tk-navy)' : '1px solid var(--tk-track)',
                  borderBottom: isSelected ? '2px solid var(--tk-brass)' : '1px solid var(--tk-track)',
                  borderRadius: '4px',
                  padding: '8px 6px 10px',
                  textAlign: 'center',
                  background: isSelected ? 'var(--tk-navy)' : 'var(--tk-paper-raised)',
                  cursor: 'pointer',
                  transition: 'border-color 0.12s, background 0.12s',
                  outline: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                  animationDelay: `${i * 50}ms`,
                  opacity: (item.status === 'REGRET' || item.status === 'DEPARTED') ? 0.65 : 1,
                }}
                onFocus={e => { e.currentTarget.style.outline = '2px solid var(--tk-brass)'; e.currentTarget.style.outlineOffset = '2px'; }}
                onBlur={e => { e.currentTarget.style.outline = 'none'; }}
              >
                {/* Date digit */}
                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: isSelected ? '#FAF6EC' : 'var(--tk-ink)',
                  lineHeight: 1,
                  margin: '0 0 2px',
                  letterSpacing: '-0.03em',
                }}>
                  {dd}
                </p>

                {/* Day label */}
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '9px',
                  fontWeight: 500,
                  color: isSelected ? 'rgba(250,246,236,0.65)' : 'var(--tk-ink-muted)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  margin: '0 0 6px',
                }}>
                  {dayLabel}
                </p>

                {/* Split-flap mid-seam line */}
                <div style={{
                  position: 'absolute',
                  left: 0, right: 0,
                  top: '50%',
                  height: '1px',
                  background: isSelected ? 'rgba(250,246,236,0.12)' : 'var(--tk-track)',
                  pointerEvents: 'none',
                }} />

                {/* Status text — colored, no filled badge */}
                {item.status !== 'TATKAL_NOT_YET' && (
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '9px',
                    fontWeight: 600,
                    color: isSelected
                      ? (sig.textColor === 'var(--tk-signal-green)'
                          ? '#8ECFAD'
                          : sig.textColor === 'var(--tk-signal-red)'
                            ? '#F08A80'
                            : 'rgba(250,246,236,0.55)')
                      : sig.textColor,
                    letterSpacing: '0.04em',
                    textDecoration: sig.strikethrough ? 'line-through' : 'none',
                    margin: '0 0 2px',
                    lineHeight: 1.2,
                  }}>
                    {sig.label}
                  </p>
                )}

                {/* Tatkal countdown */}
                {item.status === 'TATKAL_NOT_YET' && (
                  <TatkalTimer
                    minsUntilOpen={item.minsUntilOpen}
                    opensInDays={item.opensInDays ?? 0}
                    opensOnDate={item.opensOnDate}
                    opensAt={item.opensAt}
                    onComplete={fetchAvailability}
                  />
                )}

                {/* Tatkal REGRET → nudge to General */}
                {item.status === 'REGRET' && quota === 'tatkal' && (
                  <button
                    style={{
                      marginTop: '3px', fontSize: '9px',
                      color: isSelected ? 'rgba(250,246,236,0.55)' : 'var(--tk-ink-muted)',
                      textDecoration: 'underline', cursor: 'pointer',
                      background: 'none', border: 'none',
                      fontFamily: 'var(--font-body)', lineHeight: 1.2,
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      const p = new URLSearchParams(window.location.search);
                      p.set('quota', 'general');
                      navigate(`/search-results?${p.toString()}`);
                    }}
                  >
                    General?
                  </button>
                )}

                {/* Fare */}
                {item.status !== 'TATKAL_NOT_YET' && (
                  <p
                    title={train.fareApproximate ? 'Approximate fare — exact fare unavailable for this train' : ''}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: isSelected
                        ? 'rgba(250,246,236,0.85)'
                        : item.fare
                          ? (train.fareApproximate ? 'var(--tk-brass)' : 'var(--tk-ink)')
                          : 'var(--tk-track)',
                      marginTop: '2px',
                      fontStyle: train.fareApproximate && item.fare ? 'italic' : 'normal',
                    }}
                  >
                    {item.fare
                      ? `${train.fareApproximate ? '~' : ''}₹${item.fare}`
                      : '—'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Book Now row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '10px', gap: '12px' }}>
        {/* Summary — date + fare label beside the button */}
        {selectedItem && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--tk-ink-muted)' }}>
            {selectedItem.label}
            {selectedItem.isBookable && (
              <>
                {' · '}
                <span
                  title={train.fareApproximate ? 'Approximate fare — exact fare unavailable for this train' : ''}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: train.fareApproximate ? 'var(--tk-brass)' : 'var(--tk-ink)',
                    fontStyle: train.fareApproximate && selectedItem.fare > 0 ? 'italic' : 'normal',
                  }}
                >
                  {selectedItem.fare > 0
                    ? `${train.fareApproximate ? '~' : ''}₹${selectedItem.fare}`
                    : 'Fare N/A'}
                </span>
              </>
            )}
          </span>
        )}

        {/* Book Now — flat brass button */}
        <button
          onClick={() => onBook(selectedItem?.date ?? searchDate)}
          disabled={bookNowDisabled}
          className="tk-book-btn"
          style={{ cursor: bookNowDisabled ? 'not-allowed' : 'pointer' }}
          onMouseEnter={e => { if (!bookNowDisabled) e.currentTarget.style.filter = 'brightness(0.92)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
          aria-disabled={bookNowDisabled}
        >
          Book Now →
        </button>
      </div>
    </div>
  );
}

// ─── Main TrainCard — ticket stub layout ──────────────────────────────────────

const CLASS_ORDER = ['SL', '3A', '2A', '1A', 'CC', '2S'];

export default function TrainCard({ train, searchedClass, searchDate, quota = 'general' }) {
  const navigate = useNavigate();

  // Derive available classes
  let availableClasses = CLASS_ORDER.filter(c => train.availability?.[c]);
  if (availableClasses.length === 0 && train.fares?.length > 0) {
    availableClasses = CLASS_ORDER.filter(c => train.fares.some(f => f.class_code === c));
  }
  if (availableClasses.length === 0) availableClasses = ['SL', '3A', '2A'];

  const initialClass = availableClasses.includes(searchedClass) ? searchedClass : availableClasses[0];
  const [activeClass, setActiveClass] = useState(initialClass);

  const trainPhase   = train.trainPhase   ?? 'ARP_OPEN';
  const currAvlCount = train.currAvlCount ?? 0;
  const isPhaseBlocked = trainPhase === 'DEPARTED' || trainPhase === 'BOOKING_UNAVAILABLE';

  // Running days
  const DAYS     = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const runsCols = ['runs_sun', 'runs_mon', 'runs_tue', 'runs_wed', 'runs_thu', 'runs_fri', 'runs_sat'];
  const dateObj  = searchDate ? new Date(searchDate) : new Date();
  const todayIdx = dateObj.getDay();

  function handleBook(bookingDate) {
    const params = new URLSearchParams({
      from:  train.fromStation,
      to:    train.toStation,
      date:  bookingDate,
      class: activeClass,
    });
    navigate(`/booking/${train.trainNumber}?${params}`);
  }

  return (
    <div
      className="tk-card"
      style={{
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid var(--tk-track)',
        boxShadow: '0 1px 2px rgba(43,38,32,0.06)',
        background: 'var(--tk-paper-raised)',
        opacity: isPhaseBlocked ? 0.72 : 1,
        transition: 'border-color 0.15s ease, opacity 0.2s ease',
        marginBottom: '10px',
      }}
      onMouseEnter={e => { if (!isPhaseBlocked) e.currentTarget.style.borderColor = 'var(--tk-brass)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--tk-track)'; }}
    >
      {/* Phase banner — full width at top */}
      <PhaseBanner trainPhase={trainPhase} currAvlCount={currAvlCount} />

      {/* Ticket body — two-zone flex layout */}
      <div className="tk-ticket-body">

        {/* ── LEFT ZONE: Train identity ─────────────────────────────── */}
        <div className="tk-zone-left">
          {/* Train name */}
          <h3 style={{
            fontFamily: 'var(--font-slab)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--tk-navy)',
            margin: '0 0 2px',
            lineHeight: 1.25,
          }}>
            {train.trainName}
          </h3>

          {/* Train number */}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--tk-ink-muted)',
            letterSpacing: '0.04em',
            display: 'block',
            marginBottom: '12px',
          }}>
            {train.trainNumber}
          </span>

          {/* Running days */}
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {DAYS.map((day, idx) => {
              const runs    = train[runsCols[idx]] === 1;
              const isToday = idx === todayIdx;
              return (
                <span key={idx} style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '9px',
                  fontWeight: isToday ? 700 : (runs ? 500 : 400),
                  color: isToday
                    ? 'var(--tk-brass)'
                    : runs
                      ? 'var(--tk-ink-muted)'
                      : 'var(--tk-track)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                  {day}
                </span>
              );
            })}
          </div>

          {/* Distance */}
          {train.distanceKm > 0 && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--tk-ink-muted)',
              fontWeight: 500,
              marginBottom: '4px',
            }}>
              {train.distanceKm} km
            </div>
          )}

          {/* Approx fare notice */}
          {train.fareApproximate && (
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '9px',
              color: 'var(--tk-brass)',
              fontStyle: 'italic',
              marginTop: '4px',
            }}>
              ~fare estimate
            </div>
          )}
        </div>

        {/* ── VERTICAL PERFORATION ────────────────────────────────────── */}
        <div className="tk-perf-v" aria-hidden="true" />

        {/* ── RIGHT ZONE: Route + Booking ─────────────────────────────── */}
        <div className="tk-zone-right">
          {/* Route strip (dep time → track → arr time) */}
          <RouteStrip train={train} />

          {/* Class tabs row */}
          <div style={{
            display: 'flex',
            gap: '5px',
            padding: '10px 14px 0',
            flexWrap: 'wrap',
            background: 'var(--tk-paper)',
          }}>
            {availableClasses.map(cls => {
              const isActive  = activeClass === cls;
              const dotColor  = classAvailToSignal(train.availability?.[cls]);
              return (
                <button
                  key={cls}
                  onClick={() => setActiveClass(cls)}
                  className={`tk-class-tab${isActive ? ' active' : ''}`}
                  onFocus={e => { e.currentTarget.style.outline = '2px solid var(--tk-brass)'; e.currentTarget.style.outlineOffset = '2px'; }}
                  onBlur={e => { e.currentTarget.style.outline = 'none'; }}
                >
                  {/* Signal dot */}
                  <span style={{
                    display: 'inline-block',
                    width: 6, height: 6,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }} />
                  {cls}
                </button>
              );
            })}
          </div>

          {/* Date strip + Book Now */}
          {activeClass && (
            <AvailabilityGrid
              searchDate={searchDate}
              train={train}
              activeClass={activeClass}
              trainPhase={trainPhase}
              quota={quota}
              onBook={handleBook}
            />
          )}
        </div>
      </div>
    </div>
  );
}
