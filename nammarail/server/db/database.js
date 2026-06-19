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
