'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only thing the page learns from the desktop app.
 *
 * `fingerprint.js` prefers this device id over the random one it keeps in
 * browser storage, and `native.js` reports the platform as `windows` so the
 * server records the binding honestly in the platform device list.
 *
 * It is read synchronously, before the page's own scripts run, because the
 * web client reads the device id synchronously when it builds its first
 * request headers. One blocking call at startup is the cost of not having to
 * make every caller asynchronous.
 *
 * Nothing else crosses: no file access, no shell, no Node. The refresh token
 * stays an httpOnly cookie that neither this bridge nor the page can read,
 * exactly as on the web.
 */
let deviceId = null;
try {
  deviceId = ipcRenderer.sendSync('feker:device-id');
} catch {
  // The page falls back to its own browser-storage id, which still signs in.
  deviceId = null;
}

contextBridge.exposeInMainWorld('__fekerDesktop', Object.freeze({
  platform: 'windows',
  deviceId,
  version: process.versions.electron,
}));
