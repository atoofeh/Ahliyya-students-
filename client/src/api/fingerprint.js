/**
 * Stable device identity for the single-device policy.
 * - deviceId: web — a random UUID persisted in localStorage (per browser profile);
 *             native  — a platform identifier hashed inside the native plugin so
 *             the raw platform id never crosses the bridge. It survives a reinstall,
 *             so reinstalling the app does not require an admin device reset.
 * - fingerprint: hash of environment characteristics, sent with every request so
 *   the server can flag token theft across differing environments.
 */
import { isNative, nativeDeviceId, desktop } from './native';

/**
 * Web device id. Kept synchronous — several callers rely on it.
 *
 * The Windows app answers first and answers from the machine, so clearing
 * site data or reinstalling does not hand the student a new identity and lock
 * them out of their own account until an administrator resets it. That is the
 * same reason the phones derive theirs from a platform id rather than from
 * storage. Everywhere else this is a random id, per browser profile.
 */
export function getDeviceId() {
  if (desktop?.deviceId) return desktop.deviceId;
  let id = localStorage.getItem('lms_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('lms_device_id', id);
  }
  return id;
}

/**
 * Older desktop pages registered a profile UUID before reading the native
 * bridge. Offer that existing credential during Windows login so the server
 * can verify and migrate the binding without changing the canonical identity.
 */
export function legacyDesktopDeviceId() {
  if (isNative || desktop?.platform !== 'windows'
    || typeof desktop.deviceId !== 'string' || !/^[0-9a-f]{64}$/i.test(desktop.deviceId)) return undefined;
  try {
    const previous = localStorage.getItem('lms_device_id');
    return typeof previous === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(previous)
      ? previous : undefined;
  } catch {
    return undefined;
  }
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
