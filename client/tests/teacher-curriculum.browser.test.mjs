/** Isolated real-component checks. Run: node --test tests/teacher-curriculum.browser.test.mjs */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const media = await readFile(new URL('./fixtures/playback.mp4', import.meta.url));
const lessonText = 'The complete saved lesson.\nIts content is absent from the curriculum summary.';
const lessons = [
  { _id: 'text-lesson', title: 'Cell biology', type: 'text', durationMinutes: 12, isPublished: false },
  { _id: 'video-lesson', title: 'Microscope recording', type: 'video', durationMinutes: 2, isPublished: true, video: 'video-asset' },
  { _id: 'pdf-lesson', title: 'Cell diagram', type: 'pdf', fileAsset: 'pdf-asset', isPublished: true },
  { _id: 'quiz-lesson', title: 'Cell quiz', type: 'quiz', quiz: 'quiz-asset', isPublished: false },
  { _id: 'assignment-lesson', title: 'Lab report', type: 'assignment', assignment: 'assignment-asset', isPublished: true },
];
const curriculum = [{ _id: 'section-one', title: 'Cells', lessons }];
const quiz = { _id: 'quiz-asset', title: 'Cell quiz', description: 'Identify the organelles.', timeLimitMinutes: 15, passingScore: 60, maxAttempts: 2 };
const assignment = { _id: 'assignment-asset', title: 'Lab report', instructions: 'Describe the observed cells.', maxPoints: 25 };
const fullLesson = (id) => ({
  ...lessons.find((lesson) => lesson._id === id), content: id === 'text-lesson' ? lessonText : '',
  ...(id === 'video-lesson' ? { video: { _id: 'video-asset', title: 'Recording', status: 'ready' } } : {}),
  ...(id === 'pdf-lesson' ? { fileAsset: { _id: 'pdf-asset', mimeType: 'application/pdf', originalName: 'diagram.pdf' } } : {}),
  ...(id === 'quiz-lesson' ? { quiz } : {}), ...(id === 'assignment-lesson' ? { assignment } : {}),
});

const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import CurriculumTab from '/src/pages/teacher/tabs/CurriculumTab.jsx';
import { LanguageProvider } from '/src/context/LanguageContext.jsx';
import { ToastProvider } from '/src/context/ToastContext.jsx';
import { ConfirmProvider } from '/src/context/ConfirmContext.jsx';
import '/src/index.css';
const tree = React.createElement(CurriculumTab, {
  courseId: 'test-course', curriculum: ${JSON.stringify(curriculum)}, reload: async () => {},
  onOpenTab: (tab) => { window.__openedTab = tab; },
});
createRoot(document.getElementById('root')).render(
  React.createElement(LanguageProvider, null,
    React.createElement(ToastProvider, null, React.createElement(ConfirmProvider, null, tree))));`;
let server;
let browser;
let origin;

before(async () => {
  server = await createServer({
    root: clientRoot, configFile: path.join(clientRoot, 'vite.config.js'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__curriculum-api') },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'teacher-curriculum-browser-test',
      resolveId(id) { if (id === '/__curriculum-test.jsx') return id; },
      load(id) { if (id === '/__curriculum-test.jsx') return entry; },
    }],
  });
  await server.listen();
  origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (!executablePath && process.platform === 'win32') {
    const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    try { await access(chrome); executablePath = chrome; } catch { /* use installed Playwright browser */ }
  }
  browser = await chromium.launch({ headless: true, executablePath });
});
after(async () => { await browser?.close(); await server?.close(); });

async function openCurriculum(t) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const state = { mutations: [], reads: [], failures: new Set(), errors: [] };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/__curriculum-test') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div>
      <script type="module">import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script>
      <script type="module" src="/@vite/client"></script><script type="module" src="/__curriculum-test.jsx"></script>` });
    if (!url.pathname.startsWith('/__curriculum-api/')) return route.continue();
    const endpoint = url.pathname.slice('/__curriculum-api'.length);
    if (request.method() !== 'GET' && !endpoint.endsWith('/token')) {
      state.mutations.push({ method: request.method(), endpoint, body: request.postDataJSON() });
      return route.fulfill({ json: {} });
    }
    state.reads.push(endpoint);
    if (endpoint === '/videos/courses/test-course') return route.fulfill({ json: [{ _id: 'video-asset', status: 'ready', title: 'Recording' }] });
    if (endpoint === '/files/courses/test-course') return route.fulfill({ json: { items: [] } });
    if (endpoint === '/quizzes/courses/test-course') return route.fulfill({ json: [quiz] });
    if (endpoint === '/assignments/courses/test-course') return route.fulfill({ json: [assignment] });
    if (endpoint.startsWith('/courses/test-course/lessons/')) {
      const id = endpoint.split('/').at(-1);
      if (state.failures.has(id)) return route.fulfill({ status: 503, json: { message: 'Lesson could not be read' } });
      return route.fulfill({ json: fullLesson(id) });
    }
    if (endpoint.endsWith('/token')) return route.fulfill({ json: { token: 'synthetic-token', expiresInSeconds: 300 } });
    if (endpoint.endsWith('/watermark/me')) return route.fulfill({ json: { enabled: false } });
    if (endpoint.endsWith('/stream')) {
      const range = request.headers().range;
      const match = range && /^bytes=(\d+)-(\d*)$/.exec(range);
      const begin = match ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4',
        headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${begin}-${end}/${media.length}` } : {}) },
        body: media.subarray(begin, end + 1) });
    }
    if (endpoint === '/files/pdf-asset/content') return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
    throw new Error(`Unexpected test request: ${endpoint}`);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  t.after(() => assert.deepEqual(state.errors, []));
  await page.goto(`${origin}/__curriculum-test`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByRole('button', { name: 'Preview lesson: Cell biology', exact: true }).waitFor({ timeout: 30000 });
  return { page, state };
}

const browserTest = (name, run) => test(name, { timeout: 45000 }, run);

browserTest('lesson titles open full read-only previews with mouse and keyboard', async (t) => {
  const { page, state } = await openCurriculum(t);
  const preview = page.getByRole('button', { name: 'Preview lesson: Cell biology', exact: true });
  await preview.click();
  const modal = page.getByRole('dialog', { name: 'Preview lesson: Cell biology', exact: true });
  await modal.getByText(lessonText).waitFor();
  assert.ok(state.reads.includes('/courses/test-course/lessons/text-lesson'));
  assert.equal(await modal.getByRole('button', { name: 'Save lesson', exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  await preview.focus();
  await page.keyboard.press('Enter');
  await modal.getByText(lessonText).waitFor();
  assert.deepEqual(state.mutations, []);
});

browserTest('duration can be cleared and replaced, and text edits preserve full saved content', async (t) => {
  const { page, state } = await openCurriculum(t);
  await page.getByRole('button', { name: 'Edit lesson', exact: true }).first().click();
  const modal = page.getByRole('dialog', { name: 'Edit lesson', exact: true });
  await modal.getByRole('textbox', { name: /^Content/ }).waitFor();
  assert.equal(await modal.getByRole('textbox', { name: /^Content/ }).inputValue(), lessonText);
  const duration = modal.getByLabel('Duration (minutes)', { exact: true });
  await duration.fill('');
  assert.equal(await duration.inputValue(), '');
  await duration.fill('35');
  await modal.getByLabel('Title', { exact: true }).fill('Cell biology revised');
  const save = page.waitForResponse((response) => response.request().method() === 'PUT');
  await modal.getByRole('button', { name: 'Save lesson', exact: true }).click();
  await save;
  assert.equal(state.mutations[0].body.durationMinutes, 35);
  assert.equal(state.mutations[0].body.content, lessonText);
  assert.equal(state.mutations[0].body.isPublished, false);
});

browserTest('an empty duration saves zero only at submission time', async (t) => {
  const { page, state } = await openCurriculum(t);
  await page.getByRole('button', { name: 'Lesson', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Title', { exact: true }).fill('New lesson');
  await modal.getByLabel('Duration (minutes)', { exact: true }).fill('');
  assert.equal(await modal.getByLabel('Duration (minutes)', { exact: true }).inputValue(), '');
  const save = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/lessons'));
  await modal.getByRole('button', { name: 'Save lesson', exact: true }).click();
  await save;
  assert.equal(state.mutations[0].body.durationMinutes, 0);
});

browserTest('a failed edit read cannot save incomplete content and supports retry', async (t) => {
  const { page, state } = await openCurriculum(t);
  state.failures.add('text-lesson');
  await page.getByRole('button', { name: 'Edit lesson', exact: true }).first().click();
  const modal = page.getByRole('dialog', { name: 'Edit lesson', exact: true });
  await modal.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  assert.equal(await modal.getByRole('button', { name: 'Save lesson', exact: true }).count(), 0);
  state.failures.delete('text-lesson');
  await modal.getByRole('button', { name: 'Try again', exact: true }).click();
  await modal.getByRole('textbox', { name: /^Content/ }).waitFor();
  assert.equal(await modal.getByRole('textbox', { name: /^Content/ }).inputValue(), lessonText);
  assert.deepEqual(state.mutations, []);
});

browserTest('video previews use the protected player without student progress writes', async (t) => {
  const { page, state } = await openCurriculum(t);
  await page.getByRole('button', { name: 'Preview lesson: Microscope recording', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.locator('video').evaluate(async (video) => { video.muted = true; video.currentTime = 10; await video.play(); });
  await page.waitForFunction(() => document.querySelector('video').currentTime > 10.1);
  await page.locator('video').evaluate((video) => video.pause());
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  assert.equal(await page.locator('video').count(), 0);
  assert.deepEqual(state.mutations, []);
  assert.ok(state.reads.includes('/videos/video-asset/token'));
});

browserTest('document previews fetch through the authorized content endpoint', async (t) => {
  const { page, state } = await openCurriculum(t);
  await page.getByRole('button', { name: 'Preview lesson: Cell diagram', exact: true }).click();
  await page.locator('iframe[title="Cell diagram"]').waitFor();
  assert.ok((await page.locator('iframe').getAttribute('src')).startsWith('blob:'));
  assert.ok(state.reads.includes('/files/pdf-asset/content'));
  assert.deepEqual(state.mutations, []);
});

browserTest('quiz and assignment previews show read-only overviews and navigate to management', async (t) => {
  const { page, state } = await openCurriculum(t);
  await page.getByRole('button', { name: 'Preview lesson: Cell quiz', exact: true }).click();
  await page.getByText(quiz.description, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open quizzes', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__openedTab), 'quizzes');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: 'Preview lesson: Lab report', exact: true }).click();
  await page.getByText(assignment.instructions, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open assignments', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__openedTab), 'assignments');
  assert.deepEqual(state.mutations, []);
});
