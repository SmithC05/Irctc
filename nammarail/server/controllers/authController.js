// =============================================================================
// NammaRail — Authentication Controller
// =============================================================================
// Contains two exported handler functions:
//   register — creates a new user account
//   login    — authenticates a user and returns a JWT
//
// A "controller" in MVC terminology is a function that:
//   1. Reads data from the request (req.body, req.params, etc.)
//   2. Performs business logic (validation, DB queries)
//   3. Sends back a response (res.json(), res.status().json(), etc.)
// =============================================================================

'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db     = require('../db/database');

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers — each returns an error string or null if valid.
// Kept separate so the register function stays under 25 lines.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that all required fields for registration are present and meet
 * basic format rules.  Returns a human-readable error string, or null if valid.
 */
function validateRegisterInput(name, email, password) {
    if (!name || !email || !password) {
        return 'name, email, and password are all required';
    }
    // Minimal email check — a proper email must have @ and at least one dot after it.
    if (!email.includes('@') || !email.split('@')[1]?.includes('.')) {
        return 'Please provide a valid email address';
    }
    // A 6-character minimum forces users away from trivially guessable passwords.
    if (password.length < 6) {
        return 'Password must be at least 6 characters long';
    }
    return null;  // null means "all good"
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER — POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new user account.
 *
 * Flow: validate → check for duplicate email → hash password → insert → respond.
 *
 * WHY WE NEVER STORE PLAIN-TEXT PASSWORDS:
 * ──────────────────────────────────────────
 * If our database were ever compromised (data breach, SQL injection, insider
 * threat), storing plain passwords would instantly expose every user's account
 * — and because people reuse passwords, potentially their bank, email, and
 * social media too.
 *
 * bcrypt hashes the password with a built-in random "salt" (random bytes mixed
 * into the hash before computation).  Even if two users have the same password,
 * their stored hashes will be completely different.  You cannot reverse a bcrypt
 * hash back to the original password.
 *
 * WHAT DO "SALT ROUNDS" (cost factor) MEAN?
 * ───────────────────────────────────────────
 * bcrypt runs an expensive key-derivation loop internally.  The salt rounds
 * number (10 here) means the algorithm loops 2^10 = 1,024 times.
 * This makes hashing intentionally SLOW (~100ms on a modern CPU).
 * That slowness is a feature: if an attacker steals our hash database and tries
 * to brute-force passwords, each guess takes 100ms instead of a microsecond —
 * making a billion guesses take ~3 years instead of seconds.
 * Higher rounds = more security but more CPU time per login.  10 is the
 * industry-standard sweet spot for web applications.
 */
async function register(req, res) {
    const { name, email, password } = req.body;

    // Step 1: Validate inputs before touching the database.
    const validationError = validateRegisterInput(name, email, password);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    // Step 2: Check if this email is already registered.
    // We use .get() from better-sqlite3 (returns one row or undefined).
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existingUser) {
        return res.status(409).json({ error: 'Email already registered' });
    }

    // Step 3: Hash the password.  bcrypt.hash is async — it computes 2^10 rounds.
    const passwordHash = await bcrypt.hash(password, 10);

    // Step 4: Generate a UUID for the user's primary key.
    // UUIDs are random 128-bit values — they don't expose how many users we have
    // and are safe to send to clients unlike sequential integer IDs.
    const userId = uuidv4();

    // Step 5: Insert the new user record into the database.
    db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES (?, ?, ?, ?)
    `).run(userId, name.trim(), email.toLowerCase().trim(), passwordHash);

    return res.status(201).json({ message: 'Account created', userId });
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN — POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authenticates a user and returns a JWT.
 *
 * Flow: find user → compare password → sign JWT → respond with token.
 *
 * WHY WE RETURN THE SAME ERROR FOR WRONG EMAIL AND WRONG PASSWORD:
 * ─────────────────────────────────────────────────────────────────
 * If we returned "Email not found" vs. "Wrong password" as separate messages,
 * an attacker could use that distinction to enumerate which email addresses
 * are registered in our system — a "user enumeration attack."
 * They'd simply try thousands of emails until they get "Wrong password" (meaning
 * that email EXISTS), then move on to brute-forcing the password for just that
 * account.  Returning the same generic error eliminates that information leak.
 *
 * WHAT IS THE JWT TOKEN WE SEND BACK?
 * ──────────────────────────────────────
 * • Payload  — { userId, email, name } — non-sensitive identifying info.
 *              Do NOT put the password hash or any secret in the payload;
 *              the payload is readable by anyone (it's just base64).
 * • Secret   — process.env.JWT_SECRET — our server-side signing key.
 *              Without it, no one can forge a valid token.
 * • expiresIn — "7d" — the token auto-expires after 7 days.
 *              After that, the user must log in again to get a new token.
 *              This limits the damage if a token is stolen.
 */
async function login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
    }

    // Step 1: Look up the user by email.
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

    // Step 2: If no user found, return the SAME generic error as a wrong password.
    // (See the comment above explaining why this is important.)
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Step 3: Compare the supplied password against the stored bcrypt hash.
    // bcrypt.compare hashes the supplied password with the same salt that was
    // used when the hash was originally created, then checks if they match.
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Step 4: Build the JWT payload — only include info needed by the client.
    const tokenPayload = {
        userId: user.id,
        email:  user.email,
        name:   user.name,
    };

    // Step 5: Sign and return the token.
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
        token,
        user: { id: user.id, name: user.name, email: user.email },
    });
}

module.exports = { register, login };
