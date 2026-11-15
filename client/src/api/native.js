/**
 * The only module in the client that talks to Capacitor.
 *
 * Everything else asks this module questions, so the web build keeps working
 * unchanged: `isNative` is false in a browser and every call below short-circuits
 * to the web behaviour.
 *
 * `LmsNative` is implemented in the Android and iOS app projects:
 *   secureSet/secureGet/secureRemove — Keychain on iOS; AndroidKeyStore on Android
 *   deviceId                        — stable, hashed platform identity
 *   openFile                        — opens a cached file in the native document viewer
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const LmsNative = registerPlugin('LmsNative');

export const isNative = Capacitor.isNativePlatform();

/**
 * The Windows app, which is a hardened window onto this same site rather than
 * a packaged copy of it. Its preload sets `__fekerDesktop` before any of this
 * runs; nothing else on the web can forge a value the server trusts, because
 * the only thing it carries is a device id, and a device id is a claim the
 * server already treats as unproven until the session is bound to it.
 *
 * It is deliberately *not* native: `isNative` stays false, so the refresh
 * token remains an httpOnly cookie — correct here, because the app loads the
 * real origin and gets the real cookie jar — and the multi-device exception
 * that iOS and Android carry does not apply. A desktop binding occupies the
 * student's one device slot, which is exactly what it is for.
 */
export const desktop = (typeof window !== 'undefined' && window.__fekerDesktop) || null;
export const isDesktop = !!desktop;

/** The value sent as `x-client-platform`; the server grants native clients a refresh-token body copy. */
export const platformName = () => {
  if (isNative) return Capacitor.getPlatform();
  return isDesktop ? 'windows' : 'web';
};

/**
 * Refresh tokens on native live in the platform secure store, never in web storage.
 * On web these are no-ops — the refresh token is an httpOnly cookie the page cannot read.
 */
export const secure = {
  async get(key) {
    if (!isNative) return null;
    try {
      const { value } = await LmsNative.secureGet({ key });
      return value || null;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    if (!isNative || !value) return;
    try { await LmsNative.secureSet({ key, value }); } catch { /* storage unavailable — session simply won't survive a cold start */ }
  },
  async remove(key) {
    if (!isNative) return;
    try { await LmsNative.secureRemove({ key }); } catch { /* nothing to remove */ }
  },
};

/** Reinstall-stable, hashed native device id. The raw platform id never crosses the bridge. */
export const nativeDeviceId = async () => {
  const { id } = await LmsNative.deviceId();
  return id;
};

/** Hand a downloaded file to the system viewer. Native only. */
export const openFile = (path, mime) => LmsNative.openFile({ path, mime });

/**
 * Open this app's notification settings after notification permission is denied.
 */
export const openNotificationSettings = async () => {
  if (!isNative) return false;
  try {
    await LmsNative.openNotificationSettings();
    return true;
  } catch {
    return false;
  }
};

export default LmsNative;
