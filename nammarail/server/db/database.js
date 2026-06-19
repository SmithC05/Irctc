// =============================================================================
// NammaRail — Shared Database Connection
// =============================================================================
//
// WHY A SINGLE SHARED CONNECTION?
// ────────────────────────────────
// SQLite is a file-based database — it is not a server process like PostgreSQL
// or MySQL. Opening multiple connections to the same file from the same Node.js
// process causes:
//   1. "SQLITE_BUSY" locking errors when two writes happen simultaneously.
//   2. Wasted overhead opening/closing the file on every request.
//
// The solution: open the database ONCE when the server starts, then export
// that single `db` instance.  Every route file does:
//   const db = require('./db/database');
// ...and they all share the same connection — no conflicts, no wasted I/O.
//
// better-sqlite3 is also synchronous, so one connection is safe; it processes
// one statement at a time internally.
// =============================================================================

'use strict';

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

// Resolve absolute paths so this module works regardless of the working
// directory from which Node was launched.
const DB_PATH     = path.join(__dirname, '..', '..', 'nammarail.db');
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'db', 'schema.sql');

/**
 * Checks whether a column exists in a table using PRAGMA table_info().
 * SQLite returns one row per column; we look for the target column name.
 *
 * @param {Object} db        - better-sqlite3 instance
 * @param {string} table     - table name
 * @param {string} column    - column name to check for
 * @returns {boolean}
 */
function columnExists(db, table, column) {
    const info = db.pragma(`table_info(${table})`);
    return info.some(col => col.name === column);
}

/**
 * Runs additive schema migrations on every startup.
 * Each migration is safe to run multiple times (idempotent).
 *
 * WHY NOT USE A MIGRATION FRAMEWORK?
 * ─────────────────────────────────────────────────────────────────────────────
 * NammaRail intentionally has no external migration library dependency.
 * For a project of this size, a simple columnExists() check + ALTER TABLE
 * is explicit, readable, and has zero extra dependencies.
 *
 * @param {Object} db - better-sqlite3 instance
 */
function runAdditiveMigrations(db) {
    // Migration M001: Add curr_avl_filled to seat_inventory
    // Introduced with the CURR_AVL / Chart Preparation system.
    if (!columnExists(db, 'seat_inventory', 'curr_avl_filled')) {
        db.exec(`
            ALTER TABLE seat_inventory
            ADD COLUMN curr_avl_filled INTEGER NOT NULL DEFAULT 0;
        `);
        console.log('  ✔  Migration M001: seat_inventory.curr_avl_filled added');
    }

    if (!columnExists(db, 'bookings', 'pnr_number')) {
        db.exec(`
            ALTER TABLE bookings
            ADD COLUMN pnr_number TEXT;
        `);
        console.log('  ✔  Migration M002: bookings.pnr_number added');
    }

    // Migration M003: Expand bookings.booking_type CHECK to include 'curr_avl'.
    // SQLite does not support ALTER TABLE ... ALTER COLUMN or modifying constraints
    // in place. The only safe approach is the 12-step table-rebuild pattern:
    //   1. Create new table with corrected constraint.
    //   2. Copy all existing rows.
    //   3. Drop old table.
    //   4. Rename new table.
    //
    // Guard: check whether any 'curr_avl' row already exists. If one can be
    // inserted without error, the constraint is already correct (fresh DB from
    // updated schema.sql) and we skip. We detect old constraint by reading
    // sqlite_master for the table DDL containing the old CHECK text.
    const bookingsDDL = db.prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='bookings'`
    ).get();
    const needsM003 = bookingsDDL && bookingsDDL.sql.includes(`'normal', 'tatkal'`)
                   && !bookingsDDL.sql.includes(`'curr_avl'`);

    if (needsM003) {
        db.exec(`
            PRAGMA foreign_keys = OFF;

            CREATE TABLE bookings_new (
                id                TEXT PRIMARY KEY,
                user_id           TEXT    NOT NULL REFERENCES users(id),
                train_id          INTEGER NOT NULL REFERENCES trains(id),
                from_station_code TEXT    NOT NULL,
                to_station_code   TEXT    NOT NULL,
                journey_date      TEXT    NOT NULL,
                class_code        TEXT    NOT NULL,
                booking_type      TEXT    NOT NULL DEFAULT 'normal'
                                  CHECK(booking_type IN ('normal', 'tatkal', 'curr_avl')),
                status            TEXT    NOT NULL DEFAULT 'CNF'
                                  CHECK(status IN ('CNF', 'RAC', 'WL', 'CANCELLED_WL')),
                wl_number         INTEGER DEFAULT NULL,
                rac_number        INTEGER DEFAULT NULL,
                seat_number       TEXT    DEFAULT NULL,
                passenger_name    TEXT    NOT NULL,
                passenger_age     INTEGER NOT NULL,
                passenger_gender  TEXT    NOT NULL CHECK(passenger_gender IN ('M', 'F', 'O')),
                total_fare        INTEGER NOT NULL,
                booked_at         TEXT    DEFAULT (datetime('now')),
                cancelled_at      TEXT    DEFAULT NULL,
                refund_amount     INTEGER DEFAULT NULL,
                pnr_number        TEXT
            );

            INSERT INTO bookings_new
                SELECT id, user_id, train_id, from_station_code, to_station_code,
                       journey_date, class_code, booking_type, status,
                       wl_number, rac_number, seat_number,
                       passenger_name, passenger_age, passenger_gender,
                       total_fare, booked_at, cancelled_at, refund_amount,
                       pnr_number
                FROM bookings;

            DROP TABLE bookings;
            ALTER TABLE bookings_new RENAME TO bookings;

            CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
            CREATE INDEX IF NOT EXISTS idx_bookings_train_date ON bookings(train_id, journey_date);

            PRAGMA foreign_keys = ON;
        `);
        console.log('  ✔  Migration M003: bookings.booking_type CHECK expanded to include curr_avl');
    }

    // The train_charts table is created by schema.sql via CREATE TABLE IF NOT EXISTS,
    // so no explicit migration needed here — just a log confirmation.
    const chartTable = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='train_charts'`
    ).get();
    if (chartTable) {
        console.log('  ✔  train_charts table: present');
    }
}

/**
 * Opens the SQLite database, enforces foreign keys, and initialises the schema.
 *
 * Called once at module load time — the result is cached by Node's require()
 * system so subsequent require('./db/database') calls return the same object.
 */
function initDatabase() {
    // Open (or create) the database file at DB_PATH.
    const db = new Database(DB_PATH);

    // SQLite does NOT enforce foreign key constraints unless you tell it to,
    // for every connection, every time.  This must be the very first PRAGMA.
    db.pragma('foreign_keys = ON');

    // Run the schema file to create tables if they don't already exist.
    // CREATE TABLE IF NOT EXISTS makes this idempotent — safe to run on startup
    // even when the database has already been populated by import.js.
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schemaSql);

    // ── Additive Migrations ────────────────────────────────────────────────────
    // SQLite does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN.
    // We use PRAGMA table_info() to check whether a column already exists before
    // adding it. This keeps startup idempotent — safe to run on every server boot,
    // even on a database that was already migrated.
    runAdditiveMigrations(db);

    console.log(`✔  DB connection open: ${DB_PATH}`);
    return db;
}

// Export the single shared instance.
// Node.js caches require() results, so this object is created exactly once.
module.exports = initDatabase();
