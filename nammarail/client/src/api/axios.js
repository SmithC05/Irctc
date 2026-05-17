// =============================================================================
// NammaRail — Axios Instance
// =============================================================================
//
// WHAT IS AN INTERCEPTOR?
// ─────────────────────────────────────────────────────────────────────────────
// An interceptor is a function that runs automatically on EVERY request or
// response, before it reaches your component.
//
// Without interceptors:
//   Every API call would need to manually add the Authorization header:
//     axios.get('/bookings', { headers: { Authorization: `Bearer ${token}` } })
//   Repeat this in 20 files → bug-prone and tedious.
//
// With a request interceptor:
//   Write the header logic ONCE here. Every API call gets it automatically.
//   Your component code becomes: api.get('/bookings')  ← clean and simple.
//
// With a response interceptor:
//   Catch 401 Unauthorized responses in ONE place, clear auth, redirect to login.
//   Without it, you'd need a try/catch in every API call to handle expired tokens.
// =============================================================================

import axios from 'axios';

// Create a custom Axios instance with the backend's base URL baked in.
// All calls using this instance automatically prefix /api to the path.
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor ──────────────────────────────────────────────────────
// Runs before EVERY outgoing request.
// Reads the token from localStorage and attaches it as a Bearer token.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('nammarail_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor ─────────────────────────────────────────────────────
// Runs after EVERY response comes back from the server.
// If the server returns 401 (token expired or invalid), we:
//   1. Clear localStorage (wipe the stale token and user)
//   2. Redirect to /login so the user can authenticate again
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token is expired or invalid — force logout.
      localStorage.removeItem('nammarail_token');
      localStorage.removeItem('nammarail_user');
      // Redirect to login page. We use window.location instead of React Router
      // because this interceptor lives outside the React component tree and
      // has no access to the useNavigate hook.
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
