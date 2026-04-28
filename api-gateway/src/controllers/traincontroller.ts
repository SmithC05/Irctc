import { Request, Response } from 'express';
import { searchTrains } from '../services/trainservice';

export const getTrains = async (req: Request, res: Response): Promise<void> => {
    try {
        // Extract search parameters from the query string (e.g., ?source=Madurai&destination=Chennai)
        const { source, destination } = req.query;

        if (!source || !destination) {
            res.status(400).json({ status: 'error', message: 'Source and destination are required' });
            return;
        }

        const trains = await searchTrains(source as string, destination as string);

        res.status(200).json({
            status: 'success',
            results: trains.length,
            data: trains
        });
    } catch (error) {
        console.error('Error fetching trains:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};