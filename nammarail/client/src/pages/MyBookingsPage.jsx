// =============================================================================
// NammaRail — My Bookings Page (Full Implementation)
// =============================================================================
//
// HOW TO PROTECT A ROUTE IN REACT ROUTER:
// ─────────────────────────────────────────────────────────────────────────────
// There is no built-in "protected route" concept in React Router v6.
// The pattern is simple: at the TOP of the component, check if the user is
// logged in. If not, render <Navigate to="/login" /> immediately — React Router
// will redirect the browser before anything else renders.
//
// WHY SPLIT UPCOMING / PAST / CANCELLED ON THE FRONTEND?
// ─────────────────────────────────────────────────────────────────────────────
// The backend returns ALL bookings in a single GET /api/bookings/my call.
// The frontend then groups them into three tabs. Advantages of this approach:
//   1. Simpler API — one endpoint, no ?tab= or ?filter= query params
//   2. Flexible UI — if we add a "Travelling today" tab later, it's a frontend
//      change only, the server doesn't need to change
//   3. Avoids three round-trips (one per tab) which would slow the page load
// The trade-off is that for users with thousands of bookings the payload is
// large — acceptable for a typical user with <50 bookings lifetime.
// =============================================================================

import { useEffect, useState }  from 'react';
import { Navigate, Link }       from 'react-router-dom';
import { useAuth }              from '../context/AuthContext';
import { useBookings }          from '../hooks/useBookings';
import Layout                   from '../components/layout/Layout';
import LoadingSpinner            from '../components/ui/LoadingSpinner';
import BookingCard              from '../components/bookings/BookingCard';

// ─── Tab configuration ────────────────────────────────────────────────────────
const TABS = [
  { id: 'upcoming',  label: 'Upcoming' },
  { id: 'past',      label: 'Past'     },
  { id: 'cancelled', label: 'Cancelled'},
];

// ─── Empty state component ────────────────────────────────────────────────────
function EmptyState({ type }) {
  if (type === 'upcoming') {
    return (
      <div className="card p-10 text-center">
        <div className="text-5xl mb-4">🚆</div>
        <p className="font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
          No upcoming trips
        </p>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
          Plan your next journey with NammaRail
        </p>
        <Link to="/" className="btn-primary inline-block px-6 py-2.5">
          Search trains
        </Link>
      </div>
    );
  }
  if (type === 'past') {
    return (
      <div className="card p-10 text-center">
        <div className="text-5xl mb-4">📜</div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          No past journeys yet
        </p>
      </div>
    );
  }
  return (
    <div className="card p-10 text-center">
      <div className="text-5xl mb-4">🙌</div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        No cancelled bookings
      </p>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ activeTab, setActiveTab, counts }) {
  return (
    /*
      Tab bar is horizontally scrollable on mobile (overflow-x-auto + flex-nowrap).
      This prevents tabs from wrapping into multiple rows on narrow screens,
      which would waste vertical space and look cluttered.
    */
    <div
      className="flex gap-1 mb-6 overflow-x-auto"
      style={{
        borderBottom: '2px solid var(--border)',
        scrollbarWidth: 'none',     // hide scrollbar on Firefox
        msOverflowStyle: 'none',    // hide scrollbar on IE/Edge
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className="flex-shrink-0 px-5 py-3 text-sm font-semibold transition-all duration-150
                       whitespace-nowrap relative"
            style={{
              color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: '-2px',  // overlap the container border-bottom
              background: 'transparent',
            }}
          >
            {tab.label}
            <span
              className="ml-2 text-xs px-1.5 py-0.5 rounded-full font-bold"
              style={{
                backgroundColor: isActive ? 'var(--brand-light)' : 'var(--bg-tertiary)',
                color:           isActive ? 'var(--brand)'       : 'var(--text-tertiary)',
              }}
            >
              {counts[tab.id] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Booking list ─────────────────────────────────────────────────────────────
function BookingList({ bookings, type, onRefresh }) {
  if (!bookings.length) return <EmptyState type={type} />;

  return (
    <div className="space-y-4">
      {bookings.map(b => (
        <BookingCard
          key={b.booking_id ?? b.id}
          booking={b}
          type={type}
          onCancelClick={onRefresh}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MyBookingsPage() {
  const { isLoggedIn, isLoading: authLoading, user } = useAuth();
  const {
    isLoading, error,
    fetchBookings,
    getUpcoming, getPast, getCancelled,
  } = useBookings();

  const [activeTab, setActiveTab] = useState('upcoming');

  // Guard: wait for auth before deciding to redirect
  useEffect(() => {
    if (isLoggedIn) fetchBookings();
  }, [isLoggedIn, fetchBookings]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <Layout>
        <LoadingSpinner text="Loading your account…" />
      </Layout>
    );
  }
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  // ── Derived data ──────────────────────────────────────────────────────────
  const upcoming  = getUpcoming();
  const past      = getPast();
  const cancelled = getCancelled();
  const counts    = { upcoming: upcoming.length, past: past.length, cancelled: cancelled.length };

  const currentList = activeTab === 'upcoming'  ? upcoming
                    : activeTab === 'past'       ? past
                    : cancelled;

  return (
    <Layout>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          My Bookings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Hi {user?.name?.split(' ')[0] ?? 'there'}, here are your trips
        </p>
      </div>

      {/* ── Loading / Error ──────────────────────────────────────────────── */}
      {isLoading && <LoadingSpinner text="Loading your bookings…" />}

      {error && !isLoading && (
        <div className="card p-5 text-center mb-6 text-red-600 dark:text-red-400">
          <p className="font-semibold mb-2">{error}</p>
          <button onClick={fetchBookings} className="btn-outline text-sm px-4 py-2">
            Try again
          </button>
        </div>
      )}

      {/* ── Tab bar + content ────────────────────────────────────────────── */}
      {!isLoading && !error && (
        <>
          <TabBar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            counts={counts}
          />
          <BookingList
            bookings={currentList}
            type={activeTab}
            onRefresh={fetchBookings}
          />
        </>
      )}
    </Layout>
  );
}
