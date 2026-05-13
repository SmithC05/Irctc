// =============================================================================
// NammaRail — Booking Routes
// =============================================================================
// All booking routes are PROTECTED — a valid JWT must be in the
// Authorization header for every request.
//
// Mounted in index.js as: app.use('/api/bookings', bookingRoutes)
//
// Full URL → handler mapping:
//   POST /api/bookings         → create a new booking
//   GET  /api/bookings/my      → get all bookings for the logged-in user
//   GET  /api/bookings/:id     → get one specific booking (owner only)
// =============================================================================

'use strict';

const express                                    = require('express');
const { createBooking, getMyBookings, getBookingById } = require('../controllers/bookingController');
const { cancelBooking }                                = require('../controllers/cancellationController');
const { authenticateToken }                            = require('../middleware/auth');

const router = express.Router();

// Apply authenticateToken to EVERY route in this file.
// router.use() registers middleware for all subsequent routes —
// instead of repeating `authenticateToken` on every single route,
// we declare it once here.  Any unauthenticated request is rejected
// by the middleware before the controller ever runs.
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings
// Creates a new booking for one or more passengers.
// Body: { trainNumber, fromStation, toStation, journeyDate,
//         classCode, bookingType, passengers: [{name, age, gender}] }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', createBooking);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/my
// Returns all trips booked by the authenticated user, grouped by journey.
//
// IMPORTANT: This route MUST be declared BEFORE /:id.
// Otherwise "my" would be treated as a booking UUID and getBookingById
// would be called — it would fail with a confusing "Booking not found" error.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my', getMyBookings);

// ─────────────────────────────────────────────
// DELETE /api/bookings/:bookingId/cancel
// Cancels a booking, calculates the refund, and runs the WL→RAC→CNF cascade.
//
// WHY DELETE, not POST?
// REST (Representational State Transfer) conventions say:
//   POST   → create a new resource
//   GET    → read a resource
//   PUT    → replace/update a resource fully
//   PATCH  → partially update a resource
//   DELETE → remove or deactivate a resource
//
// A cancellation "removes" the passenger's active booking — the booking
// record itself stays in the DB (for audit/refund history), but the booking
// is deactivated by setting cancelled_at.  DELETE communicates the intent
// clearly to API consumers: "this booking is being destroyed from the
// passenger's perspective."
//
// IMPORTANT: This route /:bookingId/cancel MUST be declared BEFORE /:id.
// Express matches routes top-to-bottom.  If /:id came first, a request to
// /abc123/cancel would match /:id with id="abc123" and ignoring "/cancel".
// ─────────────────────────────────────────────
router.delete('/:bookingId/cancel', cancelBooking);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/:id
// Returns details for a single booking.
// Returns 403 if the booking belongs to a different user.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', getBookingById);

module.exports = router;
