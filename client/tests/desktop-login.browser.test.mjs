/** Actual AuthProvider login against intercepted APIs; no production accounts. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const machine = 'ab'.repeat(32);
const legacy = 'ef2f8942-6219-46db-a20e-831d69f0c746';
const user = { id: 'fixture-student-id', name: 'Desktop Fixture Student', username: 'fixture-student', role: 'student' };
const entry = `import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '/src/context/AuthContext.jsx';
import { useAuth } from '/src/hooks/useAuth.js';
import api from '/src/api/axios.js';
function LoginFixture() {
  const { login, user, loading } = useAuth();
  const [status, setStatus] = useState('ready');
  const signIn = async () => {
    try {
      await login('fixture-student', 'Fixture@12345', true);
      await api.get('/auth/me');
      setStatus('complete');
    } catch (error) { setStatus('failed: ' + error.message); }
  };
  return <><button disabled={loading} onClick={signIn}>Sign in fixture</button>
    <output data-testid="status">{status}</output>
    <output data-testid="user">{user?.name || ''}</output></>;
}
createRoot(document.getElementById('root')).render(<AuthProvider><LoginFixture /></AuthProvider>);`;

let server;
let browser;
let origin;

before(async () => {
  server = await createServer({
    root: clientRoot, configFile: path.join(clientRoot, 'vite.config.js'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__desktop-login-api') },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [{
      name: 'desktop-login-test',
      resolveId(id) { if (id === '/__desktop-login.jsx') return id; },
      load(id) { if (id === '/__desktop-login.jsx') return entry; },
    }],
  });
  await server.listen();
  origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (!executablePath && process.platform === 'win32') {
    const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    try { await access(chrome); executablePath = chrome; } catch { /* use Playwright's browser */ }
  }
  browser = await chromium.launch({ headless: true, executablePath });
});

after(async () => { await browser?.close(); await server?.close(); });

test('Windows AuthProvider offers the legacy credential only during login while all requests use canonical identity', { timeout: 60000 }, async (context) => {
  const browserContext = await browser.newContext();
  context.after(() => browserContext.close());
  const state = { requests: [], errors: [], unknown: [] };
  await browserContext.addInitScript(({ machine, legacy }) => {
    window.__fekerDesktop = Object.freeze({ platform: 'windows', deviceId: machine, version: 'fixture' });
    localStorage.setItem('lms_device_id', legacy);
    // Track writes after fixture setup to catch any accidental UUID replacement.
    window.__identityWrites = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.__identityWrites.push({ key, value });
      return setItem.call(this, key, value);
    };
  }, { machine, legacy });
  await browserContext.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/__desktop-login') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div>
      <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script>
      <script type="module" src="/__desktop-login.jsx"></script>` });
    if (!url.pathname.startsWith('/__desktop-login-api/')) return route.continue();
    const endpoint = url.pathname.slice('/__desktop-login-api'.length);
    state.requests.push({ endpoint, method: request.method(), headers: request.headers(), body: request.postDataJSON() });
    if (endpoint === '/auth/refresh') return route.fulfill({ status: 401, json: { code: 'NO_REFRESH', message: 'Fixture has no prior session' } });
    if (endpoint === '/auth/login') return route.fulfill({ json: { accessToken: 'synthetic-desktop-access-token', user } });
    if (endpoint === '/auth/me') return route.fulfill({ json: user });
    state.unknown.push(endpoint);
    return route.fulfill({ status: 500, json: { message: 'Unexpected fixture API request' } });
  });
  const page = await browserContext.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  await page.goto(`${origin}/__desktop-login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sign in fixture', exact: true }).click();
  await page.getByTestId('status').filter({ hasText: /^complete$/ }).waitFor();
  assert.equal(await page.getByTestId('user').textContent(), user.name);

  const refresh = state.requests.find((request) => request.endpoint === '/auth/refresh');
  const login = state.requests.find((request) => request.endpoint === '/auth/login');
  const me = state.requests.find((request) => request.endpoint === '/auth/me');
  assert.ok(refresh && login && me, 'actual bootstrap, login and authenticated request all run');
  assert.deepEqual(login.body, {
    username: 'fixture-student', password: 'Fixture@12345', rememberMe: true,
    deviceId: machine, fingerprint: login.body.fingerprint, desktopLegacyDeviceId: legacy,
  });
  assert.match(login.body.fingerprint, /^[0-9a-f]{32}$/);
  for (const request of state.requests) {
    assert.equal(request.headers['x-device-id'], machine, `${request.endpoint} must use canonical identity`);
    assert.equal(request.headers['x-client-platform'], 'windows');
  }
  assert.equal(me.headers.authorization, 'Bearer synthetic-desktop-access-token');
  assert.equal(me.body, null, 'legacy identity is not attached to later authenticated requests');
  const stored = await page.evaluate(() => ({
    legacy: localStorage.getItem('lms_device_id'), writes: window.__identityWrites,
    tokenKeys: Object.keys(localStorage).filter((key) => /token/i.test(key)),
  }));
  assert.equal(stored.legacy, legacy);
  assert.ok(stored.writes.every((write) => write.key !== 'lms_device_id'), 'login does not replace legacy storage');
  assert.deepEqual(stored.tokenKeys, [], 'desktop credentials do not create web-storage tokens');
  assert.deepEqual(state.unknown, []);
  assert.deepEqual(state.errors, []);
});
