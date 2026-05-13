// =============================================================================
// NammaRail — useRefundPreview Custom Hook
// =============================================================================
//
// WHY CALCULATE REFUND ON THE FRONTEND?
// ─────────────────────────────────────────────────────────────────────────────
// The backend is the SOURCE OF TRUTH for the actual refund amount — it
// calculates and processes the real transaction. However, we ALSO calculate
// it on the frontend so the user sees an ESTIMATED REFUND BEFORE they confirm
// cancellation. This pattern is called an "optimistic preview":
//   - User sees: "You'll get back ₹245" → makes an informed decision
//   - Without it: user clicks cancel, waits for API, then finds out "₹0 refund"
//     — too late, booking is already cancelled.
// The frontend calculation mirrors the backend hoursBeforeDeparture logic
// so the estimate is accurate. Minor discrepancies (e.g. service charge
// differences) are documented as "estimated".
// =============================================================================

import { useMemo } from 'react';

// ─── Refund slab table (mirrors backend refund logic) ─────────────────────────
// Indian Railways refund rules:
//   > 48h  before departure → 75% refund
//   12–48h before departure → 50% refund
//    4–12h before departure → 25% refund
//   < 4h   before departure → 0%  refund (no-show / last-minute)
//   Tatkal tickets          → 0%  refund (policy, regardless of hours)
//   WL (waitlisted) tickets → 100% refund (ticket was never confirmed)

const SLABS = [
  { hoursMin: 48,  percent: 75 },
  { hoursMin: 12,  percent: 50 },
  { hoursMin: 4,   percent: 25 },
  { hoursMin: 0,   percent: 0  },
];

/**
 * Combines a date string (YYYY-MM-DD) and time string (HH:MM or HH:MM:SS)
 * into a single JS Date object.
 *
 * WHY DO WE NEED BOTH DATE AND TIME?
 * ─────────────────────────────────────────────────────────────────────────────
 * The refund bracket depends on HOURS BEFORE DEPARTURE, not just the day.
 * A journey on "2026-06-15" departing at "23:00" is very different from one
 * departing at "06:00" — 17 hours apart. Using only the date (midnight) would
 * give the wrong bracket. The backend combines them the same way, so we must
 * replicate that here for the preview to be accurate.
 */
function combineDateAndTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour = 0, minute = 0] = (timeStr ?? '00:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0);
}

/**
 * Custom hook — given a full booking object, returns a refund preview.
 *
 * @param {Object|null} booking - Full booking object from API
 * @returns {{ refundPercent, refundAmount, cancellationCharge,
 *             refundNote, hasRefund }}
 */
export function useRefundPreview(booking) {
  return useMemo(() => {
    const EMPTY = {
      refundPercent:      0,
      refundAmount:       0,
      cancellationCharge: 0,
      refundNote:         'Select a booking to see refund estimate.',
      hasRefund:          false,
    };

    if (!booking) return EMPTY;

    const totalFare    = Number(booking.total_fare ?? 0);
    const bookingType  = (booking.booking_type ?? '').toLowerCase();
    const departureTime = booking.departure_time ?? '00:00';
    const journeyDate  = booking.journey_date;

    // ── Tatkal: always no-refund (policy) ─────────────────────────────────
    if (bookingType === 'tatkal') {
      return {
        refundPercent:      0,
        refundAmount:       0,
        cancellationCharge: totalFare,
        refundNote:         'No refund (Tatkal policy — non-refundable tickets)',
        hasRefund:          false,
      };
    }

    // ── WL tickets: full refund (never confirmed, so no penalty) ──────────
    const passengers = booking.passengers ?? [];
    const allWL = passengers.length > 0 &&
      passengers.every(p => p.status?.toUpperCase().startsWith('WL'));
    if (allWL) {
      return {
        refundPercent:      100,
        refundAmount:       totalFare,
        cancellationCharge: 0,
        refundNote:         `Full refund: ₹${totalFare} (waitlisted ticket — never confirmed)`,
        hasRefund:          totalFare > 0,
      };
    }

    // ── Time-based slab ────────────────────────────────────────────────────
    const departureDate = combineDateAndTime(journeyDate, departureTime);
    if (!departureDate) return EMPTY;

    const hoursBeforeDeparture = (departureDate - Date.now()) / (1000 * 60 * 60);

    // No refund if already departed
    if (hoursBeforeDeparture <= 0) {
      return {
        refundPercent:      0,
        refundAmount:       0,
        cancellationCharge: totalFare,
        refundNote:         'No refund (train has already departed)',
        hasRefund:          false,
      };
    }

    const slab = SLABS.find(s => hoursBeforeDeparture >= s.hoursMin);
    const percent = slab?.percent ?? 0;
    const refundAmount = Math.floor((percent / 100) * totalFare);
    const cancellationCharge = totalFare - refundAmount;

    let refundNote;
    if (percent === 0) {
      refundNote = `No refund applicable (cancelled within 4 hours of departure)`;
    } else {
      const h = Math.floor(hoursBeforeDeparture);
      refundNote = `Estimated refund: ₹${refundAmount} (${percent}% of ₹${totalFare}) — ${h}h before departure`;
    }

    return {
      refundPercent: percent,
      refundAmount,
      cancellationCharge,
      refundNote,
      hasRefund: refundAmount > 0,
    };
  }, [booking]);
}
