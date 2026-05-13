// ─────────────────────────────────────────────
// Load environment variables from a .env file
// dotenv lets us store secrets (like JWT_SECRET, DB_PATH) outside our code
// so we never accidentally commit them to Git
// ─────────────────────────────────────────────
require("dotenv").config();

// ─────────────────────────────────────────────
// Import the core libraries we need
// express  → web framework that handles routing and middleware
// cors     → Cross-Origin Resource Sharing — without this, the browser
//             BLOCKS requests from a different port (e.g. React on 5173
//             trying to call this server on 5000)
// ─────────────────────────────────────────────
const express    = require("express");
const cors       = require("cors");
const authRoutes    = require("./routes/authRoutes");
const trainRoutes   = require("./routes/trainRoutes");
const bookingRoutes = require("./routes/bookingRoutes");

// ─────────────────────────────────────────────
// Create the Express app instance
// Think of `app` as our server object — we attach routes and middleware to it
// ─────────────────────────────────────────────
const app = express();

// ─────────────────────────────────────────────
// Set the port the server will listen on
// We first check if there's a PORT variable in the .env file,
// and if not, we fall back to 5000 as the default
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

// ─────────────────────────────────────────────
// Configure CORS (Cross-Origin Resource Sharing)
// This tells the browser: "It's okay for http://localhost:5173 (our React app)
// to make requests to this server."
// Without this, browsers block requests between different ports/domains.
// ─────────────────────────────────────────────
const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// ─────────────────────────────────────────────
// Parse incoming JSON request bodies
// When a client sends data like { "name": "John" }, Express needs this
// middleware to convert the raw text into a usable JavaScript object.
// Without this, req.body would be undefined.
// ─────────────────────────────────────────────
app.use(express.json());

// ─────────────────────────────────────────────
// Health check route — GET /api/health
// This is a simple endpoint used to confirm the server is running.
// Tools like load balancers, monitoring dashboards, and CI pipelines
// ping this to check if the service is alive.
// ─────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    project: "NammaRail",
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// Mount the authentication router.
// All routes inside authRoutes.js are prefixed with /api/auth:
//   POST /api/auth/register
//   POST /api/auth/login
//   GET  /api/auth/me
// ─────────────────────────────────────────────
app.use('/api/auth',   authRoutes);

// ─────────────────────────────────────────────
// Mount the train search router.
// All routes inside trainRoutes.js are prefixed with /api/trains:
//   GET /api/trains/search?from=MAS&to=CBE&date=...&class=SL
//   GET /api/trains/:trainNumber
// ─────────────────────────────────────────────
app.use('/api/trains',   trainRoutes);

// ─────────────────────────────────────────────
// Mount the booking router.
// All routes inside bookingRoutes.js require a valid JWT.
//   POST /api/bookings
//   GET  /api/bookings/my
//   GET  /api/bookings/:id
// ─────────────────────────────────────────────
app.use('/api/bookings', bookingRoutes);

// ─────────────────────────────────────────────
// 404 handler — catches any route that doesn't match above
// This middleware runs only if no earlier route handled the request.
// `next` is not used here since this is the final fallback.
// ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: `Route ${req.method} ${req.url} not found`,
  });
});

// ─────────────────────────────────────────────
// Global error handler — catches any errors thrown inside route handlers
// Express recognises a 4-argument middleware as an error handler.
// If any route calls next(error), it lands here.
// ─────────────────────────────────────────────
app.use((error, req, res, next) => {
  console.error("[NammaRail Error]", error.message);
  res.status(500).json({
    status: "error",
    message: error.message || "Internal server error",
  });
});

// ─────────────────────────────────────────────
// Start the server and begin listening for incoming requests
// app.listen() binds to the port and waits for HTTP connections
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚆 NammaRail server is running on http://localhost:${PORT}`);
  console.log(`📡 Health check → http://localhost:${PORT}/api/health`);
  console.log(`🌐 Accepting requests from ${corsOptions.origin}`);
});
