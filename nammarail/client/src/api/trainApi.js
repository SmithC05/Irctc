// =============================================================================
// NammaRail — Train API Calls
// =============================================================================
// All train-related HTTP calls in one place.
// Importing from a single module means: if the endpoint changes,
// we edit one file, not every component that uses it.
// =============================================================================

import api from './axios';

/**
 * Search for trains between two stations on a given date.
 * @param {string} from      - Origin station code (e.g. "MAS")
 * @param {string} to        - Destination station code (e.g. "CBE")
 * @param {string} date      - Journey date in YYYY-MM-DD format
 * @param {string} classCode - Class filter: "SL", "3A", "2A", "1A", "CC" or "" for all
 */
export const searchTrains = (from, to, date, classCode) =>
  api.get('/trains/search', {
    params: { from, to, date, class: classCode || undefined },
  });

/**
 * Fetch full schedule, halt stations, and per-class availability for a train.
 * @param {number|string} trainNumber - Train number (e.g. 12673)
 * @param {string} from  - From station code (for fare lookup)
 * @param {string} to    - To station code (for fare lookup)
 * @param {string} date  - Journey date (for availability check)
 */
export const getTrainDetails = (trainNumber, from, to, date) =>
  api.get(`/trains/${trainNumber}`, {
    params: { from, to, date },
  });
