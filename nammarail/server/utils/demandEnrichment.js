// =============================================================================
// NammaRail — Demand Enrichment via Gemini
// =============================================================================
//
// PURPOSE
// ────────
// Classifies each train's real-world demand as 'high', 'medium', or 'low'
// using Gemini's knowledge of Indian Railways.  The classification is stored
// in trains.demand_tier and is read by the World Engine to scale booking
// pressure simulation.
//
// FAILURE MODE
// ─────────────
// If the Gemini API is unavailable, rate-limited, or returns malformed JSON,
// this function logs the error and returns null — it NEVER throws.  The caller
// should leave demand_tier as NULL, which the World Engine treats as 'medium'.
//
// CALL SITES
// ──────────
// 1. db/import.js  — after train insert batch, loops through unclassified trains.
// 2. Admin "add train" route — fire-and-forget after single train insert.
//
// PREREQUISITES
// ─────────────
// • server/.env must contain GEMINI_API_KEY=<your key>
//   (obtain from https://aistudio.google.com/app/apikey)
// • npm install @google/generative-ai (already added to package.json)
//
// =============================================================================

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db/database');

// ─── Gemini client (lazy-initialised so missing key doesn't crash on require)

let _genAI         = null;
let _primaryModel  = null;
let _fallbackModel = null;

/**
 * Initialises and returns { primary, fallback } Gemini model instances.
 * Model names are read from env vars:
 *   GEMINI_MODEL          — primary   (default: gemini-2.0-flash)
 *   GEMINI_FALLBACK_MODEL — fallback  (default: same as primary)
 * Returns null if GEMINI_API_KEY is not set.
 */
function getModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;   // Enrichment disabled — no key

    if (!_primaryModel) {
        _genAI = new GoogleGenerativeAI(apiKey);

        const generationConfig = {
            responseMimeType: 'application/json',
            temperature: 0.1,
        };

        const primaryName  = process.env.GEMINI_MODEL          || 'gemini-2.0-flash';
        const fallbackName = process.env.GEMINI_FALLBACK_MODEL || primaryName;

        _primaryModel  = _genAI.getGenerativeModel({ model: primaryName,  generationConfig });
        _fallbackModel = _genAI.getGenerativeModel({ model: fallbackName, generationConfig });

        console.log(`  ℹ  Gemini enrichment: primary=${primaryName}, fallback=${fallbackName}`);
    }

    return { primary: _primaryModel, fallback: _fallbackModel };
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

/**
 * Builds the classification prompt for a single train.
 */
function buildPrompt(train) {
    return `You are an Indian Railways data analyst. Classify the real-world passenger demand for the following train.

Train details:
  Number : ${train.id}
  Name   : ${train.name}
  From   : ${train.from_station_code}
  To     : ${train.to_station_code}

Criteria for classification:
  - "high"   : Popular trunk-route express trains (Rajdhani, Shatabdi, Duronto, high-traffic
                corridor intercity trains). Typically runs full 30+ days ahead, heavy competition
                for seats, frequent waitlist.
  - "medium" : Standard intercity/mail/express trains on moderately busy corridors.
                Usually fills up 10-20 days ahead. Waitlist possible on weekends.
  - "low"    : Passenger, MEMU, DEMU, slow mail trains, low-frequency routes,
                trains on rural or thin corridors. Rarely hits full capacity.

Respond with ONLY valid JSON in this exact shape — no markdown, no explanation:
{
  "demand_tier": "high" | "medium" | "low",
  "reasoning": "<one sentence explaining the classification>"
}`;
}

// ─── Core enrichment function ─────────────────────────────────────────────────

/**
 * Calls Gemini to classify a train's demand tier, then persists the result.
 * Tries the primary model first; on any error retries once with the fallback.
 *
 * @param {{ id, name, from_station_code, to_station_code }} train
 * @returns {Promise<'high'|'medium'|'low'|null>}
 *   Returns the classified tier on success, null on any failure.
 */
async function enrichTrainDemandTier(train) {
    const models = getModels();
    if (!models) {
        // No API key — silently skip; demand_tier stays NULL (treated as 'medium')
        return null;
    }

    const prompt = buildPrompt(train);

    // Helper: attempt one model and return parsed tier, or throw on failure.
    async function tryModel(model, label) {
        const result = await model.generateContent(prompt);
        const text   = result.response.text().trim();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (parseErr) {
            throw new Error(`Non-JSON response from ${label}: ${text.slice(0, 120)}`);
        }

        const tier = (parsed.demand_tier || '').toLowerCase();
        if (!['high', 'medium', 'low'].includes(tier)) {
            throw new Error(`Invalid tier "${tier}" from ${label}`);
        }

        return { tier, reasoning: parsed.reasoning || null };
    }

    // Attempt primary, then fallback.
    let tier      = null;
    let reasoning = null;

    try {
        ({ tier, reasoning } = await tryModel(models.primary, 'primary'));
    } catch (primaryErr) {
        const code = primaryErr?.status || primaryErr?.code || 'ERR';
        console.warn(`  ⚠  Primary model failed for train ${train.id} [${code}]: ${primaryErr.message} — trying fallback`);

        try {
            ({ tier, reasoning } = await tryModel(models.fallback, 'fallback'));
        } catch (fallbackErr) {
            console.error(`  ✘  Fallback also failed for train ${train.id}: ${fallbackErr.message}`);
            return null;
        }
    }

    // Persist to DB.
    db.prepare(`
        UPDATE trains
           SET demand_tier      = ?,
               demand_reasoning = ?
         WHERE id = ?
    `).run(tier, reasoning, train.id);

    return tier;
}

// ─── Batch enrichment (for import.js) ────────────────────────────────────────

/**
 * Loops through all trains that have demand_tier = NULL and enriches each one.
 * Adds a small delay between calls to avoid Gemini rate limits.
 *
 * @param {number} [delayMs=1200] - Milliseconds to wait between API calls.
 *                                   Gemini Free Tier allows ~60 RPM; 1200ms ≈ 50 RPM.
 * @returns {Promise<{ classified: number, failed: number, skipped: number }>}
 */
async function enrichAllUnclassifiedTrains(delayMs = 1200) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('  ℹ  GEMINI_API_KEY not set — skipping demand enrichment.');
        return { classified: 0, failed: 0, skipped: 0 };
    }

    const unclassified = db.prepare(`
        SELECT id, name, from_station_code, to_station_code
          FROM trains
         WHERE demand_tier IS NULL
         ORDER BY id
    `).all();

    const total = unclassified.length;
    if (total === 0) {
        console.log('  ✔  All trains already classified — nothing to enrich.');
        return { classified: 0, failed: 0, skipped: 0 };
    }

    console.log(`\n── Gemini Demand Enrichment: ${total} trains to classify ──`);

    let classified = 0;
    let failed     = 0;

    for (let i = 0; i < total; i++) {
        const train = unclassified[i];
        const tier  = await enrichTrainDemandTier(train);

        if (tier) {
            classified++;
            console.log(`  [${classified + failed}/${total}] ✔  Train ${train.id} (${train.name}) → ${tier}`);
        } else {
            failed++;
            console.log(`  [${classified + failed}/${total}] ✘  Train ${train.id} (${train.name}) → failed (stays NULL)`);
        }

        // Rate-limit pause between calls (skip after last call).
        if (i < total - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    console.log(`\n  ✔  Enrichment complete: ${classified} classified, ${failed} failed\n`);
    return { classified, failed, skipped: 0 };
}

module.exports = { enrichTrainDemandTier, enrichAllUnclassifiedTrains };
