// =============================================================================
// NammaRail — Refund Calculation Utilities
// =============================================================================
// Pure functions — no database calls, no side effects.
// Takes fare amounts + timing information, returns rupee refund amounts.
//
// REFUND RULES EXPLAINED (for a first-time train traveller):
// ───────────────────────────────────────────────────────────
// Think of cancelling a train ticket like cancelling a hotel booking.
// The closer to your departure you cancel, the less money you get back.
// This is because:
//   • The railway needs time to re-sell your seat to another passenger.
//   • If you cancel 3 days out, there's plenty of time — you lose only 25%.
//   • If you cancel 2 hours before departure, no one else can buy that seat
//     in time — you lose everything (0% refund).
//
// NORMAL TICKETS — refund tiers:
//   > 48 hours before  → lose 25%   (early notice, easy to re-sell)
//   12–48 hours before → lose 50%   (less time to re-sell)
//   4–12 hours before  → lose 75%   (very little time, likely seat goes empty)
//   < 4 hours or after → lose 100%  (chart prepared, no re-allocation possible)
//
// TATKAL TICKETS — 0% refund always:
//   Tatkal is a "genuine emergency need" quota. The premium price (50–100%
//   extra) compensates for guaranteed last-minute availability. If tatkal had
//   refunds, people would book tatkal speculatively and cancel, defeating its
//   purpose and blocking genuine urgent travellers.
//
// WL (Waitlisted) TICKETS — 100% refund always:
//   A WL passenger never received a confirmed berth. Charging them a
//   cancellation fee for something they never got would be unfair.
//   IRCTC refunds WL tickets in full, automatically, if they remain
//   WL at chart preparation time.
//
// RAC TICKETS — almost always full refund:
//   RAC passengers have a partial berth (sitting). If they cancel more than
//   30 minutes before departure they get a full refund. If they cancel
//   at the last minute (< 30 mins), Indian Railways deducts a nominal fee.
// =============================================================================

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// REFUND TIER CONSTANTS
// Named constants make the rules readable and easy to change if IRCTC
// updates its cancellation policy.
// ─────────────────────────────────────────────────────────────────────────────
const REFUND_NORMAL_EARLY    = 0.75;  // > 48 hrs  → 75% back
const REFUND_NORMAL_MID      = 0.50;  // 12–48 hrs → 50% back
const REFUND_NORMAL_LATE     = 0.25;  // 4–12 hrs  → 25% back
const REFUND_NORMAL_NO       = 0.00;  // < 4 hrs   → nothing
const REFUND_RAC_EARLY       = 1.00;  // > 30 mins → full refund
const REFUND_RAC_LAST_MINUTE = 0.00;  // < 30 mins → nothing

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: getRefundPercentForNormal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the refund percentage (0–1 decimal) for a NORMAL ticket based on
 * how many hours are left before departure.
 *
 * @param {number} hoursBeforeDeparture - Fractional hours (e.g. 2.5 = 2h 30m)
 * @returns {number} Refund fraction between 0 and 1
 */
function getRefundPercentForNormal(hoursBeforeDeparture) {
    if (hoursBeforeDeparture > 48)  return REFUND_NORMAL_EARLY;
    if (hoursBeforeDeparture > 12)  return REFUND_NORMAL_MID;
    if (hoursBeforeDeparture > 4)   return REFUND_NORMAL_LATE;
    return REFUND_NORMAL_NO;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: calculateRefund
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines the refund percentage for a cancellation.
 *
 * @param {number} totalFare              - Amount originally paid (integer rupees)
 * @param {string} bookingType            - "normal" or "tatkal"
 * @param {string} bookingStatus          - "CNF", "RAC", or "WL"
 * @param {number} hoursBeforeDeparture   - Fractional hours until departure
 *                                          (negative means train already departed)
 * @returns {number} Refund fraction (0–1). Multiply by totalFare to get rupees.
 */
function calculateRefund(totalFare, bookingType, bookingStatus, hoursBeforeDeparture) {
    // WL tickets get a full refund regardless of timing — the passenger never
    // received a confirmed seat, so charging a cancellation fee is not justified.
    if (bookingStatus === 'WL') return 1.00;

    // Tatkal tickets have ZERO refund always.
    // WHY: Tatkal is sold at a premium to guarantee last-minute seats for people
    // with genuine emergencies. Allowing refunds would let passengers book tatkal
    // as a "backup" and cancel — flooding the quota and squeezing out genuine users.
    if (bookingType === 'tatkal') return REFUND_NORMAL_NO;

    // RAC passengers had a partial seat (side berth, sitting).
    // Full refund if cancelled with reasonable notice (> 30 minutes = 0.5 hours).
    // No refund in the last 30 minutes — the berth is too close to departure to re-fill.
    if (bookingStatus === 'RAC') {
        return hoursBeforeDeparture > 0.5 ? REFUND_RAC_EARLY : REFUND_RAC_LAST_MINUTE;
    }

    // CNF (confirmed) passengers — apply the standard time-based tier.
    return getRefundPercentForNormal(hoursBeforeDeparture);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: getRefundBreakdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a refund fraction into a full breakdown object with rupee amounts.
 *
 * WHY Math.floor?
 * Indian Railways always rounds the refund DOWN to the nearest rupee.
 * This means the passenger gets slightly less than the exact percentage,
 * but it prevents any scenario where rounding up would give the passenger
 * more back than the cancellation charge formula allows.
 *
 * @param {number} totalFare    - Original fare paid (integer rupees)
 * @param {number} refundFraction - Value from calculateRefund() (0–1)
 * @returns {{ refundAmount: number, cancellationCharge: number, refundPercent: number }}
 */
function getRefundBreakdown(totalFare, refundFraction) {
    const refundAmount        = Math.floor(totalFare * refundFraction);
    const cancellationCharge  = totalFare - refundAmount;
    const refundPercent       = Math.round(refundFraction * 100);

    return { refundAmount, cancellationCharge, refundPercent };
}

module.exports = { calculateRefund, getRefundBreakdown };
