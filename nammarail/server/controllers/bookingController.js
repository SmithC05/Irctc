// =============================================================================
// NammaRail — Booking Controller
// =============================================================================
// Handles all booking-related API operations.
// All routes in this controller REQUIRE authentication (JWT token).
//
// Functions:
//   createBooking   → POST /api/bookings
//   getMyBookings   → GET  /api/bookings/my
//   getBookingById  → GET  /api/bookings/:id
// =============================================================================

'use strict';

const { v4: uuidv4 }           = require('uuid');
const db                       = require('../db/database');
const { validateJourneyDate }  = require('../utils/dateUtils');
const {
    getBookingStatus,
    getNextWLNumber,
    getNextRACNumber,
    assignSeatNumber,
} = require('../utils/seatUtils');

// Valid values — used for input validation before touching the database.
const VALID_CLASSES       = ['1A', '2A', '3A', 'SL', 'CC', '2S'];
const VALID_BOOKING_TYPES = ['normal', 'tatkal'];
const VALID_GENDERS       = ['M', 'F', 'O'];
const MAX_PASSENGERS      = 6;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: getOrCreateInventory
// ─────────────────────────────────────────────────────────────────────────────

// Seat capacity defaults mirror those in trainController.js.
// We keep them here too so bookingController has no dependency on trainController.
const SEAT_DEFAULTS = {
    '1A': { total_seats: 18,  rac_total: 4,  tatkal_seats: 4  },
    '2A': { total_seats: 46,  rac_total: 11, tatkal_seats: 9  },
    '3A': { total_seats: 64,  rac_total: 16, tatkal_seats: 13 },
    'SL': { total_seats: 72,  rac_total: 18, tatkal_seats: 14 },
    'CC': { total_seats: 78,  rac_total: 0,  tatkal_seats: 16 },
    '2S': { total_seats: 100, rac_total: 0,  tatkal_seats: 20 },
};

/**
 * Fetches the seat_inventory row for (trainId, date, class).
 * Creates it with defaults if it doesn't exist yet (lazy creation).
 * MUST be called INSIDE a transaction when used during booking.
 */
function getOrCreateInventory(trainId, journeyDate, classCode) {
    const existing = db.prepare(`
        SELECT * FROM seat_inventory
        WHERE train_id = ? AND journey_date = ? AND class_code = ?
    `).get(trainId, journeyDate, classCode);

    if (existing) return existing;

    const defaults = SEAT_DEFAULTS[classCode] || { total_seats: 50, rac_total: 12, tatkal_seats: 10 };

    db.prepare(`
        INSERT OR IGNORE INTO seat_inventory
            (train_id, journey_date, class_code, total_seats, rac_total, tatkal_seats, wl_total)
        VALUES (?, ?, ?, ?, ?, ?, 60)
    `).run(trainId, journeyDate, classCode,
           defaults.total_seats, defaults.rac_total, defaults.tatkal_seats);

    return db.prepare(`
        SELECT * FROM seat_inventory
        WHERE train_id = ? AND journey_date = ? AND class_code = ?
    `).get(trainId, journeyDate, classCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: validateBookingBody
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates all fields in the booking request body.
 * Returns a human-readable error string, or null if everything is valid.
 * All checks happen before the transaction opens — cheaper to fail fast.
 */
function validateBookingBody(body) {
    const { trainNumber, fromStation, toStation, journeyDate,
            classCode, bookingType, passengers } = body;

    if (!trainNumber || !fromStation || !toStation || !journeyDate || !classCode || !bookingType) {
        return 'trainNumber, fromStation, toStation, journeyDate, classCode, and bookingType are all required';
    }

    const dateCheck = validateJourneyDate(journeyDate);
    if (!dateCheck.valid) return dateCheck.error;

    if (!VALID_CLASSES.includes(classCode)) {
        return `classCode must be one of: ${VALID_CLASSES.join(', ')}`;
    }
    if (!VALID_BOOKING_TYPES.includes(bookingType)) {
        return 'bookingType must be "normal" or "tatkal"';
    }
    if (!Array.isArray(passengers) || passengers.length === 0) {
        return 'passengers must be a non-empty array';
    }
    if (passengers.length > MAX_PASSENGERS) {
        return `Maximum ${MAX_PASSENGERS} passengers per booking`;
    }
    return validatePassengerList(passengers);
}

/**
 * Validates each passenger object in the array.
 * Returns error string on first failure, or null if all are valid.
 */
function validatePassengerList(passengers) {
    for (let idx = 0; idx < passengers.length; idx++) {
        const pax = passengers[idx];
        const label = `Passenger ${idx + 1}`;

        if (!pax.name || typeof pax.name !== 'string' || pax.name.trim() === '') {
            return `${label}: name is required`;
        }
        const age = parseInt(pax.age, 10);
        if (isNaN(age) || age < 1 || age > 125) {
            return `${label}: age must be between 1 and 125`;
        }
        if (!VALID_GENDERS.includes(pax.gender)) {
            return `${label}: gender must be M, F, or O`;
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: getFareRecord
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the fare row for this (train, from, to, class) combination.
 * Returns null if no fare is found — caller must handle this case.
 */
function getFareRecord(trainId, fromStation, toStation, classCode) {
    return db.prepare(`
        SELECT total_fare, tatkal_fare, base_fare,
               reservation_charge, superfast_charge, service_tax
        FROM   fares
        WHERE  train_id          = ?
          AND  from_station_code = ?
          AND  to_station_code   = ?
          AND  class_code        = ?
    `).get(trainId, fromStation.toUpperCase(), toStation.toUpperCase(), classCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: updateInventoryAfterBooking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Increments the correct counter(s) in seat_inventory after a successful booking.
 * Must be called INSIDE a transaction.
 *
 * @param {number} trainId
 * @param {string} journeyDate
 * @param {string} classCode
 * @param {string} status       - "CNF", "RAC", or "WL"
 * @param {boolean} isTatkal    - Also increment tatkal_filled if true
 */
function updateInventoryAfterBooking(trainId, journeyDate, classCode, status, isTatkal) {
    // Build the SET clause dynamically based on booking outcome.
    const increments = [];

    if (status === 'CNF') increments.push('confirmed_seats = confirmed_seats + 1');
    if (status === 'RAC') increments.push('rac_filled = rac_filled + 1');
    if (status === 'WL')  increments.push('wl_filled = wl_filled + 1');
    if (isTatkal)         increments.push('tatkal_filled = tatkal_filled + 1');

    if (increments.length === 0) return;

    db.prepare(`
        UPDATE seat_inventory
        SET    ${increments.join(', ')}
        WHERE  train_id = ? AND journey_date = ? AND class_code = ?
    `).run(trainId, journeyDate, classCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: bookSinglePassenger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Books ONE passenger.  Called in a loop inside the transaction.
 * Reads fresh inventory each time (so the 2nd passenger sees the 1st's effect).
 * Returns the booking result object for this passenger.
 *
 * Throws an Error (with a `statusCode` property) on any failure —
 * the transaction wrapper will catch it and roll back.
 */
function bookSinglePassenger(params) {
    const { trainId, fromStation, toStation, journeyDate,
            classCode, bookingType, passenger, fareRecord, userId } = params;

    const isTatkal = bookingType === 'tatkal';

    // Read the LATEST inventory (may have changed if previous passengers
    // in this loop already took some seats).
    const inventory = getOrCreateInventory(trainId, journeyDate, classCode);

    // Decide this passenger's status.
    let status;
    if (isTatkal) {
        // Tatkal passengers get confirmed seats from the tatkal quota.
        const tatkalAvailable = inventory.tatkal_seats - inventory.tatkal_filled;
        if (tatkalAvailable <= 0) {
            const err = new Error('No Tatkal seats available');
            err.statusCode = 409;
            throw err;
        }
        status = 'CNF';   // Tatkal is always CNF (no RAC/WL for tatkal)
    } else {
        status = getBookingStatus(inventory);
    }

    if (status === 'REGRET') {
        const err = new Error('No seats available in any quota');
        err.statusCode = 409;
        throw err;
    }

    // Determine seat number and position numbers based on status.
    const racNumber  = status === 'RAC' ? getNextRACNumber(inventory) : null;
    const wlNumber   = status === 'WL'  ? getNextWLNumber(inventory)  : null;
    const seatNumber = assignSeatNumber(inventory, status, classCode, racNumber);

    // Calculate fare: tatkal adds the tatkal_fare surcharge on top.
    const baseFare    = fareRecord ? (fareRecord.total_fare || 0) : 0;
    const tatkalExtra = (isTatkal && fareRecord) ? (fareRecord.tatkal_fare || 0) : 0;
    const totalFare   = baseFare + tatkalExtra;

    // Generate a unique booking ID (UUID v4).
    const bookingId = uuidv4();

    // Insert the booking record.
    db.prepare(`
        INSERT INTO bookings
            (id, user_id, train_id, from_station_code, to_station_code,
             journey_date, class_code, booking_type, status,
             wl_number, rac_number, seat_number,
             passenger_name, passenger_age, passenger_gender, total_fare)
        VALUES
            (?, ?, ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?,
             ?, ?, ?, ?)
    `).run(
        bookingId, userId, trainId, fromStation.toUpperCase(), toStation.toUpperCase(),
        journeyDate, classCode, bookingType, status,
        wlNumber, racNumber, seatNumber,
        passenger.name.trim(), parseInt(passenger.age, 10), passenger.gender, totalFare
    );

    // Update the inventory counters to reflect this booking.
    updateInventoryAfterBooking(trainId, journeyDate, classCode, status, isTatkal);

    // Build the human-readable status string (e.g. "WL/3", "RAC 5", "CNF").
    let statusDisplay = status;
    if (status === 'WL')  statusDisplay = `WL/${wlNumber}`;
    if (status === 'RAC') statusDisplay = `RAC ${racNumber}`;

    return {
        bookingId,
        name:       passenger.name.trim(),
        age:        parseInt(passenger.age, 10),
        gender:     passenger.gender,
        status:     statusDisplay,
        seatNumber: seatNumber || 'To be assigned',
        fare:       totalFare,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: createBooking — POST /api/bookings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates one or more bookings (one per passenger) for a single journey.
 *
 * WHY USE A TRANSACTION?
 * ───────────────────────
 * A transaction means all DB operations succeed TOGETHER or fail TOGETHER.
 * Imagine booking 3 passengers: passenger 1 gets CNF, passenger 2 gets CNF,
 * then the server crashes before passenger 3 is saved.
 * Without a transaction: passengers 1 and 2 have tickets but inventory is
 * partially updated — the data is permanently inconsistent (corrupted).
 * With a transaction: the crash rolls back ALL changes; the passenger sees
 * an error, retries, and all 3 get booked cleanly.
 * This is called "atomicity" — the booking either fully happens or not at all.
 */
function createBooking(req, res) {
    const userId = req.user.userId;  // Attached by authenticateToken middleware
    const body   = req.body;

    // Validate all inputs before opening the transaction.
    const validationError = validateBookingBody(body);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { trainNumber, fromStation, toStation, journeyDate,
            classCode, bookingType, passengers } = body;

    const trainId = parseInt(trainNumber, 10);

    // Verify the train exists.
    const train = db.prepare('SELECT id, name FROM trains WHERE id = ?').get(trainId);
    if (!train) {
        return res.status(404).json({ error: `Train ${trainNumber} not found` });
    }

    // Fetch fare record once — the same fare applies to all passengers.
    const fareRecord = getFareRecord(trainId, fromStation, toStation, classCode);

    const passengerResults = [];
    let totalFare = 0;

    // Wrap all passenger bookings in a single atomic transaction.
    const runTransaction = db.transaction(() => {
        for (const passenger of passengers) {
            const result = bookSinglePassenger({
                trainId, fromStation, toStation, journeyDate,
                classCode, bookingType, passenger, fareRecord, userId,
            });
            passengerResults.push(result);
            totalFare += result.fare;
        }
    });

    try {
        runTransaction();
    } catch (err) {
        // bookSinglePassenger throws with a statusCode on business logic failures.
        const statusCode = err.statusCode || 500;
        return res.status(statusCode).json({ error: err.message });
    }

    return res.status(201).json({
        bookingIds:  passengerResults.map(p => p.bookingId),
        trainNumber: train.id,
        trainName:   train.name,
        journeyDate,
        fromStation: fromStation.toUpperCase(),
        toStation:   toStation.toUpperCase(),
        classCode,
        bookingType,
        passengers:  passengerResults,
        totalFare,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: getMyBookings — GET /api/bookings/my
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all bookings belonging to the currently logged-in user.
 * Groups results by journey (same train + date = one trip displayed together).
 *
 * We JOIN with trains to get the train name in one query instead of doing
 * a separate query for each booking (N+1 problem prevention).
 */
function getMyBookings(req, res) {
    const userId = req.user.userId;

    const bookings = db.prepare(`
        SELECT
            b.id            AS bookingId,
            b.train_id      AS trainNumber,
            t.name          AS trainName,
            b.from_station_code AS fromStation,
            b.to_station_code   AS toStation,
            b.journey_date,
            b.class_code,
            b.booking_type,
            b.status,
            b.wl_number,
            b.rac_number,
            b.seat_number,
            b.passenger_name,
            b.passenger_age,
            b.passenger_gender,
            b.total_fare,
            b.booked_at,
            b.cancelled_at
        FROM   bookings b
        JOIN   trains   t ON t.id = b.train_id
        WHERE  b.user_id = ?
        ORDER  BY b.booked_at DESC
    `).all(userId);

    // Group bookings by (trainNumber + journeyDate) so the client can display
    // all passengers of one trip as a single card, not separate entries.
    const grouped = {};
    for (const booking of bookings) {
        const key = `${booking.trainNumber}_${booking.journey_date}`;
        if (!grouped[key]) {
            grouped[key] = {
                trainNumber:  booking.trainNumber,
                trainName:    booking.trainName,
                fromStation:  booking.fromStation,
                toStation:    booking.toStation,
                journeyDate:  booking.journey_date,
                classCode:    booking.class_code,
                bookingType:  booking.booking_type,
                passengers:   [],
            };
        }
        grouped[key].passengers.push({
            bookingId:  booking.bookingId,
            name:       booking.passenger_name,
            age:        booking.passenger_age,
            gender:     booking.passenger_gender,
            status:     booking.status,
            wlNumber:   booking.wl_number,
            racNumber:  booking.rac_number,
            seatNumber: booking.seat_number,
            fare:       booking.total_fare,
            bookedAt:   booking.booked_at,
            cancelledAt: booking.cancelled_at,
        });
    }

    return res.status(200).json({
        count: Object.keys(grouped).length,
        trips: Object.values(grouped),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: getBookingById — GET /api/bookings/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns full details for a single booking record.
 *
 * WHY CHECK BOOKING OWNERSHIP?
 * ─────────────────────────────
 * Every booking has a UUID as its ID.  A logged-in user could guess or share
 * another user's booking ID (e.g. copy it from a URL) and try to fetch it.
 * Without an ownership check, User A could read User B's booking — seeing
 * their name, age, journey details.  This is a data privacy violation (and
 * potentially a regulatory one under India's DPDP Act).
 *
 * The fix: always filter by BOTH booking id AND the requesting user's id.
 * If the booking exists but belongs to someone else, we return 403 Forbidden —
 * we don't even confirm that the booking ID exists, to prevent enumeration.
 */
function getBookingById(req, res) {
    const bookingId = req.params.id;
    const userId    = req.user.userId;

    // Fetch the booking — include train name via JOIN.
    const booking = db.prepare(`
        SELECT
            b.*,
            t.name AS train_name,
            t.departure_time,
            t.arrival_time
        FROM   bookings b
        JOIN   trains   t ON t.id = b.train_id
        WHERE  b.id = ?
    `).get(bookingId);

    // If the booking doesn't exist at all, return 404.
    if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
    }

    // If the booking exists but belongs to a different user, return 403.
    // We return the SAME error message as 404 — not confirming whether the
    // booking ID exists prevents an attacker from enumerating valid IDs.
    if (booking.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    // Build the human-readable status string.
    let statusDisplay = booking.status;
    if (booking.status === 'WL' && booking.wl_number) {
        statusDisplay = `WL/${booking.wl_number}`;
    }
    if (booking.status === 'RAC' && booking.rac_number) {
        statusDisplay = `RAC ${booking.rac_number}`;
    }

    return res.status(200).json({
        bookingId:      booking.id,
        trainNumber:    booking.train_id,
        trainName:      booking.train_name,
        fromStation:    booking.from_station_code,
        toStation:      booking.to_station_code,
        journeyDate:    booking.journey_date,
        classCode:      booking.class_code,
        bookingType:    booking.booking_type,
        status:         statusDisplay,
        seatNumber:     booking.seat_number,
        passengerName:  booking.passenger_name,
        passengerAge:   booking.passenger_age,
        passengerGender: booking.passenger_gender,
        totalFare:      booking.total_fare,
        bookedAt:       booking.booked_at,
        cancelledAt:    booking.cancelled_at,
        refundAmount:   booking.refund_amount,
    });
}

module.exports = { createBooking, getMyBookings, getBookingById };
