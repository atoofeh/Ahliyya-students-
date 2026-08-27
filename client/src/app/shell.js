/**
 * Native shell wiring: hardware back button, keyboard, system bars, splash.
 * Every export is a no-op in a browser, so callers never branch.
 *
 * The plugin modules are imported dynamically inside installShell(): the web
 * bundle must not carry Android-only code it will never execute.
 */
import { registerPlugin } from '@capacitor/core';
import { isNative } from '../api/native';

const SystemBars = registerPlugin('SystemBars');

/**
 * Layers that must swallow the back gesture before it navigates: open modals,
 * the mobile curriculum sheet, and anything else that covers the page. Each
 * caller pushes a closer and removes it on unmount; the newest one wins.
 */
const backLayers = [];

export function pushBackHandler(close) {
  backLayers.push(close);
  return () => {
    const i = backLayers.indexOf(close);
    if (i >= 0) backLayers.splice(i, 1);
  };
}

let lastBackPress = 0;

/**
 * @param {object} deps
 * @param {() => void} deps.onExitHint  shown when the next back press will close the app
 * @returns {() => void} teardown
 */
export function installShell({ onExitHint } = {}) {
  if (!isNative) return () => {};

  const subscriptions = [];
  let torn = false;
  const track = (promise) => promise.then((handle) => {
    if (torn) handle?.remove?.();
    else subscriptions.push(handle);
  }).catch(() => {});

  (async () => {
    const [{ App }, { Keyboard }, { SplashScreen }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/keyboard'),
      import('@capacitor/splash-screen'),
    ]);

    // Back button: close the topmost layer, else go back, else confirm exit.
    track(App.addListener('backButton', ({ canGoBack }) => {
      if (backLayers.length > 0) {
        backLayers[backLayers.length - 1]();
        return;
      }
      if (canGoBack && window.history.length > 1) {
        window.history.back();
        return;
      }
      const now = Date.now();
      if (now - lastBackPress < 2000) {
        App.exitApp();
        return;
      }
      lastBackPress = now;
      if (onExitHint) onExitHint();
    }));

    // resize:'body' (capacitor.config.json) shrinks the webview, so fixed bottom
    // bars ride above the keyboard; the class drops their gesture-bar padding.
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    track(Keyboard.addListener('keyboardWillShow', () => {
      document.documentElement.classList.add('keyboard-open');
    }));
    track(Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.classList.remove('keyboard-open');
    }));

    SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
  })();

  return () => {
    torn = true;
    subscriptions.forEach((handle) => handle?.remove?.());
    subscriptions.length = 0;
  };
}

/**
 * System-bar icon colour has to invert with the theme: Android draws the app
 * behind the bars (edge-to-edge is mandatory from SDK 35), so the icons sit on
 * top of the page background.
 *   DARK  = light icons, for a dark page
 *   LIGHT = dark icons, for a light page
 */
export function applySystemBarStyle(isDarkTheme) {
  if (!isNative) return;
  const style = isDarkTheme ? 'DARK' : 'LIGHT';
  SystemBars.setStyle({ bar: 'StatusBar', style }).catch(() => {});
  SystemBars.setStyle({ bar: 'NavigationBar', style }).catch(() => {});
}
