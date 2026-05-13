// =============================================================================
// NammaRail — My Bookings Page (Shell, Protected)
// =============================================================================
//
// HOW TO PROTECT A ROUTE IN REACT ROUTER:
// ─────────────────────────────────────────────────────────────────────────────
// There is no built-in "protected route" concept in React Router v6.
// The pattern is simple: at the TOP of the component, check if the user is
// logged in. If not, render <Navigate to="/login" /> immediately — React Router
// will redirect the browser before anything else renders.
//
// Why not protect at the route level (in App.jsx)?
// You can — but doing it per-page is simpler to understand and debug.
// For a larger app with many protected pages, a <PrivateRoute> wrapper
// component in App.jsx avoids repeating this check in every page.
// =============================================================================

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/layout/Layout';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function MyBookingsPage() {
  const { isLoggedIn, isLoading } = useAuth();

  // While AuthContext is restoring the session from localStorage, show a spinner.
  // Without this check, the page would briefly redirect to /login on refresh
  // before the token is restored — a jarring flash.
  if (isLoading) {
    return (
      <Layout>
        <LoadingSpinner text="Loading your account…" />
      </Layout>
    );
  }

  // If not logged in after loading completes → redirect to login.
  // <Navigate> renders nothing and immediately redirects the browser.
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          My Bookings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Your trip history and active tickets.
        </p>
      </div>

      <div className="card p-10 text-center">
        <div className="text-4xl mb-4">🎟️</div>
        <p style={{ color: 'var(--text-secondary)' }}>
          Booking cards with cancellation coming in the next build.
        </p>
      </div>
    </Layout>
  );
}
