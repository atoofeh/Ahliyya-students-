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

/**
 * Loads the plugin into `plugin`, and deliberately returns nothing.
 *
 * A Capacitor plugin is a Proxy that answers *every* property access with a
 * native call — `then` included. Resolving a promise with it therefore makes
 * the runtime treat it as a thenable and invoke `LocalNotifications.then()` on
 * the native side, which does not exist: the promise never settles and every
 * `await` behind it hangs for ever, with nothing thrown and nothing logged.
 * So the proxy stays out of promise values: callers `await load()` and then
 * read the module-level `plugin`.
 *
 * Importing dynamically also keeps the plugin out of the web bundle.
 */
const load = async () => {
  if (plugin) return;
  const mod = await import('@capacitor/local-notifications');
  plugin = mod.LocalNotifications;
};

/**
 * Ask once for permission to post notifications (Android 13+ requires it).
 * A refusal is remembered for the session and never nags again.
 */
export const ensurePermission = async () => {
  if (!isNative) return false;
  if (permission !== null) return permission;
  try {
    await load();
    const current = await plugin.checkPermissions();
    const status = current.display === 'granted' ? current : await plugin.requestPermissions();
    permission = status.display === 'granted';
    return permission;
  } catch (err) {
    console.warn('[notifications] permission check failed', err);
    permission = false;
    return false;
  }
};

/**
 * Route a tapped notification into the app. NotificationsBell passes
 * react-router's navigate here; until it does, taps just open the app.
 */
export const onNotificationTap = async (navigate) => {
  if (!isNative) return () => {};
  navigateTo = navigate;
  try {
    await load();
    const handle = await plugin.addListener('localNotificationActionPerformed', (event) => {
      const link = event?.notification?.extra?.link;
      if (link && navigateTo) navigateTo(link);
    });
    return () => handle.remove();
  } catch (err) {
    console.warn('[notifications] tap listener not registered', err);
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
 * Post one phone notification per item. Does nothing on the web, or when the
 * user declined the permission. A failure here must never break the app, but it
 * is logged rather than swallowed: a silent notification failure is invisible
 * from the outside and very hard to find later.
 */
export const notifyOnDevice = async (items) => {
  if (!isNative || !items?.length) return;
  if (!(await ensurePermission())) return;
  try {
    await load();
    await plugin.schedule({
      notifications: items.slice(0, 5).map((n) => ({
        id: idFor(String(n._id)),
        title: n.title,
        body: n.body || '',
        extra: { link: n.link || null },
      })),
    });
  } catch (err) {
    console.warn('[notifications] could not post to the phone', err);
  }
};
