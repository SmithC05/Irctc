// =============================================================================
// NammaRail — Station Routes
// =============================================================================
// Mounted in index.js as: app.use('/api/stations', stationRoutes)
//
// Full URL → handler mapping:
//   GET /api/stations/search?q=chen   → trainController.searchStations
//
// WHY A SEPARATE FILE FROM trainRoutes.js?
// The stations endpoint is conceptually different from train search — it
// searches the *stations* resource, not the *trains* resource. Keeping them
// in separate routers follows REST conventions and makes the codebase easier
// to navigate: "station things" live here, "train things" live in trainRoutes.
//
// No authentication required — station search is fully public.
// =============================================================================

'use strict';

const express = require('express');
const { searchStations } = require('../controllers/trainController');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/stations/search?q=<query>
//
// WHY THIS ROUTE IS DEFINED BEFORE A POTENTIAL /:stationCode ROUTE:
// Express matches routes in the order they are defined.
// If a dynamic route like /:stationCode came first, a request to /search
// would match it with stationCode = "search" and fail with a confusing error.
// Always register specific literal routes BEFORE dynamic parameter routes.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/search', searchStations);

module.exports = router;
