# /server/middleware

This folder contains **Express middleware functions** — code that runs *between* a request arriving and a route handler responding.

Middleware receives `(req, res, next)`:
- `req` — the incoming request (you can read/modify it here)
- `res` — the response (you can short-circuit and respond early)
- `next()` — call this to pass control to the next middleware/route

## Planned Middleware Files

| File | Purpose |
|------|---------|
| `auth.middleware.js` | Verify JWT token — protect private routes |
| `validate.middleware.js` | Check request body fields are valid before hitting controller |
| `rateLimit.middleware.js` | Limit how many requests a user can make (prevent abuse) |
| `logger.middleware.js` | Log every request method and URL for debugging |

## Example: Auth Middleware

```js
// server/middleware/auth.middleware.js
const jwt = require("jsonwebtoken");

// This middleware checks if the request has a valid JWT token.
// Attach it to any route that requires the user to be logged in.
function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];

  // The token is usually sent as: "Bearer <token>"
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    // jwt.verify() decodes and validates the token using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the decoded user info to the request so the next handler can use it
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ message: "Invalid or expired token." });
  }
}

module.exports = { requireAuth };
```

## How to use middleware on a route

```js
const { requireAuth } = require("../middleware/auth.middleware");

// Only logged-in users can access this route
router.get("/my-bookings", requireAuth, getMyBookings);
```
