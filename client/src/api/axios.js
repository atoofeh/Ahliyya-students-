import axios from 'axios';
import { getFingerprint, resolveDeviceId, currentDeviceId } from './fingerprint';
import {
  getAccessToken, setAccessToken, clearAccessToken,
  saveRefreshToken, readRefreshToken, clearRefreshToken,
} from './token';
import { isNative, platformName } from './native';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  // Web relies on the httpOnly refresh cookie. Native does not: the WebView runs on
  // its own origin, so the refresh token travels in the body from the Keystore.
  withCredentials: !isNative,
  headers: { 'Content-Type': 'application/json' },
});

let fingerprint = null;

/**
 * Device identity has to exist before the first request — the server binds the
 * session to `x-device-id`. Resolved once; every request waits on this promise,
 * which is already settled after the first call.
 */
const identityReady = Promise.all([
  resolveDeviceId(),
  getFingerprint().then((fp) => { fingerprint = fp; }).catch(() => {}),
]);

const deviceHeaders = () => ({
  'x-device-id': currentDeviceId(),
  ...(fingerprint && { 'x-fingerprint': fingerprint }),
  'x-client-platform': platformName(),
  'x-app-version': __APP_VERSION__,
});

api.interceptors.request.use(async (config) => {
  await identityReady;
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  Object.assign(config.headers, deviceHeaders());
  return config;
});

/**
 * Exchange the refresh token for a new access token. Uses a bare axios call
 * (not `api`) so the response interceptor cannot recurse. A single in-flight
 * refresh is shared by concurrent callers.
 *
 * Web: the httpOnly cookie travels automatically and the body is empty.
 * Native: the token comes out of the Keystore, and the rotated one goes back in.
 */
let refreshing = null;
export const refreshAccessToken = () => {
  if (!refreshing) {
    refreshing = identityReady
      .then(() => (isNative ? readRefreshToken() : null))
      .then((stored) => {
        if (isNative && !stored) throw new Error('No stored session');
        return axios.post(
          `${API_BASE}/auth/refresh`,
          isNative ? { refreshToken: stored } : {},
          { withCredentials: !isNative, headers: deviceHeaders() }
        );
      })
      .then(async ({ data }) => {
        setAccessToken(data.accessToken);
        if (isNative && data.refreshToken) await saveRefreshToken(data.refreshToken);
        return data;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

/** On app start: try the stored session; resolve the user or null. */
export const bootstrapSession = async () => {
  try {
    const { user } = await refreshAccessToken();
    return user;
  } catch {
    clearAccessToken();
    if (isNative) await clearRefreshToken();
    return null;
  }
};

const hardLogout = (reason) => {
  clearAccessToken();
  clearRefreshToken();
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
