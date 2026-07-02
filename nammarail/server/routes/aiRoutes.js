const express = require('express');
const { streamAiResponse } = require('../controllers/aiController');

const router = express.Router();

// POST /api/ai/assist
router.post('/assist', streamAiResponse);

module.exports = router;
