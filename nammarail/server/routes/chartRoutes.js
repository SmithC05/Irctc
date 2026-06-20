// =============================================================================
// NammaRail — Chart Routes
// =============================================================================
// Provides:
//   GET  /api/trains/:trainNumber/chart?date=YYYY-MM-DD  → chart status + phase
//   POST /api/admin/chart/prepare                        → force chart prep (dev/test)
// =============================================================================

'use strict';

const express              = require('express');
const db                   = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { getChartStatus, getCurrAvlRemaining } = require('../utils/chartUtils');
const { buildPhaseContext } = require('../utils/phaseUtils');
const { manualTrigger }    = require('../schedulers/chartScheduler');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trains/:trainNumber/chart?date=YYYY-MM-DD
//
// Returns the chart status and full phase context for a train on a given date.
// Used by the UI to show phase banners and CURR_AVL availability.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:trainNumber/chart', (req, res) => {
    const trainId = parseInt(req.params.trainNumber, 10);
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });
    }

    const train = db.prepare('SELECT id, departure_time FROM trains WHERE id = ?').get(trainId);
    if (!train) {
        return res.status(404).json({ error: `Train ${trainId} not found` });
    }

    const chartRow    = getChartStatus(db, trainId, date, null);
    const chartStatus = chartRow?.chartStatus ?? 'PENDING';
    const currAvlCount = chartRow?.currAvlCount ?? 0;

    const phaseContext = buildPhaseContext(date, train.departure_time, chartStatus, currAvlCount);

    return res.status(200).json({
        trainNumber: trainId,
        journeyDate: date,
        chartStatus,
        chartPreparedAt: chartRow?.chartPreparedAt ?? null,
        currAvlCount,
        ...phaseContext,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/chart/prepare
// Body: { trainNumber, journeyDate, classCode }
//
// Manually triggers chart preparation for testing.
// Protected by JWT — should be admin-only in production.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/chart/prepare', authenticateToken, (req, res) => {
    const { trainNumber, journeyDate, classCode } = req.body;

    if (!trainNumber || !journeyDate || !classCode) {
        return res.status(400).json({ error: 'trainNumber, journeyDate, and classCode are required' });
    }

    const trainId = parseInt(trainNumber, 10);
    const train   = db.prepare('SELECT id FROM trains WHERE id = ?').get(trainId);
    if (!train) {
        return res.status(404).json({ error: `Train ${trainId} not found` });
    }

    try {
        const result = manualTrigger(trainId, journeyDate, classCode);
        return res.status(200).json({
            message:      `Chart prepared for train ${trainId} on ${journeyDate} (${classCode})`,
            cancelledWL:  result.cancelledWL,
            currAvlCount: result.currAvlCount,
            prepared:     result.prepared,
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
