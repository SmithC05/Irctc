'use strict';

const db = require('../db/database');
const { bookSinglePassenger, getFareRecord } = require('../controllers/bookingController');
const { generatePNR } = require('../utils/pnrGenerator');

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000000';
const CLASSES_TO_SEED = ['SL', '3A', '2A'];
const MAX_DAYS_AHEAD = 60;

function seedBookings() {
    console.log('Starting DB Seed: Booking pressure over next 60 days...');

    // Make sure we have the mock user
    const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(MOCK_USER_ID);
    if (!existingUser) {
        db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
            MOCK_USER_ID, 'Seeder Bot', 'seeder@nammarail.in', 'notarealhash'
        );
    }

    const trains = db.prepare('SELECT id, from_station_code, to_station_code FROM trains').all();

    const runTransaction = db.transaction(() => {
        let totalBookings = 0;
        
        for (const train of trains) {
            for (const classCode of CLASSES_TO_SEED) {
                // Determine capacity based on SEAT_DEFAULTS inside bookingController logic.
                // We will just do a dummy call to create inventory if missing to get total_seats.
                // Or we can just use fixed numbers since it's a seed script.
                const total_seats = classCode === 'SL' ? 72 : (classCode === '3A' ? 64 : 46);

                const fareRecord = getFareRecord(train.id, train.from_station_code, train.to_station_code, classCode);

                for (let daysAhead = 0; daysAhead < MAX_DAYS_AHEAD; daysAhead++) {
                    const d = new Date();
                    d.setDate(d.getDate() + daysAhead);
                    const isoDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                    
                    const dayOfWeek = d.getDay();
                    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
                    
                    let fillRate = 1 - Math.pow(daysAhead / 60, 0.55) * 0.94;
                    if (isWeekend) fillRate *= 1.15;
                    
                    // Cap fillRate slightly above 1 so we get RAC/WL, but not infinitely
                    fillRate = Math.min(fillRate, 1.5);
                    
                    const numBookings = Math.floor(total_seats * fillRate);

                    if (numBookings > 0) {
                        // Generate one PNR per "group" of 4 passengers to simulate group bookings
                        let pnrNumber = generatePNR("22", isoDate);
                        
                        for (let i = 0; i < numBookings; i++) {
                            if (i > 0 && i % 4 === 0) {
                                pnrNumber = generatePNR("22", isoDate);
                            }
                            
                            try {
                                bookSinglePassenger({
                                    trainId: train.id,
                                    fromStation: train.from_station_code,
                                    toStation: train.to_station_code,
                                    journeyDate: isoDate,
                                    classCode,
                                    bookingType: 'normal',
                                    passenger: {
                                        name: `Seeder Pax ${i+1}`,
                                        age: 30 + (i % 20),
                                        gender: i % 2 === 0 ? 'M' : 'F'
                                    },
                                    fareRecord,
                                    userId: MOCK_USER_ID,
                                    pnrNumber
                                });
                                totalBookings++;
                            } catch (e) {
                                // Ignore REGRET errors or Tatkal closed
                                if (e.code === 'REGRET') {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        console.log(`Successfully seeded ${totalBookings} booking records.`);
    });

    try {
        runTransaction();
        console.log('Seed process completed successfully.');
    } catch (err) {
        console.error('Seed process failed:', err);
    }
}

seedBookings();
