// =============================================================================
// NammaRail — Booking API Calls
// =============================================================================

import api from './axios';

/**
 * Create a new booking.
 * @param {Object} bookingData - { trainNumber, fromStation, toStation,
 *   journeyDate, classCode, bookingType, passengers: [{name, age, gender}] }
 */
export const createBooking = (bookingData) =>
  api.post('/bookings', bookingData);

/**
 * Fetch all bookings for the currently logged-in user,
 * grouped by journey (trip-level view).
 */
export const getMyBookings = () =>
  api.get('/bookings/my');

/**
 * Fetch full details for a single booking.
 * Returns 403 if the booking belongs to a different user.
 * @param {string} id - Booking UUID
 */
export const getBookingById = (id) =>
  api.get(`/bookings/${id}`);

/**
 * Cancel a booking. Triggers the WL→RAC→CNF cascade on the server.
 * Uses HTTP DELETE because cancellation deactivates the booking resource.
 * @param {string} bookingId - Booking UUID
 */
export const cancelBooking = (bookingId) =>
  api.delete(`/bookings/${bookingId}/cancel`);
