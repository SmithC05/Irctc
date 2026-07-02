const fs = require('fs');
let code = fs.readFileSync('main.cpp', 'utf8');

const wsStartRegex = /\/\/\s*═════════════════════════════════════════════════════════════════════════\s*\/\/\s*WebSocket\s*\/ws\/arena\/<room_id>/;
const matchStart = code.match(wsStartRegex);
const wsEndRegex = /CROW_LOG_INFO << "=================================================";/;
const matchEnd = code.match(wsEndRegex);

if (!matchStart || !matchEnd) {
    console.error("Could not find boundaries", {start: !!matchStart, end: !!matchEnd});
    process.exit(1);
}

const wsStart = matchStart.index;
const wsEnd = matchEnd.index;

const newWs = `
    // ═════════════════════════════════════════════════════════════════════════
    // WebSocket  /ws/arena
    // ═════════════════════════════════════════════════════════════════════════
    CROW_WEBSOCKET_ROUTE(app, "/ws/arena")
    .onopen([](crow::websocket::connection& conn) {
        // We do nothing on open, wait for JOIN message
    })
    .onmessage([](crow::websocket::connection& conn, const std::string& msg, bool is_binary) {
        auto* room = static_cast<TatkalRoom*>(conn.userdata());
        
        if (!room) {
            try {
                auto data = crow::json::load(msg);
                if (data && data.has("action") && data["action"] == "JOIN") {
                    std::string room_id = data["room_id"].s();
                    
                    std::shared_lock<std::shared_mutex> rlock(g_rooms_mutex);
                    auto it = g_rooms.find(room_id);
                    if (it != g_rooms.end()) {
                        room = it->second.get();
                        conn.userdata(room);
                        
                        {
                            std::lock_guard<std::mutex> lk(room->conn_mutex);
                            room->connections.insert(&conn);
                        }
                        
                        crow::json::wvalue res;
                        res["type"] = "ROOM_JOINED";
                        res["available_tickets"] = room->available_tickets.load();
                        conn.send_text(res.dump());
                    } else {
                        crow::json::wvalue err;
                        err["type"] = "ERROR";
                        err["message"] = "Room not found";
                        conn.send_text(err.dump());
                        conn.close();
                    }
                }
            } catch (...) {}
            return;
        }

        try {
            auto data = crow::json::load(msg);
            if (data && data.has("action") && data["action"] == "BOOK_TICKET") {
                const int seat_acquired = room->available_tickets.fetch_sub(1, std::memory_order_acq_rel);

                if (seat_acquired > 0) {
                    std::string user_id = data.has("user_id") ? std::string(data["user_id"].s()) : "unknown";
                    crow::json::wvalue confirm;
                    confirm["type"] = "CONFIRMED";
                    confirm["seat"]   = seat_acquired;
                    confirm["user_id"] = user_id;
                    conn.send_text(confirm.dump());

                    const int remaining = room->available_tickets.load(std::memory_order_acquire);

                    crow::json::wvalue bcast;
                    bcast["type"]             = "TICKET_BOOKED";
                    bcast["remaining"] = (remaining < 0 ? 0 : remaining);
                    bcast["user_id"] = user_id;
                    broadcast_to_room(*room, bcast.dump(), &conn);

                    CROW_LOG_INFO << "[BOOK]  seat=" << seat_acquired << " remaining=" << remaining;

                } else {
                    room->available_tickets.fetch_add(1, std::memory_order_relaxed);

                    crow::json::wvalue sold_out;
                    sold_out["type"] = "SOLD_OUT";
                    conn.send_text(sold_out.dump());

                    CROW_LOG_INFO << "[SOLD_OUT] connection attempted booking, no seats left";
                }
            }
        } catch (...) {}
    })
    .onclose([](crow::websocket::connection& conn, const std::string& reason) {
        auto* room = static_cast<TatkalRoom*>(conn.userdata());
        if (!room) return;

        {
            std::lock_guard<std::mutex> lk(room->conn_mutex);
            room->connections.erase(&conn);
        }

        CROW_LOG_INFO << "[LEAVE] room=" << room->room_id << " reason=" << reason;
    });
`;

code = code.substring(0, wsStart) + newWs + "\n    " + code.substring(wsEnd);
fs.writeFileSync('main.cpp', code);
console.log("Success");
