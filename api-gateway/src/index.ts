import express from 'express';
import cors from 'cors';
import pool from './config/database';
import dotenv from 'dotenv';
import trainRoutes from './routes/trainroutes'; // <-- Import the new routes

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Mount the train routes under /api/trains
app.use('/api/trains', trainRoutes); // <-- Mount the router

// Health Check Route
app.get('/api/health', async (req, res) => {
    // ... existing health check code ...
    try {
        const dbResult = await pool.query('SELECT NOW() AS current_time');
        res.status(200).json({ status: 'success', database_time: dbResult.rows[0].current_time });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API Gateway running on http://localhost:${PORT}`);
});