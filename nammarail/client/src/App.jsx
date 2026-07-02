// =============================================================================
// NammaRail — Root App Component
// =============================================================================

import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import ProtectedRoute from './components/auth/ProtectedRoute';

import HomePage                from './pages/HomePage';
import SearchResultsPage       from './pages/SearchResultsPage';
import TrainDetailPage         from './pages/TrainDetailPage';
import PassengerFormPage       from './pages/PassengerFormPage';
import BookingConfirmationPage from './pages/BookingConfirmationPage';
import MyBookingsPage          from './pages/MyBookingsPage';
import LoginPage               from './pages/LoginPage';
import RegisterPage            from './pages/RegisterPage';
import BookingDetailPage       from './pages/BookingDetailPage';
import TatkalArena             from './pages/TatkalArena';
import PNRStatus               from './pages/PNRStatus';
import Chart                   from './pages/Chart';
import AIAssistant             from './components/chat/AIAssistant';

// ─── 404 ──────────────────────────────────────────────────────────────────────
function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4"
      style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="text-6xl">🚉</div>
      <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>404 — Platform Not Found</h1>
      <p style={{ color: 'var(--text-secondary)' }}>
        This train doesn't stop here. Let's get you back on track.
      </p>
      <Link to="/" className="btn-primary mt-2">← Back to Home</Link>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/"                                       element={<HomePage />} />
          <Route path="/search-results"                         element={<SearchResultsPage />} />
          <Route path="/booking/:trainNumber"                   element={<TrainDetailPage />} />
          <Route path="/login"                                  element={<LoginPage />} />
          <Route path="/register"                               element={<RegisterPage />} />

          {/* ── Protected routes — require a valid login session ─────────────
              ProtectedRoute shows a spinner while auth state loads from
              localStorage, then redirects to /login if not authenticated.
              It passes location.pathname as state.from so LoginPage can
              send the user back here after a successful login. */}
          <Route path="/passengers" element={
            <ProtectedRoute><PassengerFormPage /></ProtectedRoute>
          } />
          <Route path="/booking-confirmation/:bookingId" element={
            <ProtectedRoute><BookingConfirmationPage /></ProtectedRoute>
          } />
          <Route path="/pnr-status"                             element={<PNRStatus />} />
          <Route path="/chart"                                  element={<Chart />} />
          <Route path="/bookings/:bookingId" element={
            <ProtectedRoute><BookingDetailPage /></ProtectedRoute>
          } />
          <Route path="/my-bookings" element={
            <ProtectedRoute><MyBookingsPage /></ProtectedRoute>
          } />
          <Route path="/tatkal/:roomId" element={
            <ProtectedRoute><TatkalArena /></ProtectedRoute>
          } />

          <Route path="*"                                       element={<NotFoundPage />} />
        </Routes>
        <AIAssistant />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
