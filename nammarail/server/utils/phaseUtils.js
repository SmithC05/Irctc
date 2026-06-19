// =============================================================================
// NammaRail — Train Phase Utilities
// =============================================================================
//
// THE PHASE STATE MACHINE (from the Agent Constitution):
// ──────────────────────────────────────────────────────
//
//  BOOKING_UNAVAILABLE → ARP_OPEN → TATKAL_OPEN → CHART_PENDING
//                                                → CHART_PREPARED → DEPARTED
//
// Every train on every date is in exactly ONE phase at any moment.
// The phase is DERIVED in real-time — never stored in the database.
//
// Inputs:  journeyDate (YYYY-MM-DD), departureTime (HH:MM), chartStatus
// Outputs: phase string, Tatkal window status, time deltas
//
// WHY PURE FUNCTIONS?
// ─────────────────────────────────────────────────────────────────────────────
// Phase logic is called from multiple places:
//   • trainController (search + detail responses)
//   • bookingController (gate validation before seat allocation)
//   • chartScheduler (to decide whether to trigger chart prep)
//
// Making it stateless / side-effect-free means it can be unit-tested without
// a DB connection, and reused in any context without fear of hidden side effects.
// =============================================================================

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

// ARP = Advance Reservation Period. Indian Railways allows booking 60 days ahead.
const ARP_DAYS = 60;

// Chart is prepared 4 hours before departure.
const CHART_PREP_HOURS_BEFORE = 4;

// Tatkal opening times in IST (hours, 24h format).
// AC classes (1A, 2A, 3A, CC): open at 10:00 AM.
// Sleeper classes (SL, 2S):    open at 11:00 AM.
const TATKAL_AC_HOUR   = 10;
const TATKAL_SL_HOUR   = 11;
const TATKAL_MINUTE    = 0;

// IST offset from UTC = +5:30 = 330 minutes.
const IST_OFFSET_MINUTES = 330;

// AC class codes that use the 10:00 Tatkal window.
const AC_CLASS_CODES = new Set(['1A', '2A', '3A', 'CC']);
// Sleeper class codes that use the 11:00 Tatkal window.
const SL_CLASS_CODES = new Set(['SL', '2S']);

// Phase name constants — exported so callers don't use magic strings.
const PHASES = {
  BOOKING_UNAVAILABLE: 'BOOKING_UNAVAILABLE',
  ARP_OPEN:            'ARP_OPEN',
  TATKAL_OPEN:         'TATKAL_OPEN',
  CHART_PENDING:       'CHART_PENDING',
  CHART_PREPARED:      'CHART_PREPARED',
  DEPARTED:            'DEPARTED',
};

// ─── IST helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the current time as a Date object in IST (UTC+5:30).
 * JavaScript's Date is always stored as UTC internally; we shift by 330 minutes
 * to get a Date whose getHours()/getMinutes() etc. reflect IST values.
 *
 * Note: This is a "fake local time" trick — the Date object is still UTC
 * underneath, but its component methods will return IST values.
 */
function nowIST() {
    const utc  = Date.now();
    const ist  = new Date(utc + IST_OFFSET_MINUTES * 60 * 1000);
    return ist;
}

/**
 * Given a YYYY-MM-DD date string and HH:MM time string, returns a Date object
 * representing that moment in IST as a UTC timestamp.
 *
 * Example: date="2026-06-15", time="22:30"
 *   → IST 22:30 = UTC 17:00 → returns Date(UTC 2026-06-15T17:00:00Z)
 *
 * @param {string} dateStr  - "YYYY-MM-DD"
 * @param {string} timeStr  - "HH:MM" (24h)
 * @returns {Date}
 */
function toISTDate(dateStr, timeStr = '00:00') {
    const [y, mo, d]   = dateStr.split('-').map(Number);
    const [hr, mi = 0] = timeStr.split(':').map(Number);

    // Build IST moment: interpret date+time as IST, then convert to UTC.
    // IST = UTC + 330m → UTC = IST - 330m
    const istMs = Date.UTC(y, mo - 1, d, hr, mi) - IST_OFFSET_MINUTES * 60 * 1000;
    return new Date(istMs);
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Determines the current operational phase of a train on a given journey date.
 *
 * @param {string} journeyDate    - "YYYY-MM-DD"
 * @param {string} departureTime  - "HH:MM" (24h, IST)
 * @param {string} chartStatus    - "PENDING" | "PREPARED"
 * @returns {string} One of the PHASES constants
 */
function getTrainPhase(journeyDate, departureTime, chartStatus = 'PENDING') {
    const now           = nowIST();
    const departure     = toISTDate(journeyDate, departureTime);
    const msUntilDep    = departure - now;
    const hoursUntilDep = msUntilDep / (1000 * 60 * 60);

    // ── DEPARTED ──────────────────────────────────────────────────────────────
    // Train has already left — no booking possible.
    if (hoursUntilDep <= 0) return PHASES.DEPARTED;

    // ── CHART_PREPARED ────────────────────────────────────────────────────────
    // Chart was explicitly set to PREPARED (by the scheduler or admin trigger).
    if (chartStatus === 'PREPARED') return PHASES.CHART_PREPARED;

    // ── CHART_PENDING ─────────────────────────────────────────────────────────
    // Chart not yet prepared but departure is within 4 hours.
    // Bookings still allowed (no Tatkal), but scheduler should prepare chart soon.
    if (hoursUntilDep <= CHART_PREP_HOURS_BEFORE) return PHASES.CHART_PENDING;

    // ── ARP check: is journey date within the 60-day window? ──────────────────
    const arpMaxDate = toISTDate(journeyDate, '00:00');
    const today      = nowIST();
    // Days until journey (compare date parts only, not times)
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    // Compute the journey date in local-ish IST components
    const jd   = new Date(toISTDate(journeyDate, '00:00'));
    const jDay = new Date(jd.getUTCFullYear(), jd.getUTCMonth(), jd.getUTCDate());
    const daysUntil = Math.floor((jDay - todayMidnight) / (1000 * 60 * 60 * 24));

    if (daysUntil > ARP_DAYS) return PHASES.BOOKING_UNAVAILABLE;

    // ── TATKAL_OPEN ───────────────────────────────────────────────────────────
    // Tatkal opens the day BEFORE the journey:
    //   AC classes at 10:00 IST
    //   SL classes  at 11:00 IST
    // If today IS the day before and current IST time >= either opening time,
    // the phase is TATKAL_OPEN.
    if (daysUntil === 1) {
        const acOpening = new Date(today.getFullYear(), today.getMonth(), today.getDate(), TATKAL_AC_HOUR, TATKAL_MINUTE);
        const nowHHMM   = today.getHours() * 60 + today.getMinutes();
        const acHHMM    = TATKAL_AC_HOUR  * 60 + TATKAL_MINUTE;
        const slHHMM    = TATKAL_SL_HOUR  * 60 + TATKAL_MINUTE;

        if (nowHHMM >= acHHMM || nowHHMM >= slHHMM) {
            return PHASES.TATKAL_OPEN;
        }
    }

    // ── ARP_OPEN ──────────────────────────────────────────────────────────────
    // Normal booking window is open.
    return PHASES.ARP_OPEN;
}

/**
 * Returns the Tatkal window status for a given class code and journey date.
 * Used to tell the client exactly when Tatkal opens and whether it's open now.
 *
 * @param {string} classCode    - "SL", "3A", "2A", "1A", "CC", "2S"
 * @param {string} journeyDate  - "YYYY-MM-DD"
 * @returns {{
 *   isOpen:     boolean,   // Can Tatkal be booked right now?
 *   openHour:   number,    // 10 (AC) or 11 (SL)
 *   opensOnDate: string,   // The date Tatkal opens (day before journey)
 *   opensAt:    string,    // "10:00" or "11:00"
 *   minsUntilOpen: number  // Minutes until opening (0 if already open or wrong day)
 * }}
 */
function getTatkalWindowStatus(classCode, journeyDate) {
    const isAC      = AC_CLASS_CODES.has(classCode);
    const openHour  = isAC ? TATKAL_AC_HOUR : TATKAL_SL_HOUR;
    const opensAt   = `${String(openHour).padStart(2, '0')}:00`;

    // Day before journey date
    const jd        = toISTDate(journeyDate, '00:00');
    const dayBefore = new Date(jd.getTime() - 24 * 60 * 60 * 1000);
    // Format as YYYY-MM-DD using UTC (since toISTDate produces UTC midnight for IST midnight)
    const opensOnDate = dayBefore.toISOString().split('T')[0];

    const now       = nowIST();
    const today     = nowIST();
    const todayDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    const isOpensDay = todayDate === opensOnDate;
    const nowMins    = today.getHours() * 60 + today.getMinutes();
    const openMins   = openHour * 60 + TATKAL_MINUTE;

    const isOpen = isOpensDay && nowMins >= openMins;

    let minsUntilOpen = 0;
    if (isOpensDay && !isOpen) {
        minsUntilOpen = openMins - nowMins;
    }

    return { isOpen, openHour, opensOnDate, opensAt, minsUntilOpen };
}

/**
 * Returns the departure Date for a train (in IST, as a UTC timestamp).
 * Utility used by the scheduler.
 *
 * @param {string} journeyDate
 * @param {string} departureTime
 * @returns {Date}
 */
function getDepartureDate(journeyDate, departureTime) {
    return toISTDate(journeyDate, departureTime);
}

/**
 * Returns hours remaining until departure (negative if departed).
 *
 * @param {string} journeyDate
 * @param {string} departureTime
 * @returns {number}
 */
function hoursUntilDeparture(journeyDate, departureTime) {
    const dep = toISTDate(journeyDate, departureTime);
    return (dep - Date.now()) / (1000 * 60 * 60);
}

/**
 * Builds the full phase context object that goes into every API response.
 * This is the canonical shape defined in the Agent Constitution's API Contract.
 *
 * @param {string} journeyDate
 * @param {string} departureTime
 * @param {string} chartStatus      - "PENDING" | "PREPARED"
 * @param {number} currAvlCount     - Seats available via CURR_AVL (post-chart)
 * @returns {Object} trainPhaseContext
 */
function buildPhaseContext(journeyDate, departureTime, chartStatus = 'PENDING', currAvlCount = 0) {
    const phase       = getTrainPhase(journeyDate, departureTime, chartStatus);
    const acTatkal    = getTatkalWindowStatus('3A', journeyDate);   // representative AC class
    const slTatkal    = getTatkalWindowStatus('SL', journeyDate);   // representative SL class

    return {
        trainPhase: phase,
        tatkalStatus: {
            acOpen:       acTatkal.isOpen,
            slOpen:       slTatkal.isOpen,
            acOpensAt:    acTatkal.opensAt,
            slOpensAt:    slTatkal.opensAt,
            opensOnDate:  acTatkal.opensOnDate,  // same day for both (day before journey)
            acMinsUntilOpen: acTatkal.minsUntilOpen,
            slMinsUntilOpen: slTatkal.minsUntilOpen,
        },
        chartStatus,
        currAvlCount,
    };
}

module.exports = {
    PHASES,
    getTrainPhase,
    getTatkalWindowStatus,
    getDepartureDate,
    hoursUntilDeparture,
    buildPhaseContext,
    // Export constants for use in validators
    AC_CLASS_CODES,
    SL_CLASS_CODES,
    CHART_PREP_HOURS_BEFORE,
};
