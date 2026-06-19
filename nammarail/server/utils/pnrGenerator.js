'use strict';

const crypto = require('crypto');
const db = require('../db/database');

/**
 * Generates a unique 10-digit PNR for a booking transaction.
 * Format: [Zone:2][Month:2][Day:2][Random:4]
 * Example: 2206104821 (22 = Southern Railway, 06 = June, 10 = 10th, 4821 = random)
 *
 * @param {string} trainZone    - 2-digit zone code (e.g., "22" for SR)
 * @param {string} bookingDate  - YYYY-MM-DD
 * @returns {string} 10-digit PNR string
 */
function generatePNR(trainZone = "22", bookingDate) {
    const dateObj = new Date(bookingDate || new Date());
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    // Prefix is 6 digits: Zone(2) + Month(2) + Day(2)
    const prefix = `${trainZone}${month}${day}`;
    
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
        // Generate a 4-digit random number between 1000 and 9999
        const randomSeq = crypto.randomInt(1000, 10000);
        const pnr = `${prefix}${randomSeq}`;
        
        // Check uniqueness in database
        const existing = db.prepare('SELECT 1 FROM bookings WHERE pnr_number = ?').get(pnr);
        if (!existing) {
            return pnr;
        }
    }
    
    throw new Error('Failed to generate a unique PNR after maximum retries');
}

module.exports = { generatePNR };
