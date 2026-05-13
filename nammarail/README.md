# NammaRail 🚆

**NammaRail** is an IRCTC-style railway booking system built for Tamil Nadu routes.
Book trains, check PNR status, manage passengers — all in one place.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite) |
| Backend | Node.js + Express |
| Database | SQLite (via `better-sqlite3`) |
| Auth | JWT (JSON Web Tokens) + bcrypt |
| Caching | Redis *(planned)* |

---

## Project Structure

```
nammarail/
├── client/               → React Vite frontend (runs on port 5173)
│   └── src/
├── server/               → Express API backend (runs on port 5000)
│   ├── index.js          → Server entry point
│   ├── routes/           → URL route definitions (one file per feature)
│   ├── controllers/      → Business logic for each route
│   ├── middleware/        → Auth, validation, rate-limiting
│   └── db/
│       ├── database.js   → SQLite connection setup
│       └── nammarail.db  → SQLite database file (auto-created)
├── db/
│   └── migrations/       → SQL files to define table schemas
└── README.md
```

---

## Getting Started

### 1. Install server dependencies

```bash
cd server
npm install
```

### 2. Create a `.env` file inside `/server`

```env
PORT=5000
CLIENT_URL=http://localhost:5173
JWT_SECRET=your_super_secret_key_here
NODE_ENV=development
```

### 3. Start the backend server

```bash
# Development (auto-restarts on file changes — needs nodemon)
npm run dev

# Production
npm start
```

### 4. Set up the React client

```bash
cd ../client
npm install
npm run dev
```

### 5. Test the health check

Open your browser or use a tool like Postman:

```
GET http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "project": "NammaRail",
  "timestamp": "2026-05-13T..."
}
```

---

## API Routes (Planned)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |
| POST | `/api/auth/register` | Create a new user account |
| POST | `/api/auth/login` | Login and receive JWT token |
| GET | `/api/trains/search` | Search trains by route and date |
| POST | `/api/bookings` | Book a ticket |
| GET | `/api/bookings/:pnr` | Get booking by PNR number |
| DELETE | `/api/bookings/:id` | Cancel a booking |

---

## Tamil Nadu Routes Covered *(Planned)*

- Chennai Central → Coimbatore
- Chennai → Madurai
- Chennai → Trichy
- Coimbatore → Madurai
- Chennai → Salem
- Trichy → Thanjavur

---

## License

MIT
