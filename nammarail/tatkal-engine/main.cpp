// =============================================================================
// NammaRail — Tatkal Race Simulation Engine
// main.cpp  |  C++17  |  Crow + standalone Asio
// =============================================================================
//
// ARCHITECTURE OVERVIEW
// ─────────────────────
// This server manages "Tatkal rooms" — countdown arenas where multiple users
// race in real-time to claim a finite pool of train tickets the instant a
// timer expires.
//
// Thread-Safety Model
// ───────────────────
// Two levels of concurrency are managed here:
//
//  1. ROOM REGISTRY (g_rooms):
//     Guarded by std::shared_mutex (g_rooms_mutex).
//     • POST /api/v1/room/create: takes a unique_lock (exclusive write).
//     • All WebSocket handlers:   take a shared_lock  (concurrent read).
//     Once a room is created it is never removed, so the map never shrinks —
//     this means we hold the read lock for the shortest possible time (just
//     a lookup), then drop it before doing any I/O.
//
//  2. TICKET COUNTER (TatkalRoom::available_tickets):
//     A std::atomic<int>. NO mutex surrounds it.
//     fetch_sub(1, acq_rel) is a single indivisible hardware instruction
//     (LOCK XADD on x86-64). It returns the value BEFORE subtraction, which
//     is the seat number claimed by the caller. This means:
//       • Zero mutex contention for the "hot path" of a booking.
//       • No possibility of two threads winning the same seat.
//       • Memory ordering: acq_rel ensures each thread sees all prior bookings
//         (acquire) and its own write is visible to all subsequent threads (release).
//
//  3. CONNECTION POOL (TatkalRoom::connections):
//     Guarded by TatkalRoom::conn_mutex (a plain std::mutex).
//     All reads/writes to the set hold this mutex for the minimum duration:
//     modify → unlock → do I/O (never hold the lock while sending).
//
// =============================================================================

#include "crow_all.h"     // Crow single-file header (place in include/)

#include <atomic>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

// =============================================================================
// TatkalRoom — per-room state machine
// =============================================================================

struct TatkalRoom {
    // Immutable after construction — safe to read without any lock.
    const std::string room_id;

    // ── THE CRITICAL FIELD ───────────────────────────────────────────────────
    // available_tickets is the sole source of truth for seat inventory.
    // It is ONLY decremented via fetch_sub (atomic RMW) — never via
    // non-atomic subtraction. This guarantees that even under maximum
    // concurrent "BOOK_TICKET" pressure, each seat number is awarded
    // to exactly one connection.
    //
    // std::memory_order_acq_rel on every fetch_sub forms a total order over
    // all booking operations, making the sequence globally consistent.
    std::atomic<int> available_tickets;

    // ── BROADCAST POOL ───────────────────────────────────────────────────────
    // Raw pointers to open WebSocket connections in this room.
    //
    // Ownership: Crow's IO layer owns these objects and frees them when the
    // socket closes. We NEVER dereference a stale pointer — the onclose handler
    // removes it from this set before Crow's destructor runs.
    //
    // Protected by: conn_mutex (plain std::mutex, not shared).
    // Rationale: broadcast critical sections are short (set insert/erase/copy);
    // a plain mutex is faster than shared_mutex for small critical sections.
    std::unordered_set<crow::websocket::connection*> connections;
    mutable std::mutex conn_mutex;

    // Explicit constructor required: std::atomic<T> is not copy/move constructible.
    TatkalRoom(std::string id, int tickets)
        : room_id(std::move(id))
        , available_tickets(tickets)
    {}

    // Explicitly deleted so that unique_ptr<TatkalRoom> doesn't silently
    // try to copy-construct when the map grows.
    TatkalRoom(const TatkalRoom&)            = delete;
    TatkalRoom& operator=(const TatkalRoom&) = delete;
    TatkalRoom(TatkalRoom&&)                 = delete;
    TatkalRoom& operator=(TatkalRoom&&)      = delete;
};

// =============================================================================
// Global room registry
//
// std::shared_mutex allows:
//   • N concurrent reader threads (WebSocket open/message/close handlers)
//   • 1 exclusive writer thread  (POST /api/v1/room/create)
//
// The map only grows (rooms are never removed at runtime), so write-locking
// frequency is bounded by the admin calling the create endpoint — effectively
// zero contention during a live race.
// =============================================================================

static std::unordered_map<std::string, std::unique_ptr<TatkalRoom>> g_rooms;
static std::shared_mutex g_rooms_mutex;

// =============================================================================
// Helpers
// =============================================================================

// ── broadcast ─────────────────────────────────────────────────────────────────
// Sends `payload` to every connection in `room`, optionally skipping `skip`.
//
// CRITICAL: We snapshot the connection set under the lock, then RELEASE the
// lock before doing any I/O. This prevents a scenario where:
//   1. Thread A holds conn_mutex
//   2. Thread A calls send_text() which internally waits for the socket buffer
//   3. Thread B (Crow's IO thread) tries to acquire conn_mutex in onclose
//   → Deadlock
//
// By snapshotting under the lock and sending outside it, the worst case is
// that we attempt to send to a connection that closed between snapshot and send.
// We guard that with a try/catch.
static void broadcast_to_room(TatkalRoom&                     room,
                               const std::string&              payload,
                               crow::websocket::connection*    skip = nullptr)
{
    // ── Step 1: Snapshot under lock ──────────────────────────────────────────
    std::vector<crow::websocket::connection*> snapshot;
    {
        std::lock_guard<std::mutex> lk(room.conn_mutex);
        snapshot.assign(room.connections.begin(), room.connections.end());
    }   // conn_mutex released HERE — before any I/O

    // ── Step 2: Send outside lock ────────────────────────────────────────────
    for (auto* conn : snapshot) {
        if (conn == skip) continue;   // Don't echo back to the triggering client
        try {
            conn->send_text(payload);
        } catch (...) {
            // Connection closed between snapshot and send — silently swallow.
            // The onclose handler will erase it from the set on the next event.
        }
    }
}

// =============================================================================
// main
// =============================================================================

int main()
{
    crow::SimpleApp app;

    // ═════════════════════════════════════════════════════════════════════════
    // GET /ping
    // Health-check endpoint. Returns engine identity for monitoring.
    // ═════════════════════════════════════════════════════════════════════════
    CROW_ROUTE(app, "/ping").methods("GET"_method)
    ([]() {
        crow::json::wvalue body;
        body["status"] = "PONG";
        body["engine"] = "C++17 Atomic";
        return crow::response{200, body};
    });

    // ═════════════════════════════════════════════════════════════════════════
    // POST /api/v1/room/create
    //
    // Request body (JSON):
    //   { "room_id": "tk_101", "total_tickets": 100 }
    //
    // Responses:
    //   201 Created — room initialised in g_rooms
    //   400 Bad Request — missing fields or invalid total_tickets
    //   409 Conflict   — room_id already exists
    // ═════════════════════════════════════════════════════════════════════════
    CROW_ROUTE(app, "/api/v1/room/create").methods("POST"_method)
    ([](const crow::request& req) {
        // ── Parse and validate request body ──────────────────────────────────
        auto body = crow::json::load(req.body);

        if (!body || !body.has("room_id") || !body.has("total_tickets")) {
            crow::json::wvalue err;
            err["error"] = "Missing required fields: room_id (string), total_tickets (int)";
            return crow::response{400, err};
        }

        const std::string room_id       = std::string{body["room_id"].s()};
        const int         total_tickets = static_cast<int>(body["total_tickets"].i());

        if (room_id.empty()) {
            crow::json::wvalue err;
            err["error"] = "room_id must not be empty";
            return crow::response{400, err};
        }

        if (total_tickets <= 0) {
            crow::json::wvalue err;
            err["error"] = "total_tickets must be a positive integer";
            return crow::response{400, err};
        }

        // ── Acquire exclusive write lock to mutate the registry ───────────────
        // unique_lock (not shared_lock) because we are calling emplace().
        // The lock scope is deliberately narrow — validation happens before it.
        std::unique_lock<std::shared_mutex> wlock(g_rooms_mutex);

        if (g_rooms.count(room_id)) {
            crow::json::wvalue err;
            err["error"] = "Room already exists";
            err["room_id"] = room_id;
            return crow::response{409, err};
        }

        // make_unique inside emplace: atomic<int> requires in-place construction.
        g_rooms.emplace(room_id, std::make_unique<TatkalRoom>(room_id, total_tickets));
        wlock.unlock();   // Release before building the response

        CROW_LOG_INFO << "[CREATE] room=" << room_id
                      << " tickets=" << total_tickets;

        crow::json::wvalue res;
        res["status"]        = "CREATED";
        res["room_id"]       = room_id;
        res["total_tickets"] = total_tickets;
        return crow::response{201, res};
    });

    // ═════════════════════════════════════════════════════════════════════════
    // WebSocket  /ws/arena/<room_id>
    //
    // This is the hot path — every simultaneous "Pay" click arrives here.
    //
    // Protocol (client → server):
    //   "BOOK_TICKET"    — attempt to claim one seat
    //
    // Protocol (server → client):
    //   {"event":"ROOM_JOINED",   "room_id":"…", "available_tickets":N}
    //   {"status":"CONFIRMED",    "seat":N}
    //   {"status":"SOLD_OUT"}
    //   {"event":"TICKET_BOOKED", "available_tickets":N}  ← broadcast to others
    //   {"error":"Room not found","code":404}
    // ═════════════════════════════════════════════════════════════════════════
    CROW_WEBSOCKET_ROUTE(app, "/ws/arena/<string>")

    // ── ON OPEN ───────────────────────────────────────────────────────────────
    // Crow passes the URL parameter ("room_id") as the second argument.
    // Called once per new WebSocket upgrade — from a Crow IO thread.
    .onopen([](crow::websocket::connection& conn, const std::string& room_id) {

        // ── Step 1: Locate the room (shared / read lock) ──────────────────────
        // shared_lock: multiple connections can open simultaneously without
        // serialising each other — they all share the read lock.
        TatkalRoom* room = nullptr;
        {
            std::shared_lock<std::shared_mutex> rlock(g_rooms_mutex);
            auto it = g_rooms.find(room_id);
            if (it != g_rooms.end()) {
                room = it->second.get();   // raw pointer; lifetime tied to g_rooms
            }
        }   // shared_lock released here

        if (!room) {
            conn.send_text(R"({"error":"Room not found","code":404})");
            conn.close("room_not_found");
            return;
        }

        // ── Step 2: Register in the broadcast pool ────────────────────────────
        {
            std::lock_guard<std::mutex> lk(room->conn_mutex);
            room->connections.insert(&conn);
        }

        // ── Step 3: Cache room pointer in connection's userdata slot ───────────
        // Avoids a second g_rooms lookup on every message/close.
        // conn.userdata<T>() is O(1) — it's just a void* stored on the connection.
        conn.userdata(room);

        // ── Step 4: Greet the new participant with current inventory ───────────
        const int current = room->available_tickets.load(std::memory_order_acquire);
        crow::json::wvalue hello;
        hello["event"]             = "ROOM_JOINED";
        hello["room_id"]           = room_id;
        hello["available_tickets"] = current;
        conn.send_text(hello.dump());

        CROW_LOG_INFO << "[JOIN]  room=" << room_id
                      << " tickets_remaining=" << current;
    })

    // ── ON MESSAGE ────────────────────────────────────────────────────────────
    // Called for every text frame the client sends — from a Crow IO thread.
    // For a 200-user race this may be called from 200 threads simultaneously.
    // The ONLY shared state touched is available_tickets (via atomic fetch_sub).
    .onmessage([](crow::websocket::connection& conn,
                  const std::string&           msg,
                  bool                         /*is_binary*/)
    {
        // Only act on the canonical booking command; silently ignore everything else.
        // This makes the protocol extensible without breaking the engine.
        if (msg != "BOOK_TICKET") return;

        // Retrieve the room pointer cached in onopen (zero global lock).
        auto* room = conn.userdata<TatkalRoom>();
        if (!room) return;   // Defensive; should never be null after a successful open.

        // ═════════════════════════════════════════════════════════════════════
        // THE ATOMIC BOOKING — the core of the race engine
        // ═════════════════════════════════════════════════════════════════════
        //
        // fetch_sub(1, acq_rel) performs:
        //   1. LOAD the current counter value
        //   2. DECREMENT it by 1
        //   3. STORE the result back
        //   4. RETURN the value that existed BEFORE the decrement
        //
        // Steps 1-3 happen atomically (LOCK XADD on x86-64) — indivisible.
        // No other thread can observe or modify the counter between load and store.
        //
        // Memory order explanation:
        //   memory_order_acquire (on the load) →
        //     we see all prior writes from other threads (their bookings)
        //   memory_order_release (on the store) →
        //     our decrement is immediately visible to all subsequent threads
        //   Combined: memory_order_acq_rel
        //
        // Seat numbering example with 3 seats, 4 simultaneous calls:
        //   Thread A: fetch_sub(1) → returns 3, stores 2  → seat 3, CONFIRMED ✓
        //   Thread B: fetch_sub(1) → returns 2, stores 1  → seat 2, CONFIRMED ✓
        //   Thread C: fetch_sub(1) → returns 1, stores 0  → seat 1, CONFIRMED ✓  (last!)
        //   Thread D: fetch_sub(1) → returns 0, stores -1 → SOLD_OUT, undo fetch_add
        //
        const int seat_acquired =
            room->available_tickets.fetch_sub(1, std::memory_order_acq_rel);

        if (seat_acquired > 0) {
            // ── CONFIRMED ────────────────────────────────────────────────────
            // This thread legally claimed seat `seat_acquired`.
            // Send the personalised confirmation to the buyer.
            crow::json::wvalue confirm;
            confirm["status"] = "CONFIRMED";
            confirm["seat"]   = seat_acquired;
            conn.send_text(confirm.dump());

            // Load the remaining count AFTER our decrement.
            // Sequentially consistent load ensures we see all concurrent decrements
            // that completed before our load (i.e., we never report a stale high count).
            const int remaining =
                room->available_tickets.load(std::memory_order_acquire);

            // Broadcast the updated count to every OTHER connection in the room.
            // We skip the buyer (&conn) — they already received CONFIRMED.
            crow::json::wvalue bcast;
            bcast["event"]             = "TICKET_BOOKED";
            bcast["available_tickets"] = (remaining < 0 ? 0 : remaining);
            broadcast_to_room(*room, bcast.dump(), &conn);

            CROW_LOG_INFO << "[BOOK]  seat=" << seat_acquired
                          << " remaining=" << remaining;

        } else {
            // ── SOLD OUT ─────────────────────────────────────────────────────
            // seat_acquired == 0 means the counter was 0 when we called fetch_sub.
            // seat_acquired  < 0 means it was already negative (multiple losers).
            //
            // Undo the decrement to prevent unbounded negative drift.
            // Each "loser" thread subtracts 1 and then immediately adds 1 back,
            // so the counter converges back to 0 regardless of how many threads
            // race through this branch simultaneously.
            //
            // memory_order_relaxed on the undo: we don't need any ordering
            // guarantees here — we're just compensating our own overshoot.
            room->available_tickets.fetch_add(1, std::memory_order_relaxed);

            crow::json::wvalue sold_out;
            sold_out["status"] = "SOLD_OUT";
            conn.send_text(sold_out.dump());

            CROW_LOG_INFO << "[SOLD_OUT] connection attempted booking, no seats left";
        }
    })

    // ── ON CLOSE ──────────────────────────────────────────────────────────────
    // Called by Crow when the WebSocket handshake completes or the client
    // disconnects. After this handler returns, Crow frees the connection object.
    // We must remove the pointer from the broadcast set BEFORE Crow frees it —
    // otherwise broadcast_to_room() could send to a dangling pointer.
    .onclose([](crow::websocket::connection& conn, const std::string& reason) {
        auto* room = conn.userdata<TatkalRoom>();
        if (!room) return;

        // Erase under the conn_mutex so that any concurrent broadcast_to_room()
        // that snapshots the set will either see or not see this pointer —
        // but NEVER see it as a dangling pointer (the set is consistent at
        // every point in time relative to the mutex).
        {
            std::lock_guard<std::mutex> lk(room->conn_mutex);
            room->connections.erase(&conn);
        }

        CROW_LOG_INFO << "[LEAVE] room=" << room->room_id
                      << " reason=" << reason;
    });

    // ═════════════════════════════════════════════════════════════════════════
    // Launch
    //
    // multithreaded() spawns std::thread::hardware_concurrency() IO threads.
    // On an 8-core IDX machine that's 8 threads — each handles one or more
    // WebSocket connections via Asio's epoll reactor.
    // ═════════════════════════════════════════════════════════════════════════
    CROW_LOG_INFO << "=================================================";
    CROW_LOG_INFO << "  Tatkal Race Engine  |  C++17 Atomic  |  :18080";
    CROW_LOG_INFO << "=================================================";

    app.port(18080)
       .multithreaded()
       .run();

    return 0;
}
