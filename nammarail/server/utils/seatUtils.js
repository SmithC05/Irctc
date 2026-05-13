// =============================================================================
// NammaRail — Seat Allocation Utilities
// =============================================================================
// Pure business-logic functions for deciding seat status and assignments.
//
// ZERO database calls here — these functions take plain objects (inventory rows)
// and return plain values.  This separation means:
//   1. Easy to unit-test without setting up a database.
//   2. The same logic works whether called from booking or from search.
//   3. If the allocation rules change (e.g. IRCTC changes RAC slots), we
//      edit ONE file, not three different controllers.
//
// REAL-WORLD IRCTC CONTEXT — What CNF / RAC / WL / REGRET mean:
// ──────────────────────────────────────────────────────────────
// CNF (Confirmed):
//   You have a guaranteed berth.  A specific seat number is printed on your
//   ticket (e.g. "S4 - 42").  You board and sleep.
//
// RAC (Reservation Against Cancellation):
//   You are on the train but share a berth (side-lower berth) with another
//   RAC passenger.  If any CNF passenger cancels, the first RAC passenger
//   moves up to CNF and gets a full berth.  RAC passengers CAN board the train.
//
// WL (Waitlisted):
//   No berth yet — your ticket is a "hope" ticket.  If enough CNF passengers
//   cancel, the waitlist moves up.  If you reach WL/1 → RAC → CNF before
//   journey date, you can board.  If you're still WL at chart preparation time
//   (4 hours before departure), you CANNOT board — your ticket auto-cancels.
//
// REGRET:
//   Not a formal IRCTC status — we use it internally when even the waitlist
//   is completely full.  Indian Railways uses the phrase "No Accommodation
//   Available" on their website.  We say REGRET.  No booking is possible.
// =============================================================================

'use strict';

// Seats per coach for each class — used to calculate coach number and seat number.
// e.g. a train with 8 SL coaches has 8 × 72 = 576 sleeper berths.
const SEATS_PER_COACH = {
    '1A': 18,
    '2A': 46,
    '3A': 64,
    'SL': 72,
    'CC': 78,
    '2S': 100,
};

// Coach letter prefix printed on the ticket for each class.
// e.g. Sleeper berths are in coaches named S1, S2, S3...
//      Third AC coaches are B1, B2, B3...
const COACH_PREFIX = {
    '1A': 'H',
    '2A': 'A',
    '3A': 'B',
    'SL': 'S',
    'CC': 'C',
    '2S': 'D',
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: getBookingStatus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines what booking status a NEW passenger would receive RIGHT NOW,
 * given the current state of the seat inventory.
 *
 * Returns one of: "CNF", "RAC", "WL", "REGRET"
 *
 * @param {Object} inventory - A row from the seat_inventory table
 * @returns {string} The status to assign to the next booking
 */
function getBookingStatus(inventory) {
    // Step 1: Check for confirmed seats.
    // We subtract tatkal_seats from total because tatkal quota is separate —
    // a normal booking cannot use tatkal-reserved seats.
    // available_confirmed = non-tatkal seats minus already-confirmed seats.
    const normalSeats       = inventory.total_seats - inventory.tatkal_seats;
    const availableConfirmed = normalSeats - inventory.confirmed_seats;
    if (availableConfirmed > 0) return 'CNF';

    // Step 2: Check RAC availability.
    // Each RAC berth (side-lower) accommodates 2 passengers sitting.
    // So rac_total berths × 2 = total RAC passenger slots.
    // Example: rac_total = 18 → 36 RAC slots for a Sleeper coach.
    const totalRacSlots = inventory.rac_total * 2;
    if (inventory.rac_filled < totalRacSlots) return 'RAC';

    // Step 3: Check waitlist capacity.
    // wl_total is fixed at 60 (from schema default) — a hard cap.
    if (inventory.wl_filled < inventory.wl_total) return 'WL';

    // Step 4: Everything is full — booking not possible.
    // REGRET = "No Accommodation Available" in IRCTC language.
    return 'REGRET';
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: getNextWLNumber
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the waitlist position this passenger will occupy.
 * wl_filled tells us how many passengers are already waitlisted,
 * so the NEXT person gets position wl_filled + 1.
 *
 * Example: 3 people already waitlisted → next person is WL/4.
 *
 * @param {Object} inventory - seat_inventory row
 * @returns {number} Waitlist queue number (1-based)
 */
function getNextWLNumber(inventory) {
    return inventory.wl_filled + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: getNextRACNumber
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the RAC position this passenger will occupy.
 * rac_filled tracks how many RAC SLOTS are used (not berths).
 *
 * Example: 5 RAC passengers already → next gets RAC 6.
 *
 * @param {Object} inventory - seat_inventory row
 * @returns {number} RAC slot number (1-based)
 */
function getNextRACNumber(inventory) {
    return inventory.rac_filled + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 4: assignSeatNumber
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a human-readable seat/berth identifier for the passenger's ticket.
 *
 * For CNF passengers — "S4-42" means: coach S4, berth 42.
 *   Coach number = Math.ceil(seatNumber / seatsPerCoach)
 *   Berth within coach = ((seatNumber - 1) % seatsPerCoach) + 1
 *
 *   Example (SL, 73rd passenger):
 *     seatsPerCoach = 72
 *     coachNumber   = Math.ceil(73 / 72) = 2  → "S2"
 *     berthInCoach  = ((73-1) % 72) + 1 = 1   → berth 1
 *     Result: "S2-1"
 *
 * For RAC passengers — no full berth assigned yet, just "RAC-12".
 * For WL  passengers — no seat at all; they can't board yet → null.
 *
 * @param {Object} inventory  - seat_inventory row (used for confirmed_seats count)
 * @param {string} status     - "CNF", "RAC", or "WL"
 * @param {string} classCode  - e.g. "SL", "3A"
 * @param {number} racNumber  - RAC position (used when status === "RAC")
 * @returns {string|null} Seat string or null
 */
function assignSeatNumber(inventory, status, classCode, racNumber) {
    if (status === 'WL') return null;

    if (status === 'RAC') {
        return `RAC-${racNumber}`;
    }

    // CNF: calculate coach and berth numbers.
    const seatsPerCoach = SEATS_PER_COACH[classCode] || 72;
    const prefix        = COACH_PREFIX[classCode]    || 'S';

    // This is the seat number of the next person to be confirmed.
    // confirmed_seats is the count BEFORE this booking, so +1 gives this person's berth.
    const seatNumber   = inventory.confirmed_seats + 1;
    const coachNumber  = Math.ceil(seatNumber / seatsPerCoach);
    const berthInCoach = ((seatNumber - 1) % seatsPerCoach) + 1;

    return `${prefix}${coachNumber}-${berthInCoach}`;
}

module.exports = {
    getBookingStatus,
    getNextWLNumber,
    getNextRACNumber,
    assignSeatNumber,
};
