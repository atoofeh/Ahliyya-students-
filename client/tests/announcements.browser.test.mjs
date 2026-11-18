/**
 * Real React announcement composers and send-hook regressions.
 * Run: node --test tests/announcements.browser.test.mjs
 * All requests use synthetic intercepted data; no accounts or live uploads.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=', 'base64');
let server, browser, origin;

const entry = `import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import AdminAnnouncements from '/src/pages/admin/AdminAnnouncements.jsx';
import useAnnouncementSend from '/src/hooks/useAnnouncementSend.js';
import { ToastContext } from '/src/hooks/useToast.js';
function GuardHarness() {
  const { send, phase, busy } = useAnnouncementSend('/announcements/global', '/files/news-image');
  useEffect(() => {
    const publish = async () => {
      try {
        const result = await send({ title: 'One click', body: 'One announcement' }, null);
        if (result) window.__published.push(result);
      } catch (error) { window.__sendErrors.push(error.message); }
    };
    window.__sendTwice = () => { publish(); publish(); };
  }, [send]);
  return React.createElement('button', { disabled: busy, onClick: () => window.__sendTwice() }, phase || 'Send twice');
}
window.__published = [];
window.__sendErrors = [];
const toast = { success: () => {}, error: () => {}, info: () => {} };
const View = new URL(location.href).searchParams.get('mode') === 'guard' ? GuardHarness : AdminAnnouncements;
createRoot(document.getElementById('root')).render(
  React.createElement(ToastContext.Provider, { value: toast }, React.createElement(View))
);`;

before(async () => {
  server = await createServer({
    root: clientRoot, configFile: path.join(clientRoot, 'vite.config.js'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__ann-api') },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'announcement-browser-test',
      resolveId(id) { if (id === '/__announcement-test.jsx') return id; },
      load(id) { if (id === '/__announcement-test.jsx') return entry; },
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function gate() { return { started: deferred(), release: deferred() }; }

async function openComposer(t, mode = 'admin') {
  const context = await browser.newContext();
  const state = { uploads: [], posts: [], failPosts: 0, uploadGate: null, postGate: null, gates: [], errors: [] };
  t.after(async () => {
    state.gates.forEach((item) => item.release.resolve());
    await context.close();
    assert.deepEqual(state.errors, [], 'no uncaught browser errors');
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/__announcements-test') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div>
        <script type="module">import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;</script>
        <script type="module" src="/@vite/client"></script>
        <script type="module" src="/__announcement-test.jsx"></script>` });
    }
    if (!url.pathname.startsWith('/__ann-api/')) return route.continue();
    if (url.pathname.endsWith('/announcements/feed')) return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/files/news-image')) {
      state.uploads.push(request.postDataBuffer());
      const pending = state.uploadGate;
      state.uploadGate = null;
      if (pending) { pending.started.resolve(); await pending.release.promise; }
      return route.fulfill({ status: 201, json: { _id: '111111111111111111111111' } });
    }
    if (url.pathname.endsWith('/announcements/global')) {
      const payload = request.postDataJSON();
      state.posts.push(payload);
      const pending = state.postGate;
      state.postGate = null;
      if (pending) { pending.started.resolve(); await pending.release.promise; }
      if (state.failPosts > 0) {
        state.failPosts--;
        return route.fulfill({ status: 503, json: { message: 'Synthetic response failure' } });
      }
      return route.fulfill({ status: 201, json: { _id: `announcement-${state.posts.length}`, ...payload } });
    }
    throw new Error(`Unexpected synthetic request: ${request.method()} ${url.pathname}`);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  await page.goto(`${origin}/__announcements-test?mode=${mode}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (mode === 'guard') await page.waitForFunction(() => typeof window.__sendTwice === 'function');
  else await page.getByLabel('ann.titleField', { exact: true }).waitFor();
  return { page, state };
}

async function fillComposer(page) {
  await page.getByLabel('ann.titleField', { exact: true }).fill('Photo announcement');
  await page.getByLabel('ann.message', { exact: true }).fill('Class starts at ten.');
}

test('two send calls in the same event loop produce one request while pending', { timeout: 45000 }, async (t) => {
  const { page, state } = await openComposer(t, 'guard');
  const pending = gate();
  state.postGate = pending;
  state.gates.push(pending);
  await page.evaluate(() => window.__sendTwice());
  await pending.started.promise;
  assert.equal(state.posts.length, 1);
  await page.getByRole('button', { name: 'sending', exact: true }).waitFor();
  assert.equal(await page.getByRole('button').isDisabled(), true);
  await page.evaluate(() => window.__sendTwice());
  pending.release.resolve();
  await page.waitForFunction(() => window.__published.length === 1);
  assert.equal(state.posts.length, 1);
  assert.deepEqual(await page.evaluate(() => window.__sendErrors), []);
});

test('the photo upload and announcement request visibly keep the composer busy', { timeout: 45000 }, async (t) => {
  const { page, state } = await openComposer(t);
  await fillComposer(page);
  await page.getByLabel('ann.addPhoto', { exact: true }).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
  await page.getByAltText('ann.photoPreview').waitFor();
  const uploading = gate();
  const publishing = gate();
  state.uploadGate = uploading;
  state.postGate = publishing;
  state.gates.push(uploading, publishing);
  await page.getByRole('button', { name: 'ann.publishToEveryone', exact: true }).click();
  await uploading.started.promise;
  assert.equal(await page.getByRole('button', { name: 'ann.uploadingPhoto', exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('ann.titleField', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('ann.addPhoto', { exact: true }).isDisabled(), true);
  await page.getByRole('status').filter({ hasText: 'ann.sendingHint' }).waitFor();
  assert.equal(state.posts.length, 0);
  uploading.release.resolve();
  await publishing.started.promise;
  assert.equal(await page.getByRole('button', { name: 'ann.sending', exact: true }).isDisabled(), true);
  assert.equal(state.uploads.length, 1);
  assert.equal(state.uploads[0].includes(PNG), true, 'the real selected photo is uploaded');
  assert.equal(state.posts[0].image, '111111111111111111111111');
  publishing.release.resolve();
  await page.waitForFunction(() => document.querySelector('input:not([type="file"])').value === '');
  assert.equal(await page.getByLabel('ann.addPhoto', { exact: true }).isDisabled(), false);
});

test('retry after a failed response reuses the request ID and uploaded photo; a later publish gets a new ID', { timeout: 45000 }, async (t) => {
  const { page, state } = await openComposer(t);
  await fillComposer(page);
  await page.getByLabel('ann.addPhoto', { exact: true }).setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: PNG });
  state.failPosts = 1;
  await page.getByRole('button', { name: 'ann.publishToEveryone', exact: true }).click();
  await page.getByRole('button', { name: 'ann.publishToEveryone', exact: true }).waitFor();
  assert.equal(state.posts.length, 1);
  assert.equal(await page.getByLabel('ann.titleField', { exact: true }).inputValue(), 'Photo announcement');
  await page.getByRole('button', { name: 'ann.publishToEveryone', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input:not([type="file"])').value === '');
  assert.equal(state.uploads.length, 1);
  assert.equal(state.posts.length, 2);
  assert.equal(state.posts[0].requestId, state.posts[1].requestId);
  assert.equal(state.posts[0].image, state.posts[1].image);
  assert.match(state.posts[0].requestId, /^[a-f\d-]{36}$/i);

  await fillComposer(page);
  await page.getByRole('button', { name: 'ann.publishToEveryone', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input:not([type="file"])').value === '');
  assert.equal(state.posts.length, 3);
  assert.notEqual(state.posts[2].requestId, state.posts[1].requestId);
  assert.equal(state.posts[2].image, null);
});
