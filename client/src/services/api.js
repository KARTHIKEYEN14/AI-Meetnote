import axios from 'axios';

/**
 * Central Axios instance.
 * - Base URL is '/api' — Vite proxy forwards this to http://localhost:5000/api
 * - Automatically attaches the JWT token on every request if present in localStorage
 * - Automatically clears stale token on 401 responses
 */
const api = axios.create({
  // In production (Vercel), use VITE_API_URL (e.g. https://your-app.onrender.com)
  // In local dev, use /api — Vite proxy forwards it to localhost:5000
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach JWT ─────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor — handle 401 globally ───────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired — clear it so the user is redirected to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
