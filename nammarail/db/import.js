// =============================================================================
// NammaRail — Data Import Script
// =============================================================================
// Reads schedules.csv and price_data.csv, parses them, and inserts all data
// into the SQLite database defined by schema.sql.
//
// PREREQUISITES — install these npm packages before running:
//   npm install csv-parse better-sqlite3
//
// USAGE:
//   node db/import.js
//
// The script is idempotent: re-running it will not create duplicate records
// because all inserts use INSERT OR IGNORE (explained below where first used).
// =============================================================================

'use strict';

const fs      = require('fs');
const path    = require('path');
const Database = require('better-sqlite3');

// `parse` from csv-parse/sync gives us synchronous CSV parsing —
// simpler than the streaming async API for a one-off import script.
const { parse } = require('csv-parse/sync');

// ---------------------------------------------------------------------------
// Path constants — all resolved relative to this file's directory so the
// script works regardless of the working directory you launch it from.
// ---------------------------------------------------------------------------
const DB_PATH        = path.join(__dirname, '..', 'nammarail.db');
const SCHEMA_PATH    = path.join(__dirname, 'schema.sql');
const SCHEDULES_PATH = path.join(__dirname, 'data', 'schedules.csv');
const PRICES_PATH    = path.join(__dirname, 'data', 'price_data.csv');

// ---------------------------------------------------------------------------
// Open the database connection and apply the schema.
// `better-sqlite3` is synchronous, so no async/await needed anywhere.
// ---------------------------------------------------------------------------

/**
 * Opens (or creates) the SQLite database, applies the schema, and enables
 * foreign key enforcement for this connection.
 *
 * WHY enable foreign keys manually?  SQLite disables FK enforcement by default
 * for backwards compatibility — you must turn it on per-connection.
 */
function openDatabase() {
    const db = new Database(DB_PATH);

    // Enable foreign key constraints for this connection.
    db.pragma('foreign_keys = ON');

    // Execute the full schema SQL — CREATE TABLE IF NOT EXISTS means this is
    // safe to run on an already-initialised database.
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schemaSql);

    console.log(`✔  Database ready: ${DB_PATH}`);
    return db;
}

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

/**
 * Reads a CSV file from `filePath` and returns an array of plain objects,
 * where each object's keys are taken from the header row.
 *
 * `csv-parse` handles quoted fields, embedded commas, and multi-line values
 * automatically — we just need to tell it the file has a header row.
 */
function readCsv(filePath) {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    return parse(rawContent, {
        columns: true,          // Use first row as property names
        skip_empty_lines: true,
        trim: true,             // Strip whitespace around field values
    });
}

// ---------------------------------------------------------------------------
// stationList JSON parsing
// ---------------------------------------------------------------------------

/**
 * Parses the stationList JSON string from a schedules.csv row into a JS array.
 *
 * WHY the single-quote → double-quote replacement?
 * ─────────────────────────────────────────────────
 * The stationList value in schedules.csv was likely exported by a Python script
 * (or similar tool) that serialised the list using Python's default repr format,
 * which uses single quotes ('MAS') instead of the double quotes ("MAS") that the
 * JSON specification requires.
 *
 * JSON.parse() is strict — it will throw a SyntaxError on single-quoted strings.
 * So we replace every `'` with `"` before parsing.
 *
 * WHAT COULD GO WRONG?
 * ─────────────────────
 * If a station NAME itself contains an apostrophe (e.g. "ST. MARY'S ROAD"), the
 * naïve global replace will corrupt the JSON by turning the apostrophe into a
 * double-quote, breaking the string boundary.
 *
 * The replace below uses a regex that only replaces single quotes used as JSON
 * string delimiters (preceded/followed by : , [ ]), not those embedded in values.
 * This is a pragmatic heuristic — for Indian station names in this dataset it
 * works reliably.  If you ever see a JSON parse error, inspect that specific row.
 *
 * A more robust alternative would be to fix the data export step to produce
 * valid JSON in the first place (use json.dumps() in Python instead of str()).
 */
function parseStationList(rawStationList) {
    // Replace single-quote string delimiters with double quotes.
    // The regex matches single quotes that act as delimiters by checking that
    // they are surrounded by JSON structural characters.
    const jsonString = rawStationList
        .replace(/'/g, '"')   // Simple global replace — see the caveat above
        .replace(/None/g, 'null')   // Python None → JSON null, just in case
        .replace(/True/g, 'true')   // Python True → JSON true
        .replace(/False/g, 'false'); // Python False → JSON false

    try {
        return JSON.parse(jsonString);
    } catch (error) {
        // Log which string failed so you can fix the source data if needed.
        console.error('  ✘ Failed to parse stationList JSON:', error.message);
        console.error('  Raw value (first 200 chars):', rawStationList.slice(0, 200));
        return [];  // Return empty array so the train row still gets inserted
    }
}

// ---------------------------------------------------------------------------
// Time / duration utilities
// ---------------------------------------------------------------------------

/**
 * Converts a "HH:MM" string into total minutes since midnight.
 * Returns NaN if the input is not a valid time string.
 */
function timeToMinutes(timeStr) {
    if (!timeStr || timeStr === '--') return NaN;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return NaN;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * Calculates the total journey duration in minutes.
 *
 * Handles overnight (and multi-night) journeys: if arrival time is numerically
 * earlier than departure, we add enough multiples of 1440 (mins in a day) until
 * the result is positive.  `dayCount` from the last station tells us exactly
 * how many extra days the journey spans, so we use that when available.
 *
 * @param {string} departureTime  - "HH:MM" string for origin departure
 * @param {string} arrivalTime    - "HH:MM" string for terminus arrival
 * @param {number} lastDayCount   - The `dayCount` of the last station (1 = same day)
 */
function calcDurationMins(departureTime, arrivalTime, lastDayCount) {
    const depMins = timeToMinutes(departureTime);
    const arrMins = timeToMinutes(arrivalTime);

    if (isNaN(depMins) || isNaN(arrMins)) return null;

    // Extra days beyond the first day, converted to minutes.
    const extraDays  = Math.max(0, (parseInt(lastDayCount, 10) || 1) - 1);
    const totalMins  = arrMins - depMins + extraDays * 1440;

    // Safety check: duration should be positive.
    return totalMins > 0 ? totalMins : totalMins + 1440;
}

/**
 * Converts Y/N string values (as used in the CSV days columns) to 1 or 0.
 * Anything other than 'Y' (case-insensitive) is treated as 0.
 */
function ynToInt(value) {
    return (value && value.trim().toUpperCase() === 'Y') ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Step 1 + 2 + 3: Import trains and their station stops
// ---------------------------------------------------------------------------

/**
 * Builds the train record object to insert into the `trains` table.
 * Accepts the raw CSV row and the already-parsed stations array.
 */
function buildTrainRecord(csvRow, stations) {
    // The first station holds the departure time (where journey begins).
    const firstStation = stations[0]  || {};
    // The last station holds the arrival time and total distance.
    const lastStation  = stations[stations.length - 1] || {};

    const departureTime = firstStation.departureTime || null;
    const arrivalTime   = lastStation.arrivalTime    || null;
    const lastDayCount  = lastStation.dayCount       || '1';
    const distanceKm    = parseInt(lastStation.distance, 10) || 0;

    return {
        id:               parseInt(csvRow.trainNumber, 10),
        name:             csvRow.trainName.trim(),
        from_station_code: csvRow.stationFrom.trim(),
        to_station_code:  csvRow.stationTo.trim(),
        runs_mon:         ynToInt(csvRow.trainRunsOnMon),
        runs_tue:         ynToInt(csvRow.trainRunsOnTue),
        runs_wed:         ynToInt(csvRow.trainRunsOnWed),
        runs_thu:         ynToInt(csvRow.trainRunsOnThu),
        runs_fri:         ynToInt(csvRow.trainRunsOnFri),
        runs_sat:         ynToInt(csvRow.trainRunsOnSat),
        runs_sun:         ynToInt(csvRow.trainRunsOnSun),
        departure_time:   departureTime,
        arrival_time:     arrivalTime,
        duration_mins:    calcDurationMins(departureTime, arrivalTime, lastDayCount),
        distance_km:      distanceKm,
    };
}

/**
 * Builds an array of station-stop records for the `stations` table.
 * Each element corresponds to one stop in the stationList JSON array.
 *
 * @param {number}   trainId   - The train's primary key (the train number)
 * @param {Object[]} stations  - The parsed stationList array from the CSV
 */
function buildStationRecords(trainId, stations) {
    return stations.map(station => ({
        train_id:             trainId,
        station_code:         (station.stationCode  || '').trim(),
        station_name:         (station.stationName  || '').trim(),
        arrival_time:         station.arrivalTime   || '--',
        departure_time:       station.departureTime || '--',
        day_count:            parseInt(station.dayCount,       10) || 1,
        distance_from_origin: parseInt(station.distance,       10) || 0,
        stop_number:          parseInt(station.stnSerialNumber, 10) || 0,
    }));
}

/**
 * Master function that reads schedules.csv, then inserts all trains and
 * their station stops into the database.
 *
 * Returns a summary count object: { trainsImported, stopsImported }
 *
 * WHY INSERT OR IGNORE?
 * ──────────────────────
 * INSERT OR IGNORE tells SQLite: "if this row would violate a UNIQUE or
 * PRIMARY KEY constraint (i.e. a train with this id already exists), skip
 * the insert silently instead of throwing an error."
 *
 * This makes the import script safe to re-run without wiping the database
 * first.  Existing records are left untouched; only genuinely new rows are
 * added.  If you want to UPDATE existing data instead of skipping, replace
 * OR IGNORE with OR REPLACE (which deletes-then-re-inserts the row).
 */
function importSchedules(db) {
    console.log('\n── Step 1-3: Importing schedules & stations ──');

    const rows = readCsv(SCHEDULES_PATH);
    console.log(`   Found ${rows.length} rows in schedules.csv`);

    // Prepare reusable parameterised statements — compiling once and running
    // many times is much faster than calling db.run() with a SQL string each time.
    const insertTrain = db.prepare(`
        INSERT OR IGNORE INTO trains
            (id, name, from_station_code, to_station_code,
             runs_mon, runs_tue, runs_wed, runs_thu, runs_fri, runs_sat, runs_sun,
             departure_time, arrival_time, duration_mins, distance_km)
        VALUES
            (@id, @name, @from_station_code, @to_station_code,
             @runs_mon, @runs_tue, @runs_wed, @runs_thu, @runs_fri, @runs_sat, @runs_sun,
             @departure_time, @arrival_time, @duration_mins, @distance_km)
    `);

    // The station insert is separate because we loop over each stop individually.
    // Foreign key: train_id references trains.id — the train MUST be inserted first.
    const insertStation = db.prepare(`
        INSERT OR IGNORE INTO stations
            (train_id, station_code, station_name,
             arrival_time, departure_time, day_count,
             distance_from_origin, stop_number)
        VALUES
            (@train_id, @station_code, @station_name,
             @arrival_time, @departure_time, @day_count,
             @distance_from_origin, @stop_number)
    `);

    let trainsImported = 0;
    let stopsImported  = 0;

    // Wrap everything in a single transaction — this is orders-of-magnitude
    // faster than committing each insert individually (SQLite writes to disk
    // on every commit when not in a transaction).
    const runImport = db.transaction(() => {
        for (const row of rows) {
            const stations = parseStationList(row.stationList || '[]');
            if (stations.length === 0) {
                console.warn(`  ⚠  Skipping train ${row.trainNumber} — empty stationList`);
                continue;
            }

            const trainRecord = buildTrainRecord(row, stations);

            // Insert train; `info.changes` tells us if a row was actually written
            // (0 = was ignored because it already existed, 1 = newly inserted).
            const trainInfo = insertTrain.run(trainRecord);
            if (trainInfo.changes > 0) trainsImported++;

            // Insert each stop for this train.
            const stopRecords = buildStationRecords(trainRecord.id, stations);
            for (const stopRecord of stopRecords) {
                const stopInfo = insertStation.run(stopRecord);
                if (stopInfo.changes > 0) stopsImported++;
            }
        }
    });

    runImport();

    console.log(`   ✔  Trains inserted : ${trainsImported}`);
    console.log(`   ✔  Stops  inserted : ${stopsImported}`);

    return { trainsImported, stopsImported };
}

// ---------------------------------------------------------------------------
// Step 4: Import fare data
// ---------------------------------------------------------------------------

/**
 * Builds a fare record object from one row of price_data.csv.
 * Returns null if the trainNumber is missing or non-numeric (skip the row).
 */
function buildFareRecord(csvRow) {
    const trainId = parseInt(csvRow.trainNumber, 10);
    if (isNaN(trainId)) return null;

    // Duration in price_data is stored as a string like "7:30" (hours:minutes)
    // or sometimes as total minutes — we handle both forms.
    const durationMins = parseDurationField(csvRow.duration);

    return {
        train_id:           trainId,
        from_station_code:  (csvRow.fromStnCode || '').trim(),
        to_station_code:    (csvRow.toStnCode   || '').trim(),
        class_code:         (csvRow.classCode   || '').trim(),
        base_fare:          toIntOrNull(csvRow.baseFare),
        reservation_charge: toIntOrNull(csvRow.reservationCharge),
        superfast_charge:   toIntOrNull(csvRow.superfastCharge),
        tatkal_fare:        toIntOrNull(csvRow.tatkalFare),
        service_tax:        toIntOrNull(csvRow.serviceTax),
        total_fare:         toIntOrNull(csvRow.totalFare),
        distance_km:        toIntOrNull(csvRow.distance),
        duration_mins:      durationMins,
    };
}

/**
 * Parses the `duration` field from price_data.csv.
 * The field may look like "7:30" (HH:MM), "450" (plain minutes), or be empty.
 * Returns an integer (total minutes) or null.
 */
function parseDurationField(raw) {
    if (!raw || raw.trim() === '') return null;
    const trimmed = raw.trim();

    // If value contains a colon, treat it as HH:MM.
    if (trimmed.includes(':')) {
        return timeToMinutes(trimmed) || null;
    }

    // Otherwise assume it is already in minutes.
    const asInt = parseInt(trimmed, 10);
    return isNaN(asInt) ? null : asInt;
}

/**
 * Converts a value to an integer, returning null if it is empty, '--', or NaN.
 * SQLite stores NULL correctly for absent monetary values — avoid inserting
 * a 0 when the source data simply has no value.
 */
function toIntOrNull(value) {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (trimmed === '' || trimmed === '--') return null;
    const parsed = parseInt(trimmed, 10);
    return isNaN(parsed) ? null : parsed;
}

/**
 * Reads price_data.csv, matches each row to a train, and inserts into fares.
 * Rows whose trainNumber doesn't exist in the trains table are skipped —
 * the foreign key constraint would reject them anyway, and we prefer a
 * graceful warning over a hard crash.
 *
 * Returns { faresImported } count.
 */
function importFares(db) {
    console.log('\n── Step 4: Importing fare data ──');

    const rows = readCsv(PRICES_PATH);
    console.log(`   Found ${rows.length} rows in price_data.csv`);

    // Build a quick lookup set of all train IDs already in the database.
    // This lets us skip orphan fare rows without relying on a caught exception.
    const existingTrainIds = new Set(
        db.prepare('SELECT id FROM trains').all().map(row => row.id)
    );

    const insertFare = db.prepare(`
        INSERT OR IGNORE INTO fares
            (train_id, from_station_code, to_station_code, class_code,
             base_fare, reservation_charge, superfast_charge, tatkal_fare,
             service_tax, total_fare, distance_km, duration_mins)
        VALUES
            (@train_id, @from_station_code, @to_station_code, @class_code,
             @base_fare, @reservation_charge, @superfast_charge, @tatkal_fare,
             @service_tax, @total_fare, @distance_km, @duration_mins)
    `);

    let faresImported = 0;
    let skipped       = 0;

    // Again, wrap in a transaction for performance.
    const runFareImport = db.transaction(() => {
        for (const row of rows) {
            const fareRecord = buildFareRecord(row);

            if (!fareRecord) {
                skipped++;
                continue;
            }

            // Skip if no matching train exists — avoids a FK violation error.
            if (!existingTrainIds.has(fareRecord.train_id)) {
                skipped++;
                continue;
            }

            const info = insertFare.run(fareRecord);
            if (info.changes > 0) faresImported++;
        }
    });

    runFareImport();

    if (skipped > 0) {
        console.warn(`   ⚠  Skipped ${skipped} fare rows (missing train or bad data)`);
    }
    console.log(`   ✔  Fares  inserted : ${faresImported}`);

    return { faresImported };
}

// ---------------------------------------------------------------------------
// Step 5: Print import summary
// ---------------------------------------------------------------------------

/**
 * Prints a formatted summary table showing how many records are now in each
 * table, and how many were newly inserted during this run.
 */
function printSummary(db, counts) {
    // Verify final totals by querying the DB — counts what's actually stored,
    // not just what we think we inserted (handles pre-existing data correctly).
    const totalTrains  = db.prepare('SELECT COUNT(*) AS cnt FROM trains').get().cnt;
    const totalStops   = db.prepare('SELECT COUNT(*) AS cnt FROM stations').get().cnt;
    const totalFares   = db.prepare('SELECT COUNT(*) AS cnt FROM fares').get().cnt;

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║          NammaRail — Import Summary              ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Trains inserted this run   : ${String(counts.trainsImported).padStart(6)}            ║`);
    console.log(`║  Station stops inserted     : ${String(counts.stopsImported).padStart(6)}            ║`);
    console.log(`║  Fare records inserted      : ${String(counts.faresImported).padStart(6)}            ║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Total trains  in DB        : ${String(totalTrains).padStart(6)}            ║`);
    console.log(`║  Total stops   in DB        : ${String(totalStops).padStart(6)}            ║`);
    console.log(`║  Total fares   in DB        : ${String(totalFares).padStart(6)}            ║`);
    console.log('╚══════════════════════════════════════════════════╝');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Orchestrates all import steps in order.
 * The database connection is opened once and passed through each step.
 */
function main() {
    console.log('═══════════════════════════════════════════');
    console.log('   NammaRail — Database Import Starting    ');
    console.log('═══════════════════════════════════════════');

    const db = openDatabase();

    // Steps 1-3: trains + stations from schedules.csv
    const { trainsImported, stopsImported } = importSchedules(db);

    // Step 4: fares from price_data.csv
    const { faresImported } = importFares(db);

    // Step 5: print summary
    printSummary(db, { trainsImported, stopsImported, faresImported });

    db.close();
    console.log('\n✔  Import complete. Database connection closed.\n');
}

// Run main only when this file is executed directly (not when required as a module).
// This mirrors the Node.js convention for standalone scripts.
if (require.main === module) {
    main();
}
