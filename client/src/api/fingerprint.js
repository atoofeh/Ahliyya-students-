/**
 * Stable device identity for the single-device policy.
 * - deviceId: web — a random UUID persisted in localStorage (per browser profile);
 *             native  — a platform identifier hashed inside the native plugin so
 *             the raw platform id never crosses the bridge. It survives a reinstall,
 *             so reinstalling the app does not require an admin device reset.
 * - fingerprint: hash of environment characteristics, sent with every request so
 *   the server can flag token theft across differing environments.
 */
import { isNative, nativeDeviceId } from './native';

/** Web device id. Kept synchronous — several callers rely on it. */
export function getDeviceId() {
  let id = localStorage.getItem('lms_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('lms_device_id', id);
  }
  return id;
}

let resolvedDeviceId = null;

/**
 * The device id for this platform. Async because the native id comes from the
 * plugin; resolved once and cached for the life of the process.
 */
export async function resolveDeviceId() {
  if (resolvedDeviceId) return resolvedDeviceId;
  if (!isNative) {
    resolvedDeviceId = getDeviceId();
    return resolvedDeviceId;
  }
  try {
    resolvedDeviceId = await nativeDeviceId();
  } catch {
    // The plugin should always answer; if it cannot, fall back to web storage so
    // the user can still sign in (they may need an admin device reset later).
    resolvedDeviceId = getDeviceId();
  }
  return resolvedDeviceId;
}

/** The already-resolved id, or null before the first resolve. */
export const currentDeviceId = () => resolvedDeviceId;

let cachedFingerprint = null;

export async function getFingerprint() {
  if (cachedFingerprint) return cachedFingerprint;
  const parts = [
    navigator.userAgent,
    navigator.language,
    navigator.hardwareConcurrency,
    screen.width, screen.height, screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.platform || '',
    navigator.maxTouchPoints,
  ];

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(10, 10, 100, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('lms-fingerprint', 2, 15);
    parts.push(canvas.toDataURL());
  } catch { /* canvas blocked — fingerprint still works from other signals */ }

  const data = new TextEncoder().encode(parts.join('||'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  cachedFingerprint = Array.from(new Uint8Array(digest)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return cachedFingerprint;
}
