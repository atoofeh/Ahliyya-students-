/**
 * Real owner pages inside MainLayout, using local fixtures and actual providers.
 * Run: node --test tests/admin-responsive.browser.test.mjs
 * Screenshots: artifacts/diagnostics/responsive (synthetic data only).
 * No login credentials, production requests, or destructive actions are used.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import en from '../src/i18n/en.js';
import ar from '../src/i18n/ar.js';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotRoot = path.resolve(clientRoot, '../artifacts/diagnostics/responsive');
const now = '2026-11-19T08:15:00.000Z';
const longName = 'عبد الرحمن محمد مصطفى — Academic Administration and Student Support';
const adminName = 'هدى عبد الله — Senior Administrator for Academic Affairs';
const longEmail = 'abdulrahman.mustafa.academic.department@students.support.alahliyya.example.test';
const courseTitle = 'الأحياء الجزيئية المتقدمة — Advanced Molecular Biology and Practical Laboratory Methods';
const username = 'abdulrahman.mustafa.academic.department';
const deviceId = 'IOS-9E0BC4AD-35C8-4913-B239-413E211E9B71';
const owner = { id: 'owner-id', _id: 'owner-id', role: 'super_admin', name: longName, username: 'owner.responsive', email: longEmail, mustChangePassword: false };
const student = { _id: 'student-id', id: 'student-id', name: longName, username, email: longEmail, role: 'student', status: 'active', lastLoginAt: now, createdAt: now };
const administrator = { ...student, _id: 'admin-id', id: 'admin-id', name: adminName, username: 'senior.administrator.academic.affairs', role: 'admin', mustChangePassword: true };
const teacher = { ...student, _id: 'teacher-id', id: 'teacher-id', name: 'Dr. Lina — Department of Molecular and Cellular Biology', role: 'teacher', status: 'suspended' };
const course = { _id: 'course-id', title: courseTitle, teacher: { _id: teacher._id, name: teacher.name }, category: 'Biological and Medical Sciences', difficulty: 'intermediate', visibility: 'listed', isPublished: true, enrollmentCount: 128, lessonCount: 42, quizCount: 8 };
const session = { _id: 'session-id', user: student, browser: 'Mobile Safari Technology Preview', os: 'iPadOS 26.1', deviceType: 'tablet', ip: '2001:db8:1234:5678:90ab:cdef:1234:5678', createdAt: now, lastActivityAt: now, isActive: true };
const device = { id: 'device-record', publicId: deviceId, user: student, platform: 'ios', browser: session.browser, os: session.os, isActive: true, status: 'active', firstAuthorizedAt: now, lastSeenAt: now };
const audit = { _id: 'audit-id', action: 'DEVICE_RESET_REQUEST_REJECTED', user: student, targetUser: administrator, course, resource: `device:${deviceId}`, ip: session.ip, createdAt: now };
const login = { _id: 'login-id', user: student, username, success: false, reason: 'DEVICE_MISMATCH', ip: session.ip, browser: session.browser, os: session.os, createdAt: now };
const settings = {
  platformName: 'Students Alahliyya — Academic Learning Platform', maintenanceMessage: 'Scheduled support and maintenance information',
  maintenanceMode: false, enrollmentOpen: true, sessionTimeoutMinutes: 30, maxLoginAttempts: 5, lockoutMinutes: 15,
  requireEmailVerification: false, deviceBindingEnabled: true, recordingProtection: true, screenshotProtection: true,
  watermarkEnabled: true, watermarkShowIp: true, maxVideoViews: 4, antiCheatEnabled: true, antiCheatStrictness: 'medium',
  maxUploadMb: 2048, storageQuotaGb: 1000, defaultQuizRetakeLimit: 2,
};
const announcement = { _id: 'announcement-id', title: 'إعلان مهم للطلبة — Laboratory schedule and examination information', body: 'Please review the updated laboratory schedule.\nيرجى مراجعة مواعيد المختبر والامتحانات والتواصل مع الإدارة عند الحاجة.', pinned: true, course, author: administrator, publishedAt: now, image: null };
const meta = { page: 1, limit: 20, total: 42, totalPages: 3, hasPrevPage: false, hasNextPage: true };
const paginated = (items, url) => ({ items, meta: { ...meta, page: Number(url.searchParams.get('page')) || 1 } });
const t = (lang, key, vars = {}) => Object.entries(vars).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), (lang === 'ar' ? ar : en)[key] || en[key] || key);

const pages = [
  ['dashboard', '/admin', 'adm.overviewTitle', courseTitle],
  ['courses', '/admin/courses', 'ac2.allCourses', courseTitle],
  ['users', '/admin/users', 'usr.title', longName],
  ['admins', '/admin/admins', 'adm2.title', adminName],
  ['sessions', '/admin/sessions', 'ses.title', longName],
  ['security', '/admin/security', 'sec.title', audit.action],
  ['security-devices', '/admin/security/devices', 'sec.title', deviceId],
  ['security-requests', '/admin/security/requests', 'sec.title', longName],
  ['security-policies', '/admin/security/policies', 'sec.title', null],
  ['settings', '/admin/settings', 'set.title', null],
  ['audit', '/admin/audit', 'aud.title', longName],
  ['anticheat', '/admin/anticheat', 'ac.title', longName],
  ['announcements', '/admin/announcements', 'ann.title', announcement.title],
];
const tablePages = new Set(['courses', 'users', 'admins', 'sessions', 'security-devices']);
const combinations = [
  { width: 320, height: 740, lang: 'en' },
  { width: 390, height: 844, lang: 'ar' },
  { width: 768, height: 1024, lang: 'en' },
  { width: 1024, height: 768, lang: 'ar' },
  { width: 1440, height: 1000, lang: 'en' },
  { width: 1440, height: 1000, lang: 'ar' },
];

const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import MainLayout from '/src/layouts/MainLayout.jsx';
import { AuthProvider } from '/src/context/AuthContext.jsx';
import { ThemeProvider } from '/src/context/ThemeContext.jsx';
import { LanguageProvider } from '/src/context/LanguageContext.jsx';
import { ToastProvider } from '/src/context/ToastContext.jsx';
import { ConfirmProvider } from '/src/context/ConfirmContext.jsx';
import AdminDashboard from '/src/pages/admin/AdminDashboard.jsx';
import AdminCourses from '/src/pages/admin/AdminCourses.jsx';
import AdminUsers from '/src/pages/admin/AdminUsers.jsx';
import AdminAdmins from '/src/pages/admin/AdminAdmins.jsx';
import AdminSessions from '/src/pages/admin/AdminSessions.jsx';
import AdminSecurity from '/src/pages/admin/AdminSecurity.jsx';
import AdminSettings from '/src/pages/admin/AdminSettings.jsx';
import AdminAudit from '/src/pages/admin/AdminAudit.jsx';
import AdminAntiCheat from '/src/pages/admin/AdminAntiCheat.jsx';
import AdminAnnouncements from '/src/pages/admin/AdminAnnouncements.jsx';
import '/src/index.css';
function LocationBridge() {
  const navigate = useNavigate(); const current = useLocation();
  React.useEffect(() => { window.__adminNavigate = navigate; }, [navigate]);
  return <output hidden data-testid="route">{current.pathname + current.search}</output>;
}
const initial = new URL(location.href).searchParams.get('route') || '/admin';
createRoot(document.getElementById('root')).render(
  <ThemeProvider><LanguageProvider><ToastProvider><ConfirmProvider>
    <MemoryRouter initialEntries={[initial]}><AuthProvider><LocationBridge /><Routes>
      <Route element={<MainLayout />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/courses" element={<AdminCourses />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/admins" element={<AdminAdmins />} />
        <Route path="/admin/sessions" element={<AdminSessions />} />
        <Route path="/admin/security/:tab?" element={<AdminSecurity />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/audit" element={<AdminAudit />} />
        <Route path="/admin/anticheat" element={<AdminAntiCheat />} />
        <Route path="/admin/announcements" element={<AdminAnnouncements />} />
      </Route>
    </Routes></AuthProvider></MemoryRouter>
  </ConfirmProvider></ToastProvider></LanguageProvider></ThemeProvider>);`;

let server;
let browser;
let origin;

before(async () => {
  await mkdir(screenshotRoot, { recursive: true });
  server = await createServer({
    root: clientRoot, configFile: path.join(clientRoot, 'vite.config.js'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__admin-api') },
    server: { host: '127.0.0.1', port: 0, hmr: false },
    plugins: [{ name: 'admin-responsive-test',
      resolveId(id) { if (id === '/__admin-responsive.jsx') return id; },
      load(id) { if (id === '/__admin-responsive.jsx') return entry; },
    }],
  });
  await server.listen();
  origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (!executablePath && process.platform === 'win32') {
    const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    try { await access(chrome); executablePath = chrome; } catch { /* use Playwright browser */ }
  }
  browser = await chromium.launch({ headless: true, executablePath });
});
after(async () => { await browser?.close(); await server?.close(); });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function openAdmin(testContext, viewport, route = '/admin') {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: viewport.lang === 'ar' ? 'ar-JO' : 'en-US', reducedMotion: 'reduce' });
  testContext.after(() => context.close());
  const state = { unknown: [], errors: [], mutations: [], courseGates: new Map(), reads: [] };
  await context.addInitScript(({ lang, owner }) => {
    localStorage.setItem('lms_lang', lang);
    localStorage.setItem('lms_theme', 'light');
    localStorage.setItem('lms_user', JSON.stringify(owner));
  }, { lang: viewport.lang, owner });
  await context.route('**/*', async (requestRoute) => {
    const request = requestRoute.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return requestRoute.abort();
    if (url.pathname === '/__admin-responsive') return requestRoute.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div>
      <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script>
      <script type="module" src="/__admin-responsive.jsx"></script></body></html>` });
    if (!url.pathname.startsWith('/__admin-api/')) return requestRoute.continue();
    const endpoint = url.pathname.slice('/__admin-api'.length);
    const json = (data) => requestRoute.fulfill({ json: data });
    state.reads.push(`${request.method()} ${endpoint}${url.search}`);
    if (endpoint === '/auth/refresh') return json({ accessToken: 'synthetic-local-token', user: owner });
    if (request.method() !== 'GET') {
      state.mutations.push({ endpoint, method: request.method(), body: request.postDataJSON() });
      return json({ settings });
    }
    if (endpoint === '/notifications/unread-count') return json({ count: 0 });
    if (endpoint === '/notifications') return json(paginated([], url));
    if (endpoint === '/search') return json({ courses: [], users: [], lessons: [], quizzes: [], videos: [], assignments: [] });
    if (endpoint === '/courses/mine') {
      const query = url.searchParams.get('search') || '';
      const gate = state.courseGates.get(query);
      if (gate) {
        gate.started.resolve();
        await gate.release.promise;
        try { return await json(paginated([{ ...course, title: 'Old slow search result' }], url)); }
        finally { gate.finished.resolve(); }
      }
      return json(paginated([{ ...course, ...(query === 'new' ? { title: 'Latest search result Biology' } : {}) }], url));
    }
    if (endpoint === '/admin/users') return json(paginated(url.searchParams.get('role') === 'admin' ? [administrator] : [student, teacher, administrator], url));
    if (endpoint === '/admin/account-deletion-requests') return json(paginated([{ _id: 'deletion-id', user: student, createdAt: now, reason: 'Please remove my account after this academic term. يرجى حذف الحساب بعد الفصل الدراسي.' }], url));
    // Full paths are deliberately matched before any generic fallback.
    if (/^\/admin\/users\/(student-id|teacher-id|admin-id)\/device$/.test(endpoint)) return json({ active: device, history: [{ ...device, id: 'old-device', revocationReason: 'Device replacement requested by the student', revokedAt: now, revokedBy: administrator }] });
    if (/^\/admin\/users\/(student-id|teacher-id|admin-id)$/.test(endpoint)) return json({ user: student, sessions: [session], loginHistory: [login], enrollments: [{ _id: 'enrollment-id', course, status: 'active', progressPercent: 57 }] });
    if (endpoint === '/admin/sessions') return json(paginated([session], url));
    if (endpoint === '/admin/devices') return json(paginated([device], url));
    if (endpoint === '/admin/device-requests') return json(paginated([{ _id: 'reset-request', user: student, username, note: 'My phone was replaced and I need to use the new device. تم استبدال الهاتف وأحتاج إلى استخدام الجهاز الجديد.', createdAt: now, ip: session.ip, status: 'open' }], url));
    if (endpoint === '/admin/security/overview') return json({ activeSessions: 128, failedLogins24h: 12, lockedAccounts: 3, deviceResets7d: 8, openResetRequests: 2, suspiciousEvents7d: [{ action: audit.action, count: 5 }], recentSecurityAudit: [audit] });
    if (endpoint === '/admin/settings') return json({ settings, ownerOnlyKeys: ['deviceBindingEnabled', 'sessionTimeoutMinutes'] });
    if (endpoint === '/admin/audit-logs') return json(paginated([audit], url));
    if (endpoint === '/admin/login-history') return json(paginated([login], url));
    if (endpoint === '/anticheat/platform') return json({ eventVolume: [{ _id: 'tab_switch_during_assessment', count: 26 }], topOffenders: [{ _id: student._id, name: longName, username, events: 12, weight: 24.5 }], recentEvents: paginated([{ _id: 'event-id', type: 'tab_switch_during_assessment', student, course, detail: `Device ${deviceId} switched from the assessment window.`, occurredAt: now }], url) });
    if (endpoint === '/announcements/feed') return json([announcement]);
    if (endpoint === '/analytics/admin/storage') return json({ usedBytes: 44000000000, totalBytes: 1000000000000, usedPercent: 4.4 });
    if (endpoint === '/analytics/admin') return json({ users: { total: 1600, byRole: { student: 1530, teacher: 64, admin: 6 }, suspended: 8, banned: 2 }, courses: { total: 124, published: 110 }, activity: { activeSessions: 128, logins7d: 2400, cheat7d: 17, attempts7d: 500 }, popularCourses: [{ ...course, students: 128 }], loginTrend: [{ _id: { day: '2026-11-18', success: true }, count: 76 }, { _id: { day: '2026-11-19', success: false }, count: 8 }], deviceStats: [{ _id: 'iPadOS', count: 45 }, { _id: 'Android', count: 70 }] });
    state.unknown.push(endpoint);
    return requestRoute.fulfill({ status: 500, json: { message: `Unmocked test endpoint: ${endpoint}` } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  testContext.after(() => { assert.deepEqual(state.unknown, [], 'all API shapes must be explicitly mocked'); assert.deepEqual(state.errors, [], 'pages must render without uncaught errors'); });
  await page.goto(`${origin}/__admin-responsive?${new URLSearchParams({ route })}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__adminNavigate === 'function', undefined, { timeout: 60000 });
  return { page, state };
}

async function visit(page, route, title, marker, lang) {
  await page.evaluate((next) => window.__adminNavigate(next), route);
  await page.getByRole('heading', { level: 1, name: t(lang, title), exact: true }).waitFor();
  if (marker) await page.waitForFunction((text) => document.querySelector('main')?.innerText.includes(text), marker);
  if (route === '/admin/settings' || route.endsWith('/policies')) await page.getByLabel(t(lang, 'set.inactivityTimeout')).waitFor();
  await page.locator('main .animate-pulse').first().waitFor({ state: 'hidden' });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  if (dimensions.document > dimensions.width + 1 || dimensions.body > dimensions.width + 1) {
    const overflowing = await page.locator('body *').evaluateAll((nodes) => nodes.filter((node) => {
      const bounds = node.getBoundingClientRect(); const style = getComputedStyle(node);
      return style.display !== 'none' && style.position !== 'fixed' && bounds.width > 0 && (bounds.right > innerWidth + 1 || bounds.left < -1);
    }).slice(0, 12).map((node) => ({ tag: node.tagName, class: node.className?.baseVal || node.className, text: node.textContent?.slice(0, 70) })));
    assert.fail(`${label}: horizontal overflow ${JSON.stringify({ dimensions, overflowing })}`);
  }
}

async function assertTappable(locator, minimum = 44) {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  assert.ok(bounds && bounds.height >= minimum - 0.5 && bounds.width >= minimum - 0.5, `Control must have a ${minimum}px touch target: ${JSON.stringify(bounds)}`);
}

async function screenshot(page, name, viewport) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(screenshotRoot, `${viewport.width}-${viewport.lang}-${name}.png`), fullPage: true, animations: 'disabled' });
}

for (const viewport of combinations) {
  test(`owner pages fit ${viewport.width}px ${viewport.lang} with responsive navigation and list layouts`, { timeout: 180000 }, async (context) => {
    const { page, state } = await openAdmin(context, viewport);
    for (const [name, route, title, marker] of pages) {
      await visit(page, route, title, marker, viewport.lang);
      await assertNoOverflow(page, `${name} ${viewport.width} ${viewport.lang}`);
      if (tablePages.has(name)) {
        assert.equal(await page.locator('main table:visible').count(), viewport.width >= 1280 ? 1 : 0, `${name}: expected desktop table visibility`);
        if (viewport.width < 1280) assert.ok(await page.locator('main [class~="xl:hidden"]:visible').count() > 0, `${name}: compact content should be visible`);
      }
      assert.equal(await page.locator('aside:visible').count(), viewport.width >= 1280 ? 1 : 0, 'desktop sidebar breakpoint');
      if (viewport.width < 1280) {
        await assertTappable(page.getByRole('button', { name: t(viewport.lang, 'nav.openNavigation'), exact: true }));
        const actionKeys = {
          users: 'usr.details', admins: 'usr.resetPassword', sessions: 'ses.forceLogout',
          'security-devices': 'sec.revoke', 'security-requests': 'sec.approveRevoke',
          'security-policies': 'sec.savePolicy', settings: 'set.saveAll', announcements: 'ann.publishToEveryone',
        };
        if (actionKeys[name]) await assertTappable(page.locator('main').getByRole('button', { name: t(viewport.lang, actionKeys[name]), exact: true }).first());
        if (name === 'courses') await assertTappable(page.locator('main').getByRole('button', { name: t(viewport.lang, 'ac2.studentsIn', { title: courseTitle }), exact: true }));
      }
      await screenshot(page, name, viewport);
    }
    if (viewport.width < 1280) {
      await page.getByRole('button', { name: t(viewport.lang, 'nav.openNavigation'), exact: true }).click();
      await page.locator('aside:visible').waitFor();
      await assertNoOverflow(page, `navigation drawer ${viewport.width}`);
      await screenshot(page, 'navigation', viewport);
      await page.locator('aside:visible').getByRole('link', { name: t(viewport.lang, 'nav.courses'), exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="route"]')?.textContent === '/admin/courses');
      assert.equal(await page.locator('aside:visible').count(), 0);
    }
    assert.deepEqual(state.mutations, [], 'responsive inspection must not change data');
  });
}

test('phone user forms, detail modal and generated passwords remain usable in both languages', { timeout: 120000 }, async (context) => {
  for (const lang of ['en', 'ar']) {
    const viewport = { width: 390, height: 844, lang };
    const { page, state } = await openAdmin(context, viewport, '/admin/users');
    await visit(page, '/admin/users', 'usr.title', longName, lang);
    await page.getByRole('button', { name: t(lang, 'usr.createUser'), exact: true }).click();
    let modal = page.getByRole('dialog');
    const password = modal.getByLabel(t(lang, 'usr.tempPassword'));
    await assertTappable(modal.getByRole('button', { name: t(lang, 'usr.generatePassword'), exact: true }));
    await modal.getByRole('button', { name: t(lang, 'usr.generatePassword'), exact: true }).click();
    const generated = await password.inputValue();
    assert.ok(generated.length >= 16 && /[A-Z]/.test(generated) && /[a-z]/.test(generated) && /\d/.test(generated) && /[^A-Za-z0-9]/.test(generated));
    await password.fill('Manual@12345');
    assert.equal(await password.inputValue(), 'Manual@12345');
    await assertNoOverflow(page, `create-user modal ${lang}`);
    await screenshot(page, 'create-user', viewport);
    await page.keyboard.press('Escape');
    await page.locator('main').getByRole('button', { name: t(lang, 'usr.details'), exact: true }).first().click();
    modal = page.getByRole('dialog');
    await modal.getByText(deviceId, { exact: true }).first().waitFor();
    await assertNoOverflow(page, `user-detail modal ${lang}`);
    await screenshot(page, 'user-detail', viewport);
    await page.keyboard.press('Escape');
    await visit(page, '/admin/admins', 'adm2.title', adminName, lang);
    await page.getByRole('button', { name: t(lang, 'adm2.new'), exact: true }).click();
    modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: t(lang, 'usr.generatePassword'), exact: true }).click();
    assert.ok((await modal.getByLabel(t(lang, 'usr.tempPassword')).inputValue()).length >= 16);
    await assertNoOverflow(page, `create-admin modal ${lang}`);
    await screenshot(page, 'create-admin', viewport);
    assert.deepEqual(state.mutations, []);
  }
});

test('course search keeps the latest results when an earlier request completes late', { timeout: 60000 }, async (context) => {
  const { page, state } = await openAdmin(context, { width: 390, height: 844, lang: 'en' }, '/admin/courses');
  await visit(page, '/admin/courses', 'ac2.allCourses', courseTitle, 'en');
  const gate = { started: deferred(), release: deferred(), finished: deferred() };
  state.courseGates.set('old', gate);
  const input = page.getByRole('textbox', { name: en['ac2.searchCourses'], exact: true });
  await input.fill('old');
  await gate.started.promise;
  await input.fill('new');
  await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Latest search result Biology'));
  gate.release.resolve();
  await gate.finished.promise;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.ok((await page.locator('main').innerText()).includes('Latest search result Biology'));
  assert.ok(!(await page.locator('main').innerText()).includes('Old slow search result'));
  assert.equal(await input.inputValue(), 'new');
  assert.deepEqual(state.mutations, []);
});
