// =============================================================================
// NammaRail — Authentication Routes
// =============================================================================
// An Express Router is a mini-app that groups related routes together.
// We define routes here and mount the whole router at a prefix in index.js:
//   app.use('/api/auth', authRoutes)
//
// That means:
//   POST /api/auth/register  → calls authController.register
//   POST /api/auth/login     → calls authController.login
//   GET  /api/auth/me        → protected; returns the logged-in user's info
// =============================================================================

'use strict';

const express              = require('express');
const { register, login }  = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Public route — no token required.
// Creates a new user account and returns the new userId.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', register);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Public route — no token required.
// Validates credentials and returns a signed JWT on success.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', login);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// Protected route — requires a valid JWT in the Authorization header.
//
// HOW THE PROTECTION WORKS:
// `authenticateToken` runs FIRST (as a second argument to router.get).
// If the token is missing or invalid, authenticateToken sends a 401 and
// the request never reaches the final handler.
// If the token is valid, authenticateToken calls next() and the inline
// handler below runs with req.user already populated.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', authenticateToken, (req, res) => {
    // req.user was attached by authenticateToken — it contains the decoded JWT payload.
    // We return only the fields the client actually needs, not the full decoded object
    // (which also includes iat = issued-at and exp = expiry timestamps).
    res.status(200).json({
        userId: req.user.userId,
        email:  req.user.email,
        name:   req.user.name,
    });
});

module.exports = router;
