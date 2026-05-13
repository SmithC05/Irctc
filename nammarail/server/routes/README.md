# /server/routes

This folder contains **Express route files** — one file per feature area.

Each route file:
- Imports `express.Router()`
- Defines URL paths (e.g. `/login`, `/search`)
- Calls the matching controller function to handle the logic
- Is registered in `index.js` under a base path (e.g. `/api/auth`)

## Planned Route Files

| File | Base Path | Purpose |
|------|-----------|---------|
| `auth.routes.js` | `/api/auth` | Register, login, logout |
| `train.routes.js` | `/api/trains` | Search trains, get schedule |
| `booking.routes.js` | `/api/bookings` | Create, view, cancel bookings |
| `user.routes.js` | `/api/users` | Profile, PNR history |
| `payment.routes.js` | `/api/payments` | Payment flow |

## How to add a new route file

```js
// Example: server/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const { login } = require("../controllers/auth.controller");

router.post("/login", login);

module.exports = router;
```

Then register it in `index.js`:

```js
const authRoutes = require("./routes/auth.routes");
app.use("/api/auth", authRoutes);
```
