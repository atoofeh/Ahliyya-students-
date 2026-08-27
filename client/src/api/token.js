/**
 * The access token lives only in memory. Nothing token-related is ever written
 * to web storage.
 *
 * Where the *refresh* token lives depends on the platform:
 *   web     — an httpOnly cookie the page cannot read
 *   android — the AndroidKeyStore, via the LmsNative plugin (see native.js)
 */
import { secure } from './native';

const REFRESH_KEY = 'lms_refresh_token';

let accessToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => { accessToken = token || null; };
export const clearAccessToken = () => { accessToken = null; };

/** Native only — the web client never receives a refresh token in JavaScript. */
export const saveRefreshToken = (token) => secure.set(REFRESH_KEY, token);
export const readRefreshToken = () => secure.get(REFRESH_KEY);
export const clearRefreshToken = () => secure.remove(REFRESH_KEY);

// Remove tokens persisted by earlier versions of the client.
try {
  localStorage.removeItem('lms_access_token');
  localStorage.removeItem('lms_refresh_token');
} catch { /* storage unavailable */ }
