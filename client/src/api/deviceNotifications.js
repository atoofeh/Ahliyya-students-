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
import { isNative, openNotificationSettings } from './native';

let plugin = null;
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
 * What the phone will currently do with a notification.
 *
 *   'unsupported' — the web, or a platform without the plugin
 *   'granted'     — notifications appear
 *   'prompt'      — the system will still ask if we request it
 *   'denied'      — the system will not ask again; only settings can fix it
 */
export const notificationState = async () => {
  if (!isNative) return 'unsupported';
  try {
    await load();
    const { display } = await plugin.checkPermissions();
    if (display === 'granted') return 'granted';
    if (display === 'denied') return 'denied';
    return 'prompt';
  } catch (err) {
    console.warn('[notifications] could not read the permission state', err);
    return 'unsupported';
  }
};

/**
 * Ask the system for permission. Only ever call this from something the user
 * just tapped — a cold dialog 30 seconds after sign-in is missed or dismissed,
 * and Android never asks twice.
 */
export const requestNotificationPermission = async () => {
  if (!isNative) return 'unsupported';
  try {
    await load();
    const { display } = await plugin.requestPermissions();
    if (display === 'granted') return 'granted';
    return display === 'denied' ? 'denied' : 'prompt';
  } catch (err) {
    console.warn('[notifications] permission request failed', err);
    return 'denied';
  }
};

/** Send the user to the system screen where a refusal can be undone. */
export const openSystemNotificationSettings = openNotificationSettings;

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
 * Post one phone notification per item.
 *
 * Returns true only when the phone actually accepted them, so the caller can
 * decide whether these items count as announced. It never asks for permission:
 * an alert that arrives while permission is still missing must be left for the
 * next poll rather than triggering a dialog out of nowhere.
 */
export const notifyOnDevice = async (items) => {
  if (!isNative || !items?.length) return false;
  if ((await notificationState()) !== 'granted') return false;
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
    return true;
  } catch (err) {
    console.warn('[notifications] could not post to the phone', err);
    return false;
  }
};
