import axios from 'axios';
import { getDeviceId, getFingerprint } from './fingerprint';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // refresh token cookie
  headers: { 'Content-Type': 'application/json' },
});

let fingerprint = null;
getFingerprint().then((fp) => { fingerprint = fp; });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lms_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['x-device-id'] = getDeviceId();
  if (fingerprint) config.headers['x-fingerprint'] = fingerprint;
  return config;
});

let refreshing = null;

const hardLogout = (reason) => {
  localStorage.removeItem('lms_access_token');
  localStorage.removeItem('lms_refresh_token');
  localStorage.removeItem('lms_user');
  if (reason) sessionStorage.setItem('lms_logout_reason', reason);
  if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.code;
    const status = error.response?.status;

    // Another device took the session — end it here with a clear message.
    if (status === 401 && (code === 'SESSION_TERMINATED' || code === 'SESSION_INACTIVE')) {
      hardLogout(code === 'SESSION_TERMINATED'
        ? 'Your account was signed in on another device, so this session was ended.'
        : 'You were signed out due to inactivity.');
      return Promise.reject(error);
    }

    if (status === 401 && code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      try {
        refreshing = refreshing || axios.post(
          `${API_BASE}/auth/refresh`,
          { refreshToken: localStorage.getItem('lms_refresh_token') },
          { withCredentials: true, headers: { 'x-device-id': getDeviceId() } }
        );
        const { data } = await refreshing;
        refreshing = null;
        localStorage.setItem('lms_access_token', data.accessToken);
        if (data.refreshToken) localStorage.setItem('lms_refresh_token', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        refreshing = null;
        hardLogout('Your session expired. Please sign in again.');
        return Promise.reject(refreshErr);
      }
    }

    if (status === 401) {
      hardLogout('Your session is invalid. Please sign in again.');
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export const apiError = (err, fallback = 'Something went wrong') => {
  const data = err?.response?.data;
  // Surface field-level validation details instead of a bare "Validation failed".
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors
      .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
      .join(' · ');
  }
  return data?.message || err?.message || fallback;
};

export default api;
