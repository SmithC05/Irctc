// =============================================================================
// NammaRail — Train Controller
// =============================================================================
// Handles all train-related API logic:
//   searchTrains        → GET /api/trains/search?from=MAS&to=CBE&date=...&class=SL
//   getTrainDetails     → GET /api/trains/:trainNumber?from=MAS&to=CBE&date=...
//   createInventoryIfMissing → internal helper (not an API route)
// =============================================================================

'use strict';

const db = require('../db/database');
const { validateJourneyDate, getDayColumn, getDayName, isValidDateFormat, isDateInPast } = require('../utils/dateUtils');
const { buildPhaseContext, getTrainPhase, getTatkalWindowStatus, PHASES } = require('../utils/phaseUtils');
const { getChartStatus, getCurrAvlRemaining } = require('../utils/chartUtils');
const { getBookingStatus, getNextWLNumber, getNextRACNumber } = require('../utils/seatUtils');
const { materializeInventory } = require('../utils/worldEngine');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS — Default seat capacities per class code.
//
// WHY LAZY INVENTORY CREATION?
// ─────────────────────────────
// Indian Railways runs thousands of trains across hundreds of future dates.
// Pre-creating a seat_inventory row for every train × every future date × every
// class on day-1 would mean millions of empty rows in the database before a
// single ticket is sold — a massive, wasteful up-front write operation.
//
// Instead we use "lazy initialisation": we create the inventory row for a
// specific (train, date, class) combination the FIRST TIME someone searches for
// or books that combination.  This keeps the database lean and ensures we only
// store data that has actual demand.
//
// The trade-off: the very first search for a given slot is slightly slower
// (it does an extra INSERT).  Every subsequent search just reads the same row.
// For a booking system this is the right choice.
// ─────────────────────────────────────────────────────────────────────────────
const SEAT_DEFAULTS = {
    '1A':  { total_seats: 18,  rac_total: 4,  tatkal_seats: 4  },
    '2A':  { total_seats: 46,  rac_total: 11, tatkal_seats: 9  },
    '3A':  { total_seats: 64,  rac_total: 16, tatkal_seats: 13 },
    'SL':  { total_seats: 72,  rac_total: 18, tatkal_seats: 14 },
    'CC':  { total_seats: 78,  rac_total: 0,  tatkal_seats: 16 },
    '2S':  { total_seats: 100, rac_total: 0,  tatkal_seats: 20 },
};

const DEFAULT_SEATS = { total_seats: 50, rac_total: 12, tatkal_seats: 10 };

// Day-of-week and date validation are handled by the shared utils/dateUtils.js module.
// getDayColumn(), getDayName(), isValidDateFormat(), and isDateInPast() are all imported above.


// ─────────────────────────────────────────────────────────────────────────────
// HELPER: createInventoryIfMissing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures a seat_inventory row exists for the given (trainId, date, classCode).
 *
 * If a row already exists → returns it unchanged.
 * If not             → inserts one with realistic default seat counts and returns it.
 *
 * This function is called synchronously during a search — better-sqlite3 has no
 * async overhead, so the extra INSERT (when needed) adds negligible latency.
 *
 * @param {number} trainId     - The train's id (e.g. 12673)
 * @param {string} journeyDate - YYYY-MM-DD
 * @param {string} classCode   - e.g. "SL", "3A", "2A"
 * @returns {Object} The seat_inventory row for this combination
 */
function createInventoryIfMissing(trainId, journeyDate, classCode) {
    // Check if inventory already exists for this exact (train, date, class) combo.
    const existing = db.prepare(`
        SELECT * FROM seat_inventory
        WHERE train_id = ? AND journey_date = ? AND class_code = ?
    `).get(trainId, journeyDate, classCode);

    if (!existing) {
        // Look up seat defaults for this class; fall back to generic defaults.
        const defaults = SEAT_DEFAULTS[classCode] || DEFAULT_SEATS;

        // Insert the new inventory row.
        // The UNIQUE(train_id, journey_date, class_code) constraint in schema.sql
        // prevents duplicates if two requests arrive simultaneously.
        db.prepare(`
            INSERT OR IGNORE INTO seat_inventory
                (train_id, journey_date, class_code,
                 total_seats, rac_total, tatkal_seats,
                 wl_total)
            VALUES (?, ?, ?, ?, ?, ?, 60)
        `).run(trainId, journeyDate, classCode,
               defaults.total_seats, defaults.rac_total, defaults.tatkal_seats);
    }

    // Run the World Engine to catch up any simulated demand since last access.
    // Must run after the row exists; reads sim_days_before_journey to know
    // how many days to fast-forward.  The search request runs outside an explicit
    // transaction, so we wrap just this call — better-sqlite3 transactions are
    // safe to nest (inner becomes a no-op if already inside one).
    const materialize = db.transaction(() => materializeInventory(trainId, journeyDate, classCode));
    materialize();

    // Fetch and return the freshly-updated row.
    return db.prepare(`
        SELECT * FROM seat_inventory
        WHERE train_id = ? AND journey_date = ? AND class_code = ?
    `).get(trainId, journeyDate, classCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: buildAvailabilityShape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw seat_inventory row into the structured availability object
 * returned to the client.  Calculating "available" counts here keeps the SQL
 * queries simple — no arithmetic in SQL, just raw stored values.
 *
 * @param {Object} inv - A row from seat_inventory
 * @returns {Object} Structured availability block
 */
function buildAvailabilityShape(inv, chartInfo) {
    const shape = {
        CNF: {
            available:  Math.max(0, inv.total_seats - (inv.confirmed_seats || 0)),
            totalSeats: inv.total_seats,
        },
        RAC: {
            available:    Math.max(0, inv.rac_total - (inv.rac_filled || 0)),
            totalCapacity: inv.rac_total,
        },
        WL: {
            current:    inv.wl_filled || 0,
            maxAllowed: inv.wl_total,
        },
        tatkal: {
            available: Math.max(0, inv.tatkal_seats - (inv.tatkal_filled || 0)),
        },
    };

    // CURR_AVL is only shown if chart is PREPARED.
    if (chartInfo && chartInfo.chartStatus === 'PREPARED') {
        const filled = inv.curr_avl_filled || 0;
        shape.CURR_AVL = {
            available: Math.max(0, (chartInfo.currAvlCount || 0) - filled),
            total:     chartInfo.currAvlCount || 0,
        };
    }

    return shape;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: fetchFareForClass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Looks up the fare record for a specific (train, from, to, class) combination.
 *
 * WHY PREPARED STATEMENTS (not string concatenation)?
 * ────────────────────────────────────────────────────
 * SQL injection is one of the most common and damaging web vulnerabilities.
 * If we built queries like:
 *   `SELECT * FROM fares WHERE from_station_code = '${from}'`
 * ...an attacker could pass from = "' OR '1'='1" and manipulate the query.
 *
 * With db.prepare(), we separate the SQL structure (compiled once) from the
 * data values (supplied separately via placeholders `?`).  The database driver
 * never treats the user-supplied values as SQL code — they are always treated
 * as plain data.  This completely prevents SQL injection.
 *
 * WHAT IS A COMPOSITE INDEX?
 * ───────────────────────────
 * An index is a sorted lookup structure the database maintains alongside a table
 * to make searches faster (like a book's index).  A COMPOSITE index covers
 * multiple columns together.  Our schema has:
 *   CREATE INDEX idx_fares_lookup ON fares(train_id, from_station_code, to_station_code, class_code)
 * This means a query filtering on all four columns hits the index directly and
 * never scans the 326,643-row fares table row-by-row — it jumps straight to
 * the matching entry.  Without it, every fare lookup would be O(n).
 *
 * @param {number} trainId
 * @param {string} fromCode
 * @param {string} toCode
 * @param {string} classCode - if null, returns all classes for this route
 * @returns {Object|Object[]} Single fare row, or array when classCode is null
 */
function fetchFareForClass(trainId, fromCode, toCode, classCode) {
    if (classCode) {
        // Single class lookup — uses the composite index on all four columns.
        return db.prepare(`
            SELECT base_fare, total_fare, class_code, tatkal_fare,
                   reservation_charge, superfast_charge, service_tax,
                   distance_km, duration_mins
            FROM   fares
            WHERE  train_id = ?
              AND  from_station_code = ?
              AND  to_station_code = ?
              AND  class_code = ?
        `).get(trainId, fromCode, toCode, classCode);
    }

    // No class filter — return all classes for this route.
    return db.prepare(`
        SELECT base_fare, total_fare, class_code, tatkal_fare,
               reservation_charge, superfast_charge, service_tax,
               distance_km, duration_mins
        FROM   fares
        WHERE  train_id = ?
          AND  from_station_code = ?
          AND  to_station_code = ?
        ORDER BY class_code
    `).all(trainId, fromCode, toCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: calcSegmentDuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates journey duration in minutes between two stops on the same train.
 *
 * WHY WE NEED BOTH departure_time AND day_count:
 * ────────────────────────────────────────────────
 * Many Indian trains run overnight — or even over multiple nights.
 * A time string alone like "06:00" doesn't tell us if it's day 1 or day 2.
 * day_count solves this: if the from-stop has day_count=1 and the to-stop
 * has day_count=2, the train arrives the NEXT calendar day.
 *
 * Formula:
 *   totalMinutes = (toDay - fromDay) * 1440   ← each day = 1440 minutes
 *                + toTimeInMins - fromTimeInMins
 *
 * Example: TBM departs 07:30 day_count=1, RJPM arrives 23:15 day_count=1
 *   = (1-1)*1440 + 1395 - 450 = 945 mins = 15h 45m
 *
 * Example: CBE departs 22:00 day_count=1, MAS arrives 05:30 day_count=2
 *   = (2-1)*1440 + 330 - 1320 = 450 mins = 7h 30m
 *
 * @param {string} fromTime  - "HH:MM" departure time from the FROM stop
 * @param {number} fromDay   - day_count of the FROM stop (1, 2, …)
 * @param {string} toTime    - "HH:MM" arrival time at the TO stop
 * @param {number} toDay     - day_count of the TO stop
 * @returns {number|null} Duration in minutes, or null if times are unavailable
 */
function calcSegmentDuration(fromTime, fromDay, toTime, toDay) {
    if (!fromTime || !toTime || fromTime === '--' || toTime === '--') return null;

    function toMins(t) {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    return (toDay - fromDay) * 1440 + toMins(toTime) - toMins(fromTime);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: fetchSegmentFares
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches fares for a searched segment (fromCode → toCode).
 *
 * WHY A FALLBACK?
 * ─────────────────────────────────────────────────────────────────────────────
 * The fares table stores fare rows for common origin→destination pairs.
 * For an intermediate segment like TBM→RJPM, an exact fare row may not exist
 * in the dataset. In that case we fall back to the full-route fare and mark
 * it approximate — better than showing nothing to the user.
 *
 * The fare and duration shown must reflect the SEARCHED SEGMENT (TBM→RJPM),
 * not the full train journey (MAS→NCJ). This is what real IRCTC does — it
 * shows you the fare and time for your specific boarding-to-alighting segment.
 *
 * @param {number} trainId
 * @param {string} fromCode  - Searched FROM station
 * @param {string} toCode    - Searched TO station
 * @param {string} originCode  - Train's actual origin
 * @param {string} destCode    - Train's actual destination
 * @param {string|null} classCode
 * @returns {{ fares: Object[], fareApproximate: boolean }}
 */
function fetchSegmentFares(trainId, fromCode, toCode, originCode, destCode, classCode) {
    // Try exact segment fare first (the happy path)
    const exact = fetchFareForClass(trainId, fromCode, toCode, classCode);
    const exactArr = Array.isArray(exact) ? exact : (exact ? [exact] : []);
    if (exactArr.length > 0) {
        return { fares: exactArr, fareApproximate: false };
    }

    // Fallback: use the full-route fare for this train
    const fallback = fetchFareForClass(trainId, originCode, destCode, classCode);
    const fallbackArr = Array.isArray(fallback) ? fallback : (fallback ? [fallback] : []);
    return { fares: fallbackArr, fareApproximate: fallbackArr.length > 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: buildSegmentResult
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the final result object for one train that serves the searched segment.
 *
 * Unlike the old buildTrainResult (which used train-level origin/dest times),
 * this version uses the STOP-LEVEL times for the searched stations — giving
 * the passenger accurate departure and arrival for their specific journey.
 *
 * @param {Object} row         - Combined row: train columns + s1/s2 stop columns
 * @param {string} searchFrom  - Searched FROM station code
 * @param {string} searchTo    - Searched TO station code
 * @param {string} journeyDate - YYYY-MM-DD
 * @param {string|null} classCode
 * @param {string} dayName     - e.g. "Monday"
 */
function buildSegmentResult(row, searchFrom, searchTo, journeyDate, classCode, dayName) {
    // Segment distance = distance of TO stop minus distance of FROM stop.
    const distanceKm = (row.to_distance || 0) - (row.from_distance || 0);

    // Segment duration from actual stop-level times, accounting for day_count
    const durationMins = calcSegmentDuration(
        row.actual_departure, row.from_day_count,
        row.actual_arrival,   row.to_day_count
    );

    const { fares, fareApproximate } = fetchSegmentFares(
        row.id, searchFrom, searchTo,
        row.from_station_code, row.to_station_code,
        classCode
    );

    // Build availability for each fare class (lazy-create inventory)
    const availabilityByClass = {};
    for (const fare of fares) {
        const inv       = createInventoryIfMissing(row.id, journeyDate, fare.class_code);
        const chartInfo = getChartStatus(db, row.id, journeyDate, fare.class_code);
        availabilityByClass[fare.class_code] = buildAvailabilityShape(inv, chartInfo);
    }

    // Compute phase context using departure_time from the FROM stop (actual_departure)
    // We use the train-level departure_time for phase since that's what determines
    // chart prep timing (T-4h before the train's DEPARTURE from origin).
    const chartRow    = getChartStatus(db, row.id, journeyDate, null);
    const chartStatus = chartRow?.chartStatus ?? 'PENDING';
    const currAvlCount = chartRow?.currAvlCount ?? 0;
    const phaseContext = buildPhaseContext(
        journeyDate, row.departure_time || row.actual_departure,
        chartStatus, currAvlCount
    );

    return {
        trainNumber:    row.id,
        trainName:      row.name,
        fromStation:    searchFrom,
        toStation:      searchTo,
        departureTime:  row.actual_departure,
        arrivalTime:    row.actual_arrival,
        durationMins,
        distanceKm,
        dayOfWeek:      dayName,
        fareApproximate,
        availability:   availabilityByClass,
        fares,
        // Agent Constitution API Contract: every response must include phase context
        ...phaseContext,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: searchTrains — GET /api/trains/search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches for trains that serve the searched FROM→TO segment.
 *
 * WHAT CHANGED (and why the old query was wrong):
 * ─────────────────────────────────────────────────────────────────────────────
 * The old query used:
 *   WHERE trains.from_station_code = ? AND trains.to_station_code = ?
 * This ONLY matched trains whose ORIGIN and FINAL DESTINATION were the searched
 * stations — missing any train that merely passes through both as intermediate
 * stops. For example, MAS→NCJ via TBM, SA, MDU, RJPM was invisible to a user
 * searching TBM→RJPM.
 *
 * THE FIX — double JOIN on the stations table:
 * We join the stations table TWICE — once for the departure station (s1) and
 * once for the arrival station (s2). Both JOINs use the same train_id, so only
 * trains that stop at BOTH stations are returned. The WHERE clause
 * s1.stop_number < s2.stop_number ensures the passenger is travelling in the
 * correct direction — s1 (boarding) must physically come before s2 (alighting)
 * in the train's stop sequence. Without this, a user searching MAS→TBM could
 * get results for a train running TBM→MAS (wrong direction).
 *
 * DAY-OF-WEEK CHECK:
 * If user searches date=2026-06-15 (a Monday), getDayColumn returns 'runs_mon'.
 * We then check WHERE t.runs_mon = 1 — this filters out trains that don't run
 * on Mondays. getDayColumn always receives the user's SEARCHED date, not today.
 *
 * Required query params: from, to, date
 * Optional query param:  class (e.g. SL, 3A, 2A)
 */
function searchTrains(req, res) {
    const { from, to, date, class: classCode } = req.query;

    // ── Step 1: Validate required params ──────────────────────────────────
    if (!from || !to) {
        return res.status(400).json({ error: 'from and to station codes are required' });
    }
    if (from.toUpperCase() === to.toUpperCase()) {
        return res.status(400).json({ error: 'from and to stations cannot be the same' });
    }

    // ── Step 2: Validate the journey date ────────────────────────────────
    // validateJourneyDate enforces: format, not in past, within 60-day window.
    const dateValidation = validateJourneyDate(date);
    if (!dateValidation.valid) {
        return res.status(400).json({ error: dateValidation.error });
    }

    // ── Step 3: Determine day of week from the searched date ──────────────
    // getDayColumn(date) — note: uses the SEARCHED date, not today.
    // Example: date="2026-06-15" (Monday) → dayColumn="runs_mon"
    const dayColumn = getDayColumn(date);   // e.g. 'runs_mon'
    const dayName   = getDayName(date);     // e.g. 'Monday'

    const fromCode = from.toUpperCase();
    const toCode   = to.toUpperCase();

    // ── Step 4: Double-JOIN query ─────────────────────────────────────────
    //
    // We join the stations table TWICE:
    //   s1 = the row for the FROM station on this train
    //   s2 = the row for the TO   station on this train
    //
    // Both JOINs include train_id = t.id, so a row only appears when
    // a single train has BOTH stations in its stop list.
    //
    // WHERE s1.stop_number < s2.stop_number
    //   → ensures direction is correct (FROM comes before TO in the schedule)
    //   → a train running MAS→TBM would have TBM at a lower stop_number than
    //     MAS, so searching MAS→TBM would yield 0 results for that train.
    //
    // The dynamic dayColumn is safe: it comes from getDayColumn() which maps
    // to a fixed constant array — not user input — so SQL injection is impossible.
    //
    // We select s1's departure_time and s2's arrival_time so downstream code
    // shows the passenger THEIR departure / arrival, not the train's origin times.
    // We also select day_count for both stops to calculate multi-day durations.
    const rows = db.prepare(`
        SELECT DISTINCT
            t.*,
            s1.stop_number          AS from_stop_number,
            s1.departure_time       AS actual_departure,
            s1.distance_from_origin AS from_distance,
            s1.day_count            AS from_day_count,
            s2.stop_number          AS to_stop_number,
            s2.arrival_time         AS actual_arrival,
            s2.distance_from_origin AS to_distance,
            s2.day_count            AS to_day_count
        FROM   trains t
        JOIN   stations s1
               ON  s1.train_id     = t.id
               AND s1.station_code = ?          -- s1: the FROM stop
        JOIN   stations s2
               ON  s2.train_id     = t.id
               AND s2.station_code = ?          -- s2: the TO stop
        WHERE  s1.stop_number < s2.stop_number  -- FROM must come before TO
          AND  t.${dayColumn}    = 1            -- runs on the searched day
        ORDER BY s1.departure_time
    `).all(fromCode, toCode);

    if (rows.length === 0) {
        return res.status(200).json({
            message: `No trains found from ${fromCode} to ${toCode} on ${dayName}`,
            trains:  [],
        });
    }

    // ── Step 5: Build the full result for each matching train ─────────────
    const results = rows.map(row =>
        buildSegmentResult(row, fromCode, toCode, date, classCode || null, dayName)
    );

    return res.status(200).json({
        from:      fromCode,
        to:        toCode,
        date,
        dayOfWeek: dayName,
        count:     results.length,
        trains:    results,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: buildDaysArray
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts the 7 individual runs_xxx integer columns into a readable array.
 * e.g. { runs_mon:1, runs_wed:1, runs_fri:1, ... } → ["Monday","Wednesday","Friday"]
 */
function buildDaysArray(train) {
    const pairs = [
        ['runs_sun', 'Sunday'],    ['runs_mon', 'Monday'],
        ['runs_tue', 'Tuesday'],   ['runs_wed', 'Wednesday'],
        ['runs_thu', 'Thursday'],  ['runs_fri', 'Friday'],
        ['runs_sat', 'Saturday'],
    ];
    return pairs.filter(([col]) => train[col] === 1).map(([, name]) => name);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: getTrainDetails — GET /api/trains/:trainNumber
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns complete details for one train:
 *   - All station stops (ordered by stop_number)
 *   - Fare breakdown for all classes on the requested from→to segment
 *   - Seat availability for each class (lazily initialised if needed)
 *   - Days of operation as a readable string array
 *
 * Query params (all optional): from, to, date
 * If from/to are provided, fares and availability are scoped to that segment.
 * If date is provided, availability reflects that specific date.
 */
function getTrainDetails(req, res) {
    const trainNumber = parseInt(req.params.trainNumber, 10);
    const { from, to, date } = req.query;

    // Validate trainNumber is a number.
    if (isNaN(trainNumber)) {
        return res.status(400).json({ error: 'trainNumber must be a number' });
    }

    // Fetch the master train record.
    const train = db.prepare('SELECT * FROM trains WHERE id = ?').get(trainNumber);
    if (!train) {
        return res.status(404).json({ error: `Train ${trainNumber} not found` });
    }

    // Fetch all station stops for this train, ordered by stop sequence.
    const stations = db.prepare(`
        SELECT station_code, station_name, arrival_time, departure_time,
               day_count, distance_from_origin, stop_number
        FROM   stations
        WHERE  train_id = ?
        ORDER  BY stop_number ASC
    `).all(trainNumber);

    // Determine the from/to codes to use for fare and availability lookups.
    const fromCode = (from || train.from_station_code).toUpperCase();
    const toCode   = (to   || train.to_station_code).toUpperCase();

    // Fetch all fare classes for this route segment.
    const fares = fetchFareForClass(trainNumber, fromCode, toCode, null);

    // Build per-class availability (lazy-create inventory if date was provided).
    const journeyDate = (date && isValidDateFormat(date) && !isDateInPast(date))
        ? date
        : null;

    const availabilityByClass = {};
    for (const fare of fares) {
        if (journeyDate) {
            const inv       = createInventoryIfMissing(trainNumber, journeyDate, fare.class_code);
            const chartInfo = getChartStatus(db, trainNumber, journeyDate, fare.class_code);
            availabilityByClass[fare.class_code] = buildAvailabilityShape(inv, chartInfo);
        }
    }

    // Build phase context for this train/date.
    const chartRow    = journeyDate ? getChartStatus(db, trainNumber, journeyDate, null) : null;
    const chartStatus = chartRow?.chartStatus ?? 'PENDING';
    const currAvlCount = chartRow?.currAvlCount ?? 0;
    const phaseContext = journeyDate
        ? buildPhaseContext(journeyDate, train.departure_time, chartStatus, currAvlCount)
        : null;

    return res.status(200).json({
        trainNumber: train.id,
        trainName:   train.name,
        fromStation: train.from_station_code,
        toStation:   train.to_station_code,
        departureTime: train.departure_time,
        arrivalTime:   train.arrival_time,
        durationMins:  train.duration_mins,
        distanceKm:    train.distance_km,
        runsOn:        buildDaysArray(train),
        stations,
        fares,
        ...(journeyDate ? { journeyDate, availability: availabilityByClass } : {}),
        ...(phaseContext || {}),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: toTitleCase
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY DO WE TITLE-CASE STATION NAMES?
// ─────────────────────────────────────────────────────────────────────────────
// The raw data in our SQLite database was imported from the legacy Indian
// Railways dataset which stores ALL station names in UPPERCASE (e.g.
// "MGR CHENNAI CTL", "COIMBATORE JN"). This is a formatting artifact of
// older mainframe systems. All-caps text is harder to read and looks
// unprofessional in a modern UI. We convert to Title Case before sending
// to the client so the dropdown shows "Mgr Chennai Ctl" instead.
// The backend is responsible for this transform — if the UI did it,
// every frontend client would have to repeat the same logic.

function toTitleCase(str) {
    if (!str) return str;
    return str
        .toLowerCase()
        .replace(/\b\w/g, ch => ch.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: searchStations — GET /api/stations/search?q=chen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches for stations whose code OR name contains the query string.
 *
 * Query params:
 *   q  - the search text typed by the user (minimum 2 characters)
 *
 * Returns an array of { code, name } objects (max 8 results).
 */
function searchStations(req, res) {
    const { q } = req.query;

    // ── 2-character minimum guard ──────────────────────────────────────────
    // We require at least 2 characters before querying the database.
    // Without this guard, a user typing a single letter like "C" would match
    // hundreds of stations (Chennai, Coimbatore, Cochin, Calicut…) causing
    // an expensive full-table scan and returning overwhelming results.
    // This is called a "debounce guard on the backend" — the frontend also
    // debounces API calls (300ms), but the backend enforces the minimum
    // independently so it can never be bypassed by a direct API call.
    if (!q || q.trim().length < 2) {
        return res.status(400).json({
            error: 'Query must be at least 2 characters.',
        });
    }

    const query = `%${q.trim()}%`;

    // ── DISTINCT explained ────────────────────────────────────────────────
    // The `stations` table stores one row PER STOP PER TRAIN.
    // "Chennai Central" (code: MAS) appears once for every train that halts
    // there — potentially hundreds of rows for the same physical station.
    // Without DISTINCT, searching "chennai" would return "MAS" 200+ times.
    // SELECT DISTINCT collapses all duplicates so each station appears once.
    // We only SELECT the two columns we need (code and name) — not SELECT *
    // — because DISTINCT works on the entire selected row; fewer columns
    // means fewer comparisons and a faster query.
    //
    // SQLITE LIKE IS CASE INSENSITIVE for ASCII characters by default.
    // So LIKE '%chen%' will match "Chennai", "CHENNAI", and "chen" without
    // needing a LOWER() call on both sides. This only applies to ASCII
    // (English) letters — multi-byte Unicode would need explicit handling,
    // but Indian station names in our dataset are all transliterated ASCII.
    const rows = db.prepare(`
        SELECT DISTINCT station_code, station_name
        FROM   stations
        WHERE  station_code LIKE ?
           OR  station_name LIKE ?
        LIMIT 8
    `).all(query, query);

    // ── Limit explained ───────────────────────────────────────────────────
    // We cap results at 8 for two reasons:
    //   1. UX research shows that more than 7–8 options overwhelm users;
    //      they stop reading and either pick randomly or abandon the search.
    //   2. On mobile screens, 8 items already fill the visible viewport —
    //      more would require scrolling inside the dropdown which is clunky.
    // The LIMIT clause is in SQL (not JS .slice()) so the database stops
    // scanning once it finds 8 matches — faster than fetching all and trimming.

    const stations = rows.map(r => ({
        code: r.station_code,
        name: toTitleCase(r.station_name),
    }));

    return res.status(200).json(stations);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: getStats — GET /api/stats
// ─────────────────────────────────────────────────────────────────────────────
function getStats(req, res) {
    try {
        const trainCount = db.prepare('SELECT COUNT(*) as cnt FROM trains').get().cnt;
        const stationCount = db.prepare('SELECT COUNT(*) as cnt FROM stations').get().cnt;
        const fareCount = db.prepare('SELECT COUNT(*) as cnt FROM fares').get().cnt;
        
        return res.status(200).json({ trainCount, stationCount, fareCount });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch stats' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: getAvailabilityGrid — GET /api/trains/:trainId/availability
// ─────────────────────────────────────────────────────────────────────────────

function getAvailabilityGrid(req, res) {
    const trainId = parseInt(req.params.trainId, 10);
    const { classCode, startDate, numDays, quota, from, to } = req.query;

    if (isNaN(trainId) || !classCode || !startDate) {
        return res.status(400).json({ error: 'trainId, classCode, and startDate are required' });
    }

    const days = parseInt(numDays, 10) || 6;
    const train = db.prepare('SELECT * FROM trains WHERE id = ?').get(trainId);

    if (!train) {
        return res.status(404).json({ error: 'Train not found' });
    }

    const fromCode = (from || train.from_station_code).toUpperCase();
    const toCode   = (to   || train.to_station_code).toUpperCase();

    const fareRecords = fetchFareForClass(trainId, fromCode, toCode, classCode);
    const fareObj = Array.isArray(fareRecords) ? fareRecords[0] : fareRecords;
    const baseFare = fareObj ? (fareObj.total_fare || 0) : 0;
    const tatkalExtra = fareObj ? (fareObj.tatkal_fare || 0) : 0;

    const result = [];
    const start = new Date(startDate);

    for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        // Ensure local string matches YYYY-MM-DD correctly without tz shifts
        const isoDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();

        const inv = createInventoryIfMissing(trainId, isoDate, classCode);
        const chartRow = getChartStatus(db, trainId, isoDate, classCode);
        const chartStatus = chartRow?.chartStatus ?? 'PENDING';
        
        // We need departure time at the searched fromCode if available, otherwise train origin departure
        const stopRow = db.prepare('SELECT departure_time FROM stations WHERE train_id = ? AND station_code = ?').get(trainId, fromCode);
        const departureTime = stopRow?.departure_time && stopRow.departure_time !== '--' ? stopRow.departure_time : train.departure_time;

        const phase = getTrainPhase(isoDate, departureTime, chartStatus);
        
        const isTatkal = quota === 'tatkal';
        const totalFare = baseFare + (isTatkal ? tatkalExtra : 0);

        let status = 'AVAILABLE';
        let count = 0;
        let isBookable = false;
        let extraProps = {};

        if (phase === PHASES.DEPARTED) {
            status = 'REGRET';
            isBookable = false;
        } else if (phase === PHASES.BOOKING_UNAVAILABLE) {
            status = 'NOT_YET';
            isBookable = false;
        } else if (phase === PHASES.CHART_PREPARED) {
            status = 'CHART_PREPARED';
            count = getCurrAvlRemaining(db, trainId, isoDate, classCode);
            if (count > 0 && !isTatkal) {
                // CURR_AVL available
                status = 'AVAILABLE';
                isBookable = true;
            } else {
                isBookable = false;
            }
        } else if (isTatkal) {
            const tatkalStatusObj = getTatkalWindowStatus(classCode, isoDate);
            if (!tatkalStatusObj.isOpen) {
                status = 'TATKAL_NOT_YET';
                isBookable = false;
                extraProps = {
                    opensAt: tatkalStatusObj.opensAt,
                    opensOnDate: tatkalStatusObj.opensOnDate,
                    minsUntilOpen: tatkalStatusObj.minsUntilOpen,
                    opensInDays: tatkalStatusObj.opensInDays,
                };
            } else {
                const tatkalAvailable = Math.max(0, inv.tatkal_seats - inv.tatkal_filled);
                if (tatkalAvailable > 0) {
                    status = 'AVAILABLE';
                    count = tatkalAvailable;
                    isBookable = true;
                } else {
                    status = 'REGRET';
                    isBookable = false;
                }
            }
        } else {
            // Normal booking
            const bkStatus = getBookingStatus(inv);
            if (bkStatus === 'CNF') {
                status = 'AVAILABLE';
                count = Math.max(0, (inv.total_seats - inv.tatkal_seats) - inv.confirmed_seats);
                isBookable = true;
            } else if (bkStatus === 'RAC') {
                status = 'RAC';
                count = getNextRACNumber(inv);
                isBookable = true;
            } else if (bkStatus === 'WL') {
                status = 'WL';
                count = getNextWLNumber(inv);
                isBookable = true;
            } else {
                status = 'REGRET';
                isBookable = false;
            }
        }

        result.push({
            date: isoDate,
            label,
            status,
            count,
            fare: totalFare,
            isBookable,
            ...extraProps
        });
    }

    return res.status(200).json(result);
}

// =============================================================================
// FUNCTION: adminAddTrain — POST /api/trains/admin
// =============================================================================
// Inserts a new train record and immediately kicks off async demand enrichment.
// Protected by authenticateToken middleware in trainRoutes.js.
//
// WHY FIRE-AND-FORGET?
// ────────────────────
// The Gemini enrichment call can take 1–3 seconds (network round-trip).
// Blocking the HTTP response until it completes would give the admin a poor UX
// and ties up the Express worker thread unnecessarily.
// Instead we respond immediately with the inserted train row, then asynchronously
// update demand_tier in the background via setImmediate.
// =============================================================================

const { enrichTrainDemandTier } = require('../utils/demandEnrichment');

function adminAddTrain(req, res) {
    const {
        id, name, from_station_code, to_station_code,
        departure_time, arrival_time, duration_mins, distance_km,
        runs_mon = 0, runs_tue = 0, runs_wed = 0, runs_thu = 0,
        runs_fri = 0, runs_sat = 0, runs_sun = 0,
    } = req.body;

    // Basic validation.
    if (!id || !name || !from_station_code || !to_station_code) {
        return res.status(400).json({ error: 'id, name, from_station_code, to_station_code are required' });
    }
    if (isNaN(parseInt(id, 10))) {
        return res.status(400).json({ error: 'id must be a numeric train number' });
    }

    const trainId = parseInt(id, 10);

    // Check for duplicates.
    const existing = db.prepare('SELECT id FROM trains WHERE id = ?').get(trainId);
    if (existing) {
        return res.status(409).json({ error: `Train ${trainId} already exists` });
    }

    // Insert the new train.
    db.prepare(`
        INSERT INTO trains
            (id, name, from_station_code, to_station_code,
             runs_mon, runs_tue, runs_wed, runs_thu, runs_fri, runs_sat, runs_sun,
             departure_time, arrival_time, duration_mins, distance_km)
        VALUES
            (?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?)
    `).run(
        trainId, name.trim(), from_station_code.trim().toUpperCase(), to_station_code.trim().toUpperCase(),
        runs_mon ? 1 : 0, runs_tue ? 1 : 0, runs_wed ? 1 : 0,
        runs_thu ? 1 : 0, runs_fri ? 1 : 0, runs_sat ? 1 : 0, runs_sun ? 1 : 0,
        departure_time || null, arrival_time || null,
        duration_mins  ? parseInt(duration_mins, 10)  : null,
        distance_km    ? parseInt(distance_km, 10)    : null
    );

    const inserted = db.prepare('SELECT * FROM trains WHERE id = ?').get(trainId);

    // Respond immediately — demand enrichment happens in the background.
    res.status(201).json({
        message:       'Train added successfully. Demand enrichment is running in the background.',
        train:         inserted,
        demandTierNote: 'demand_tier will be set asynchronously by Gemini. Check GET /api/trains/:id for the updated value.',
    });

    // Fire-and-forget: enrich demand tier without blocking the response.
    setImmediate(async () => {
        try {
            const tier = await enrichTrainDemandTier(inserted);
            if (tier) {
                console.log(`  ✔  Admin train ${trainId} (${name}) demand_tier classified as: ${tier}`);
            } else {
                console.log(`  ⚠  Admin train ${trainId} (${name}) enrichment skipped/failed — demand_tier stays NULL`);
            }
        } catch (err) {
            console.error(`  ✘  Admin train enrichment exception for ${trainId}:`, err.message);
        }
    });
}

module.exports = { searchTrains, getTrainDetails, searchStations, getStats, getAvailabilityGrid, adminAddTrain };
