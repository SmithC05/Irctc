// =============================================================================
// NammaRail — Train Routes
// =============================================================================
// Registers all public train-related endpoints.
// Mounted in index.js as: app.use('/api/trains', trainRoutes)
//
// Full URL → handler mapping:
//   GET /api/trains/search?from=MAS&to=CBE&date=2024-06-15&class=SL
//       → trainController.searchTrains
//
//   GET /api/trains/12673?from=MAS&to=CBE&date=2024-06-15
//       → trainController.getTrainDetails
//
//   POST /api/trains/admin    (requires JWT)
//       → trainController.adminAddTrain
//
// No authentication required on GET routes — searching is a public action.
// =============================================================================

'use strict';

const express = require('express');
const { searchTrains, getTrainDetails, getStats, getAvailabilityGrid, adminAddTrain } = require('../controllers/trainController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trains/search
// Public — no auth middleware applied.
//
// IMPORTANT: This route MUST be registered BEFORE /:trainNumber.
// Express matches routes in the order they are defined.  If /:trainNumber
// came first, a request to /search would match it with trainNumber = "search",
// causing a confusing "train not found" error instead of running the search.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/search', searchTrains);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trains/stats
// Public — returns counts of trains, stations, and fares.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', getStats);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trains/admin
// Protected — requires valid JWT.  Inserts a new train and triggers async
// Gemini demand classification (fire-and-forget, does not block the response).
// MUST be registered before /:trainNumber to avoid route collision.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin', authenticateToken, adminAddTrain);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trains/:trainId/availability
// Public — returns a 6-day availability grid.
// MUST be registered before /:trainNumber so it doesn't get masked.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:trainId/availability', getAvailabilityGrid);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trains/:trainNumber
// Public — returns full details for one train.
// The :trainNumber segment captures whatever follows /api/trains/ in the URL.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:trainNumber', getTrainDetails);

module.exports = router;
