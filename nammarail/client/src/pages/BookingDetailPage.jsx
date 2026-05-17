// =============================================================================
// NammaRail — Booking Detail Page
// =============================================================================
//
// Accessible via /bookings/:bookingId
// Full detail view for a single booking — richer than the compact BookingCard.
//
// WHY RE-FETCH ON THIS PAGE (instead of using cached state)?
// ─────────────────────────────────────────────────────────────────────────────
// Waitlist (WL) status is DYNAMIC — it changes whenever another passenger
// cancels their ticket. The status we stored in state or localStorage when
// the user first booked could be hours or days old by the time they open
// this detail page. A WL ticket could have silently become CNF.
//
// Re-fetching on page load ensures we always show the LIVE status from the
// database. We compare it to the last-known status and show a green banner
// if it improved (WL → CNF), which is a pleasant surprise for the user.
//
// This is the "stale state" problem — cached data that no longer matches
// the server's ground truth. The fix is always: re-fetch when freshness matters.
// =============================================================================

import { useEffect, useState }     from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { getBookingById }           from '../api/bookingApi';
import { useAuth }                  from '../context/AuthContext';
import Layout                       from '../components/layout/Layout';
import TrainLoader               from '../components/ui/TrainLoader';
import StatusBadge                  from '../components/ui/StatusBadge';
import CancelModal                  from '../components/bookings/CancelModal';
import { useBookings }              from '../hooks/useBookings';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CLASS_LABELS = {
  '1A': 'First AC', '2A': 'Second AC', '3A': 'Third AC',
  'SL': 'Sleeper',  'CC': 'Chair Car', '2S': 'Second Sitting',
};

// Intl.DateTimeFormat — built-in JS formatter, no library needed
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

function isWithin4Hours(journeyDate, departureTime) {
  if (!journeyDate) return true;
  const [y, m, d]      = journeyDate.split('-').map(Number);
  const [hr = 0, min = 0] = (departureTime ?? '00:00').split(':').map(Number);
  const departure      = new Date(y, m - 1, d, hr, min, 0);
  return (departure - Date.now()) / (1000 * 60 * 60) < 4;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5"
      style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className={`text-sm font-semibold text-right ${highlight ? 'text-lg font-bold' : ''}`}
        style={{ color: highlight ? 'var(--brand)' : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}

function UpgradesBanner({ booking }) {
  // Check if any passenger has improved from WL to CNF since the booking was created.
  // We infer "was WL" from the booking meta if available, otherwise we just
  // show the current confirmed status as a success message.
  const passengers = booking.passengers ?? [];
  const allConfirmed = passengers.length > 0 &&
    passengers.every(p => p.status?.toUpperCase() === 'CNF');

  if (!allConfirmed) return null;

  // Show upgrade banner if booking was originally WL (detect via wl_at field)
  const wasWL = passengers.some(p => p.original_status?.startsWith('WL'));
  if (!wasWL) return null;

  return (
    <div className="rounded-xl p-4 mb-5 bg-green-50 border border-green-200 text-green-800
                    dark:bg-green-900/20 dark:border-green-700 dark:text-green-300">
      <p className="font-bold">🎉 Great news! Your ticket is now CONFIRMED</p>
      <p className="text-xs mt-1 opacity-80">
        Your waitlisted ticket was confirmed after another passenger cancelled.
      </p>
    </div>
  );
}

function PassengerTable({ passengers }) {
  return (
    <div className="overflow-x-auto mb-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide"
            style={{ color: 'var(--text-tertiary)' }}>
            <th className="text-left pb-2 font-semibold">Name</th>
            <th className="text-center pb-2 font-semibold">Age</th>
            <th className="text-center pb-2 font-semibold">Gender</th>
            <th className="text-center pb-2 font-semibold">Seat</th>
            <th className="text-right pb-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {passengers.map((p, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="py-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                {p.name}
              </td>
              <td className="py-2 text-center" style={{ color: 'var(--text-secondary)' }}>
                {p.age}
              </td>
              <td className="py-2 text-center" style={{ color: 'var(--text-secondary)' }}>
                {p.gender}
              </td>
              <td className="py-2 text-center font-mono text-xs"
                style={{ color: 'var(--text-secondary)' }}>
                {p.seat_number ?? '—'}
              </td>
              <td className="py-2 text-right">
                <StatusBadge status={p.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BookingDetailPage() {
  const { bookingId }     = useParams();
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  const [booking,    setBooking]    = useState(null);
  const [isLoading,  setIsLoading]  = useState(true);
  const [fetchError, setFetchError] = useState(null);   // 'forbidden' | 'notfound' | string
  const [modalStep,  setModalStep]  = useState(null);
  const [errorMsg,   setErrorMsg]   = useState('');
  const { cancelBooking } = useBookings();

  useEffect(() => {
    if (!isLoggedIn || authLoading) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const res = await getBookingById(bookingId);
        if (!cancelled) setBooking(res.data?.booking ?? res.data);
      } catch (err) {
        if (!cancelled) {
          const status = err.response?.status;
          if (status === 403) setFetchError('forbidden');
          else if (status === 404) setFetchError('notfound');
          else setFetchError(err.response?.data?.message ?? 'Failed to load booking.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [bookingId, isLoggedIn, authLoading]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (authLoading) {
    return <Layout><TrainLoader message="Loading…" size="large" /></Layout>;
  }
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  // ── Error states ──────────────────────────────────────────────────────────
  if (fetchError === 'forbidden') {
    return (
      <Layout>
        <div className="card p-10 text-center max-w-md mx-auto mt-10">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Access denied
          </h1>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            This booking doesn't belong to your account.
          </p>
          <Link to="/my-bookings" className="btn-primary px-5 py-2.5">
            ← My Bookings
          </Link>
        </div>
      </Layout>
    );
  }

  if (fetchError === 'notfound') {
    return (
      <Layout>
        <div className="card p-10 text-center max-w-md mx-auto mt-10">
          <div className="text-4xl mb-3">🚫</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Booking not found
          </h1>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            The booking ID <code className="font-mono">{bookingId}</code> doesn't exist.
          </p>
          <Link to="/my-bookings" className="btn-primary px-5 py-2.5">
            ← My Bookings
          </Link>
        </div>
      </Layout>
    );
  }

  if (fetchError) {
    return (
      <Layout>
        <div className="card p-10 text-center max-w-md mx-auto mt-10">
          <p className="text-red-600 dark:text-red-400 font-semibold mb-3">{fetchError}</p>
          <Link to="/my-bookings" className="btn-outline px-5 py-2.5">← My Bookings</Link>
        </div>
      </Layout>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading || !booking) {
    return <Layout><TrainLoader message="Loading booking…" size="large" /></Layout>;
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const passengers   = booking.passengers ?? [];
  const isCancelled  = !!booking.cancelled_at;
  const isPast       = !isCancelled && new Date(booking.journey_date) < new Date(new Date().setHours(0,0,0,0));
  const within4h     = isWithin4Hours(booking.journey_date, booking.departure_time);
  const showCancel   = !isCancelled && !isPast && !within4h;
  const classLabel   = CLASS_LABELS[booking.class_code] ?? booking.class_code ?? '—';
  const pnr          = (booking.booking_id ?? booking.id ?? '').toUpperCase().slice(0, 8);
  const totalFare    = Number(booking.total_fare ?? 0);

  // ── Cancel handlers ───────────────────────────────────────────────────────
  async function handleConfirmCancel() {
    setModalStep('loading');
    const result = await cancelBooking(booking.booking_id ?? booking.id);
    if (result.success) {
      // Re-fetch to show updated status
      try {
        const res = await getBookingById(bookingId);
        setBooking(res.data?.booking ?? res.data);
      } catch { /* ignore */ }
      setModalStep('success');
    } else {
      setErrorMsg(result.error);
      setModalStep('error');
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* ── Back link ────────────────────────────────────────────────── */}
        <Link
          to="/my-bookings"
          className="inline-flex items-center gap-1.5 text-sm font-semibold mb-5"
          style={{ color: 'var(--brand)' }}
        >
          ← Back to my bookings
        </Link>

        {/* ── WL → CNF upgrade banner ──────────────────────────────────── */}
        <UpgradesBanner booking={booking} />

        {/* ── Ticket card ──────────────────────────────────────────────── */}
        <div
          className="card overflow-hidden mb-5"
          style={{ borderLeft: isCancelled ? '4px solid #DC2626' : '4px solid var(--brand)' }}
        >
          {/* Header strip */}
          <div
            className="px-5 py-4 text-white"
            style={{ background: isCancelled
              ? 'linear-gradient(135deg, #991B1B, #DC2626)'
              : 'linear-gradient(135deg, var(--brand), var(--brand-hover))' }}
          >
            <p className="text-xs opacity-80 font-semibold mb-0.5">🚆 NammaRail</p>
            <h1 className="text-xl font-bold">
              {isCancelled ? '🚫 Booking Cancelled' : `${booking.train_name ?? 'Train'}`}
            </h1>
            <p className="text-sm opacity-80 mt-0.5 font-mono tracking-widest">PNR: {pnr}</p>
          </div>

          {/* Body */}
          <div className="p-5 md:p-6" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{ color: 'var(--brand)' }}>
              Journey Details
            </p>

            <DetailRow label="Train"        value={`${booking.train_name} #${booking.train_number}`} />
            <DetailRow label="From"         value={booking.from_station} />
            <DetailRow label="To"           value={booking.to_station} />
            <DetailRow label="Date"         value={formatDate(booking.journey_date)} />
            <DetailRow label="Departure"    value={booking.departure_time ?? '—'} />
            <DetailRow label="Class"        value={classLabel} />
            <DetailRow label="Booking type" value={
              booking.booking_type === 'tatkal' ? '⚡ Tatkal' : 'Normal'
            } />
            <DetailRow label="Booked on"    value={
              booking.created_at
                ? new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  }).format(new Date(booking.created_at))
                : '—'
            } />
            {isCancelled && (
              <DetailRow
                label="Cancelled on"
                value={new Intl.DateTimeFormat('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                }).format(new Date(booking.cancelled_at))}
              />
            )}
            <DetailRow label="Total fare" value={`₹${totalFare.toLocaleString('en-IN')}`} highlight />

            {/* Passengers */}
            <p className="text-xs font-bold uppercase tracking-widest mt-5 mb-3"
              style={{ color: 'var(--brand)' }}>
              Passengers
            </p>
            <PassengerTable passengers={passengers} />

            {/* Cancel button at bottom */}
            {showCancel && (
              <button
                id="detail-cancel-btn"
                onClick={() => setModalStep('idle')}
                className="w-full py-3 rounded-xl font-semibold text-sm border-2 border-red-400
                           text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400
                           dark:hover:bg-red-900/20 transition-all duration-150"
              >
                Cancel this booking
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Cancel Modal ─────────────────────────────────────────────────── */}
      {modalStep !== null && (
        <CancelModal
          booking={booking}
          step={modalStep}
          errorMsg={errorMsg}
          onKeep={() => { setModalStep(null); setErrorMsg(''); }}
          onConfirm={handleConfirmCancel}
          onClose={() => { setModalStep(null); setErrorMsg(''); }}
          onRetry={() => setModalStep('idle')}
        />
      )}
    </Layout>
  );
}
