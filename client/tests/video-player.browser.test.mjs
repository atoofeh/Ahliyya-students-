/**
 * Browser regressions for the actual React player and actual HTML video loading.
 * Run: npm run test:player
 * Install a browser first: npx playwright install chromium
 * Alternatively set PLAYWRIGHT_CHROMIUM_EXECUTABLE to an installed Chrome path.
 * All API traffic is intercepted; this never uses accounts or production media.
 * Fixture: 40 seconds of generated H.264 color frames, 160x90, yuv420p, faststart.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const media = await readFile(new URL('./fixtures/playback.mp4', import.meta.url));
// The override is useful for a shared, preinstalled Playwright in an offline workspace.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
let server;
let browser;
let origin;
const browserTest = (name, run) => test(name, { timeout: 45000 }, run);

const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import VideoPlayer from '/src/components/VideoPlayer.jsx';
const root = createRoot(document.getElementById('root'));
const params = new URL(location.href).searchParams;
const initial = Number(params.get('startAt')) || 0;
const saved = params.has('resumeSaved')
  ? await fetch('/__player-api/saved-position').then((r) => r.json()) : initial;
window.__unmountPlayer = () => root.unmount();
root.render(React.createElement(VideoPlayer, {
  videoId: 'synthetic-video', lessonId: 'synthetic-lesson', startAt: saved,
}));`;

before(async () => {
  server = await createServer({
    root: clientRoot,
    configFile: path.join(clientRoot, 'vite.config.js'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__player-api') },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'video-player-browser-test',
      resolveId(id) { if (id === '/__playback-test.jsx') return id; },
      load(id) { if (id === '/__playback-test.jsx') return entry; },
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

after(async () => {
  await browser?.close();
  await server?.close();
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function openPlayer(t, { startAt = 0, customControls = false, initialTokenFailure = false } = {}) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const state = { tokens: 0, progress: [], streams: [], errors: [], saved: startAt, failTokens: initialTokenFailure ? 1 : 0 };
  await context.addInitScript(({ customControls }) => {
    if (customControls) HTMLVideoElement.prototype.webkitSetPresentationMode = () => {};
    // Keep media time real. Invoke the real registered renewal/retry callbacks
    // explicitly so a four-minute regression does not require a four-minute test.
    const timers = new Map();
    const originals = {
      setTimeout: window.setTimeout.bind(window), setInterval: window.setInterval.bind(window),
      clearTimeout: window.clearTimeout.bind(window), clearInterval: window.clearInterval.bind(window),
    };
    for (const kind of ['Timeout', 'Interval']) {
      window[`set${kind}`] = (callback, milliseconds, ...args) => {
        let id;
        const invoke = () => {
          if (kind === 'Timeout') timers.delete(id);
          return callback(...args);
        };
        id = originals[`set${kind}`](invoke, milliseconds);
        if (typeof callback === 'function' && milliseconds >= 4000) {
          timers.set(id, { callback: invoke, milliseconds, kind });
        }
        return id;
      };
      window[`clear${kind}`] = (id) => { timers.delete(id); originals[`clear${kind}`](id); };
    }
    window.__firePlayerTimer = (type) => {
      const match = [...timers].reverse().find(([, timer]) => type === 'renewal'
        ? timer.milliseconds >= 60000 && timer.milliseconds <= 300000
        : timer.milliseconds >= 4000 && timer.milliseconds < 60000);
      if (!match) throw new Error(`No ${type} timer; pending: ${JSON.stringify([...timers.values()].map((v) => v.milliseconds))}`);
      const [id, timer] = match;
      originals[`clear${timer.kind}`](id);
      timers.delete(id);
      return timer.callback();
    };
    window.__mediaEvents = [];
    for (const name of ['emptied', 'loadstart', 'loadedmetadata', 'pause', 'playing', 'error']) {
      document.addEventListener(name, (event) => {
        if (event.target.tagName === 'VIDEO') {
          window.__mediaEvents.push({ name, position: event.target.currentTime });
        }
      }, true);
    }
  }, { customControls });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/__playback-test') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div>
        <script type="module">import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;</script>
        <script type="module" src="/@vite/client"></script>
        <script type="module" src="/__playback-test.jsx"></script>` });
    }
    if (!url.pathname.startsWith('/__player-api/')) return route.continue();
    if (url.pathname.endsWith('/token')) {
      state.tokens++;
      const token = `synthetic-${state.tokens}`;
      const gate = state.tokenGate;
      if (gate) {
        state.tokenGate = null;
        gate.started.resolve();
        await gate.release.promise;
      }
      try {
        if (state.failTokens > 0) {
          state.failTokens--;
          return await route.fulfill({ status: 503, json: { message: 'Temporary test outage' } });
        }
        return await route.fulfill({ json: { token, expiresInSeconds: 300 } });
      } finally {
        gate?.finished?.resolve();
      }
    }
    if (url.pathname.endsWith('/watermark/me')) return route.fulfill({ json: { enabled: false } });
    if (url.pathname.endsWith('/saved-position')) return route.fulfill({ json: state.saved });
    if (url.pathname.endsWith('/progress')) {
      const progress = request.postDataJSON();
      state.progress.push(progress);
      state.saved = progress.positionSeconds;
      return route.fulfill({ json: {} });
    }
    if (url.pathname.endsWith('/stream')) {
      state.streams.push(url.searchParams.get('token'));
      const range = request.headers().range;
      let begin = 0;
      let end = media.length - 1;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        assert.ok(match, `Unexpected browser range: ${range}`);
        begin = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), end);
      }
      return route.fulfill({
        status: range ? 206 : 200, contentType: 'video/mp4',
        headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${begin}-${end}/${media.length}` } : {}) },
        body: media.subarray(begin, end + 1),
      });
    }
    throw new Error(`Unexpected test API request: ${request.method()} ${url.pathname}`);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  t.after(() => assert.deepEqual(state.errors, [], 'browser should not report uncaught errors'));
  await page.goto(`${origin}/__playback-test?startAt=${startAt}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (initialTokenFailure) await page.getByRole('button', { name: 'video.retry', exact: true }).waitFor();
  else await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, undefined, { timeout: 30000 });
  return { page, state };
}

async function snapshot(page) {
  return page.locator('video').evaluate((video) => ({
    position: video.currentTime, paused: video.paused, muted: video.muted,
    rate: video.playbackRate, source: video.getAttribute('src'), ready: video.readyState,
  }));
}

async function positionPlayer(page, { paused = false, position = 12, rate = 1.5 } = {}) {
  await page.locator('video').evaluate(async (video, options) => {
    video.muted = true;
    video.playbackRate = options.rate;
    video.currentTime = options.position;
    if (options.paused) video.pause();
    else await video.play();
  }, { paused, position, rate });
  await page.waitForFunction(({ paused, position }) => {
    const video = document.querySelector('video');
    return !video.seeking && video.paused === paused && video.currentTime >= position;
  }, { paused, position });
}

async function fireRenewal(page) {
  const previousSource = (await snapshot(page)).source;
  await page.evaluate(() => { window.__pendingRenewal = Promise.resolve(window.__firePlayerTimer('renewal')); });
  await page.waitForFunction((previous) => {
    const video = document.querySelector('video');
    return video.getAttribute('src') !== previous && video.readyState >= 2 && !video.seeking;
  }, previousSource);
}

function assertNoResetProgress(state, fromIndex) {
  assert.ok(state.progress.slice(fromIndex).every((p) => p.positionSeconds >= 10),
    `Reload must not overwrite resume progress with zero: ${JSON.stringify(state.progress.slice(fromIndex))}`);
}

for (const customControls of [false, true]) {
  browserTest(`renewal preserves active playback and options (${customControls ? 'custom' : 'native'} controls)`, async (t) => {
    const { page, state } = await openPlayer(t, { startAt: 7, customControls });
    await positionPlayer(page);
    const before = await snapshot(page);
    const progressIndex = state.progress.length;
    await fireRenewal(page);
    await page.waitForFunction(() => !document.querySelector('video').paused);
    const after = await snapshot(page);
    assert.ok(after.position >= before.position - 0.25, JSON.stringify({ before, after }));
    assert.equal(after.rate, 1.5);
    assert.equal(after.muted, true);
    const progressResponse = page.waitForResponse((response) => response.url().endsWith('/progress'));
    await page.locator('video').evaluate((video) => video.pause());
    await progressResponse;
    assertNoResetProgress(state, progressIndex);
  });
}

browserTest('renewal preserves a paused position without replaying stale saved progress', async (t) => {
  const { page, state } = await openPlayer(t, { startAt: 7 });
  await positionPlayer(page, { paused: true, rate: 0.75 });
  const progressIndex = state.progress.length;
  await fireRenewal(page);
  const after = await snapshot(page);
  assert.ok(Math.abs(after.position - 12) < 0.25, JSON.stringify(after));
  assert.equal(after.paused, true);
  assert.equal(after.rate, 0.75);
  assert.equal(after.muted, true);
  assertNoResetProgress(state, progressIndex);
});

browserTest('a seek and pause during token retrieval are preserved at source replacement', async (t) => {
  const { page, state } = await openPlayer(t, { startAt: 7 });
  await positionPlayer(page);
  const gate = { started: deferred(), release: deferred() };
  state.tokenGate = gate;
  const previousSource = (await snapshot(page)).source;
  await page.evaluate(() => { window.__pendingRenewal = Promise.resolve(window.__firePlayerTimer('renewal')); });
  await gate.started.promise;
  await positionPlayer(page, { paused: true, position: 16, rate: 0.75 });
  gate.release.resolve();
  await page.waitForFunction((previous) => {
    const video = document.querySelector('video');
    return video.getAttribute('src') !== previous && video.readyState >= 2 && !video.seeking;
  }, previousSource);
  const after = await snapshot(page);
  assert.ok(Math.abs(after.position - 16) < 0.25, JSON.stringify(after));
  assert.equal(after.paused, true);
  assert.equal(after.rate, 0.75);
});

browserTest('a visibility pause during token retrieval prevents automatic resumption', async (t) => {
  const { page, state } = await openPlayer(t);
  await positionPlayer(page);
  const gate = { started: deferred(), release: deferred() };
  state.tokenGate = gate;
  const previousSource = (await snapshot(page)).source;
  await page.evaluate(() => { window.__pendingRenewal = Promise.resolve(window.__firePlayerTimer('renewal')); });
  await gate.started.promise;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal((await snapshot(page)).paused, true);
  gate.release.resolve();
  await page.waitForFunction((previous) => {
    const video = document.querySelector('video');
    return video.getAttribute('src') !== previous && video.readyState >= 2 && !video.seeking;
  }, previousSource);
  assert.equal((await snapshot(page)).paused, true);
  assert.ok((await snapshot(page)).position >= 12);
});

browserTest('an unexpected media reload restores the latest position', async (t) => {
  const { page, state } = await openPlayer(t, { startAt: 7 });
  await positionPlayer(page, { paused: true });
  const progressIndex = state.progress.length;
  await page.locator('video').evaluate((video) => video.load());
  await page.waitForFunction(() => window.__mediaEvents.filter((e) => e.name === 'loadedmetadata').length >= 2);
  await page.waitForFunction(() => !document.querySelector('video').seeking);
  const after = await snapshot(page);
  assert.ok(Math.abs(after.position - 12) < 0.25, JSON.stringify(after));
  assert.equal(after.paused, true);
  assertNoResetProgress(state, progressIndex);
});

browserTest('a transient renewal failure keeps playback and retries before token expiry', async (t) => {
  const { page, state } = await openPlayer(t);
  await positionPlayer(page);
  const before = await snapshot(page);
  state.failTokens = 1;
  const tokenFailure = page.waitForResponse((response) => response.url().endsWith('/token') && response.status() === 503);
  await page.evaluate(() => { window.__pendingRenewal = Promise.resolve(window.__firePlayerTimer('renewal')); });
  await tokenFailure;
  await page.evaluate(() => window.__pendingRenewal);
  const afterFailure = await snapshot(page);
  assert.equal(afterFailure.source, before.source);
  assert.equal(afterFailure.paused, false);
  await page.evaluate(() => { window.__pendingRetry = Promise.resolve(window.__firePlayerTimer('retry')); });
  await page.waitForFunction((previous) => {
    const video = document.querySelector('video');
    return video.getAttribute('src') !== previous && video.readyState >= 2 && !video.paused && !video.seeking;
  }, before.source);
  assert.ok((await snapshot(page)).position >= before.position - 0.25);
  assert.equal(state.tokens, 3);
});

browserTest('a full page reload resumes from the last successful progress save', async (t) => {
  const { page, state } = await openPlayer(t);
  await positionPlayer(page);
  const progressResponse = page.waitForResponse((response) => response.url().endsWith('/progress'));
  await page.locator('video').evaluate((video) => video.pause());
  await progressResponse;
  assert.ok(state.saved >= 12);
  const saved = state.saved;
  await page.goto(`${origin}/__playback-test?resumeSaved=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2 && !document.querySelector('video').seeking);
  assert.ok(Math.abs((await snapshot(page)).position - saved) < 0.25);
});

browserTest('an initial token failure offers a working retry', async (t) => {
  const { page, state } = await openPlayer(t, { startAt: 7, initialTokenFailure: true });
  await page.getByRole('button', { name: 'video.retry', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2 && !document.querySelector('video').seeking);
  assert.ok(Math.abs((await snapshot(page)).position - 7) < 0.25);
  assert.equal(state.tokens, 2);
});

browserTest('media error recovery retries the stream from the current position', async (t) => {
  const { page, state } = await openPlayer(t, { startAt: 7 });
  await positionPlayer(page, { paused: true });
  const before = await snapshot(page);
  await page.locator('video').evaluate((video) => video.dispatchEvent(new Event('error')));
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'video.retry', exact: true }).click();
  await page.waitForFunction((previous) => {
    const video = document.querySelector('video');
    return video.getAttribute('src') !== previous && video.readyState >= 2 && !video.seeking;
  }, before.source);
  const after = await snapshot(page);
  assert.ok(Math.abs(after.position - before.position) < 0.25, JSON.stringify({ before, after }));
  assert.equal(after.paused, true);
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(state.tokens, 2);
});

browserTest('an autoplay rejection after renewal keeps the restored position and Play control', async (t) => {
  const { page } = await openPlayer(t, { customControls: true });
  await positionPlayer(page);
  const before = await snapshot(page);
  await page.locator('video').evaluate((video) => {
    video.play = () => Promise.reject(new DOMException('Simulated gesture requirement', 'NotAllowedError'));
  });
  await fireRenewal(page);
  await page.getByRole('button', { name: 'video.play', exact: true }).waitFor();
  const after = await snapshot(page);
  assert.equal(after.paused, true);
  assert.ok(after.position >= before.position - 0.25, JSON.stringify({ before, after }));
});

browserTest('unmount cancels a renewal response without loading a detached video', async (t) => {
  const { page, state } = await openPlayer(t);
  await positionPlayer(page, { paused: true });
  const gate = { started: deferred(), release: deferred(), finished: deferred() };
  state.tokenGate = gate;
  await page.evaluate(() => { window.__pendingRenewal = Promise.resolve(window.__firePlayerTimer('renewal')); });
  await gate.started.promise;
  await page.evaluate(() => {
    window.__detachedVideo = document.querySelector('video');
    window.__unmountPlayer();
  });
  const streamsBefore = state.streams.length;
  gate.release.resolve();
  await gate.finished.promise;
  await page.evaluate(() => window.__pendingRenewal);
  assert.equal(await page.locator('video').count(), 0);
  assert.equal(state.streams.length, streamsBefore);
  assert.ok(await page.evaluate(() => window.__detachedVideo.getAttribute('src').includes('synthetic-1')));
});
