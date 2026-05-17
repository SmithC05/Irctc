// =============================================================================
// NammaRail — Auth API Calls
// =============================================================================

import api from './axios';

/**
 * Register a new user account.
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns Promise<{ message, userId }>
 */
export const register = (name, email, password) =>
  api.post('/auth/register', { name, email, password });

/**
 * Log in with email and password.
 * @returns Promise<{ token, user: { id, name, email } }>
 */
export const login = (email, password) =>
  api.post('/auth/login', { email, password });

/**
 * Fetch the profile of the currently authenticated user.
 * The Authorization header is added automatically by the Axios interceptor.
 * @returns Promise<{ user: { id, name, email } }>
 */
export const getMe = () =>
  api.get('/auth/me');
