// =============================================================================
// NammaRail — Date Utility Functions
// =============================================================================
// Pure helper functions for date validation.
// "Pure" means: no database calls, no side effects — just string/math logic.
// This makes them trivially testable and reusable across any controller.
// =============================================================================

'use strict';

// How many days in advance a passenger can book a ticket.
// Indian Railways (IRCTC) currently allows up to 60 days (excluding the
// current day).  To change this, update only this one constant — nothing
// else in the codebase needs to change.
const BOOKING_WINDOW_DAYS = 60;

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: isValidDateFormat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if dateStr is a valid calendar date in YYYY-MM-DD format.
 *
 * The regex ^\d{4}-\d{2}-\d{2}$ breaks down as:
 *   ^       → start of string
 *   \d{4}   → exactly 4 digits (the year)
 *   -       → literal hyphen
 *   \d{2}   → exactly 2 digits (the month)
 *   -       → literal hyphen
 *   \d{2}   → exactly 2 digits (the day)
 *   $       → end of string
 *
 * The regex alone doesn't catch invalid calendar dates like "2024-13-99",
 * so we also parse with Date() and check isNaN — an invalid date like
 * Feb 30 would produce NaN from Date.getTime().
 */
function isValidDateFormat(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const parsed = new Date(dateStr);
    return !isNaN(parsed.getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: isDateInPast
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if dateStr is STRICTLY before today (yesterday or earlier).
 *
 * WHY calculate today fresh each time?
 * If we computed today's date at module load time (when the server starts),
 * and the server runs past midnight, every call after midnight would still
 * use yesterday's date — allowing passengers to book "today's" trains after
 * they've already departed.  Recalculating every call guarantees accuracy.
 *
 * WHY string comparison works for YYYY-MM-DD:
 * ISO dates are zero-padded, so lexicographic (alphabetical) order exactly
 * matches chronological order.  "2024-06-15" < "2024-06-16" is true both
 * as a string comparison AND as a date comparison.  No parsing overhead needed.
 */
function isDateInPast(dateStr) {
    // .toISOString() always returns UTC.  .slice(0,10) gives "YYYY-MM-DD".
    const todayStr = new Date().toISOString().slice(0, 10);
    return dateStr < todayStr;    // strictly less than = yesterday or earlier
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: isDateBeyondBookingWindow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the date is more than BOOKING_WINDOW_DAYS (60) days away.
 *
 * The 60-day rule mirrors IRCTC's Advance Reservation Period (ARP).
 * Trains don't release seats beyond 60 days because schedules, coach
 * compositions, and fares can change — confirming seats too far ahead
 * creates customer support nightmares when things change.
 *
 * To change the window: update BOOKING_WINDOW_DAYS at the top of this file.
 *
 * How the calculation works:
 *   1. Get today as a Date object.
 *   2. Add BOOKING_WINDOW_DAYS * 86400000 ms to get the cutoff date.
 *   3. Convert both to YYYY-MM-DD strings and compare.
 */
function isDateBeyondBookingWindow(dateStr) {
    const today       = new Date();
    const cutoffMs    = today.getTime() + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const cutoffStr   = new Date(cutoffMs).toISOString().slice(0, 10);
    return dateStr > cutoffStr;   // strictly greater than = beyond the 60-day window
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 4: validateJourneyDate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Master validator that combines all date checks in order of specificity.
 * Call this once from any controller to fully validate a journey date.
 *
 * Returns { valid: true } on success.
 * Returns { valid: false, error: "human-readable message" } on any failure.
 *
 * Error messages are intentionally user-facing — keep them clear and
 * actionable so the frontend can display them directly to the passenger.
 */
function validateJourneyDate(dateStr) {
    if (!dateStr) {
        return { valid: false, error: 'Date is required' };
    }
    if (!isValidDateFormat(dateStr)) {
        return { valid: false, error: 'Invalid date format. Use YYYY-MM-DD' };
    }
    if (isDateInPast(dateStr)) {
        return { valid: false, error: 'Journey date cannot be in the past' };
    }
    if (isDateBeyondBookingWindow(dateStr)) {
        return { valid: false, error: 'Booking opens only 60 days in advance' };
    }
    return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 5: getDayColumn
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a YYYY-MM-DD date string, returns the trains table column name
 * that represents that day of the week.
 *
 * JavaScript's Date.getUTCDay() returns:
 *   0 = Sunday  → "runs_sun"
 *   1 = Monday  → "runs_mon"
 *   2 = Tuesday → "runs_tue"
 *   3 = Wednesday → "runs_wed"
 *   4 = Thursday → "runs_thu"
 *   5 = Friday  → "runs_fri"
 *   6 = Saturday → "runs_sat"
 *
 * Example: getDayColumn("2024-06-17") → "runs_mon"
 *   because June 17, 2024 was a Monday (getUTCDay() = 1).
 *
 * WHY getUTCDay() not getDay()?
 * new Date("2024-06-17") creates midnight UTC.  getDay() interprets in the
 * LOCAL timezone — on an IST server (UTC+5:30) midnight UTC is 5:30 AM IST,
 * still Monday, fine.  But getUTCDay() is timezone-agnostic and always
 * correct regardless of where the server is deployed.
 */
function getDayColumn(dateStr) {
    const DAY_COLUMNS = [
        'runs_sun', 'runs_mon', 'runs_tue', 'runs_wed',
        'runs_thu', 'runs_fri', 'runs_sat',
    ];
    const dayIndex = new Date(dateStr).getUTCDay();   // 0–6
    return DAY_COLUMNS[dayIndex];
}

/**
 * Same as getDayColumn but returns the human-readable day name.
 * Exported so controllers can include "Monday" etc. in API responses.
 */
function getDayName(dateStr) {
    const DAY_NAMES = [
        'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
    ];
    return DAY_NAMES[new Date(dateStr).getUTCDay()];
}

module.exports = {
    isValidDateFormat,
    isDateInPast,
    isDateBeyondBookingWindow,
    validateJourneyDate,
    getDayColumn,
    getDayName,
};
