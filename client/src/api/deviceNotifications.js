/**
 * Phone notifications.
 *
 * When the app is running on Android, a new in-app notification is also raised
 * in the phone's own notification shade, so a teacher sees a question arrive
 * without watching the bell. This is the platform's *local* notification API —
 * the app itself posts the notification; nothing is sent through a third party.
 *
 * Honest limit: this only fires while the app process is alive (open, or in the
 * background before Android stops it). Notifications that arrive with the app
 * fully closed need Firebase Cloud Messaging, which requires a Google project —
 * see docs/ANDROID.md.
 *
 * On the web this module is inert: every function returns immediately.
 */
import { isNative } from './native';

let plugin = null;
let permission = null; // null = not asked yet, true/false = answered
let navigateTo = null;

/** Loaded only on a device, so the web bundle never carries the plugin. */
const load = async () => {
  if (plugin) return plugin;
  const mod = await import('@capacitor/local-notifications');
  plugin = mod.LocalNotifications;
  return plugin;
};

/**
 * Ask once for permission to post notifications (Android 13+ requires it).
 * A refusal is remembered for the session and never nags again.
 */
export const ensurePermission = async () => {
  if (!isNative) return false;
  if (permission !== null) return permission;
  try {
    const ln = await load();
    const current = await ln.checkPermissions();
    const status = current.display === 'granted'
      ? current
      : await ln.requestPermissions();
    permission = status.display === 'granted';
    return permission;
  } catch {
    permission = false;
    return false;
  }
};

/**
 * Route a tapped notification into the app. MainLayout passes react-router's
 * navigate here; until it does, taps just open the app.
 */
export const onNotificationTap = async (navigate) => {
  if (!isNative) return () => {};
  navigateTo = navigate;
  try {
    const ln = await load();
    const handle = await ln.addListener('localNotificationActionPerformed', (event) => {
      const link = event?.notification?.extra?.link;
      if (link && navigateTo) navigateTo(link);
    });
    return () => handle.remove();
  } catch {
    return () => {};
  }
};

/** Android notification ids must be 32-bit ints; derive one from the record id. */
const idFor = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % 2147483647;
};

/**
 * Post one phone notification per item. Silently does nothing on the web, or
 * when the user declined the permission.
 */
export const notifyOnDevice = async (items) => {
  if (!isNative || !items?.length) return;
  if (!(await ensurePermission())) return;
  try {
    const ln = await load();
    await ln.schedule({
      notifications: items.slice(0, 5).map((n) => ({
        id: idFor(String(n._id)),
        title: n.title,
        body: n.body || '',
        extra: { link: n.link || null },
      })),
    });
  } catch { /* a failed notification must never break the app */ }
};
