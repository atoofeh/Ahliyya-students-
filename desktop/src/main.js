'use strict';

const { app, BrowserWindow, Menu, session, shell, ipcMain } = require('electron');
const path = require('node:path');
const { deviceId, deviceIdSource } = require('./deviceIdentity');

/**
 * Feker for Windows.
 *
 * A hardened window onto the same site students already use, not a second
 * copy of the application. The page, the API and the login are the website's;
 * what this adds is the three things a browser tab cannot do:
 *
 *   1. Windows excludes the window from screen capture, so a recording or a
 *      screenshot of a lesson comes out blank — the same protection the
 *      Android app gets from FLAG_SECURE, and the one thing no web page can
 *      ask for. This is the reason the app exists.
 *   2. A device id derived from the machine rather than from browser storage,
 *      so clearing data or reinstalling does not lock the student out of
 *      their own account.
 *   3. A window with no developer tools, no view-source, no address bar and
 *      nowhere else to navigate.
 *
 * Loading the live site rather than bundling a copy is deliberate. Every fix
 * to the website reaches every student the next time they open the app, with
 * no new installer to send; the refresh-token cookie works exactly as it does
 * in a browser because the origin is the same; and an LMS needs the network
 * for video and sign-in regardless, so a bundled copy would buy nothing.
 */
const SITE = 'https://students-alahliyaa.com/';
const ORIGIN = new URL(SITE).origin;

/** Pages the app may show. Anything else is someone else's site. */
const isOwnPage = (url) => {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
};

let mainWindow = null;

const showOffline = (win) => {
  win.loadFile(path.join(__dirname, 'offline.html')).catch(() => {});
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#0f172a',
    show: false,
    autoHideMenuBar: true,
    title: 'Feker',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      devTools: false,
      spellcheck: false,
    },
  });

  /**
   * The protection the whole app is for.
   *
   * On Windows 10 2004 and later this is SetWindowDisplayAffinity with
   * WDA_EXCLUDEFROMCAPTURE: the compositor leaves the window out of anything
   * that captures the screen, so a recorder or a screenshot gets an empty
   * rectangle while the student still sees the lesson normally. It covers the
   * window as a whole, so there is nothing for a student to turn off and no
   * part of the page it misses.
   *
   * It does not stop a camera pointed at the screen. Nothing does, which is
   * why the moving watermark stays.
   */
  win.setContentProtection(true);

  // A bare window until the page has painted avoids a white flash on a dark
  // theme, and on a slow connection it avoids showing an empty frame.
  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Nothing opens a second app window. A link to somewhere else is handed
    // to the student's own browser, where it belongs.
    if (!isOwnPage(url) && /^https?:/.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isOwnPage(url)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url).catch(() => {});
  });

  // Developer tools are off in webPreferences; these are the keystrokes that
  // would otherwise reach Chromium's own handlers before that takes effect,
  // plus the two that exist to write the page out to a file.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    const ctrl = input.control || input.meta;
    const blocked = key === 'f12'
      || (ctrl && input.shift && ['i', 'j', 'c'].includes(key))
      || (ctrl && ['u', 'p', 's'].includes(key));
    if (blocked) event.preventDefault();
  });

  win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    // -3 is an aborted load, which a normal in-page navigation produces.
    if (isMainFrame && code !== -3) showOffline(win);
  });

  win.on('closed', () => { mainWindow = null; });

  win.loadURL(SITE).catch(() => showOffline(win));
  return win;
};

/** One window per machine; a second launch raises the first. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // Identifies the app in the platform device list and in the server log,
  // without claiming to be a different browser than it is.
  app.userAgentFallback = `${app.userAgentFallback} FekerDesktop/${app.getVersion()}`;

  ipcMain.on('feker:device-id', (event) => {
    event.returnValue = deviceId(app.getPath('userData'));
  });

  app.whenReady().then(() => {
    // No application menu at all: the default one carries reload, zoom,
    // developer tools and their accelerators.
    Menu.setApplicationMenu(null);

    // The page has no use for the camera, the microphone, the location or
    // anything else behind a permission prompt, so none is ever asked for.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    // A bad certificate is never waved through: the session cookie is the
    // student's account and this app exists to be the careful client.
    app.on('certificate-error', (event, _wc, _url, _error, _cert, callback) => {
      event.preventDefault();
      callback(false);
    });

    mainWindow = createWindow();
    console.log(`[feker] device id source: ${deviceIdSource()}`);
  });

  app.on('window-all-closed', () => app.quit());

  app.on('web-contents-created', (_event, contents) => {
    // Anything the page might create later inherits the same refusals.
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}
