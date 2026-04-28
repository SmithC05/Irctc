import pool from '../config/database';

export const searchTrains = async (source: string, destination: string) => {
    // We use parameterized queries ($1, $2) to prevent SQL Injection attacks
    const query = `
        SELECT id, train_number, train_name, source, destination, total_seats, available_seats 
        FROM trains 
        WHERE source = $1 AND destination = $2
    `;
    const values = [source, destination];
    
    const result = await pool.query(query, values);
    return result.rows; // Returns an array of matching trains
};