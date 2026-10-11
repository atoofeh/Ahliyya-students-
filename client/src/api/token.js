/**
 * The access token lives only in memory. Nothing token-related is ever written
 * to web storage.
 *
 * Where the *refresh* token lives depends on the platform:
 *   web     — an httpOnly cookie the page cannot read
 *   native  — the platform secure store, via the LmsNative plugin (see native.js)
 */
import { secure } from './native';

const REFRESH_KEY = 'lms_refresh_token';

let accessToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => { accessToken = token || null; };
export const clearAccessToken = () => { accessToken = null; };

/**
 * Native only — the web client never receives a refresh token in JavaScript.
 *
 * Where it lives depends on "Remember me":
 *   ticked   -> the Keystore, so a cold app start signs back in
 *   unticked -> this module variable: alive while the app process is alive,
 *               gone when the app is closed — which is what unticked means
 *
 * Rotation calls saveRefreshToken without options and keeps the current home.
 * After a cold start the token can only have come from the Keystore, so reading
 * it from there restores the persistent mode for subsequent rotations.
 */
let memoryRefreshToken = null;
let persisted = false;

export const saveRefreshToken = async (token, { persist } = {}) => {
  if (persist !== undefined) persisted = !!persist;
  if (persisted) {
    memoryRefreshToken = null;
    await secure.set(REFRESH_KEY, token);
  } else {
    memoryRefreshToken = token;
    // An older remembered login must not resurrect a session the user chose
    // not to keep.
    await secure.remove(REFRESH_KEY);
  }
};

export const readRefreshToken = async () => {
  if (memoryRefreshToken) return memoryRefreshToken;
  const stored = await secure.get(REFRESH_KEY);
  if (stored) persisted = true;
  return stored;
};

export const clearRefreshToken = async () => {
  memoryRefreshToken = null;
  persisted = false;
  await secure.remove(REFRESH_KEY);
};

// Remove tokens persisted by earlier versions of the client.
try {
  localStorage.removeItem('lms_access_token');
  localStorage.removeItem('lms_refresh_token');
} catch { /* storage unavailable */ }
