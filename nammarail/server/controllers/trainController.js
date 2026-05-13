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

    if (existing) return existing;

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

    // Fetch and return the freshly-inserted row.
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
function buildAvailabilityShape(inv) {
    return {
        CNF: {
            available:  inv.total_seats - inv.confirmed_seats,
            totalSeats: inv.total_seats,
        },
        RAC: {
            available:    inv.rac_total - inv.rac_filled,
            totalCapacity: inv.rac_total,
        },
        WL: {
            current:    inv.wl_filled,
            maxAllowed: inv.wl_total,
        },
        tatkal: {
            available: inv.tatkal_seats - inv.tatkal_filled,
        },
    };
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
// HELPER: buildTrainResult
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Combines a raw trains row, inventory data, and fare data into the final
 * response object for one train.  Extracted into its own function to keep
 * searchTrains under 25 lines.
 *
 * @param {Object} train       - Row from trains table
 * @param {string} journeyDate - YYYY-MM-DD
 * @param {string|null} classCode - Requested class, or null for all
 * @param {string} dayName     - e.g. "Monday"
 * @returns {Object} Fully assembled train result object
 */
function buildTrainResult(train, journeyDate, classCode, dayName) {
    // Determine which classes to show: one specific class, or all available.
    const faresToShow = fetchFareForClass(
        train.id, train.from_station_code, train.to_station_code, classCode
    );

    // Normalise to always work with an array of fares.
    const faresArray = Array.isArray(faresToShow)
        ? faresToShow
        : (faresToShow ? [faresToShow] : []);

    // For each class that has a fare entry, ensure inventory exists and build
    // the availability shape.  This is the "lazy creation" in action.
    const availabilityByClass = {};
    for (const fare of faresArray) {
        const inv = createInventoryIfMissing(train.id, journeyDate, fare.class_code);
        availabilityByClass[fare.class_code] = buildAvailabilityShape(inv);
    }

    return {
        trainNumber:   train.id,
        trainName:     train.name,
        fromStation:   train.from_station_code,
        toStation:     train.to_station_code,
        departureTime: train.departure_time,
        arrivalTime:   train.arrival_time,
        durationMins:  train.duration_mins,
        distanceKm:    train.distance_km,
        dayOfWeek:     dayName,
        availability:  availabilityByClass,
        fares:         faresArray,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: searchTrains — GET /api/trains/search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches for trains between two stations on a given date.
 *
 * Required query params: from, to, date
 * Optional query param:  class (e.g. SL, 3A, 2A)
 *
 * Steps:
 *   1. Validate inputs
 *   2. Determine the day-of-week column for the requested date
 *   3. Query trains table with the appropriate runs_xxx column filter
 *   4. For each train, assemble availability + fare data
 *   5. Return the result array
 */
function searchTrains(req, res) {
    const { from, to, date, class: classCode } = req.query;

    // Step 1: Validate required station params.
    if (!from || !to) {
        return res.status(400).json({ error: 'from and to station codes are required' });
    }

    // Step 2: Validate the date using the shared dateUtils module.
    // This enforces the same rules as the booking engine:
    //   format check → past check → 60-day window check.
    const dateValidation = validateJourneyDate(date);
    if (!dateValidation.valid) {
        return res.status(400).json({ error: dateValidation.error });
    }

    // Step 3: Determine day of week from the validated date.
    const dayColumn = getDayColumn(date);   // e.g. 'runs_mon'
    const dayName   = getDayName(date);     // e.g. 'Monday'

    // Step 3: Fetch matching trains.
    // The dynamic column name (dayColumn) is safe here because it comes from
    // our own constant array — not from user input — so it cannot cause injection.
    const trains = db.prepare(`
        SELECT *
        FROM   trains
        WHERE  from_station_code = ?
          AND  to_station_code   = ?
          AND  ${dayColumn}      = 1
        ORDER BY departure_time
    `).all(from.toUpperCase(), to.toUpperCase());

    if (trains.length === 0) {
        return res.status(200).json({
            message: `No trains found from ${from} to ${to} on ${dayName}`,
            trains:  [],
        });
    }

    // Step 4: Assemble the full result for each train.
    const results = trains.map(train =>
        buildTrainResult(train, date, classCode || null, dayName)
    );

    return res.status(200).json({
        from:    from.toUpperCase(),
        to:      to.toUpperCase(),
        date,
        dayOfWeek: dayName,
        count:   results.length,
        trains:  results,
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
            const inv = createInventoryIfMissing(trainNumber, journeyDate, fare.class_code);
            availabilityByClass[fare.class_code] = buildAvailabilityShape(inv);
        }
    }

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
    });
}

module.exports = { searchTrains, getTrainDetails };
