// =============================================================================
// NammaRail — Tatkal Routes
// =============================================================================
// Provides a bridge to the C++ Tatkal Engine.
//
// Mounted in index.js as: app.use('/api/tatkal', tatkalRoutes)
// =============================================================================

'use strict';

const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const TATKAL_ENGINE_URL = process.env.TATKAL_ENGINE_URL || 'http://localhost:18080';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tatkal/room/create
// Proxies room creation to the C++ engine.
// Protected by JWT.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/room/create', authenticateToken, async (req, res) => {
    const { room_id, tickets } = req.body;
    
    if (!room_id || !tickets) {
        return res.status(400).json({ error: 'room_id and tickets are required' });
    }

    try {
        // Using native fetch (Node.js 18+)
        const response = await fetch(`${TATKAL_ENGINE_URL}/api/v1/room/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // The C++ engine expects total_tickets
            body: JSON.stringify({ room_id, total_tickets: tickets })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        
        return res.status(201).json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to connect to Tatkal engine', details: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tatkal/room/:room_id/ping
// Pings the C++ engine to check if it's alive.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/room/:room_id/ping', async (req, res) => {
    try {
        const response = await fetch(`${TATKAL_ENGINE_URL}/ping`);
        if (response.ok) {
            return res.status(200).json({ engineAlive: true });
        }
        return res.status(200).json({ engineAlive: false });
    } catch (err) {
        return res.status(200).json({ engineAlive: false });
    }
});

module.exports = router;
