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
const { generatePNR }          = require('../utils/pnrGenerator');
const db                       = require('../db/database');
const { validateJourneyDate }  = require('../utils/dateUtils');
const {
    getBookingStatus,
    getNextWLNumber,
    getNextRACNumber,
    assignSeatNumber,
} = require('../utils/seatUtils');
const {
    getTatkalWindowStatus,
    getTrainPhase,
    buildPhaseContext,
    PHASES,
    AC_CLASS_CODES,
} = require('../utils/phaseUtils');
const { getChartStatus, getCurrAvlRemaining } = require('../utils/chartUtils');

// Valid values — used for input validation before touching the database.
const VALID_CLASSES       = ['1A', '2A', '3A', 'SL', 'CC', '2S'];
const VALID_BOOKING_TYPES = ['normal', 'tatkal', 'curr_avl'];
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
        return 'bookingType must be "normal", "tatkal", or "curr_avl"';
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

/**
 * Atomically increments the correct counter(s) in seat_inventory after a booking.
 * Must be called INSIDE a transaction.
 *
 * Each counter is incremented in a SINGLE UPDATE that includes a capacity guard
 * in its WHERE clause.  This closes the TOCTOU window: if two concurrent
 * requests both pass the earlier JS availability check, only one will win here —
 * the other will see result.changes === 0 and must be rejected.
 *
 * @returns {{ ok: boolean, failedCounter: string|null }}
 *   ok = true  → all counters incremented successfully.
 *   ok = false → a concurrent booking took the last seat; failedCounter names which.
 */
function updateInventoryAfterBooking(trainId, journeyDate, classCode, status, isTatkal) {
    // ── Step 1: Increment the status-based counter with a capacity guard ──────
    if (status === 'CNF' && !isTatkal) {
        // Normal CNF: must not exceed (total_seats - tatkal_seats)
        const result = db.prepare(`
            UPDATE seat_inventory
               SET confirmed_seats = confirmed_seats + 1
             WHERE train_id = ? AND journey_date = ? AND class_code = ?
               AND confirmed_seats < (total_seats - tatkal_seats)
        `).run(trainId, journeyDate, classCode);

        if (result.changes === 0) {
            return { ok: false, failedCounter: 'confirmed_seats' };
        }
    }

    if (status === 'RAC') {
        // RAC: must not exceed rac_total * 2 (2 passengers per RAC berth)
        const result = db.prepare(`
            UPDATE seat_inventory
               SET rac_filled = rac_filled + 1
             WHERE train_id = ? AND journey_date = ? AND class_code = ?
               AND rac_filled < (rac_total * 2)
        `).run(trainId, journeyDate, classCode);

        if (result.changes === 0) {
            return { ok: false, failedCounter: 'rac_filled' };
        }
    }

    if (status === 'WL') {
        // WL: must not exceed wl_total (hard cap, default 60)
        const result = db.prepare(`
            UPDATE seat_inventory
               SET wl_filled = wl_filled + 1
             WHERE train_id = ? AND journey_date = ? AND class_code = ?
               AND wl_filled < wl_total
        `).run(trainId, journeyDate, classCode);

        if (result.changes === 0) {
            return { ok: false, failedCounter: 'wl_filled' };
        }
    }

    // ── Step 2: Increment tatkal_filled with its own capacity guard ───────────
    if (isTatkal) {
        // Tatkal CNF: must not exceed tatkal_seats
        const result = db.prepare(`
            UPDATE seat_inventory
               SET tatkal_filled = tatkal_filled + 1
             WHERE train_id = ? AND journey_date = ? AND class_code = ?
               AND tatkal_filled < tatkal_seats
        `).run(trainId, journeyDate, classCode);

        if (result.changes === 0) {
            return { ok: false, failedCounter: 'tatkal_filled' };
        }
    }

    return { ok: true, failedCounter: null };
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
            classCode, bookingType, passenger, fareRecord, userId, pnrNumber } = params;

    const isTatkal  = bookingType === 'tatkal';
    const isCurrAvl = bookingType === 'curr_avl';

    // Read the LATEST inventory (may have changed if previous passengers
    // in this loop already took some seats).
    const inventory = getOrCreateInventory(trainId, journeyDate, classCode);

    // ── CURR_AVL booking path ─────────────────────────────────────────────────
    // After chart preparation, bypass normal allocation and book directly
    // from the pool of vacant seats.
    if (isCurrAvl) {
        const remaining = getCurrAvlRemaining(db, trainId, journeyDate, classCode);
        if (remaining <= 0) {
            const err = new Error('No Current Availability (CURR_AVL) seats remaining');
            err.statusCode = 409;
            err.code = 'CURR_AVL_EXHAUSTED';
            throw err;
        }

        const baseFare  = fareRecord ? (fareRecord.total_fare || 0) : 0;
        const bookingId = uuidv4();

        // CURR_AVL is always CNF — instant confirmation per the World Rules.
        db.prepare(`
            INSERT INTO bookings
                (id, user_id, train_id, from_station_code, to_station_code,
                 journey_date, class_code, booking_type, status,
                 passenger_name, passenger_age, passenger_gender, total_fare, pnr_number)
            VALUES
                (?, ?, ?, ?, ?,
                 ?, ?, 'curr_avl', 'CNF',
                 ?, ?, ?, ?, ?)
        `).run(
            bookingId, userId, trainId,
            fromStation.toUpperCase(), toStation.toUpperCase(),
            journeyDate, classCode,
            passenger.name.trim(), parseInt(passenger.age, 10), passenger.gender, baseFare, pnrNumber
        );

        // Increment curr_avl_filled in seat_inventory.
        db.prepare(`
            UPDATE seat_inventory
               SET curr_avl_filled = curr_avl_filled + 1
             WHERE train_id = ? AND journey_date = ? AND class_code = ?
        `).run(trainId, journeyDate, classCode);

        return {
            bookingId,
            name:       passenger.name.trim(),
            age:        parseInt(passenger.age, 10),
            gender:     passenger.gender,
            status:     'CNF',
            seatNumber: 'To be assigned',
            fare:       baseFare,
        };
    }

    // ── Normal / Tatkal booking path ──────────────────────────────────────────
    let status;
    if (isTatkal) {
        // Tatkal passengers get confirmed seats from the tatkal quota.
        const tatkalAvailable = inventory.tatkal_seats - inventory.tatkal_filled;
        if (tatkalAvailable <= 0) {
            const err = new Error('No Tatkal seats available — quota exhausted');
            err.statusCode = 409;
            err.code = 'TATKAL_CLOSED';
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
             passenger_name, passenger_age, passenger_gender, total_fare, pnr_number)
        VALUES
            (?, ?, ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?,
             ?, ?, ?, ?, ?)
    `).run(
        bookingId, userId, trainId, fromStation.toUpperCase(), toStation.toUpperCase(),
        journeyDate, classCode, bookingType, status,
        wlNumber, racNumber, seatNumber,
        passenger.name.trim(), parseInt(passenger.age, 10), passenger.gender, totalFare, pnrNumber
    );

    // Update the inventory counters. The function uses atomic conditional UPDATEs
    // (each guarded by a capacity WHERE clause) to close the TOCTOU window.
    // If a concurrent request already took the last seat between our earlier read
    // and this UPDATE, result.ok will be false — throw so the transaction rolls back.
    const invUpdate = updateInventoryAfterBooking(trainId, journeyDate, classCode, status, isTatkal);
    if (!invUpdate.ok) {
        const err = invUpdate.failedCounter === 'tatkal_filled'
            ? new Error('No Tatkal seats available — quota exhausted (concurrent booking)')
            : new Error('No seats available — taken by a concurrent booking');
        err.statusCode = 409;
        err.code = invUpdate.failedCounter === 'tatkal_filled' ? 'TATKAL_CLOSED' : 'SEATS_EXHAUSTED';
        throw err;
    }


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
        pnrNumber,
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

    // Verify the train exists and fetch departure time for phase checking.
    const train = db.prepare('SELECT id, name, departure_time FROM trains WHERE id = ?').get(trainId);
    if (!train) {
        return res.status(404).json({ error: `Train ${trainNumber} not found` });
    }

    // ── RAILWAY GATE 1: ARP + Phase Check ────────────────────────────────────
    // Read current chart status from DB (null = PENDING if no row exists).
    const chartRow    = getChartStatus(db, trainId, journeyDate, classCode);
    const chartStatus = chartRow?.chartStatus ?? 'PENDING';
    const phase       = getTrainPhase(journeyDate, train.departure_time, chartStatus);

    // Booking unavailable — too far in advance or train has departed.
    if (phase === PHASES.BOOKING_UNAVAILABLE) {
        return res.status(409).json({
            error:  'Booking unavailable: journey date is beyond the 60-day ARP window',
            code:   'ARP_NOT_OPEN',
            phase,
        });
    }
    if (phase === PHASES.DEPARTED) {
        return res.status(409).json({
            error:  'Booking unavailable: train has already departed',
            code:   'TRAIN_DEPARTED',
            phase,
        });
    }

    // ── RAILWAY GATE 2: Chart Gate ────────────────────────────────────────────
    // After chart preparation, only CURR_AVL bookings are allowed.
    if (chartStatus === 'PREPARED' && bookingType !== 'curr_avl') {
        const currAvlLeft = getCurrAvlRemaining(db, trainId, journeyDate, classCode);
        return res.status(409).json({
            error:       'Chart has been prepared. Only Current Availability (CURR_AVL) bookings are now accepted.',
            code:        'CHART_PREPARED',
            phase:       PHASES.CHART_PREPARED,
            currAvlLeft,
        });
    }
    if (bookingType === 'curr_avl' && chartStatus !== 'PREPARED') {
        return res.status(409).json({
            error: 'CURR_AVL booking is only available after chart preparation',
            code:  'CHART_NOT_PREPARED',
            phase,
        });
    }

    // ── RAILWAY GATE 3: Tatkal Time-Gate ──────────────────────────────────────
    // Tatkal opens the day BEFORE the journey:
    //   AC classes (1A, 2A, 3A, CC) at 10:00 IST
    //   SL classes (SL, 2S)         at 11:00 IST
    if (bookingType === 'tatkal') {
        const tatkal = getTatkalWindowStatus(classCode, journeyDate);
        if (!tatkal.isOpen) {
            return res.status(409).json({
                error:          `Tatkal booking for ${classCode} opens on ${tatkal.opensOnDate} at ${tatkal.opensAt} IST`,
                code:           'TATKAL_NOT_OPEN',
                opensOnDate:    tatkal.opensOnDate,
                opensAt:        tatkal.opensAt,
                minsUntilOpen:  tatkal.minsUntilOpen,
                phase,
            });
        }
    }

    // ── All gates passed — proceed to seat allocation ──────────────────────────
    const fareRecord = getFareRecord(trainId, fromStation, toStation, classCode);

    const passengerResults = [];
    let totalFare = 0;
    
    // Generate one PNR for the whole transaction
    const pnrNumber = generatePNR("22", journeyDate);

    // Wrap all passenger bookings in a single atomic transaction.
    const runTransaction = db.transaction(() => {
        for (const passenger of passengers) {
            const result = bookSinglePassenger({
                trainId, fromStation, toStation, journeyDate,
                classCode, bookingType, passenger, fareRecord, userId, pnrNumber,
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
        return res.status(statusCode).json({ error: err.message, code: err.code });
    }

    return res.status(201).json({
        bookingIds:  passengerResults.map(p => p.bookingId),
        pnrNumber:   pnrNumber,
        trainNumber: train.id,
        trainName:   train.name,
        journeyDate,
        fromStation: fromStation.toUpperCase(),
        toStation:   toStation.toUpperCase(),
        classCode,
        bookingType,
        passengers:  passengerResults,
        totalFare,
        phase,
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
            b.pnr_number,
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
                pnrNumber:    booking.pnr_number,
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
            pnrNumber:  booking.pnr_number,
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
        pnrNumber:      booking.pnr_number,
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

module.exports = { createBooking, getMyBookings, getBookingById, bookSinglePassenger, getFareRecord };
