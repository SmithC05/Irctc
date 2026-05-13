// =============================================================================
// NammaRail — Cancellation Controller
// =============================================================================
// Handles booking cancellation with automatic WL→RAC→CNF cascade promotion.
//
// The single public function (cancelBooking) orchestrates:
//   1. Ownership + cancellability checks
//   2. Refund calculation
//   3. Atomic cancellation + cascade in one SQLite transaction
//   4. Descriptive response including cascade results
// =============================================================================

'use strict';

const db                                  = require('../db/database');
const { calculateRefund, getRefundBreakdown } = require('../utils/refundUtils');
const { runCancellationCascade }          = require('../utils/cascadeUtils');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: fetchBookingWithTrain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the booking row joined with train details (needed for departure time).
 * Returns null if the booking ID doesn't exist.
 */
function fetchBookingWithTrain(bookingId) {
    return db.prepare(`
        SELECT b.*, t.departure_time, t.name AS train_name
        FROM   bookings b
        JOIN   trains   t ON t.id = b.train_id
        WHERE  b.id = ?
    `).get(bookingId);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: buildDepartureDateTime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constructs a full Date object for when the train departs on journey_date.
 *
 * WHY we need the full datetime, not just the date:
 * Refund percentages depend on HOURS before departure, not just days.
 * "2026-06-15" alone tells us nothing about whether departure is in 3 hours
 * or 18 hours — we need to combine the date with the train's departure time.
 *
 * departure_time is stored as "HH:MM" (24-hour).
 * We build "YYYY-MM-DDTHH:MM:00" so JavaScript's Date() parses it correctly.
 * We treat all times as IST (UTC+5:30) — this matches how trains are scheduled.
 *
 * @param {string} journeyDate    - "YYYY-MM-DD"
 * @param {string} departureTime  - "HH:MM"
 * @returns {Date} Full departure timestamp
 */
function buildDepartureDateTime(journeyDate, departureTime) {
    // Combine date and time into an ISO-like string, then interpret as IST.
    // We append the IST offset (+05:30) so JavaScript treats it as local Indian time.
    const departureDateTimeStr = `${journeyDate}T${departureTime}:00+05:30`;
    return new Date(departureDateTimeStr);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: calcHoursBeforeDeparture
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the number of hours (fractional) between now and the departure.
 * Returns a negative number if the train has already departed.
 */
function calcHoursBeforeDeparture(departureDateTime) {
    const nowMs          = Date.now();
    const departureMs    = departureDateTime.getTime();
    const diffMs         = departureMs - nowMs;
    return diffMs / (1000 * 60 * 60);   // convert milliseconds → hours
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: checkCancellationPreconditions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that this booking CAN be cancelled.
 * Returns { ok: false, status, error } if any check fails.
 * Returns { ok: true } if all checks pass.
 *
 * Checks:
 *   1. Booking exists (caller verifies — we get the object passed in).
 *   2. Correct owner.
 *   3. Not already cancelled.
 *   4. Train hasn't departed.
 */
function checkCancellationPreconditions(booking, userId, hoursBeforeDeparture) {
    if (booking.user_id !== userId) {
        return { ok: false, status: 403, error: 'Not authorised to cancel this booking' };
    }
    if (booking.cancelled_at !== null) {
        return { ok: false, status: 400, error: 'Booking is already cancelled' };
    }
    // hoursBeforeDeparture < 0 means the train has already left the origin station.
    if (hoursBeforeDeparture < 0) {
        return { ok: false, status: 400, error: 'Cannot cancel after train has departed' };
    }
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: runCancellationTransaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps the entire cancellation + cascade in ONE atomic transaction.
 *
 * WHY ATOMIC?
 * Three things must happen together:
 *   a) Mark the booking as cancelled with refund_amount set.
 *   b) Run the cascade (promote RAC → CNF, WL → RAC, renumber WL queue).
 *   c) Adjust seat_inventory counters.
 *
 * If we crash between (a) and (b), we have a cancelled booking with no seat
 * freed — the promoted passenger never gets their new seat, and the
 * inventory is wrong.  A transaction guarantees "all or nothing".
 *
 * @returns {{ cascadeResult, seatBecameEmpty }}
 */
function runCancellationTransaction(booking, refundAmount) {
    let cascadeResult  = {};
    let seatBecameEmpty = false;

    const txn = db.transaction(() => {
        // Step a: Mark the booking cancelled, record the refund.
        db.prepare(`
            UPDATE bookings
            SET    cancelled_at  = datetime('now'),
                   refund_amount = ?
            WHERE  id = ?
        `).run(refundAmount, booking.id);

        // Step b: Run the cascade — this updates other passengers' statuses
        // and adjusts rac_filled / wl_filled counters internally.
        cascadeResult = runCancellationCascade(db, booking, booking.seat_number);

        // Step c: If the cancelled CNF seat became genuinely empty (no one
        // was promoted into it), decrement confirmed_seats now.
        // For RAC/WL cancels, inventory was already adjusted inside the cascade.
        if (booking.status === 'CNF' && cascadeResult.seatBecameEmpty) {
            db.prepare(`
                UPDATE seat_inventory
                SET    confirmed_seats = confirmed_seats - 1
                WHERE  train_id     = ?
                  AND  journey_date = ?
                  AND  class_code   = ?
            `).run(booking.train_id, booking.journey_date, booking.class_code);
            seatBecameEmpty = true;
        }
    });

    txn();   // Execute; any thrown error inside auto-rolls back the transaction.
    return { cascadeResult, seatBecameEmpty };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: cancelBooking — DELETE /api/bookings/:bookingId/cancel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancels a booking, calculates the passenger's refund, runs the WL cascade,
 * and returns a full breakdown of what happened.
 *
 * Flow:
 *   1. Fetch booking (with train departure time via JOIN)
 *   2. Calculate hours before departure
 *   3. Run precondition checks (ownership, already-cancelled, departed)
 *   4. Calculate refund amount
 *   5. Execute atomic transaction (cancel + cascade + inventory)
 *   6. Return descriptive response
 */
function cancelBooking(req, res) {
    const { bookingId } = req.params;
    const userId        = req.user.userId;

    // Step 1: Fetch the booking (includes train departure_time via JOIN).
    const booking = fetchBookingWithTrain(bookingId);
    if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
    }

    // Step 2: Build the departure datetime and compute hours remaining.
    const departureDateTime    = buildDepartureDateTime(booking.journey_date, booking.departure_time);
    const hoursBeforeDeparture = calcHoursBeforeDeparture(departureDateTime);

    // Step 3: Check all preconditions before touching the database.
    const check = checkCancellationPreconditions(booking, userId, hoursBeforeDeparture);
    if (!check.ok) {
        return res.status(check.status).json({ error: check.error });
    }

    // Step 4: Determine refund percentage and rupee amounts.
    const refundFraction = calculateRefund(
        booking.total_fare,
        booking.booking_type,
        booking.status,
        hoursBeforeDeparture
    );
    const refundBreakdown = getRefundBreakdown(booking.total_fare, refundFraction);

    // Step 5: Execute the atomic cancellation + cascade transaction.
    let cascadeResult;
    try {
        ({ cascadeResult } = runCancellationTransaction(booking, refundBreakdown.refundAmount));
    } catch (err) {
        console.error('[NammaRail] Cancellation transaction failed:', err.message);
        return res.status(500).json({ error: 'Cancellation failed — please try again' });
    }

    // Step 6: Build and return the descriptive response.
    return res.status(200).json({
        message:    'Booking cancelled successfully',
        bookingId,
        trainName:  booking.train_name,
        passenger:  booking.passenger_name,
        refund: {
            refundAmount:       refundBreakdown.refundAmount,
            cancellationCharge: refundBreakdown.cancellationCharge,
            refundPercent:      refundBreakdown.refundPercent,
            note:               'Refund will be processed in 5-7 business days',
        },
        cascadeInfo: {
            racPromotedToCNF: !!cascadeResult.racPromotedToCNF,
            wlPromotedToRAC:  !!cascadeResult.wlPromotedToRAC,
        },
    });
}

module.exports = { cancelBooking };
