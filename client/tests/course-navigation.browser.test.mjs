import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const course = {
  _id: 'bio', title: 'Biology', teacher: { name: 'Teacher' }, difficulty: 'beginner',
  language: 'en', visibility: 'listed', isPublished: true, enrollmentCount: 2,
  lessonCount: 0, quizCount: 0, completionThreshold: 80,
};
const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AdminCourses from '/src/pages/admin/AdminCourses.jsx';
import TeacherCourses from '/src/pages/teacher/TeacherCourses.jsx';
import CourseManager from '/src/pages/teacher/CourseManager.jsx';
import { AuthContext } from '/src/hooks/useAuth.js';
import { LanguageProvider } from '/src/context/LanguageContext.jsx';
import { ToastProvider } from '/src/context/ToastContext.jsx';
import { ConfirmProvider } from '/src/context/ConfirmContext.jsx';
import '/src/index.css';
const h = React.createElement;
const params = new URL(location.href).searchParams;
function Location() { const value = useLocation(); return h('output', { 'data-testid': 'route' }, value.pathname + value.search); }
const tree = h(MemoryRouter, { initialEntries: [params.get('route') || '/admin/courses'] },
  h(Location), h(Routes, null,
    h(Route, { path: '/admin/courses', element: h(AdminCourses) }),
    h(Route, { path: '/teacher/courses', element: h(TeacherCourses) }),
    h(Route, { path: '/teacher/courses/:courseId/:tab?', element: h(CourseManager) })));
createRoot(document.getElementById('root')).render(h(AuthContext.Provider, { value: { user: { role: params.get('role') || 'super_admin' } } },
  h(LanguageProvider, null, h(ToastProvider, null, h(ConfirmProvider, null, tree)))));`;

let server, browser, origin;
before(async () => {
  server = await createServer({
    root: clientRoot, configFile: path.join(clientRoot, 'vite.config.js'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__course-api') },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [{ name: 'course-navigation-test',
      resolveId(id) { if (id === '/__course-test.jsx') return id; },
      load(id) { if (id === '/__course-test.jsx') return entry; },
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

async function openCourses(t, route, role = 'super_admin') {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.addInitScript(() => localStorage.setItem('lms_lang', 'en'));
  const errors = [], reads = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/__course-test') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div>
      <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script>
      <script type="module" src="/@vite/client"></script><script type="module" src="/__course-test.jsx"></script>` });
    if (!url.pathname.startsWith('/__course-api/')) return route.continue();
    reads.push(url.pathname + url.search);
    if (url.pathname.endsWith('/courses/mine')) return route.fulfill({ json: {
      items: [course], meta: { page: Number(url.searchParams.get('page')) || 1, totalPages: 4, total: 40, hasPrevPage: true, hasNextPage: true },
    } });
    if (url.pathname === '/__course-api/courses/bio') return route.fulfill({ json: { course, curriculum: [] } });
    if (url.pathname.includes('/files/')) return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: [] });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(`${origin}/__course-test?${new URLSearchParams({ route, role })}`, { waitUntil: 'domcontentloaded' });
  return { page, reads };
}

test('owner returns through manager tabs to the same filtered course list page', { timeout: 60000 }, async (t) => {
  const { page, reads } = await openCourses(t, '/admin/courses?page=3&search=bio');
  await page.getByRole('button', { name: /manage.*Biology/i }).click();
  await page.getByRole('button', { name: 'Videos', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="route"]')?.textContent === '/teacher/courses/bio/videos');
  await page.getByRole('button', { name: 'All courses', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="route"]')?.textContent === '/admin/courses?page=3&search=bio');
  assert.equal(await page.getByTestId('route').textContent(), '/admin/courses?page=3&search=bio');
  assert.equal(await page.getByPlaceholder('Search courses...').inputValue(), 'bio');
  assert.ok(reads.filter((url) => url.includes('page=3') && url.includes('search=bio')).length >= 2);
});

test('a direct owner course link defaults back to administrator courses', { timeout: 45000 }, async (t) => {
  const { page } = await openCourses(t, '/teacher/courses/bio/settings');
  await page.getByRole('button', { name: 'All courses', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="route"]')?.textContent === '/admin/courses');
  assert.equal(await page.getByTestId('route').textContent(), '/admin/courses');
});

test('teacher course return retains the teacher list page', { timeout: 45000 }, async (t) => {
  const { page, reads } = await openCourses(t, '/teacher/courses?page=2', 'teacher');
  await page.getByRole('link', { name: /Biology/ }).click();
  await page.getByRole('button', { name: 'All courses', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="route"]')?.textContent === '/teacher/courses?page=2');
  assert.equal(await page.getByTestId('route').textContent(), '/teacher/courses?page=2');
  assert.ok(reads.filter((url) => url.includes('page=2')).length >= 2);
});
