// =============================================================================
// NammaRail — ProtectedRoute Component
// =============================================================================
//
// THE RACE CONDITION BUG (and why this component exists):
// ─────────────────────────────────────────────────────────────────────────────
// This is a race condition — two things are happening at the same time:
// (1) React renders the component, (2) useEffect reads localStorage.
// React renders first, sees isLoggedIn=false, and redirects. The fix is to
// show a loading state while we wait for the auth check to complete. Only
// THEN do we decide whether to redirect.
//
// Without this guard, even a fully logged-in user would be kicked to /login
// on every page refresh, because AuthContext reads localStorage inside a
// useEffect, which always runs AFTER the first render. On that first render
// isLoggedIn is still false — so any route guard that checks isLoggedIn
// immediately would wrongly redirect the user.
//
// REDIRECT-AFTER-LOGIN pattern:
// ─────────────────────────────────────────────────────────────────────────────
// When a user tries to visit /my-bookings without being logged in, we send
// them to /login but remember where they were going by passing the intended
// path in React Router's location state (state.from = '/my-bookings').
// After they log in successfully, LoginPage reads state.from and sends them
// back to /my-bookings instead of the homepage. Better UX — the user ends
// up exactly where they wanted to be.
// =============================================================================

import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import TrainLoader from '../ui/TrainLoader';

/**
 * Wraps any route that requires authentication.
 *
 * Render logic:
 *   isLoading=true  → localStorage not yet read; show spinner, don't redirect
 *   isLoading=false, isLoggedIn=false → redirect to /login (with return path)
 *   isLoading=false, isLoggedIn=true  → render the protected page
 */
export default function ProtectedRoute({ children }) {
  const { isLoggedIn, isLoading } = useAuth();
  const location = useLocation();

  // Still reading localStorage — auth state is not ready yet.
  // Redirecting now would be wrong; the user might already be logged in.
  // Show a full-screen spinner and wait for the check to complete.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}>
        <TrainLoader message="Loading account…" size="large" />
      </div>
    );
  }

  // Auth check is done and user is not logged in.
  // Pass location.pathname as state.from so LoginPage can redirect back here
  // after a successful login (the redirect-after-login pattern).
  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Auth check is done and user IS logged in — render the requested page.
  return children;
}
