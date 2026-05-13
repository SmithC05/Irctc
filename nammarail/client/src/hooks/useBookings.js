// =============================================================================
// NammaRail — useBookings Custom Hook
// =============================================================================
//
// WHY A CUSTOM HOOK INSTEAD OF useState IN THE COMPONENT?
// ─────────────────────────────────────────────────────────────────────────────
// A custom hook extracts stateful logic OUT of components. Both MyBookingsPage
// and BookingDetailPage need similar booking fetch logic. Instead of
// copy-pasting useState + useEffect in both files, we write it ONCE in a hook
// and reuse it. This is the same idea as utility functions — Don't Repeat
// Yourself (DRY). Custom hooks also make components easier to read: the
// component focuses on rendering, the hook focuses on data management.
//
// Custom hooks are just regular JavaScript functions whose names start with
// "use". They can call other hooks (useState, useEffect) internally.
// React's linter rules apply to them the same as to components.
// =============================================================================

import { useState, useCallback } from 'react';
import { getMyBookings, cancelBooking as cancelBookingApi } from '../api/bookingApi';

// ─── Date helpers ─────────────────────────────────────────────────────────────

// Returns a Date object at midnight for a given date string (YYYY-MM-DD).
// We use midnight so that a journey_date of "today" is NOT treated as past.
function dateAtMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);   // month is 0-indexed in JS
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBookings() {
  const [bookings,   setBookings]   = useState([]);
  const [isLoading,  setIsLoading]  = useState(false);
  const [error,      setError]      = useState(null);

  // ── fetchBookings ───────────────────────────────────────────────────────────
  // Calls GET /api/bookings/my and stores the full list.
  // Splitting into upcoming/past/cancelled is done in the filter functions below
  // (frontend split) rather than via separate API calls. This keeps the backend
  // API simple (one endpoint, one query) while giving the frontend flexibility
  // to display bookings in any grouping it wants.
  const fetchBookings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getMyBookings();
      // API returns { bookings: [...] } or just an array — handle both shapes
      const data = res.data?.bookings ?? res.data ?? [];
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to load bookings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── cancelBooking ───────────────────────────────────────────────────────────
  // Calls DELETE /api/bookings/:bookingId/cancel then refreshes the list.
  // Returns { success, data, error } so the caller (CancelModal) can react.
  const cancelBooking = useCallback(async (bookingId) => {
    try {
      const res = await cancelBookingApi(bookingId);
      // After cancellation, re-fetch so the card moves from Upcoming → Cancelled
      await fetchBookings();
      return { success: true, data: res.data };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.message ?? 'Cancellation failed.',
      };
    }
  }, [fetchBookings]);

  // ── Filter helpers ──────────────────────────────────────────────────────────
  // WHY SPLIT ON FRONTEND NOT BACKEND?
  // The backend returns all bookings in one call. The frontend then splits them
  // into three buckets. This approach keeps the API simple (no ?filter= params)
  // and lets the UI decide how to categorise — for example, if we later want a
  // "travelling today" tab, we only change frontend code, not the server.

  const today = new Date();
  today.setHours(0, 0, 0, 0);  // midnight so today's journeys count as upcoming

  const getUpcoming = useCallback(() =>
    bookings.filter(b =>
      !b.cancelled_at &&
      dateAtMidnight(b.journey_date) >= today
    ),
  [bookings]);  // eslint-disable-line react-hooks/exhaustive-deps

  const getPast = useCallback(() =>
    bookings.filter(b =>
      !b.cancelled_at &&
      dateAtMidnight(b.journey_date) < today
    ),
  [bookings]);  // eslint-disable-line react-hooks/exhaustive-deps

  const getCancelled = useCallback(() =>
    bookings.filter(b => !!b.cancelled_at),
  [bookings]);

  return {
    bookings,
    isLoading,
    error,
    fetchBookings,
    cancelBooking,
    getUpcoming,
    getPast,
    getCancelled,
  };
}
