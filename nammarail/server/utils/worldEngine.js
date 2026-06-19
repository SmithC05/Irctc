// =============================================================================
// NammaRail — World Engine: Lazy Demand Simulation
// =============================================================================
//
// PURPOSE
// ────────
// Seat_inventory rows are created empty (all counters = 0) on first access.
// Real-world trains fill up over the 60-day booking window according to demand.
// Without simulation, every train always appears completely empty — unrealistic.
//
// The World Engine simulates the passage of time LAZILY: when a row is first
// read, it "fast-forwards" through every day between when the booking window
// opened (d=60) and today, applying demand logic per day.
//
// KEY DESIGN DECISIONS
// ─────────────────────
// • Pure lazy materialization — no background jobs.  The first query for any
//   (train, date, class) triggers the simulation for that specific row.
// • Subsequent reads are instant — sim_days_before_journey tracks where we left
//   off; only newly-elapsed days are re-rolled.
// • Must be called INSIDE a transaction (same transaction that reads the row)
//   so the TOCTOU fix in bookingController is not circumvented.
// • Demand tier ('high'|'medium'|'low'|null→'medium') is read from the trains
//   table via the trainId.  The caller must NOT pass the tier — we read fresh
//   from DB so enrichment updates are immediately reflected.
// • Randomness: Math.random() — no seeding (intentional per design).
//
// DEMAND PHASES (per simulated day d = daysBeforeJourney at that iteration):
//
//  [31, 60] SLOW  — CNF pool fills at 5–15 seats/day × tier × weekend × night
//  [21, 30] RAC   — RAC fills at 1–4 slots/day × multipliers
//                   (falls back to SLOW if CNF not yet full)
//  [ 2, 20] WL    — WL fills at 1–6 entries/day × multipliers
//                   (falls back to RAC or SLOW if earlier pools not full)
//  [ 0,  1] CURR_AVL — 0–3 cancellations convert CNF seats to curr_avl pool
//
// MULTIPLIERS (compose multiplicatively):
//   final = tier_multiplier * weekend_multiplier * night_multiplier
//   tier    : high=1.8, medium=1.0, low=0.5
//   weekend : Fri or Sun journey → 1.5, else 1.0
//   night   : departure 18:00–23:59 or 00:00–05:00 → 1.3, else 1.0
//   min 1 after rounding — EXCEPT when tier='low' AND weekend=1.0 AND night=1.0
//   (low-demand daytime weekday trains may produce 0 rolls, staying mostly empty)
//
// =============================================================================

'use strict';

const db = require('../db/database');

// ─── Constants ────────────────────────────────────────────────────────────────

// IST offset — kept local here to avoid a circular dependency on phaseUtils.
const IST_OFFSET_MS = 330 * 60 * 1000;   // 330 minutes in ms

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns today's date string (YYYY-MM-DD) in IST.
 */
function todayIST() {
    const now = new Date(Date.now() + IST_OFFSET_MS);
    return now.toISOString().slice(0, 10);
}

/**
 * Computes floor((journeyDate - todayIST) in days).
 * Returns a negative number if the journey is in the past.
 */
function daysBeforeJourney(journeyDateStr) {
    const todayStr = todayIST();
    const todayMs  = new Date(todayStr).getTime();
    const journMs  = new Date(journeyDateStr).getTime();
    return Math.floor((journMs - todayMs) / (24 * 60 * 60 * 1000));
}

/**
 * Returns the demand tier multiplier for a given tier string.
 * NULL tier is treated as 'medium' per spec.
 */
function tierMultiplier(tier) {
    switch ((tier || 'medium').toLowerCase()) {
        case 'high':   return 1.8;
        case 'low':    return 0.5;
        default:       return 1.0;   // 'medium' or unknown
    }
}

/**
 * Returns true if the journey date falls on a Friday or Sunday (IST).
 * These are high-demand days per the spec.
 * journeyDateStr is YYYY-MM-DD; new Date(x) parses as UTC midnight.
 */
function isWeekendDay(journeyDateStr) {
    const day = new Date(journeyDateStr).getUTCDay(); // 0=Sun, 5=Fri
    return day === 0 || day === 5;
}

/**
 * Returns 1.3 if the train's departure time falls in a night window,
 * 1.0 otherwise.
 *
 * Night windows (per spec):
 *   18:00 – 23:59  (late-evening departures)
 *   00:00 – 05:00  (overnight/early-morning departures)
 *
 * departureTime is "HH:MM" (24-hour) as stored in trains.departure_time.
 * If null/missing, falls back to 1.0 (no penalty, no bonus).
 */
function nightMultiplier(departureTime) {
    if (!departureTime || !/^\d{2}:\d{2}$/.test(departureTime)) return 1.0;
    const [h, m] = departureTime.split(':').map(Number);
    const totalMins = h * 60 + m;
    // 18:00 = 1080, 23:59 = 1439, 00:00 = 0, 05:00 = 300
    if (totalMins >= 1080 || totalMins <= 300) return 1.3;
    return 1.0;
}

/**
 * Applies all three multipliers to a base roll and returns a floored integer.
 *
 * final = tier_mult * weekend_mult * night_mult, applied to baseRoll,
 * then rounded to nearest int.
 *
 * Min-1 floor is applied UNLESS ALL of these are true:
 *   - tier is 'low' (or null treated as medium — null never reaches low path)
 *   - weekend multiplier = 1.0 (not a Fri/Sun journey)
 *   - night multiplier   = 1.0 (not a night departure)
 * When all three conditions hold, the roll is allowed to produce 0 — keeping
 * genuinely low-demand daytime weekday trains mostly empty.
 *
 * @param {number} baseRoll
 * @param {string|null} tier           - demand_tier
 * @param {string} journeyDateStr      - YYYY-MM-DD
 * @param {string|null} departureTime  - HH:MM from trains.departure_time
 */
function applyMultipliers(baseRoll, tier, journeyDateStr, departureTime) {
    const tMult = tierMultiplier(tier);
    const wMult = isWeekendDay(journeyDateStr) ? 1.5 : 1.0;
    const nMult = nightMultiplier(departureTime);

    const result = Math.round(baseRoll * tMult * wMult * nMult);

    // Suppress the min-1 floor only for low-demand, daytime, weekday trains.
    const suppressMin = (tier || 'medium').toLowerCase() === 'low'
        && wMult === 1.0
        && nMult === 1.0;

    return suppressMin ? result : Math.max(1, result);
}

/**
 * Returns a random integer in the range [min, max] inclusive.
 */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Fetches the demand_tier for a train. Returns null if not set (runtime treats
 * null as 'medium').
 */
function getTrainDemandTier(trainId) {
    const row = db.prepare('SELECT demand_tier FROM trains WHERE id = ?').get(trainId);
    return row ? row.demand_tier : null;
}

// ─── Core simulation ──────────────────────────────────────────────────────────

/**
 * Simulates ONE day of demand for the given mutable `state` object.
 * The state object holds live seat counter values and is modified in place.
 *
 * @param {Object} state           - Current seat counter values (will be mutated)
 * @param {number} d               - daysBeforeJourney for this iteration
 * @param {string|null} tier       - demand_tier ('high'|'medium'|'low'|null)
 * @param {string} journeyDate     - YYYY-MM-DD (for weekend check)
 * @param {string|null} depTime    - HH:MM from trains.departure_time (for night check)
 */
function rollOneDayDemand(state, d, tier, journeyDate, depTime) {
    const normalCapacity = state.total_seats - state.tatkal_seats;
    const racCapacity    = state.rac_total * 2;   // 2 pax per RAC berth

    if (d >= 31) {
        // ── SLOW PHASE [31, 60] — fill CNF pool ──────────────────────────────
        const cnfRoom = normalCapacity - state.confirmed_seats;
        if (cnfRoom <= 0) return;   // CNF full, SLOW phase does nothing extra here

        const base = randInt(5, 15);
        const roll = Math.min(applyMultipliers(base, tier, journeyDate, depTime), cnfRoom);
        state.confirmed_seats += roll;

    } else if (d >= 21) {
        // ── RAC PHASE [21, 30] ────────────────────────────────────────────────
        const cnfRoom = normalCapacity - state.confirmed_seats;
        if (cnfRoom > 0) {
            // CNF not yet exhausted — keep filling CNF with SLOW formula
            const base = randInt(5, 15);
            const roll = Math.min(applyMultipliers(base, tier, journeyDate, depTime), cnfRoom);
            state.confirmed_seats += roll;
        } else {
            // CNF full — fill RAC
            const racRoom = racCapacity - state.rac_filled;
            if (racRoom <= 0) return;

            const base = randInt(1, 4);
            const roll = Math.min(applyMultipliers(base, tier, journeyDate, depTime), racRoom);
            state.rac_filled += roll;
        }

    } else if (d >= 2) {
        // ── WL PHASE [2, 20] ─────────────────────────────────────────────────
        const cnfRoom = normalCapacity - state.confirmed_seats;
        if (cnfRoom > 0) {
            // Still room in CNF
            const base = randInt(5, 15);
            const roll = Math.min(applyMultipliers(base, tier, journeyDate, depTime), cnfRoom);
            state.confirmed_seats += roll;
        } else {
            const racRoom = racCapacity - state.rac_filled;
            if (racRoom > 0) {
                // RAC still has room
                const base = randInt(1, 4);
                const roll = Math.min(applyMultipliers(base, tier, journeyDate, depTime), racRoom);
                state.rac_filled += roll;
            } else {
                // Both CNF and RAC full — fill WL
                const wlRoom = state.wl_total - state.wl_filled;
                if (wlRoom <= 0) return;

                const base = randInt(1, 6);
                const roll = Math.min(applyMultipliers(base, tier, journeyDate, depTime), wlRoom);
                state.wl_filled += roll;
            }
        }

    } else {
        // ── CURR_AVL PHASE [0, 1] ─────────────────────────────────────────────
        // Simulate late cancellations: some CNF passengers cancel, freeing
        // confirmed seats that become CURR_AVL pool for post-chart booking.
        if (state.confirmed_seats <= 0) return;

        const cancellations = Math.min(randInt(0, 3), state.confirmed_seats);
        state.confirmed_seats  -= cancellations;
        state.curr_avl_filled  += cancellations;
        // NOTE: curr_avl_filled here represents simulated cancellation demand
        // that populates the CURR_AVL pool.  The chartUtils.prepareChart() logic
        // sets curr_avl_count on the chart row separately — these are additive.
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Materializes demand for a seat_inventory row by simulating all elapsed days
 * since the booking window opened (or since the last simulation run).
 *
 * MUST be called INSIDE a db.transaction() — it reads and writes the same row
 * that the surrounding booking/search transaction is operating on.
 *
 * @param {number} trainId
 * @param {string} journeyDate  - YYYY-MM-DD
 * @param {string} classCode    - e.g. 'SL', '3A'
 * @returns {void}
 */
function materializeInventory(trainId, journeyDate, classCode) {
    // Step 1: Compute current daysBeforeJourney.
    const currentD = daysBeforeJourney(journeyDate);

    // Outside booking window entirely — nothing to do.
    if (currentD > 60 || currentD < 0) return;

    // Step 2: Read the inventory row.  The caller (getOrCreateInventory /
    // createInventoryIfMissing) is responsible for ensuring the row exists
    // BEFORE calling materializeInventory — we only update, never insert here.
    const inv = db.prepare(`
        SELECT * FROM seat_inventory
        WHERE train_id = ? AND journey_date = ? AND class_code = ?
    `).get(trainId, journeyDate, classCode);

    if (!inv) return;   // Row doesn't exist yet — caller will create it

    // Step 3: If sim_days_before_journey is NULL, treat as 60 (booking just opened).
    const lastSimD = (inv.sim_days_before_journey !== null && inv.sim_days_before_journey !== undefined)
        ? inv.sim_days_before_journey
        : 60;

    // If the current day is at or after the last simulated day, we're caught up.
    // (sim_days_before_journey tracks "simulated up to this far out, nothing closer done")
    if (currentD >= lastSimD) return;

    // Step 4: Roll each day from (lastSimD - 1) down to currentD inclusive.
    const tier    = getTrainDemandTier(trainId);
    const trainRow = db.prepare('SELECT departure_time FROM trains WHERE id = ?').get(trainId);
    const depTime  = trainRow ? trainRow.departure_time : null;

    // Work on a mutable state copy so we can apply increments cumulatively
    // before writing to the DB once at the end.
    const state = {
        total_seats:     inv.total_seats,
        tatkal_seats:    inv.tatkal_seats,
        confirmed_seats: inv.confirmed_seats,
        rac_total:       inv.rac_total,
        rac_filled:      inv.rac_filled,
        wl_total:        inv.wl_total,
        wl_filled:       inv.wl_filled,
        curr_avl_filled: inv.curr_avl_filled,
    };

    for (let d = lastSimD - 1; d >= currentD; d--) {
        rollOneDayDemand(state, d, tier, journeyDate, depTime);
    }

    // Step 5: Persist updated counters and set sim_days_before_journey = currentD.
    db.prepare(`
        UPDATE seat_inventory
           SET confirmed_seats         = ?,
               rac_filled              = ?,
               wl_filled               = ?,
               curr_avl_filled         = ?,
               sim_days_before_journey = ?
         WHERE train_id    = ?
           AND journey_date = ?
           AND class_code   = ?
    `).run(
        state.confirmed_seats,
        state.rac_filled,
        state.wl_filled,
        state.curr_avl_filled,
        currentD,
        trainId, journeyDate, classCode
    );
}

module.exports = { materializeInventory, daysBeforeJourney };
