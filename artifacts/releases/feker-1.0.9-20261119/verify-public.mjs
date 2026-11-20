import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '../../../client/node_modules/playwright/index.mjs';
const root = path.resolve('D:/Ahliyaa students');
const origin = 'https://students-alahliyaa.com';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const checks = [];
for (const relative of ['index.html', ...(await fs.readdir(path.join(root, 'client/dist/assets'))).map((name) => `assets/${name}`)]) {
  const response = await fetch(`${origin}/${relative === 'index.html' ? '' : relative}`, { signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
  const received = Buffer.from(await response.arrayBuffer());
  const expected = await fs.readFile(path.join(root, 'client/dist', relative));
  if (response.status !== 200 || digest(received) !== digest(expected)) throw new Error(`Deployed file mismatch: ${relative}`);
  checks.push({ path: relative, sha256: digest(received) });
}
for (const route of ['/api/health', '/privacy/', '/privacy-policy.html', '/support/']) {
  const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(10000) });
  if (response.status !== 200) throw new Error(`${route}: ${response.status}`);
}
for (const route of ['/api/v1/announcements/feed', '/api/v1/videos/000000000000000000000000/stream?token=invalid']) {
  const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(10000) });
  if (response.status !== 401) throw new Error(`Protected route unexpectedly returned ${response.status}`);
}
const oldAsset = await fetch(`${origin}/assets/DownloadButton-B07sXY6p.js`);
if (oldAsset.status !== 200 || digest(Buffer.from(await oldAsset.arrayBuffer())) !== '2681d5ece0968de0bc7f75cc874276f1438bceae758a31d08f49e1203bb303b1') throw new Error('Previously loaded player asset was not retained');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, locale: 'en-US' });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('lms_lang', 'en'));
    await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
    await page.locator('form').waitFor();
    if (!(await page.locator('input[type="password"]').isVisible())) throw new Error('Login form missing');
    await page.screenshot({ path: path.join(root, `artifacts/diagnostics/published-${name}.png`), fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
if (errors.length) throw new Error(errors.join('\n'));
await fs.writeFile(path.join(root, 'artifacts/diagnostics/public-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, loginErrors: errors, oldAssetRetained: true }, null, 2));
console.log(`Verified ${checks.length} exact deployed file hashes, public/protected routes, retained old assets, and desktop/mobile login rendering.`);
