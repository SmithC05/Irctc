-- =============================================================================
-- NammaRail — SQLite Database Schema
-- =============================================================================
-- Run this file to initialize the database tables.
-- Execute via: node -e "require('better-sqlite3')('./nammarail.db').exec(require('fs').readFileSync('./db/schema.sql','utf8'))"
-- Or call it programmatically from your app's DB initialiser.
-- =============================================================================

-- Enable foreign key enforcement in SQLite.
-- IMPORTANT: SQLite does NOT enforce foreign keys by default.
-- You must run this PRAGMA once per connection in your application code too.
PRAGMA foreign_keys = ON;


-- =============================================================================
-- TABLE 1: trains
-- Stores the master list of trains fetched from schedules.csv.
-- The `id` is the actual Indian Railway train number (e.g. 12673), not an
-- auto-generated surrogate key, so lookups by train number are direct.
-- =============================================================================
CREATE TABLE IF NOT EXISTS trains (
    id               INTEGER PRIMARY KEY,   -- Real train number (e.g. 12673, 22691)
    name             TEXT    NOT NULL,       -- Human-readable train name (e.g. "CHERAN EXPRESS")
    from_station_code TEXT   NOT NULL,       -- Origin station code (e.g. "MAS")
    to_station_code  TEXT    NOT NULL,       -- Destination station code (e.g. "CBE")

    -- Days of operation — stored as 1 (runs) or 0 (does not run).
    -- Using INTEGER instead of BOOLEAN because SQLite has no native BOOLEAN type.
    runs_mon         INTEGER NOT NULL DEFAULT 0,
    runs_tue         INTEGER NOT NULL DEFAULT 0,
    runs_wed         INTEGER NOT NULL DEFAULT 0,
    runs_thu         INTEGER NOT NULL DEFAULT 0,
    runs_fri         INTEGER NOT NULL DEFAULT 0,
    runs_sat         INTEGER NOT NULL DEFAULT 0,
    runs_sun         INTEGER NOT NULL DEFAULT 0,

    -- Times extracted from the stationList JSON in schedules.csv.
    -- departure_time = first station's departureTime field.
    -- arrival_time   = last station's arrivalTime field.
    -- Stored as TEXT in "HH:MM" format (24-hour).
    departure_time   TEXT,
    arrival_time     TEXT,

    -- Computed from departure_time and arrival_time during import.
    -- Accounts for overnight journeys (arrival next day or later).
    duration_mins    INTEGER,

    -- Total route distance in km, taken from the last station's `distance` field
    -- in the stationList JSON array.
    distance_km      INTEGER
);


-- =============================================================================
-- TABLE 2: stations
-- Stores every intermediate stop for every train.
-- One row per station per train — so a train with 20 stops = 20 rows here.
-- =============================================================================
CREATE TABLE IF NOT EXISTS stations (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Foreign key: links this stop to a train in the trains table.
    -- A FOREIGN KEY means the value in train_id MUST exist as an `id` in trains.
    -- This prevents orphan records (stops without a parent train).
    train_id             INTEGER NOT NULL REFERENCES trains(id) ON DELETE CASCADE,

    station_code         TEXT    NOT NULL,   -- Short code (e.g. "SA", "ED", "CBE")
    station_name         TEXT    NOT NULL,   -- Full name (e.g. "SALEM JN")
    arrival_time         TEXT,               -- "--" for origin, HH:MM for others
    departure_time       TEXT,               -- HH:MM; "--" for terminus
    day_count            INTEGER NOT NULL DEFAULT 1,  -- Journey day this stop falls on (1, 2, …)
    distance_from_origin INTEGER NOT NULL DEFAULT 0,  -- KM from the train's origin station
    stop_number          INTEGER NOT NULL             -- stnSerialNumber from source data (1-based)
);

-- Index to speed up queries like "give me all stops for train 12673".
CREATE INDEX IF NOT EXISTS idx_stations_train_id ON stations(train_id);


-- =============================================================================
-- TABLE 3: fares
-- Stores pricing information for each train / segment / class combination.
-- One row = one (train, from, to, class) combination.
-- =============================================================================
CREATE TABLE IF NOT EXISTS fares (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Foreign key: must match a valid train id in the trains table.
    train_id            INTEGER NOT NULL REFERENCES trains(id) ON DELETE CASCADE,

    from_station_code   TEXT    NOT NULL,   -- Boarding station for this fare
    to_station_code     TEXT    NOT NULL,   -- Alighting station for this fare

    -- Class codes follow Indian Railways conventions:
    -- 1A = First AC, 2A = Second AC, 3A = Third AC, SL = Sleeper,
    -- CC = Chair Car, 2S = Second Sitting, EC = Executive Chair Car
    class_code          TEXT    NOT NULL,

    -- All monetary values stored in INTEGER (paise or whole rupees — be consistent).
    -- Using INTEGER avoids floating-point rounding issues with currency.
    base_fare           INTEGER,
    reservation_charge  INTEGER,
    superfast_charge    INTEGER,
    tatkal_fare         INTEGER,
    service_tax         INTEGER,
    total_fare          INTEGER,

    distance_km         INTEGER,    -- Distance for this segment in km
    duration_mins       INTEGER     -- Duration for this segment in minutes
);

-- Composite index: the most common fare lookup is (train + from + to + class).
CREATE INDEX IF NOT EXISTS idx_fares_lookup
    ON fares(train_id, from_station_code, to_station_code, class_code);


-- =============================================================================
-- TABLE 4: users
-- Stores registered passenger accounts.
-- We use UUID strings for id instead of auto-increment integers to avoid
-- exposing sequential IDs to clients (security best practice).
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,           -- UUID v4 string (generated in app layer)
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,       -- Unique constraint prevents duplicate accounts
    password_hash TEXT NOT NULL,              -- bcrypt/argon2 hash — NEVER store plaintext
    created_at    TEXT DEFAULT (datetime('now'))  -- ISO-8601 timestamp, UTC
);


-- =============================================================================
-- TABLE 5: bookings
-- One row per passenger per booking.
-- If a booking covers 3 passengers, there will be 3 rows sharing the same
-- journey details but each with a unique id and passenger-specific fields.
-- =============================================================================
CREATE TABLE IF NOT EXISTS bookings (
    id                TEXT PRIMARY KEY,       -- UUID v4 (generated in app layer)

    -- Foreign keys ensure referential integrity across the system.
    user_id           TEXT    NOT NULL REFERENCES users(id),
    train_id          INTEGER NOT NULL REFERENCES trains(id),

    from_station_code TEXT    NOT NULL,
    to_station_code   TEXT    NOT NULL,
    journey_date      TEXT    NOT NULL,       -- Format: YYYY-MM-DD
    class_code        TEXT    NOT NULL,

    -- booking_type distinguishes regular quota, surge-priced tatkal, and post-chart
    -- current availability (curr_avl) bookings.
    booking_type      TEXT    NOT NULL DEFAULT 'normal'
                              CHECK(booking_type IN ('normal', 'tatkal', 'curr_avl')),

    -- Confirmation status mirrors Indian Railways conventions:
    -- CNF = Confirmed, RAC = Reservation Against Cancellation, WL = Waitlisted
    -- CANCELLED_WL = auto-cancelled at chart preparation time (full refund issued)
    status            TEXT    NOT NULL DEFAULT 'CNF'
                              CHECK(status IN ('CNF', 'RAC', 'WL', 'CANCELLED_WL')),

    -- Position numbers; NULL when not applicable.
    wl_number         INTEGER DEFAULT NULL,   -- Waitlist queue position (e.g. WL/3)
    rac_number        INTEGER DEFAULT NULL,   -- RAC position (e.g. RAC 12)
    seat_number       TEXT    DEFAULT NULL,   -- e.g. "S4-42" — assigned on confirmation

    -- Passenger-specific details (one row per passenger).
    passenger_name    TEXT    NOT NULL,
    passenger_age     INTEGER NOT NULL,
    passenger_gender  TEXT    NOT NULL CHECK(passenger_gender IN ('M', 'F', 'O')),

    total_fare        INTEGER NOT NULL,       -- Total charged for this passenger's ticket

    -- Audit timestamps (all UTC).
    booked_at         TEXT    DEFAULT (datetime('now')),
    cancelled_at      TEXT    DEFAULT NULL,   -- Set when passenger cancels
    refund_amount     INTEGER DEFAULT NULL    -- Calculated refund on cancellation
);

-- Index to quickly fetch all bookings for a given user.
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);

-- Index for train + date queries (e.g. "how many booked on this train today?").
CREATE INDEX IF NOT EXISTS idx_bookings_train_date ON bookings(train_id, journey_date);


-- =============================================================================
-- TABLE 6: seat_inventory
-- Tracks real-time seat availability per train, per date, per class.
-- This is the source of truth for CNF / RAC / WL allocation logic.
--
-- Capacity rules encoded here:
--   RAC total  = FLOOR(total_seats / 4)
--   WL total   = 60 (fixed max per IRCTC convention)
--   Tatkal quota = FLOOR(total_seats * 0.20)
-- =============================================================================
CREATE TABLE IF NOT EXISTS seat_inventory (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Foreign key to trains; no ON DELETE CASCADE here intentionally —
    -- we want to preserve historical inventory records even if a train entry changes.
    train_id         INTEGER NOT NULL REFERENCES trains(id),
    journey_date     TEXT    NOT NULL,    -- YYYY-MM-DD
    class_code       TEXT    NOT NULL,

    -- Seat counts — all INTEGER, default 0.
    total_seats      INTEGER NOT NULL,
    confirmed_seats  INTEGER NOT NULL DEFAULT 0,

    rac_total        INTEGER NOT NULL,    -- Max RAC berths = FLOOR(total_seats / 4)
    rac_filled       INTEGER NOT NULL DEFAULT 0,

    wl_total         INTEGER NOT NULL DEFAULT 60,   -- Max waitlist entries allowed
    wl_filled        INTEGER NOT NULL DEFAULT 0,

    tatkal_seats     INTEGER NOT NULL,    -- Tatkal quota = FLOOR(total_seats * 0.20)
    tatkal_filled    INTEGER NOT NULL DEFAULT 0,

    -- CURR_AVL: seats that became vacant after chart preparation.
    -- Set by chartUtils.prepareChart(); incremented by each CURR_AVL booking.
    -- 0 until chart is PREPARED.
    curr_avl_filled  INTEGER NOT NULL DEFAULT 0,

    -- Prevents duplicate inventory records for the same train+date+class.
    -- The booking logic should UPDATE this row, not INSERT a new one.
    UNIQUE(train_id, journey_date, class_code)
);


-- =============================================================================
-- TABLE 7: train_charts
-- Tracks chart preparation state per train, per date, per class.
--
-- Created by: chartUtils.prepareChart() (called by chartScheduler).
-- One row per (train, date, class) after chart is prepared.
--
-- chart_status:
--   'PENDING'  → chart not yet prepared (default assumed if no row exists)
--   'PREPARED' → chart prepared, WL cancelled, CURR_AVL computed
--
-- curr_avl_count: number of vacant seats available via CURR_AVL booking
--   after chart preparation. Decrements logically (tracked via curr_avl_filled
--   in seat_inventory, not here).
-- =============================================================================
CREATE TABLE IF NOT EXISTS train_charts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,

    train_id          INTEGER NOT NULL REFERENCES trains(id),
    journey_date      TEXT    NOT NULL,    -- YYYY-MM-DD
    class_code        TEXT    NOT NULL,

    chart_status      TEXT    NOT NULL DEFAULT 'PENDING'
                              CHECK(chart_status IN ('PENDING', 'PREPARED')),

    -- Timestamp when the chart was prepared (IST stored as UTC).
    chart_prepared_at TEXT    DEFAULT NULL,

    -- Number of seats available via CURR_AVL after chart prep.
    -- = total_seats - confirmed_seats - ceil(rac_filled/2) at time of preparation.
    curr_avl_count    INTEGER NOT NULL DEFAULT 0,

    -- Ensures we never have two chart records for the same train+date+class.
    UNIQUE(train_id, journey_date, class_code)
);

-- Index for fast scheduler queries: "find all PENDING charts for today/tomorrow"
CREATE INDEX IF NOT EXISTS idx_charts_date_status
    ON train_charts(journey_date, chart_status);
