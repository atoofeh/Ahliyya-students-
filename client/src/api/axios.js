import axios from 'axios';
import { getDeviceId, getFingerprint } from './fingerprint';
import { getAccessToken, setAccessToken, clearAccessToken } from './token';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // refresh token cookie
  headers: { 'Content-Type': 'application/json' },
});

let fingerprint = null;
getFingerprint().then((fp) => { fingerprint = fp; });

const deviceHeaders = () => ({
  'x-device-id': getDeviceId(),
  ...(fingerprint && { 'x-fingerprint': fingerprint }),
  'x-client-platform': 'web',
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  Object.assign(config.headers, deviceHeaders());
  return config;
});

/**
 * Exchange the httpOnly refresh cookie for a new access token. Uses a bare
 * axios call (not `api`) so the response interceptor cannot recurse.
 * A single in-flight refresh is shared by concurrent callers.
 */
let refreshing = null;
export const refreshAccessToken = () => {
  if (!refreshing) {
    refreshing = axios
      .post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true, headers: deviceHeaders() })
      .then(({ data }) => { setAccessToken(data.accessToken); return data; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

/** On page load: try the cookie; resolve the user or null. */
export const bootstrapSession = async () => {
  try {
    const { user } = await refreshAccessToken();
    return user;
  } catch {
    clearAccessToken();
    return null;
  }
};

const hardLogout = (reason) => {
  clearAccessToken();
  localStorage.removeItem('lms_user');
  if (reason) sessionStorage.setItem('lms_logout_reason', reason);
  if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
};

const SESSION_END_MESSAGES = {
  SESSION_TERMINATED: 'Your session has ended. Please sign in again.',
  SESSION_INACTIVE: 'You were signed out due to inactivity.',
  TOKEN_REVOKED: 'Your session has ended. Please sign in again.',
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.code;
    const status = error.response?.status;

    if (status === 401 && SESSION_END_MESSAGES[code]) {
      hardLogout(SESSION_END_MESSAGES[code]);
      return Promise.reject(error);
    }

    if (status === 401 && code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      try {
        const data = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        hardLogout('Your session expired. Please sign in again.');
        return Promise.reject(refreshErr);
      }
    }

    if (status === 401 && !original.url?.includes('/auth/login')) {
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
