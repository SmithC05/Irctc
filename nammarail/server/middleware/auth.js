// =============================================================================
// NammaRail — JWT Authentication Middleware
// =============================================================================
//
// WHAT IS A MIDDLEWARE?
// ──────────────────────
// In Express, a middleware is a function that sits BETWEEN the incoming HTTP
// request and the final route handler.  It has this signature:
//
//   (req, res, next) => { ... }
//
// `next` is a callback.  Calling next() tells Express: "I'm done — pass the
// request along to the next middleware or route handler in the chain."
// If you don't call next() (and don't send a response), the request hangs.
//
// WHAT IS JWT?
// ─────────────
// JWT (JSON Web Token) is a compact, self-contained string that carries
// verifiable claims about a user.  It has three parts separated by dots:
//
//   Header.Payload.Signature
//
//   • Header   — algorithm used to sign (e.g. HS256)
//   • Payload  — the actual data (userId, email, name, expiry)
//   • Signature — HMAC of header+payload using a secret key
//
// WHAT DOES "SIGNING" MEAN?
// ──────────────────────────
// When we create a JWT at login, we run the payload through a cryptographic
// hash function combined with our JWT_SECRET.  The result (the Signature) is
// appended to the token.  Anyone who has the token can READ the payload (it's
// only base64-encoded, not encrypted), but they cannot CHANGE it without
// invalidating the signature — because they don't know our secret key.
// This means we can trust that the payload was produced by our own server.
//
// WHY "Bearer" TOKENS IN THE AUTHORIZATION HEADER?
// ──────────────────────────────────────────────────
// The HTTP spec defines the Authorization header for authentication.
// The "Bearer" scheme (RFC 6750) says: "the bearer of this token is allowed
// in."  It's the standard way APIs receive JWTs.  The format is:
//   Authorization: Bearer eyJhbGci...
//
// Clients (React, mobile apps) store the token after login and attach it to
// every subsequent request using this header.
// =============================================================================

'use strict';

const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT from the Authorization header.
 *
 * If valid  → decodes the payload, attaches it to req.user, calls next().
 * If missing or invalid → returns 401 Unauthorized immediately.
 *
 * Place this middleware on any route that requires a logged-in user:
 *   router.get('/profile', authenticateToken, profileController.get);
 */
function authenticateToken(req, res, next) {
    // The Authorization header looks like: "Bearer eyJhbGci..."
    // We split on the space and take the second part (index 1).
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1];

    // If no token was provided at all, reject immediately.
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized — no token provided' });
    }

    // jwt.verify checks:
    //   1. The signature is valid (was signed with our JWT_SECRET).
    //   2. The token has not expired (the `exp` field in the payload).
    // If either check fails, it throws an error which we catch below.
    jwt.verify(token, process.env.JWT_SECRET, (err, decodedPayload) => {
        if (err) {
            // This covers both expired tokens and tampered tokens.
            return res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
        }

        // Attach the decoded payload to the request object.
        // Route handlers downstream can now read req.user.userId, req.user.email, etc.
        req.user = decodedPayload;

        // Pass control to the next middleware or route handler in the chain.
        next();
    });
}

module.exports = { authenticateToken };
