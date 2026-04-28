import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize the Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Enterprise Concurrency Settings:
    max: 20, // Maximum number of connections in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test the connection immediately on startup
pool.on('connect', () => {
    console.log('🔗 Connected to PostgreSQL Database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    process.exit(-1);
});

export default pool;