import { Router } from 'express';
import { getTrains } from '../controllers/traincontroller';

const router = Router();

// Define the route: GET /api/trains
router.get('/', getTrains);

export default router;