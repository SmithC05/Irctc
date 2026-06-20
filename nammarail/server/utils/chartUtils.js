// =============================================================================
// NammaRail — Chart Preparation Utilities
// =============================================================================
//
// Chart preparation is the most complex operation in the NammaRail lifecycle.
// It is triggered automatically by the scheduler exactly 4 hours before departure.
//
// THE CHART PREPARATION SEQUENCE (from the Agent Constitution):
// ─────────────────────────────────────────────────────────────
//  1. Freeze WL movement — no more promotions
//  2. Auto-cancel remaining WL passengers — full refund, status = CANCELLED_WL
//  3. Process final RAC → CNF upgrades if any CNF seats opened
//  4. Generate passenger manifest — final passenger list is frozen
//  5. Compute CURR_AVL seats — vacant seats after all allocations
//  6. Mark chart as PREPARED
//
// WHY ONE ATOMIC TRANSACTION?
// ─────────────────────────────────────────────────────────────────────────────
// Chart preparation touches bookings, seat_inventory, AND train_charts in one
// operation. If any step fails midway (e.g. step 2 cancels some WL but the
// train_charts update crashes), the database would be in an inconsistent state —
// some WL passengers cancelled, chart not marked as PREPARED, CURR_AVL wrong.
//
// Wrapping everything in db.transaction() ensures: either ALL changes commit,
// or NONE do. The scheduler can safely retry the operation on the next tick.
// =============================================================================

'use strict';

const { hoursUntilDeparture, CHART_PREP_HOURS_BEFORE } = require('./phaseUtils');

// ─── shouldPrepareChart ───────────────────────────────────────────────────────

/**
 * Returns true if it is now time to prepare the chart for a given train/date.
 *
 * Conditions:
 *   1. Departure is <= CHART_PREP_HOURS_BEFORE (4h) away
 *   2. Departure has NOT passed (don't prepare a chart for a departed train)
 *   3. Chart is still PENDING (don't re-prepare an already PREPARED chart)
 *
 * @param {string} journeyDate    - "YYYY-MM-DD"
 * @param {string} departureTime  - "HH:MM" (IST)
 * @param {string} chartStatus    - "PENDING" | "PREPARED"
 * @returns {boolean}
 */
function shouldPrepareChart(journeyDate, departureTime, chartStatus) {
    if (chartStatus === 'PREPARED') return false;   // Already done
    const hours = hoursUntilDeparture(journeyDate, departureTime);
    return hours >= 0 && hours <= CHART_PREP_HOURS_BEFORE;
}

// ─── prepareChart ─────────────────────────────────────────────────────────────

/**
 * Executes chart preparation for one (train, date, classCode) combination.
 * Runs inside a single atomic SQLite transaction.
 *
 * Steps (matching the Agent Constitution exactly):
 *   1. Fetch current seat_inventory row
 *   2. Cancel all remaining WL bookings for this train/date/class (full refund)
 *   3. Compute CURR_AVL = total_seats - confirmed_seats - (rac_filled * 0.5 rounded down)
 *      In practice: vacant = total_seats - confirmed_seats - (rac_total still allocated)
 *   4. Upsert train_charts row with PREPARED status + curr_avl_count
 *   5. Update seat_inventory.curr_avl_filled = 0 (will increment as CURR_AVL bookings come in)
 *
 * @param {Object}  db          - better-sqlite3 Database instance
 * @param {number}  trainId     - train.id (train number)
 * @param {string}  journeyDate - "YYYY-MM-DD"
 * @param {string}  classCode   - "SL", "3A", etc.
 * @returns {{ prepared: boolean, cancelledWL: number, currAvlCount: number }}
 */
function prepareChart(db, trainId, journeyDate, classCode) {
    const run = db.transaction(() => {
        // ── Step 1: Get current inventory ─────────────────────────────────────
        const inv = db.prepare(`
            SELECT *
              FROM seat_inventory
             WHERE train_id     = ?
               AND journey_date = ?
               AND class_code   = ?
        `).get(trainId, journeyDate, classCode);

        if (!inv) {
            // No inventory row means nobody booked this class on this date.
            // Create a chart record with 0 curr_avl (no seats to release).
            db.prepare(`
                INSERT INTO train_charts
                    (train_id, journey_date, class_code, chart_status, chart_prepared_at, curr_avl_count)
                VALUES (?, ?, ?, 'PREPARED', datetime('now'), 0)
                ON CONFLICT(train_id, journey_date, class_code)
                DO UPDATE SET
                    chart_status      = 'PREPARED',
                    chart_prepared_at = datetime('now'),
                    curr_avl_count    = 0
            `).run(trainId, journeyDate, classCode);
            return { prepared: true, cancelledWL: 0, currAvlCount: 0 };
        }

        // ── Step 2: Auto-cancel all remaining WL bookings ──────────────────────
        // WL passengers at chart prep time: full refund, cannot board.
        // We set status = 'CANCELLED_WL' (different from user-initiated 'CNF' cancels)
        // and refund_amount = total_fare (100% refund, as per the World Rules).
        const cancelResult = db.prepare(`
            UPDATE bookings
               SET status        = 'CANCELLED_WL',
                   cancelled_at  = datetime('now'),
                   refund_amount = total_fare
             WHERE train_id      = ?
               AND journey_date  = ?
               AND class_code    = ?
               AND status        = 'WL'
               AND cancelled_at IS NULL
        `).run(trainId, journeyDate, classCode);

        const cancelledWL = cancelResult.changes;

        // ── Step 3: Update inventory — zero out wl_filled for cancelled WLs ───
        // The WL queue is now empty. wl_filled reflects active WL count.
        if (cancelledWL > 0) {
            db.prepare(`
                UPDATE seat_inventory
                   SET wl_filled = 0
                 WHERE train_id     = ?
                   AND journey_date = ?
                   AND class_code   = ?
            `).run(trainId, journeyDate, classCode);
        }

        // ── Step 4: Compute CURR_AVL ───────────────────────────────────────────
        // CURR_AVL = seats that are still completely vacant after all allocations.
        // A fully-confirmed seat: confirmed_seats tracks how many CNF are filled.
        // RAC passengers fill rac_total slots. Each RAC berth holds 2 passengers.
        // Vacant berths = total_seats - confirmed_seats - ceil(rac_filled / 2)
        // But more simply: CURR_AVL = seats that were never allocated at all.
        //
        // Formula: curr_avl = total_seats - confirmed_seats - ceil(rac_filled / 2)
        // Note: rac berths are counted per berth (1 berth = 2 RAC passengers).
        //       rac_filled tracks passengers, not berths.
        const racBerthsUsed = Math.ceil((inv.rac_filled || 0) / 2);
        const currAvlCount  = Math.max(0, inv.total_seats - (inv.confirmed_seats || 0) - racBerthsUsed);

        // ── Step 5: Upsert train_charts record ─────────────────────────────────
        db.prepare(`
            INSERT INTO train_charts
                (train_id, journey_date, class_code, chart_status, chart_prepared_at, curr_avl_count)
            VALUES (?, ?, ?, 'PREPARED', datetime('now'), ?)
            ON CONFLICT(train_id, journey_date, class_code)
            DO UPDATE SET
                chart_status      = 'PREPARED',
                chart_prepared_at = datetime('now'),
                curr_avl_count    = excluded.curr_avl_count
        `).run(trainId, journeyDate, classCode, currAvlCount);

        // ── Step 6: Reset curr_avl_filled in inventory (CURR_AVL bookings start fresh) ─
        db.prepare(`
            UPDATE seat_inventory
               SET curr_avl_filled = 0
             WHERE train_id     = ?
               AND journey_date = ?
               AND class_code   = ?
        `).run(trainId, journeyDate, classCode);

        return { prepared: true, cancelledWL, currAvlCount };
    });

    return run();
}

// ─── getChartStatus ───────────────────────────────────────────────────────────

/**
 * Reads the chart status for a (train, date, class) from the database.
 * Returns null if no chart record exists (means PENDING).
 *
 * @param {Object}  db
 * @param {number}  trainId
 * @param {string}  journeyDate
 * @param {string}  [classCode]  - If omitted, fetches the first class found
 * @returns {{ chartStatus: string, chartPreparedAt: string|null, currAvlCount: number }|null}
 */
function getChartStatus(db, trainId, journeyDate, classCode) {
    let row;
    if (classCode) {
        row = db.prepare(`
            SELECT chart_status, chart_prepared_at, curr_avl_count
              FROM train_charts
             WHERE train_id     = ?
               AND journey_date = ?
               AND class_code   = ?
        `).get(trainId, journeyDate, classCode);
    } else {
        // If no class specified, return PREPARED if ANY class is prepared
        row = db.prepare(`
            SELECT chart_status, chart_prepared_at, MAX(curr_avl_count) as curr_avl_count
              FROM train_charts
             WHERE train_id     = ?
               AND journey_date = ?
             GROUP BY chart_status
             ORDER BY chart_status DESC   -- 'PREPARED' > 'PENDING' lexicographically
             LIMIT 1
        `).get(trainId, journeyDate);
    }

    if (!row) return null;

    return {
        chartStatus:      row.chart_status,
        chartPreparedAt:  row.chart_prepared_at,
        currAvlCount:     row.curr_avl_count ?? 0,
    };
}

/**
 * Gets the CURR_AVL remaining count — how many post-chart vacant seats are
 * still available for booking right now.
 *
 * curr_avl_count (total post-chart vacancies) minus curr_avl_filled (already booked)
 *
 * @param {Object}  db
 * @param {number}  trainId
 * @param {string}  journeyDate
 * @param {string}  classCode
 * @returns {number} remaining CURR_AVL seats (0 if chart not prepared)
 */
function getCurrAvlRemaining(db, trainId, journeyDate, classCode) {
    const chart = getChartStatus(db, trainId, journeyDate, classCode);
    if (!chart || chart.chartStatus !== 'PREPARED') return 0;

    const inv = db.prepare(`
        SELECT curr_avl_filled
          FROM seat_inventory
         WHERE train_id     = ?
           AND journey_date = ?
           AND class_code   = ?
    `).get(trainId, journeyDate, classCode);

    const filled = inv?.curr_avl_filled ?? 0;
    return Math.max(0, chart.currAvlCount - filled);
}

module.exports = {
    shouldPrepareChart,
    prepareChart,
    getChartStatus,
    getCurrAvlRemaining,
};
