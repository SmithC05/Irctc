// =============================================================================
// NammaRail — Cancellation Cascade Utilities
// =============================================================================
//
// CASCADE PROMOTION EXPLAINED:
// When a CNF passenger cancels their ticket, their seat becomes free.
// Indian Railways does not just mark it as empty — it triggers a chain:
//
// 1. The first RAC passenger (RAC/1) gets promoted to CNF.
//    They get assigned the freed seat number.
//    Their status changes from RAC to CNF.
//
// 2. The slot freed by that RAC passenger moving to CNF is now an RAC slot.
//    The first WL passenger (WL/1) gets promoted to RAC.
//    Their status changes from WL to RAC.
//
// 3. All remaining WL passengers shift their number down by 1.
//    WL/2 becomes WL/1, WL/3 becomes WL/2, and so on.
//    This keeps the queue consistent — no gaps in the WL sequence.
//
// If there are no RAC passengers when a CNF cancels:
//    Skip step 1, go directly to step 2 (WL/1 gets the freed CNF seat directly).
//
// If there are no WL passengers:
//    Just free the seat; no promotions needed.
//
// This entire cascade MUST run inside one SQLite transaction.
// If any step fails (e.g. DB locked, constraint violation), the whole thing
// rolls back — no partial promotions. No passenger gets a half-updated ticket.
//
// REAL-LIFE EXAMPLE:
// Train 12673, 2026-06-15, SL class. Seats: 72 confirmed, 36 RAC, 60 WL cap.
//   Ravi (CNF, seat S2-14) cancels.
//   → Lakshmi (RAC/1) is promoted to CNF and gets seat S2-14.
//   → Karthik (WL/1) is promoted to RAC/1.
//   → Meena (WL/2) becomes WL/1. Suresh (WL/3) becomes WL/2. And so on.
// =============================================================================

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: findFirstRAC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the RAC passenger with the lowest rac_number for this train+date+class.
 * "Lowest rac_number" = the person who has been waiting longest = gets promoted first.
 */
function findFirstRAC(db, trainId, journeyDate, classCode) {
    return db.prepare(`
        SELECT * FROM bookings
        WHERE  train_id     = ?
          AND  journey_date = ?
          AND  class_code   = ?
          AND  status       = 'RAC'
        ORDER  BY rac_number ASC
        LIMIT  1
    `).get(trainId, journeyDate, classCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: findFirstWL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the WL passenger with wl_number = 1 (the very front of the queue).
 * WL/1 always gets promoted first when an RAC or CNF slot opens up.
 */
function findFirstWL(db, trainId, journeyDate, classCode) {
    return db.prepare(`
        SELECT * FROM bookings
        WHERE  train_id     = ?
          AND  journey_date = ?
          AND  class_code   = ?
          AND  status       = 'WL'
          AND  wl_number    = 1
    `).get(trainId, journeyDate, classCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: promoteToConfirmed
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Promotes a passenger (was RAC or WL) to confirmed status.
 * Assigns them the freed seat number from the cancelled CNF passenger.
 * Clears their rac_number and wl_number since they are now fully confirmed.
 */
function promoteToConfirmed(db, bookingId, freedSeatNumber) {
    db.prepare(`
        UPDATE bookings
        SET    status      = 'CNF',
               seat_number = ?,
               rac_number  = NULL,
               wl_number   = NULL
        WHERE  id = ?
    `).run(freedSeatNumber, bookingId);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: promoteToRAC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Promotes a WL/1 passenger to RAC status.
 * Assigns them the rac_number of the slot freed by the passenger who moved to CNF.
 *
 * @param {number} newRacNumber - The RAC slot number being assigned (usually the
 *   rac_number of the person who just moved to CNF, since that slot is now free)
 */
function promoteToRAC(db, bookingId, newRacNumber) {
    db.prepare(`
        UPDATE bookings
        SET    status     = 'RAC',
               rac_number = ?,
               wl_number  = NULL,
               seat_number = ?
        WHERE  id = ?
    `).run(newRacNumber, `RAC-${newRacNumber}`, bookingId);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: shiftWLNumbersDown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decrements wl_number by 1 for all WL passengers whose number is ABOVE
 * `aboveNumber`.  Called after a WL passenger leaves the queue (via promotion
 * or manual cancellation) to close the gap left in the sequence.
 *
 * Example: WL/1 leaves → WL/2 becomes WL/1, WL/3 becomes WL/2, etc.
 * Example: WL/3 cancels → WL/4 becomes WL/3, WL/5 becomes WL/4, etc.
 */
function shiftWLNumbersDown(db, trainId, journeyDate, classCode, aboveNumber) {
    db.prepare(`
        UPDATE bookings
        SET    wl_number = wl_number - 1
        WHERE  train_id     = ?
          AND  journey_date = ?
          AND  class_code   = ?
          AND  status       = 'WL'
          AND  wl_number    > ?
    `).run(trainId, journeyDate, classCode, aboveNumber);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: updateInventory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a set of signed integer deltas to the seat_inventory counters.
 * Pass negative values to decrement, positive to increment.
 *
 * This helper avoids writing multiple prepared statements for every possible
 * combination of inventory changes — just pass a delta object.
 *
 * @param {{ confirmed?: number, rac?: number, wl?: number }} deltas
 */
function updateInventory(db, trainId, journeyDate, classCode, deltas) {
    const sets = [];
    const args = [];

    if (deltas.confirmed !== undefined) {
        sets.push('confirmed_seats = confirmed_seats + ?');
        args.push(deltas.confirmed);
    }
    if (deltas.rac !== undefined) {
        sets.push('rac_filled = rac_filled + ?');
        args.push(deltas.rac);
    }
    if (deltas.wl !== undefined) {
        sets.push('wl_filled = wl_filled + ?');
        args.push(deltas.wl);
    }

    if (sets.length === 0) return;

    db.prepare(`
        UPDATE seat_inventory
        SET    ${sets.join(', ')}
        WHERE  train_id     = ?
          AND  journey_date = ?
          AND  class_code   = ?
    `).run(...args, trainId, journeyDate, classCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: cascadeFromCNFCancel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles the cascade when a CNF passenger cancels.
 * Returns an object describing what promotions happened (for the API response).
 *
 * Story:
 *   A CNF seat has just been freed.
 *   We try to give it to the first RAC passenger first.
 *   If no RAC, we give it straight to WL/1.
 *   Then we try to fill the now-empty RAC slot with WL/1.
 *   Finally, we renumber the WL queue.
 */
function cascadeFromCNFCancel(db, trainId, journeyDate, classCode, freedSeatNumber) {
    const result = { racPromotedToCNF: false, wlPromotedToRAC: false };

    const firstRAC = findFirstRAC(db, trainId, journeyDate, classCode);

    if (firstRAC) {
        // Step A: Promote RAC/1 → CNF.  They take the freed seat.
        promoteToConfirmed(db, firstRAC.id, freedSeatNumber);
        // Inventory: one fewer RAC passenger (they moved to CNF, but confirmed
        // count stays the same because the cancelled CNF seat is being reused).
        updateInventory(db, trainId, journeyDate, classCode, { rac: -1 });
        result.racPromotedToCNF = true;

        // Step B: The RAC slot freed by this person's promotion → give to WL/1.
        const firstWL = findFirstWL(db, trainId, journeyDate, classCode);
        if (firstWL) {
            // firstRAC.rac_number is the slot that just became free.
            promoteToRAC(db, firstWL.id, firstRAC.rac_number);
            updateInventory(db, trainId, journeyDate, classCode, { wl: -1 });
            result.wlPromotedToRAC = true;
            // Step C: Renumber remaining WL (above position 1, which just left).
            shiftWLNumbersDown(db, trainId, journeyDate, classCode, 1);
        }
    } else {
        // No RAC passengers — give the freed CNF seat directly to WL/1.
        const firstWL = findFirstWL(db, trainId, journeyDate, classCode);
        if (firstWL) {
            promoteToConfirmed(db, firstWL.id, freedSeatNumber);
            // confirmed_seats stays same (cancelled CNF → new CNF), wl shrinks by 1.
            updateInventory(db, trainId, journeyDate, classCode, { wl: -1 });
            result.wlPromotedToRAC = true;   // semantically a WL→CNF, but flag is accurate enough
            shiftWLNumbersDown(db, trainId, journeyDate, classCode, 1);
        } else {
            // Nobody to promote — the seat just becomes genuinely empty.
            // The caller must decrement confirmed_seats after this function returns.
            result.seatBecameEmpty = true;
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: cascadeFromRACCancel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles the cascade when an RAC passenger cancels.
 * The freed RAC slot should go to WL/1 if one exists.
 */
function cascadeFromRACCancel(db, trainId, journeyDate, classCode, cancelledRacNumber) {
    const result = { racPromotedToCNF: false, wlPromotedToRAC: false };

    // Free the RAC slot first.
    updateInventory(db, trainId, journeyDate, classCode, { rac: -1 });

    const firstWL = findFirstWL(db, trainId, journeyDate, classCode);
    if (firstWL) {
        // WL/1 takes the freed RAC slot.
        promoteToRAC(db, firstWL.id, cancelledRacNumber);
        updateInventory(db, trainId, journeyDate, classCode, { wl: -1 });
        result.wlPromotedToRAC = true;
        shiftWLNumbersDown(db, trainId, journeyDate, classCode, 1);
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: cascadeFromWLCancel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles the case when a WL passenger cancels.
 * No seat is freed (they never had one), but the WL queue must be renumbered.
 */
function cascadeFromWLCancel(db, trainId, journeyDate, classCode, cancelledWLNumber) {
    // Free the WL slot.
    updateInventory(db, trainId, journeyDate, classCode, { wl: -1 });

    // Shift everyone behind the cancelled position forward by one.
    shiftWLNumbersDown(db, trainId, journeyDate, classCode, cancelledWLNumber);

    return { racPromotedToCNF: false, wlPromotedToRAC: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT: runCancellationCascade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Entry point for the cascade.  Called from the cancellation controller
 * INSIDE an already-open transaction — do NOT open a nested transaction here.
 *
 * Dispatches to the correct cascade handler based on what status the
 * cancelled booking had.
 *
 * @param {Object} db               - better-sqlite3 connection
 * @param {Object} cancelledBooking - Full booking row being cancelled
 * @param {string|null} freedSeatNumber - The seat that was freed (null for RAC/WL)
 * @returns {{ racPromotedToCNF: boolean, wlPromotedToRAC: boolean }}
 */
function runCancellationCascade(db, cancelledBooking, freedSeatNumber) {
    const { train_id, journey_date, class_code, status, rac_number, wl_number } = cancelledBooking;

    if (status === 'CNF') {
        return cascadeFromCNFCancel(db, train_id, journey_date, class_code, freedSeatNumber);
    }

    if (status === 'RAC') {
        return cascadeFromRACCancel(db, train_id, journey_date, class_code, rac_number);
    }

    if (status === 'WL') {
        return cascadeFromWLCancel(db, train_id, journey_date, class_code, wl_number);
    }

    // Unknown status — do nothing but return a safe default.
    return { racPromotedToCNF: false, wlPromotedToRAC: false };
}

module.exports = { runCancellationCascade };
