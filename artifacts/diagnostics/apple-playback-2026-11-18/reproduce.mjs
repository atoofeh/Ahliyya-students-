import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../../..');
const mediaReload = process.argv.includes('--media-reload');
const requireClient = createRequire(path.join(root, 'client/package.json'));
process.chdir(path.join(root, 'client'));
const { createServer } = await import(pathToFileURL(requireClient.resolve('vite')).href);
const { chromium, webkit } = await import('../../student-guide/tools/node_modules/playwright/index.mjs');
const mp4 = await fs.readFile(path.join(out, 'synthetic.mp4'));
const webm = await fs.readFile(path.join(out, 'synthetic.webm'));
const probeModule = `import React from 'react';
import { createRoot } from 'react-dom/client';
import VideoPlayer from '/src/components/VideoPlayer.jsx';
const startAt = Number(new URL(location.href).searchParams.get('startAt')) || 0;
createRoot(document.getElementById('root')).render(React.createElement(VideoPlayer, { videoId: 'synthetic-video', startAt }));`;
const server = await createServer({
  root: path.join(root, 'client'),
  configFile: path.join(root, 'client/vite.config.js'),
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__probe-api') },
  server: { host: '127.0.0.1', port: 5189, strictPort: true },
  plugins: [{
    name: 'temporary-playback-diagnostic',
    resolveId(id) { if (id === '/__diagnostic.jsx') return id; },
    load(id) { if (id === '/__diagnostic.jsx') return probeModule; },
  }],
});
await server.listen();
const results = [];
try {
  for (const [name, engine, options] of [
    ['chromium', chromium, { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }],
    ['webkit', webkit, {}],
  ]) {
    let browser;
    try {
      browser = await engine.launch({ headless: true, ...options });
      for (const startAt of [0, 7]) {
        const media = name === 'webkit' ? webm : mp4;
        const context = await browser.newContext();
        // Capture the actual four-minute callback without waiting four minutes.
        // Media timing itself runs normally; component code is unchanged.
        await context.addInitScript(() => {
          const original = window.setInterval.bind(window);
          window.setInterval = (callback, milliseconds, ...args) => {
            if (milliseconds === 240000) window.__renewStream = callback;
            return original(callback, milliseconds, ...args);
          };
          window.__mediaEvents = [];
          for (const event of ['emptied', 'loadstart', 'loadedmetadata', 'pause', 'playing', 'error']) {
            document.addEventListener(event, (e) => {
              if (e.target.tagName === 'VIDEO') window.__mediaEvents.push({ event, time: e.target.currentTime, paused: e.target.paused });
            }, true);
          }
        });
        let tokenCount = 0;
        const errors = [];
        await context.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.hostname !== '127.0.0.1') return route.abort();
          if (url.pathname === '/__diagnostic') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script><script type="module" src="/@vite/client"></script><script type="module" src="/__diagnostic.jsx"></script>` });
          if (!url.pathname.startsWith('/__probe-api')) return route.continue();
          if (url.pathname.endsWith('/token')) return route.fulfill({ json: { token: `synthetic-${++tokenCount}`, expiresInSeconds: 300 } });
          if (url.pathname.endsWith('/watermark/me')) return route.fulfill({ json: { enabled: false } });
          if (url.pathname.endsWith('/stream')) {
            const range = route.request().headers().range;
            let begin = 0, end = media.length - 1;
            if (range) {
              const match = /^bytes=(\d+)-(\d*)$/.exec(range);
              if (match) { begin = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
            }
            return route.fulfill({ status: range ? 206 : 200, contentType: name === 'webkit' ? 'video/webm' : 'video/mp4', headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${begin}-${end}/${media.length}` } : {}) }, body: media.subarray(begin, end + 1) });
          }
          return route.fulfill({ json: {} });
        });
        const page = await context.newPage();
        page.on('pageerror', (error) => { errors.push(error.message); console.log(name, 'pageerror', error.message); });
        try {
          await page.goto(`http://127.0.0.1:5189/__diagnostic?startAt=${startAt}`);
          console.log(name, startAt, 'page loaded');
          await page.locator('video').waitFor();
          if (name === 'webkit') {
            await page.locator('video').evaluate((v) => { v.muted = true; });
            await page.getByRole('button', { name: 'video.play', exact: true }).click();
          }
          await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, undefined, { timeout: 10000 });
          console.log(name, startAt, 'media loaded');
          await page.evaluate(async () => { const video = document.querySelector('video'); video.muted = true; video.currentTime = 12; await video.play(); });
          await page.waitForFunction(() => document.querySelector('video').currentTime > 12.1);
          const before = await page.locator('video').evaluate((v) => ({ position: v.currentTime, paused: v.paused, src: v.getAttribute('src') }));
          if (mediaReload) await page.locator('video').evaluate((v) => v.load());
          else {
            await page.evaluate(() => window.__renewStream());
            await page.waitForFunction(() => document.querySelector('video').getAttribute('src').includes('synthetic-2'));
          }
          await page.waitForFunction(() => window.__mediaEvents.filter((e) => e.event === 'loadedmetadata').length >= 2);
          const after = await page.locator('video').evaluate((v) => ({ position: v.currentTime, paused: v.paused, src: v.getAttribute('src') }));
          results.push({ engine: name, startAt, before, after, events: await page.evaluate(() => window.__mediaEvents), errors });
          console.log(name, startAt, JSON.stringify({ before, after }));
        } catch (error) { console.log(name, startAt, error.message); results.push({ engine: name, startAt, error: error.message, errors, mediaState: await page.evaluate(() => { const v = document.querySelector('video'); return v && { readyState: v.readyState, error: v.error?.message, supportsMp4: v.canPlayType('video/mp4; codecs="avc1.42E01E"'), supportsWebm: v.canPlayType('video/webm; codecs="vp8"') }; }).catch(() => null) }); }
        await context.close();
      }
    } catch (error) { results.push({ engine: name, launchError: error.message }); }
    finally { await browser?.close(); }
  }
} finally { await server.close(); }
await fs.writeFile(path.join(out, mediaReload ? 'media-reload-results.json' : 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
