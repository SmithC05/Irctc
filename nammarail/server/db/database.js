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
 * Opens the SQLite database, enforces foreign keys, and initialises the schema.
 *
 * Called once at module load time — the result is cached by Node's require()
 * system so subsequent require('./db/database') calls return the same object.
 */
function initDatabase() {
    // Open (or create) the database file at DB_PATH.
    // The { verbose } option logs every SQL statement to the console in dev —
    // remove it or gate it behind NODE_ENV === 'development' for production.
    const db = new Database(DB_PATH);

    // SQLite does NOT enforce foreign key constraints unless you tell it to,
    // for every connection, every time.  This must be the very first PRAGMA.
    db.pragma('foreign_keys = ON');

    // Run the schema file to create tables if they don't already exist.
    // CREATE TABLE IF NOT EXISTS makes this idempotent — safe to run on startup
    // even when the database has already been populated by import.js.
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schemaSql);

    console.log(`✔  DB connection open: ${DB_PATH}`);
    return db;
}

// Export the single shared instance.
// Node.js caches require() results, so this object is created exactly once.
module.exports = initDatabase();
