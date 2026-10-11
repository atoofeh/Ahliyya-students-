/**
 * Notifications that arrive while the app is closed.
 *
 * The local-notification path in deviceNotifications.js can only fire while
 * the app is running — it is the app that posts them. This is the other half:
 * the phone registers with Firebase, the server pushes to that address, and
 * Android draws the notification whether or not the app is alive.
 *
 * The two must not both fire for the same event, so once push is registered
 * the poll stops raising local notifications and the only foreground one comes
 * from `pushNotificationReceived` below — Android does not display a push while
 * the app is in the foreground, so something has to.
 *
 * Inert on the web, and inert on a device the server has no Firebase
 * credentials for: registration simply never completes and nothing changes.
 */
import api from './axios';
import { isNative, platformName } from './native';
import { notifyOnDevice } from './deviceNotifications';

let plugin = null;
let registeredToken = null;
let navigateTo = null;
let listeners = [];

/**
 * Loads the plugin into `plugin` and returns nothing — a Capacitor plugin is a
 * Proxy that answers every property including `then`, so resolving a promise
 * with one makes the runtime call `PushNotifications.then()` natively and the
 * promise never settles. See deviceNotifications.js for the same trap.
 */
const load = async () => {
  if (plugin) return;
  const mod = await import('@capacitor/push-notifications');
  plugin = mod.PushNotifications;
};

/** True once this phone has an address the server can push to. */
export const isPushRegistered = () => !!registeredToken;

/**
 * Register this phone with Firebase and hand the address to the server.
 *
 * Only call this once notifications are permitted — registering without the
 * permission yields a token that can never deliver anything.
 */
export const registerForPush = async (navigate) => {
  // iOS exposes an APNs token here, while this backend expects an FCM token.
  // Avoid registering an unusable token. iOS still uses local notifications.
  if (!isNative || platformName() !== 'android' || registeredToken) return false;
  navigateTo = navigate || navigateTo;

  try {
    await load();

    // The channel the manifest names as Firebase's default and the server
    // sends as channel_id. Created here so it exists before the first message.
    await plugin.createChannel({
      id: 'default',
      name: 'Course activity',
      description: 'Questions, replies and course announcements',
      importance: 4, // heads-up
      visibility: 1,
    }).catch(() => { /* older Android has no channels */ });

    listeners.push(await plugin.addListener('registration', async ({ value }) => {
      if (!value || value === registeredToken) return;
      try {
        await api.post('/notifications/push-token', { token: value, platform: 'android' });
        registeredToken = value;
      } catch {
        // The server may not have Firebase configured; the local path stays.
      }
    }));

    listeners.push(await plugin.addListener('registrationError', (err) => {
      console.warn('[push] registration failed', err);
    }));

    // Arrives only while the app is in the foreground; Android draws nothing
    // in that case, so raise it ourselves and keep one behaviour everywhere.
    listeners.push(await plugin.addListener('pushNotificationReceived', (n) => {
      notifyOnDevice([{
        _id: n.id || String(Date.now()),
        title: n.title || n.data?.title || 'New activity',
        body: n.body || n.data?.body || '',
        link: n.data?.link || null,
      }]);
    }));

    // A tap while the app was closed or in the background.
    listeners.push(await plugin.addListener('pushNotificationActionPerformed', (event) => {
      const link = event?.notification?.data?.link;
      if (link && navigateTo) navigateTo(link);
    }));

    await plugin.register();
    return true;
  } catch (err) {
    console.warn('[push] could not register this device', err);
    return false;
  }
};

/** Stop pushing to this phone — on sign-out. */
export const unregisterPush = async () => {
  const token = registeredToken;
  registeredToken = null;
  for (const l of listeners) { try { await l.remove(); } catch { /* already gone */ } }
  listeners = [];
  if (!token) return;
  try {
    await api.delete('/notifications/push-token', { data: { token } });
  } catch { /* signing out matters more than tidying the token */ }
};
