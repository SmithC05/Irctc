// =============================================================================
// NammaRail — BookingCard Component
// =============================================================================
//
// Displays a single booking in a rich card layout. The card appearance changes
// based on the `type` prop: 'upcoming' (gold), 'past' (muted), 'cancelled' (red).
//
// Props:
//   booking       — full booking object from the API
//   type          — 'upcoming' | 'past' | 'cancelled'
//   onCancelClick — function(bookingId) called when Cancel is clicked
// =============================================================================

import { useState }    from 'react';
import { Link }        from 'react-router-dom';
import StatusBadge     from '../ui/StatusBadge';
import CancelModal     from './CancelModal';
import { useBookings } from '../../hooks/useBookings';

// ─── formatDate ───────────────────────────────────────────────────────────────
// Uses Intl.DateTimeFormat — the BUILT-IN JavaScript internationalisation API.
// No external libraries like moment.js or date-fns are needed.
// Intl.DateTimeFormat accepts a locale (e.g. 'en-IN') and an options object
// that controls which parts of the date to show and how to format them.
// Example output: "Sun, 15 Jun 2026"
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

// ─── isWithin4Hours ───────────────────────────────────────────────────────────
// Returns true if the departure is LESS THAN 4 hours away.
// We combine BOTH date AND time into a full Date object because:
//   - Same date, different time = different eligibility
//   - "2026-06-15" + "23:00" vs "2026-06-15" + "06:00" → 17h difference
//   - Using only the date (midnight) gives wrong results half the time
// This matches the backend's hoursBeforeDeparture calculation exactly,
// so the cancel button visibility aligns with the actual refund policy.
// (No cancel after 4h = no refund after 4h — same rule, shown consistently.)
function isWithin4Hours(journeyDate, departureTime) {
  if (!journeyDate) return true;   // be safe — hide cancel if no date
  const [y, m, d]      = journeyDate.split('-').map(Number);
  const [hr = 0, min = 0] = (departureTime ?? '00:00').split(':').map(Number);
  const departure      = new Date(y, m - 1, d, hr, min, 0);
  const hoursLeft      = (departure - Date.now()) / (1000 * 60 * 60);
  return hoursLeft < 4;
}

// ─── getRefundNote ────────────────────────────────────────────────────────────
// Returns a human-readable refund note for CANCELLED bookings only.
function getRefundNote(booking) {
  if (!booking.cancelled_at) return '';

  const type = (booking.booking_type ?? '').toLowerCase();
  if (type === 'tatkal') return 'No refund (Tatkal ticket)';

  // CANCELLED_WL = automatically cancelled at chart prep time (full refund per World Rules)
  const anyWLCancel = (booking.passengers ?? []).some(p => p.status === 'CANCELLED_WL');
  if (anyWLCancel) return 'Full refund issued (WL auto-cancelled at chart preparation)';

  const refund = Number(booking.refund_amount ?? 0);
  if (refund <= 0) {
    const isLate = isWithin4Hours(booking.journey_date, booking.departure_time);
    return isLate
      ? 'No refund (cancelled < 4h before departure)'
      : 'No refund applicable';
  }
  return `Refund: ₹${refund} processed`;
}

// ─── formatCancelledAt ────────────────────────────────────────────────────────
function formatCancelledAt(isoStr) {
  if (!isoStr) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(isoStr));
}

// ─── Sub-component: Route strip ───────────────────────────────────────────────
function RouteStrip({ booking }) {
  return (
    <div
      className="flex items-center gap-3 py-3 px-4 rounded-xl mb-3"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      <div className="text-center min-w-0">
        <p className="text-base font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {booking.departure_time ?? '—'}
        </p>
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--brand)' }}>
          {booking.from_station}
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center">
        <div
          className="flex items-center gap-1 w-full"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: 'var(--border)' }} />
          <span className="text-xs">→</span>
          <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: 'var(--border)' }} />
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {booking.arrival_time ?? ''}
        </p>
      </div>

      <div className="text-center min-w-0">
        <p className="text-base font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {booking.arrival_time ?? '—'}
        </p>
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--brand)' }}>
          {booking.to_station}
        </p>
      </div>
    </div>
  );
}

// ─── Sub-component: Journey meta row ──────────────────────────────────────────
const CLASS_LABELS = {
  '1A': 'First AC', '2A': 'Second AC', '3A': 'Third AC',
  'SL': 'Sleeper',  'CC': 'Chair Car', '2S': 'Second Sitting',
};

function JourneyMetaRow({ booking }) {
  const classLabel = CLASS_LABELS[booking.class_code] ?? booking.class_code ?? '—';
  const isTatkal   = (booking.booking_type ?? '').toLowerCase() === 'tatkal';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-sm">
      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
        {formatDate(booking.journey_date)}
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>{classLabel}</span>
      {isTatkal ? (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700
                         dark:bg-amber-900/30 dark:text-amber-300">
          ⚡ Tatkal
        </span>
      ) : (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600
                         dark:bg-blue-900/30 dark:text-blue-300">
          Normal
        </span>
      )}
    </div>
  );
}

// ─── Sub-component: Passenger list ────────────────────────────────────────────
function PassengerList({ passengers }) {
  if (!passengers?.length) return null;

  const hasWL        = passengers.some(p => p.status?.toUpperCase().startsWith('WL'));
  const hasRAC       = passengers.some(p => p.status?.toUpperCase().startsWith('RAC'));
  const hasCancelledWL = passengers.some(p => p.status === 'CANCELLED_WL');

  return (
    <div className="mb-3">
      <div className="space-y-1.5">
        {passengers.map((p, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap text-sm">
            <span style={{ color: 'var(--text-primary)' }}>
              {p.name} · {p.age}
            </span>
            {p.seat_number && (
              <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {p.seat_number}
              </span>
            )}
            <StatusBadge status={p.status} />
          </div>
        ))}
      </div>

      {/* WL warning banner */}
      {hasWL && !hasCancelledWL && (
        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          ⚠ Waitlisted — check status before travel
        </p>
      )}

      {/* CANCELLED_WL banner (auto-cancelled at chart prep) */}
      {hasCancelledWL && (
        <p className="mt-2 text-xs font-medium text-orange-600 dark:text-orange-400">
          📋 Auto-cancelled at chart preparation — full refund has been issued
        </p>
      )}

      {/* RAC info banner */}
      {hasRAC && !hasWL && !hasCancelledWL && (
        <p className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400">
          ℹ RAC — you may get a berth on chart preparation
        </p>
      )}
    </div>
  );
}

// ─── Main BookingCard ──────────────────────────────────────────────────────────

/**
 * @param {Object}   booking       - Full booking object from API
 * @param {'upcoming'|'past'|'cancelled'} type
 * @param {Function} onCancelClick - Called with bookingId when cancel pressed
 */
export default function BookingCard({ booking, type, onCancelClick }) {
  const [modalStep, setModalStep] = useState(null);   // null = closed
  const [errorMsg,  setErrorMsg]  = useState('');
  const { cancelBooking }         = useBookings();

  const passengers  = booking.passengers ?? [];
  const pnr         = (booking.booking_id ?? booking.id ?? '').toUpperCase().slice(0, 8);
  const totalFare   = Number(booking.total_fare ?? 0);

  // CANCELLED_WL = auto-cancelled at chart prep (different from user-initiated cancel)
  const hasCancelledWL = passengers.some(p => p.status === 'CANCELLED_WL');

  // ── Left border colour by type ────────────────────────────────────────────
  const borderLeft = type === 'cancelled'
    ? hasCancelledWL
      ? '4px solid #EA580C'     // orange-600 for auto-WL cancels (distinct from user-cancel)
      : '4px solid #DC2626'     // red-600 for user-initiated cancels
    : '4px solid var(--brand)'; // gold

  // ── Past cards are visually muted ─────────────────────────────────────────
  const cardOpacity = type === 'past' ? 'opacity-60' : '';

  // ── 4-hour rule for cancel button ─────────────────────────────────────────
  // WHY 4 HOURS?
  // Indian Railways (and our backend refund policy) applies 0% refund within
  // 4 hours of departure. Showing the cancel button when there's no refund
  // and no time to act creates confusion. We hide it to match backend logic.
  const within4h       = isWithin4Hours(booking.journey_date, booking.departure_time);
  const showCancelBtn  = type === 'upcoming' && !within4h;

  // ── Cancel flow handlers ──────────────────────────────────────────────────
  async function handleConfirmCancel() {
    setModalStep('loading');
    const result = await cancelBooking(booking.booking_id ?? booking.id);
    if (result.success) {
      setModalStep('success');
    } else {
      setErrorMsg(result.error);
      setModalStep('error');
    }
  }

  function handleCloseModal() {
    setModalStep(null);
    setErrorMsg('');
    if (onCancelClick) onCancelClick();   // triggers parent refresh
  }

  return (
    <>
      <div
        id={`booking-card-${pnr}`}
        className={`card p-4 md:p-5 transition-all duration-200 hover:shadow-md ${cardOpacity}`}
        style={{ borderLeft }}
      >
        {/* ── Card top strip ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              {booking.train_name ?? '—'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              #{booking.train_number}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs font-mono font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              PNR: {pnr || '—'}
            </p>
            {type === 'past' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full
                               bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                Completed
              </span>
            )}
          </div>
        </div>

        {/* ── Route display ────────────────────────────────────────────────── */}
        <RouteStrip booking={booking} />

        {/* ── Journey meta ──────────────────────────────────────────────────── */}
        <JourneyMetaRow booking={booking} />

        {/* ── Passengers ───────────────────────────────────────────────────── */}
        <PassengerList passengers={passengers} />

        {/* ── Cancelled-specific info ───────────────────────────────────────── */}
        {type === 'cancelled' && (
          <div className="text-xs mb-3 space-y-0.5">
            <p style={{ color: 'var(--text-tertiary)' }}>
              Cancelled on {formatCancelledAt(booking.cancelled_at)}
            </p>
            <p
              className={`font-semibold ${
                getRefundNote(booking).startsWith('Refund: ₹')
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-500 dark:text-red-400'
              }`}
            >
              {getRefundNote(booking)}
            </p>
          </div>
        )}

        {/* ── Bottom row: fare + actions ───────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 pt-2"
          style={{ borderTop: '1px solid var(--border)' }}>

          <p className="font-bold text-base" style={{ color: 'var(--brand)' }}>
            ₹{totalFare.toLocaleString('en-IN')}
          </p>

          <div className="flex items-center gap-2">
            <Link
              to={`/bookings/${booking.booking_id ?? booking.id}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-150"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              View details
            </Link>

            {showCancelBtn && (
              <button
                id={`cancel-btn-${pnr}`}
                onClick={() => setModalStep('idle')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-300
                           text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400
                           dark:hover:bg-red-900/20 transition-all duration-150"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Cancel Modal (portal-like, rendered inside card tree) ──────────── */}
      {modalStep !== null && (
        <CancelModal
          booking={booking}
          step={modalStep}
          errorMsg={errorMsg}
          onKeep={handleCloseModal}
          onConfirm={handleConfirmCancel}
          onClose={handleCloseModal}
          onRetry={() => setModalStep('idle')}
        />
      )}
    </>
  );
}
