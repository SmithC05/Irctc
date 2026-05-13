# /server/controllers

This folder contains **controller functions** — the actual business logic behind each route.

A controller:
- Receives `req` (the incoming request) and `res` (the response object)
- Talks to the database or other services
- Sends back a JSON response

## Why separate controllers from routes?

Keeping logic here instead of in route files makes the code:
- **Easier to test** — you can unit-test a controller function alone
- **Easier to read** — route files stay clean and short
- **Reusable** — the same controller can be called from multiple routes

## Planned Controller Files

| File | Purpose |
|------|---------|
| `auth.controller.js` | Register user, hash password, generate JWT |
| `train.controller.js` | Search trains by source/destination/date |
| `booking.controller.js` | Create booking, check seat availability |
| `user.controller.js` | Get profile, booking history |
| `payment.controller.js` | Process and verify payment |

## Example Controller

```js
// server/controllers/auth.controller.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Register a new user
async function register(req, res) {
  const { name, email, password } = req.body;

  // Hash the password before saving (never store plain text passwords!)
  const hashedPassword = await bcrypt.hash(password, 10);

  // ... save to DB ...

  res.status(201).json({ message: "User registered successfully" });
}

module.exports = { register };
```
