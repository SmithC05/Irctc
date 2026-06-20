// =============================================================================
// NammaRail — Chart Preparation Scheduler
// =============================================================================
//
// WHY A SCHEDULER?
// ─────────────────────────────────────────────────────────────────────────────
// Chart preparation must happen automatically at T-4h before departure.
// There is no user action that triggers it — it is a railway world event.
//
// We use setInterval() — Node.js's built-in repeating timer.
// Every 5 minutes, the scheduler wakes up and scans for any train/date/class
// combinations that should have their chart prepared.
//
// WHY 5-MINUTE INTERVALS?
// ─────────────────────────────────────────────────────────────────────────────
// Chart prep triggers at T-4h (4 hours before departure).
// A 5-minute tick means the chart is prepared within 5 minutes of the trigger
// window opening. This is accurate enough for a railway simulation, and avoids
// hammering the DB every second.
//
// WHY IN-PROCESS (not a cron job or worker thread)?
// ─────────────────────────────────────────────────────────────────────────────
// better-sqlite3 is NOT thread-safe — it cannot be shared across threads.
// Running the scheduler inside the same process (using the shared `db` instance)
// is the correct approach for a synchronous SQLite connection.
//
// If we needed a separate process, we'd use a separate DB connection in a
// child_process or worker. For NammaRail's scale, in-process is fine.
//
// IDEMPOTENCY:
// Each tick checks shouldPrepareChart() which returns false if chart is already
// PREPARED. prepareChart() uses ON CONFLICT DO UPDATE so double-calls are safe.
// =============================================================================

'use strict';

const db = require('../db/database');
const { shouldPrepareChart }    = require('../utils/chartUtils');
const { prepareChart }          = require('../utils/chartUtils');
const { CHART_PREP_HOURS_BEFORE } = require('../utils/phaseUtils');

// How often to run the check (every 5 minutes)
const TICK_INTERVAL_MS = 5 * 60 * 1000;

// ─── runChartPreparationTick ──────────────────────────────────────────────────

/**
 * One tick of the scheduler.
 *
 * Finds all (train_id, journey_date, class_code) combinations that:
 *   1. Have active bookings (i.e. a seat_inventory row exists)
 *   2. Have not yet been prepared (chart_status = 'PENDING' or no train_charts row)
 *   3. Are within the 4-hour pre-departure window
 *
 * For each matching combination, calls prepareChart() to run the full
 * chart preparation sequence atomically.
 */
function runChartPreparationTick() {
    // Get today's and tomorrow's dates in YYYY-MM-DD format (IST).
    const IST_OFFSET = 330 * 60 * 1000;  // 330 minutes in ms
    const now        = new Date(Date.now() + IST_OFFSET);
    const yyyy       = now.getUTCFullYear();
    const mm         = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd         = String(now.getUTCDate()).padStart(2, '0');
    const today      = `${yyyy}-${mm}-${dd}`;

    // Tomorrow
    const tomorrowMs = Date.now() + IST_OFFSET + 24 * 60 * 60 * 1000;
    const tomorrow   = new Date(tomorrowMs);
    const ty         = tomorrow.getUTCFullYear();
    const tm         = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
    const td         = String(tomorrow.getUTCDate()).padStart(2, '0');
    const tomorrowStr = `${ty}-${tm}-${td}`;

    // Find all inventory entries for today and tomorrow that haven't been
    // chart-prepared yet. LEFT JOIN with train_charts allows us to find rows
    // where no chart entry exists (NULL chart_status means PENDING).
    const candidates = db.prepare(`
        SELECT
            si.train_id,
            si.journey_date,
            si.class_code,
            t.departure_time,
            COALESCE(tc.chart_status, 'PENDING') AS chart_status
        FROM seat_inventory si
        JOIN trains t ON t.id = si.train_id
        LEFT JOIN train_charts tc
               ON tc.train_id     = si.train_id
              AND tc.journey_date = si.journey_date
              AND tc.class_code   = si.class_code
        WHERE si.journey_date IN (?, ?)
          AND COALESCE(tc.chart_status, 'PENDING') = 'PENDING'
    `).all(today, tomorrowStr);

    if (candidates.length === 0) return;

    let prepared = 0;

    for (const row of candidates) {
        try {
            if (shouldPrepareChart(row.journey_date, row.departure_time, row.chart_status)) {
                const result = prepareChart(db, row.train_id, row.journey_date, row.class_code);
                if (result.prepared) {
                    prepared++;
                    console.log(
                        `  📋 Chart prepared: Train ${row.train_id} | ${row.journey_date} | ${row.class_code}` +
                        ` | WL cancelled: ${result.cancelledWL} | CURR_AVL: ${result.currAvlCount}`
                    );
                }
            }
        } catch (err) {
            // Log and continue — one failure should not stop other trains from being processed.
            console.error(
                `  ❌ Chart prep failed: Train ${row.train_id} | ${row.journey_date} | ${row.class_code}`,
                err.message
            );
        }
    }

    if (prepared > 0) {
        console.log(`  ✔  Chart scheduler tick: ${prepared} charts prepared`);
    }
}

// ─── startChartScheduler ──────────────────────────────────────────────────────

/**
 * Starts the background scheduler.
 * Runs once immediately on startup (to catch any charts that should have been
 * prepared while the server was offline), then every TICK_INTERVAL_MS.
 *
 * @returns {NodeJS.Timeout} The interval handle (store if you need to stop it)
 */
function startChartScheduler() {
    console.log(`🕐 Chart scheduler started (tick every ${TICK_INTERVAL_MS / 1000 / 60} minutes)`);

    // Run once immediately — handles edge case where server was restarted
    // between when a chart should have been prepared and now.
    try {
        runChartPreparationTick();
    } catch (err) {
        console.error('Chart scheduler initial tick failed:', err.message);
    }

    // Schedule recurring checks.
    return setInterval(() => {
        try {
            runChartPreparationTick();
        } catch (err) {
            console.error('Chart scheduler tick failed:', err.message);
        }
    }, TICK_INTERVAL_MS);
}

// ─── manualTrigger ────────────────────────────────────────────────────────────

/**
 * Force-prepares the chart for a specific train/date/class.
 * Used by the admin route for testing.
 *
 * @param {number} trainId
 * @param {string} journeyDate
 * @param {string} classCode
 * @returns {{ prepared: boolean, cancelledWL: number, currAvlCount: number }}
 */
function manualTrigger(trainId, journeyDate, classCode) {
    return prepareChart(db, trainId, journeyDate, classCode);
}

module.exports = { startChartScheduler, manualTrigger, runChartPreparationTick };
