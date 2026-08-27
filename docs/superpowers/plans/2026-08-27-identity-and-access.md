# Identity & Access Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four-role hierarchy with a protected owner, strict one-account/one-authorized-device login, and refresh tokens that never reach JavaScript-readable storage — on the existing Express/Mongo/React codebase, with a `node:test` suite proving every rule.

**Architecture:** A single permission map (`core/permissions.js`) feeds a `requirePermission()` middleware and an `assertCanManage()` guard in the admin service; `authorize()` stays for teacher/course routes. A `Device` collection with a partial unique index makes the database enforce one active device per user; `AuthService.login` binds or rejects after the password check, and every authenticated request re-checks the session's device hash. The web client keeps the access token in memory and relies on the httpOnly cookie for refresh; native clients declare `x-client-platform` to receive a body copy.

**Tech Stack:** Node 22 (`node:test`, `node --test`), Express 4, Mongoose 8, mongodb-memory-server 11, Zod 3, bcryptjs, jsonwebtoken, React 19 + Vite 8 + axios.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-27-identity-and-access-design.md`. Section numbers below refer to it.
- `server/storage/` and `server/logs/` are read-only for the whole mission. Tests must write only under `os.tmpdir()`.
- No public registration route may be added. No route may accept `role: 'super_admin'`.
- Existing audit action names (`LOGIN`, `LOGIN_FAILED`, `DEVICE_MISMATCH`, …) are kept; new ones are added to `AUDIT_ACTIONS` (an unknown action makes `audit()` fail silently, so every new action must be in the enum).
- Password strength rule everywhere: 8–128 chars, at least one lowercase, one uppercase, one digit.
- Roles: `super_admin | admin | teacher | student`. `ROLE_RANK = { student: 0, teacher: 1, admin: 2, super_admin: 3 }`.
- Owner-only settings keys: `sessionTimeoutMinutes`, `maxLoginAttempts`, `lockoutMinutes`, `requireEmailVerification`, `deviceBindingEnabled`.
- User-facing device rejection sentence, verbatim: *This account is already linked to another device. Contact an administrator or request a device reset.*
- Generic credential failure, verbatim: *Invalid username or password* — returned for wrong password **regardless** of account state.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit …` (the repo has no user config).
- All shell commands below run from `d:\Ahliyaa students` unless a `cd` is shown. Use the Bash tool (POSIX sh).

---

## File map

**Create**
- `server/tests/helpers/harness.js` — boots in-memory Mongo + app on an ephemeral port with temp storage/logs; `api()`, `loginAs()`, `loginAndOnboard()`, `createUser()`, `stop()`.
- `server/tests/rbac.test.js`, `server/tests/owner.test.js`, `server/tests/devices.test.js`, `server/tests/auth.test.js`, `server/tests/seed.test.js`, `server/tests/permissions.test.js`.
- `server/eslint.config.js`, `server/.env.example`, `client/.env.example`.
- `server/src/core/permissions.js` — permission constants, role map, `hasPermission`, `isAdminRole`, `canAssignRole`, `ROLE_RANK`.
- `server/src/models/Device.js`, `server/src/models/Migration.js`.
- `server/src/modules/auth/device.service.js` — `bindOrVerify`, `revoke`, `activeFor`, `historyFor`, `hashDeviceId`.
- `server/src/scripts/seed.js`, `server/src/scripts/migrate.js`, `server/src/migrations/001-roles-and-devices.js`.
- `client/src/api/token.js` — in-memory access token.
- `client/src/utils/roles.js` — `isAdminRole`, `roleMatches`, `homeFor`, `ROLE_LABEL`.

**Modify**
- `server/package.json` (scripts, devDeps), `server/src/config/env.js`, `server/src/config/logger.js`, `server/src/config/constants.js`, `server/src/config/settingsCache.js`, `server/src/seed.js`, `server/src/server.js`.
- `server/src/middleware/authorize.js`, `authenticate.js`, `courseAccess.js`, `security.js`, `rateLimiters.js`.
- `server/src/models/Session.js`, `server/src/models/User.js` (no change needed — enum derives from `ROLES`).
- `server/src/modules/auth/auth.service.js`, `auth.controller.js`, `auth.routes.js`, `auth.validators.js`.
- `server/src/modules/admin/admin.service.js`, `admin.routes.js`.
- `server/src/modules/enrollments/enrollments.routes.js`, `analytics/analytics.routes.js`, `anticheat/anticheat.routes.js`, `announcements/announcements.routes.js`, `files/files.routes.js`, `files/files.service.js`, `qa/qa.routes.js`, `search/search.routes.js`, `courses/courses.controller.js`, `courses/courses.service.js`, `videos/videos.service.js`.
- `server/tests/smoke.test.js` (converted to `node:test`).
- `client/src/api/axios.js`, `client/src/context/AuthContext.jsx`, `client/src/hooks/useAntiCheat.js`, `client/src/App.jsx`, `client/src/layouts/MainLayout.jsx`, `client/src/pages/auth/LoginPage.jsx`, `client/src/pages/auth/OnboardingPage.jsx`, `client/src/pages/admin/AdminUsers.jsx`, `client/src/pages/admin/AdminSettings.jsx`.
- `docs/SECURITY.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `README.md`, `CLAUDE.md`.

---

### Task 1: Test harness and `node:test` conversion

**Files:**
- Create: `server/tests/helpers/harness.js`
- Modify: `server/tests/smoke.test.js` (full rewrite), `server/package.json:6-10`, `server/src/config/env.js:35-40`, `server/src/config/logger.js:6`, `server/src/middleware/rateLimiters.js:1-12`

**Interfaces:**
- Produces: `startApp() → Promise<{ baseUrl, api, loginAs, loginAndOnboard, createUser, stop, tmpDir }>`
  - `api(method, path, { token, body, deviceId, fingerprint, platform, cookie, headers }) → Promise<{ status, data, headers, cookies, setCookies }>`
  - `loginAs(username, password, { deviceId, platform }) → Promise<{ token, cookies, deviceId, user, data }>` (throws if status ≠ 200)
  - `loginAndOnboard(username, password, opts)` — same, but completes `/auth/set-password` when `mustChangePassword` is true
  - `createUser(adminToken, { name, username, email, password, role, mustChangePassword = false }) → Promise<data>` (POST `/admin/users`, throws unless 201)
- Test env values (fixed, used by every later test): legacy admin `admin` / `Admin@12345`; owner `owner` / `Owner@12345` (`owner@test.local`); Abdullah `abdullah.dabbas` / `Abdul@12345` (`abdullah@test.local`). Owner and Abdullah are created in Task 4; until then the harness only sets the variables.

- [ ] **Step 1: Add `LOG_DIR` to env and logger, and relax rate limits under test**

In `server/src/config/env.js`, after the `LOG_LEVEL` line inside `envSchema`, add:

```js
  LOG_DIR: z.string().optional(),
```

and at the bottom, after the `env.STORAGE_ROOT = …` line, add:

```js
env.LOG_DIR = env.LOG_DIR || path.join(__dirname, '..', '..', 'logs');
```

In `server/src/config/logger.js`, replace line 6:

```js
const logDir = path.join(__dirname, '..', '..', 'logs');
```
with
```js
const logDir = env.LOG_DIR;
```

In `server/src/middleware/rateLimiters.js`, replace the top of the file (lines 1–12) with:

```js
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// The suite fires dozens of logins from 127.0.0.1; production limits stay as written.
const TEST_MULTIPLIER = env.NODE_ENV === 'test' ? 100 : 1;

const build = (windowMs, max, message, options = {}) =>
  rateLimit({
    windowMs,
    max: max * TEST_MULTIPLIER,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message, code: 'RATE_LIMITED' },
    ...options,
  });
```

- [ ] **Step 2: Write the harness**

Create `server/tests/helpers/harness.js`:

```js
/**
 * Shared test harness. Requiring this file configures the environment BEFORE
 * src/config/env is loaded, so every test process runs against an in-memory
 * MongoDB with storage and logs under a throwaway temp directory.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-test-'));

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable-forces-memory';
process.env.STORAGE_ROOT = path.join(tmpDir, 'storage');
process.env.LOG_DIR = path.join(tmpDir, 'logs');
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.SMTP_HOST = '';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.SUPER_ADMIN_NAME = 'Test Owner';
process.env.SUPER_ADMIN_USERNAME = 'owner';
process.env.SUPER_ADMIN_EMAIL = 'owner@test.local';
process.env.SUPER_ADMIN_INITIAL_PASSWORD = 'Owner@12345';
process.env.DEFAULT_ADMIN_NAME = 'Abdullah Dabbas';
process.env.DEFAULT_ADMIN_USERNAME = 'abdullah.dabbas';
process.env.DEFAULT_ADMIN_EMAIL = 'abdullah@test.local';
process.env.DEFAULT_ADMIN_INITIAL_PASSWORD = 'Abdul@12345';

const CREDENTIALS = {
  admin: { username: 'admin', password: 'Admin@12345' },
  owner: { username: 'owner', password: 'Owner@12345' },
  abdullah: { username: 'abdullah.dabbas', password: 'Abdul@12345' },
};

const makeApi = (baseUrl) => async (method, path, opts = {}) => {
  const {
    token, body, deviceId = 'device-default-0001', fingerprint, platform, cookie, headers = {},
  } = opts;
  const h = {
    'Content-Type': 'application/json',
    'x-device-id': deviceId,
    ...(fingerprint && { 'x-fingerprint': fingerprint }),
    ...(platform && { 'x-client-platform': platform }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(cookie && { Cookie: cookie }),
    ...headers,
  };
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: h,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const cookies = setCookies.map((c) => c.split(';')[0]).join('; ');
  return { status: res.status, data, headers: res.headers, cookies, setCookies };
};

const startApp = async () => {
  const { connectDB, disconnectDB } = require('../../src/config/db');
  const app = require('../../src/app');
  const seed = require('../../src/seed');

  await connectDB();
  // Wait for every model's indexes (the Device partial unique index is load-bearing).
  const mongoose = require('mongoose');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seed();

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = makeApi(baseUrl);

  const loginAs = async (username, password, { deviceId = `device-${username}`, platform } = {}) => {
    const r = await api('POST', '/auth/login', { body: { username, password, deviceId }, deviceId, platform });
    if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status} ${r.data.message || ''} ${r.data.code || ''}`);
    return { token: r.data.accessToken, cookies: r.cookies, deviceId, user: r.data.user, data: r.data };
  };

  const loginAndOnboard = async (username, password, opts = {}) => {
    const session = await loginAs(username, password, opts);
    if (session.user?.mustChangePassword) {
      const r = await api('POST', '/auth/set-password', { token: session.token, deviceId: session.deviceId, body: { password } });
      if (r.status !== 200) throw new Error(`set-password ${username} failed: ${r.status} ${r.data.message || ''}`);
      session.user = r.data;
    }
    return session;
  };

  const createUser = async (adminToken, { name, username, email, password, role, mustChangePassword = false }, deviceId = 'device-admin') => {
    const r = await api('POST', '/admin/users', {
      token: adminToken, deviceId,
      body: { name, username, email, password, role, mustChangePassword },
    });
    if (r.status !== 201) throw new Error(`createUser ${username} failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  };

  const stop = async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { baseUrl, api, loginAs, loginAndOnboard, createUser, stop, tmpDir };
};

module.exports = { startApp, CREDENTIALS, tmpDir };
```

- [ ] **Step 3: Convert the smoke test to `node:test`**

Replace the entire contents of `server/tests/smoke.test.js` with:

```js
/**
 * End-to-end API smoke test: admin → teacher builds a course and quiz → admin
 * issues codes → student enrols, takes the quiz with anti-cheat events →
 * teacher grades → analytics → admin controls. Runs in-process against the
 * harness (in-memory MongoDB, temp storage).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app;
let api;
before(async () => { app = await startApp(); api = app.api; });
after(async () => { await app.stop(); });

const ADMIN_DEVICE = 'device-admin-01';
const TEACHER_DEVICE = 'device-teach-01';
const STUDENT_DEVICE = 'device-stud-01';

let adminToken, teacherToken, studentToken, courseId, sectionId, quizId, attemptId, questionIds, accessCode;

test('health check', async () => {
  const res = await fetch(`${app.baseUrl}/api/health`);
  assert.equal(res.status, 200);
});

test('admin login', async () => {
  const { status, data } = await api('POST', '/auth/login', {
    deviceId: ADMIN_DEVICE,
    body: { ...CREDENTIALS.admin, deviceId: ADMIN_DEVICE },
  });
  assert.equal(status, 200, data.message);
  adminToken = data.accessToken;
});

test('login rejects bad password + records history', async () => {
  const { status } = await api('POST', '/auth/login', {
    deviceId: ADMIN_DEVICE,
    body: { username: 'admin', password: 'WrongPass1', deviceId: ADMIN_DEVICE },
  });
  assert.equal(status, 401);
});

test('admin creates teacher', async () => {
  const { status, data } = await api('POST', '/admin/users', {
    token: adminToken, deviceId: ADMIN_DEVICE,
    body: { name: 'Prof. Ada', username: 'ada', email: 'ada@lms.local', password: 'Teach@1234', role: 'teacher', mustChangePassword: false },
  });
  assert.equal(status, 201, data.message);
});

test('admin creates student', async () => {
  const { status, data } = await api('POST', '/admin/users', {
    token: adminToken, deviceId: ADMIN_DEVICE,
    body: { name: 'Student Sam', username: 'sam', email: 'sam@lms.local', password: 'Learn@1234', role: 'student', mustChangePassword: false },
  });
  assert.equal(status, 201, data.message);
});

test('teacher login', async () => {
  const { status, data } = await api('POST', '/auth/login', {
    deviceId: TEACHER_DEVICE,
    body: { username: 'ada', password: 'Teach@1234', deviceId: TEACHER_DEVICE },
  });
  assert.equal(status, 200, data.message);
  teacherToken = data.accessToken;
});

test('teacher creates course', async () => {
  const { status, data } = await api('POST', '/courses', {
    token: teacherToken, deviceId: TEACHER_DEVICE,
    body: { title: 'Intro to Networks', description: 'CCNA prep', category: 'IT', difficulty: 'beginner', visibility: 'private', isPublished: true },
  });
  assert.equal(status, 201, data.message);
  courseId = data._id;
});

test('teacher adds section + lesson', async () => {
  const s = await api('POST', `/courses/${courseId}/sections`, { token: teacherToken, deviceId: TEACHER_DEVICE, body: { title: 'Week 1' } });
  assert.equal(s.status, 201, s.data.message);
  sectionId = s.data._id;
  const l = await api('POST', `/courses/${courseId}/lessons`, {
    token: teacherToken, deviceId: TEACHER_DEVICE,
    body: { section: sectionId, title: 'OSI Model', type: 'text', content: 'Seven layers...', durationMinutes: 10 },
  });
  assert.equal(l.status, 201, l.data.message);
});

test('teacher creates questions (multiple types)', async () => {
  const post = (body) => api('POST', `/quizzes/courses/${courseId}/questions`, { token: teacherToken, deviceId: TEACHER_DEVICE, body });
  const mc = await post({
    type: 'multiple_choice', text: 'Which layer routes packets?',
    options: [
      { id: 'a', text: 'Layer 2', isCorrect: false },
      { id: 'b', text: 'Layer 3', isCorrect: true },
      { id: 'c', text: 'Layer 7', isCorrect: false },
    ],
    points: 2, explanation: 'Network layer routes.', tags: ['osi'],
  });
  assert.equal(mc.status, 201, JSON.stringify(mc.data));
  const tf = await post({
    type: 'true_false', text: 'TCP is connectionless.',
    options: [{ id: 'true', text: 'True', isCorrect: false }, { id: 'false', text: 'False', isCorrect: true }],
  });
  assert.equal(tf.status, 201, JSON.stringify(tf.data));
  const sa = await post({ type: 'short_answer', text: 'Protocol for secure shell?', correctAnswers: ['ssh'], points: 1 });
  assert.equal(sa.status, 201, JSON.stringify(sa.data));
  const fb = await post({ type: 'fill_blanks', text: 'HTTP uses port {{blank}} and HTTPS uses {{blank}}.', correctAnswers: ['80', '443'] });
  assert.equal(fb.status, 201, JSON.stringify(fb.data));
  const essay = await post({ type: 'essay', text: 'Explain the three-way handshake.', points: 5 });
  assert.equal(essay.status, 201, JSON.stringify(essay.data));
});

test('teacher lists question bank (sees answers)', async () => {
  const { status, data } = await api('GET', `/quizzes/courses/${courseId}/questions?limit=50`, { token: teacherToken, deviceId: TEACHER_DEVICE });
  assert.equal(status, 200);
  assert.equal(data.items.length, 5);
  questionIds = data.items.map((q) => q._id);
  const mc = data.items.find((q) => q.type === 'multiple_choice');
  assert.ok(mc.options.some((o) => o.isCorrect === true), 'teacher view must include isCorrect');
});

test('teacher creates + publishes quiz', async () => {
  const { status, data } = await api('POST', `/quizzes/courses/${courseId}`, {
    token: teacherToken, deviceId: TEACHER_DEVICE,
    body: {
      title: 'Week 1 Quiz', questions: questionIds, timeLimitMinutes: 30,
      passingScore: 50, maxAttempts: 2, isPublished: true,
      shuffleQuestions: false, shuffleAnswers: false, showResultsImmediately: true, showExplanations: true,
    },
  });
  assert.equal(status, 201, JSON.stringify(data));
  quizId = data._id;
});

test('teacher blocked from generating access codes', async () => {
  const { status } = await api('POST', `/enrollments/courses/${courseId}/codes`, {
    token: teacherToken, deviceId: TEACHER_DEVICE, body: { count: 2, maxUses: 1 },
  });
  assert.equal(status, 403);
});

test('admin generates access codes', async () => {
  const { status, data } = await api('POST', `/enrollments/courses/${courseId}/codes`, {
    token: adminToken, deviceId: ADMIN_DEVICE, body: { count: 2, maxUses: 1 },
  });
  assert.equal(status, 201, JSON.stringify(data));
  accessCode = data[0].code;
});

test('student login', async () => {
  const { status, data } = await api('POST', '/auth/login', {
    deviceId: STUDENT_DEVICE,
    body: { username: 'sam', password: 'Learn@1234', deviceId: STUDENT_DEVICE },
  });
  assert.equal(status, 200, data.message);
  studentToken = data.accessToken;
});

test('student blocked from course before enrollment', async () => {
  const { status } = await api('GET', `/courses/${courseId}`, { token: studentToken, deviceId: STUDENT_DEVICE });
  assert.equal(status, 403);
});

test('student redeems code + sees course', async () => {
  const r = await api('POST', '/enrollments/redeem', { token: studentToken, deviceId: STUDENT_DEVICE, body: { code: accessCode } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const c = await api('GET', `/courses/${courseId}`, { token: studentToken, deviceId: STUDENT_DEVICE });
  assert.equal(c.status, 200);
  assert.equal(c.data.curriculum.length, 1);
});

test('student starts quiz — no answer leakage', async () => {
  const { status, data } = await api('POST', `/quizzes/courses/${courseId}/${quizId}/start`, { token: studentToken, deviceId: STUDENT_DEVICE });
  assert.equal(status, 201, JSON.stringify(data));
  attemptId = data.attemptId;
  assert.equal(data.questions.length, 5);
  for (const q of data.questions) {
    assert.equal(q.correctAnswers, undefined, 'correctAnswers must not leak');
    assert.equal(q.explanation, undefined, 'explanation must not leak');
    for (const o of q.options || []) assert.equal(o.isCorrect, undefined, 'isCorrect must not leak');
  }
});

test('anti-cheat events recorded', async () => {
  const { status, data } = await api('POST', '/anticheat/events', {
    token: studentToken, deviceId: STUDENT_DEVICE,
    body: { attemptId, events: [{ type: 'tab_switch' }, { type: 'copy' }, { type: 'devtools_open' }] },
  });
  assert.equal(status, 200, JSON.stringify(data));
  assert.ok(data.riskScore > 0);
});

test('student submits quiz — auto-grading + essay pending', async () => {
  const start = await api('GET', `/quizzes/attempts/${attemptId}`, { token: studentToken, deviceId: STUDENT_DEVICE });
  const snapshot = start.data.questionsSnapshot || [];
  const findByType = (t) => snapshot.find((q) => q.type === t);
  const answers = [
    { questionId: findByType('multiple_choice').questionId, selectedOptionIds: ['b'] },
    { questionId: findByType('true_false').questionId, selectedOptionIds: ['false'] },
    { questionId: findByType('short_answer').questionId, textAnswer: 'SSH' },
    { questionId: findByType('fill_blanks').questionId, blanks: ['80', '443'] },
    { questionId: findByType('essay').questionId, textAnswer: 'SYN, SYN-ACK, ACK.' },
  ];
  const { status, data } = await api('POST', `/quizzes/attempts/${attemptId}/submit`, {
    token: studentToken, deviceId: STUDENT_DEVICE, body: { answers },
  });
  assert.equal(status, 200, JSON.stringify(data.message));
  assert.equal(data.pendingManualGrading, true);
  assert.equal(data.score, 5, `expected 5 got ${data.score}`);
});

test('teacher grades essay — attempt finalized', async () => {
  const attempt = await api('GET', `/quizzes/attempts/${attemptId}`, { token: teacherToken, deviceId: TEACHER_DEVICE });
  const essayQ = attempt.data.questionsSnapshot.find((q) => q.type === 'essay');
  const { status, data } = await api('POST', `/quizzes/attempts/${attemptId}/grade`, {
    token: teacherToken, deviceId: TEACHER_DEVICE,
    body: { grades: [{ questionId: essayQ.questionId, points: 4, feedback: 'Good, mention flags explicitly.' }] },
  });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.score, 9);
  assert.equal(data.status, 'graded');
  assert.equal(data.passed, true);
});

test('cheat report visible to teacher', async () => {
  const { status, data } = await api('GET', `/anticheat/attempts/${attemptId}`, { token: teacherToken, deviceId: TEACHER_DEVICE });
  assert.equal(status, 200);
  assert.equal(data.events.length, 3);
});

test('quiz stats + student analytics', async () => {
  const s = await api('GET', `/quizzes/courses/${courseId}/${quizId}/stats`, { token: teacherToken, deviceId: TEACHER_DEVICE });
  assert.equal(s.status, 200);
  assert.equal(s.data.attempts, 1);
  const d = await api('GET', '/analytics/student', { token: studentToken, deviceId: STUDENT_DEVICE });
  assert.equal(d.status, 200);
  assert.equal(d.data.stats.enrolledCourses, 1);
});

test('teacher forbidden from admin + other course isolation', async () => {
  const a = await api('GET', '/admin/users', { token: teacherToken, deviceId: TEACHER_DEVICE });
  assert.equal(a.status, 403);
});

test('teacher forbidden from enrolling student directly', async () => {
  const res = await api('POST', `/enrollments/courses/${courseId}/students`, {
    token: teacherToken, deviceId: TEACHER_DEVICE, body: { student: 'sam' },
  });
  assert.equal(res.status, 403);
});

test('admin can enroll student directly', async () => {
  const stud = await api('POST', '/admin/users', {
    token: adminToken, deviceId: ADMIN_DEVICE,
    body: { name: 'Direct Student', username: 'directstud', email: 'direct@lms.local', password: 'Learn@1234', role: 'student', mustChangePassword: false },
  });
  assert.equal(stud.status, 201);
  const res = await api('POST', `/enrollments/courses/${courseId}/students`, {
    token: adminToken, deviceId: ADMIN_DEVICE, body: { student: 'directstud' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
});

test('single-session: second login on the same device kills the first session', async () => {
  const second = await api('POST', '/auth/login', {
    deviceId: STUDENT_DEVICE,
    body: { username: 'sam', password: 'Learn@1234', deviceId: STUDENT_DEVICE },
  });
  assert.equal(second.status, 200);
  const old = await api('GET', '/auth/me', { token: studentToken, deviceId: STUDENT_DEVICE });
  assert.equal(old.status, 401);
  assert.equal(old.data.code, 'SESSION_TERMINATED');
  studentToken = second.data.accessToken;
});

test('admin settings update + audit logs', async () => {
  const upd = await api('PUT', '/admin/settings', { token: adminToken, deviceId: ADMIN_DEVICE, body: { platformName: 'Smoke LMS' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.settings.platformName, 'Smoke LMS');
  const logs = await api('GET', '/admin/audit-logs?limit=50', { token: adminToken, deviceId: ADMIN_DEVICE });
  assert.equal(logs.status, 200);
  assert.ok(logs.data.items.length >= 5);
});

test('admin suspends student → student locked out', async () => {
  const users = await api('GET', '/admin/users?role=student', { token: adminToken, deviceId: ADMIN_DEVICE });
  const sam = users.data.items.find((u) => u.username === 'sam');
  const susp = await api('POST', `/admin/users/${sam._id}/status`, { token: adminToken, deviceId: ADMIN_DEVICE, body: { status: 'suspended' } });
  assert.equal(susp.status, 200);
  const me = await api('GET', '/auth/me', { token: studentToken, deviceId: STUDENT_DEVICE });
  assert.ok([401, 403].includes(me.status));
  await api('POST', `/admin/users/${sam._id}/status`, { token: adminToken, deviceId: ADMIN_DEVICE, body: { status: 'active' } });
});

test('global search (admin)', async () => {
  const { status, data } = await api('GET', '/search?q=Networks', { token: adminToken, deviceId: ADMIN_DEVICE });
  assert.equal(status, 200);
  assert.ok(data.courses.length >= 1);
});
```

Two deliberate changes from the original script: the single-session scenario now re-logs in on the **same** device (a different device will be rejected once Task 8 lands), and the settings scenario writes `platformName` instead of `sessionTimeoutMinutes` (which becomes owner-only in Task 5).

- [ ] **Step 4: Point `npm test` at `node --test`**

In `server/package.json` replace the `scripts` block with:

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node --test --test-concurrency=2 \"tests/*.test.js\""
  },
```

- [ ] **Step 5: Run the suite**

Run: `cd server && npm test 2>&1 | tail -15`
Expected: `# pass 29`, `# fail 0`. Confirm nothing was written to the real trees: `git -C .. status --short server/storage server/logs` prints nothing (both are ignored anyway) and `ls server/logs` shows no new timestamps.

- [ ] **Step 6: Commit**

```bash
git add server/tests server/package.json server/src/config/env.js server/src/config/logger.js server/src/middleware/rateLimiters.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "test: node:test harness with isolated storage/logs; convert smoke suite

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server ESLint

**Files:**
- Create: `server/eslint.config.js`
- Modify: `server/package.json` (devDependencies, `lint` script)

- [ ] **Step 1: Install and configure**

Run: `cd server && npm install --save-dev eslint@^10.2.1 @eslint/js@^10.0.1 globals@^17.5.0`

Create `server/eslint.config.js`:

```js
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'storage/**', 'logs/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
    },
  },
];
```

Add to `server/package.json` scripts: `"lint": "eslint ."`.

- [ ] **Step 2: Run lint and fix only what it reports**

Run: `cd server && npm run lint`
Expected: a short list of findings (unused imports such as `objectId` in `admin.routes.js`, `requireCourseAccess` in `videos.routes.js`, `env` in `videos.service.js`, `securityLogger` where unused, `z` in some route files). Fix each by removing the unused binding — nothing else. Re-run until clean.

- [ ] **Step 3: Commit**

```bash
git add server/eslint.config.js server/package.json server/package-lock.json server/src
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "chore(server): add ESLint flat config and fix unused bindings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Roles, permission map, `authorize`/`requirePermission`, `isAdminRole` sweep

**Files:**
- Create: `server/src/core/permissions.js`, `server/tests/permissions.test.js`
- Modify: `server/src/config/constants.js:7`, `server/src/middleware/authorize.js`, `server/src/middleware/authenticate.js:74`, `server/src/middleware/courseAccess.js:26,59-60`, `server/src/modules/admin/admin.routes.js:42-95`, `server/src/modules/enrollments/enrollments.routes.js:33-40`, `server/src/modules/analytics/analytics.routes.js:23-27`, `server/src/modules/anticheat/anticheat.routes.js:41`, `server/src/modules/announcements/announcements.routes.js:52,91`, `server/src/modules/files/files.routes.js:35`, `server/src/modules/files/files.service.js:42`, `server/src/modules/qa/qa.routes.js:52,81`, `server/src/modules/search/search.routes.js:40,52`, `server/src/modules/courses/courses.controller.js:9,15`, `server/src/modules/courses/courses.service.js:64`, `server/src/modules/videos/videos.service.js:343`

**Interfaces:**
- Produces: `require('../core/permissions')` → `{ PERMISSIONS, ROLE_PERMISSIONS, ROLE_RANK, hasPermission(role, perm), isAdminRole(role), canAssignRole(actorRole, targetRole) }`
- Produces: `require('../middleware/authorize')` → default `authorize(...roles)` plus `.requirePermission(...perms)`
- Produces: `ROLES.SUPER_ADMIN === 'super_admin'`, `ROLE_RANK` in `config/constants.js`

- [ ] **Step 1: Write the failing unit test**

Create `server/tests/permissions.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS: P, hasPermission, isAdminRole, canAssignRole, ROLE_RANK } = require('../src/core/permissions');

test('rank order', () => {
  assert.deepEqual(ROLE_RANK, { student: 0, teacher: 1, admin: 2, super_admin: 3 });
});

test('student has no platform permissions; teacher may manage own courses', () => {
  assert.equal(hasPermission('student', P.USERS_VIEW), false);
  assert.equal(hasPermission('student', P.COURSES_MANAGE_OWN), false);
  assert.equal(hasPermission('teacher', P.COURSES_MANAGE_OWN), true);
  assert.equal(hasPermission('teacher', P.USERS_CREATE), false);
});

test('admin has operational permissions but not owner-only ones', () => {
  assert.equal(hasPermission('admin', P.USERS_CREATE), true);
  assert.equal(hasPermission('admin', P.ACCESS_CODES_MANAGE), true);
  assert.equal(hasPermission('admin', P.SETTINGS_MANAGE), true);
  assert.equal(hasPermission('admin', P.ADMINS_VIEW), true);
  assert.equal(hasPermission('admin', P.ADMINS_CREATE), false);
  assert.equal(hasPermission('admin', P.ADMINS_MANAGE), false);
  assert.equal(hasPermission('admin', P.SECURITY_MANAGE), false);
});

test('super_admin has every permission', () => {
  for (const perm of Object.values(P)) assert.equal(hasPermission('super_admin', perm), true, perm);
});

test('unknown role has nothing', () => {
  assert.equal(hasPermission('ghost', P.USERS_VIEW), false);
  assert.equal(hasPermission(undefined, P.USERS_VIEW), false);
});

test('isAdminRole', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('super_admin'), true);
  assert.equal(isAdminRole('teacher'), false);
});

test('canAssignRole: nobody assigns super_admin; admin needs admins.create', () => {
  assert.equal(canAssignRole('super_admin', 'super_admin'), false);
  assert.equal(canAssignRole('admin', 'super_admin'), false);
  assert.equal(canAssignRole('super_admin', 'admin'), true);
  assert.equal(canAssignRole('admin', 'admin'), false);
  assert.equal(canAssignRole('admin', 'teacher'), true);
  assert.equal(canAssignRole('admin', 'student'), true);
  assert.equal(canAssignRole('teacher', 'student'), true);
  assert.equal(canAssignRole('teacher', 'teacher'), false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && node --test tests/permissions.test.js`
Expected: fails with `Cannot find module '../src/core/permissions'`.

- [ ] **Step 3: Add the roles and the permission map**

In `server/src/config/constants.js`, replace line 7:

```js
  ROLES: { ADMIN: 'admin', TEACHER: 'teacher', STUDENT: 'student' },
```
with
```js
  ROLES: { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', TEACHER: 'teacher', STUDENT: 'student' },
  ROLE_RANK: { student: 0, teacher: 1, admin: 2, super_admin: 3 },
```

Create `server/src/core/permissions.js`:

```js
const { ROLES, ROLE_RANK } = require('../config/constants');

/**
 * Central permission model. Roles map to permission sets; routes declare the
 * permission they need with requirePermission(); services that act on a
 * specific target still apply owner/admin protections (admin.service) and
 * course ownership (courseAccess) on top of this.
 */
const PERMISSIONS = Object.freeze({
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_SUSPEND: 'users.suspend',
  USERS_DELETE: 'users.delete',
  USERS_RESET_PASSWORD: 'users.reset_password',
  USERS_FORCE_LOGOUT: 'users.force_logout',
  ADMINS_VIEW: 'admins.view',
  ADMINS_CREATE: 'admins.create',
  ADMINS_MANAGE: 'admins.manage',
  COURSES_MANAGE_ANY: 'courses.manage_any',
  COURSES_MANAGE_OWN: 'courses.manage_own',
  ENROLLMENTS_MANAGE: 'enrollments.manage',
  ACCESS_CODES_MANAGE: 'access_codes.manage',
  SESSIONS_VIEW: 'sessions.view',
  SESSIONS_REVOKE: 'sessions.revoke',
  DEVICES_VIEW: 'devices.view',
  DEVICES_RESET: 'devices.reset',
  AUDIT_VIEW: 'audit.view',
  LOGIN_HISTORY_VIEW: 'login_history.view',
  ANTICHEAT_PLATFORM: 'anticheat.platform',
  ANALYTICS_GLOBAL: 'analytics.global',
  ANNOUNCEMENTS_GLOBAL: 'announcements.global',
  FILES_GLOBAL: 'files.global',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
  SECURITY_MANAGE: 'security.manage',
  MAINTENANCE_MANAGE: 'maintenance.manage',
});

const OWNER_ONLY = new Set([PERMISSIONS.ADMINS_CREATE, PERMISSIONS.ADMINS_MANAGE, PERMISSIONS.SECURITY_MANAGE]);

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.STUDENT]: new Set(),
  [ROLES.TEACHER]: new Set([PERMISSIONS.COURSES_MANAGE_OWN]),
  [ROLES.ADMIN]: new Set(Object.values(PERMISSIONS).filter((p) => !OWNER_ONLY.has(p))),
  [ROLES.SUPER_ADMIN]: new Set(Object.values(PERMISSIONS)),
});

const hasPermission = (role, permission) => Boolean(ROLE_PERMISSIONS[role]?.has(permission));

const isAdminRole = (role) => role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;

/**
 * May `actorRole` assign `targetRole` to another account?
 * super_admin is never assignable (bootstrap only); admin needs admins.create;
 * anything else must rank strictly below the actor.
 */
const canAssignRole = (actorRole, targetRole) => {
  if (targetRole === ROLES.SUPER_ADMIN) return false;
  if (targetRole === ROLES.ADMIN) return hasPermission(actorRole, PERMISSIONS.ADMINS_CREATE);
  if (!(targetRole in ROLE_RANK) || !(actorRole in ROLE_RANK)) return false;
  return ROLE_RANK[targetRole] < ROLE_RANK[actorRole];
};

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, ROLE_RANK, hasPermission, isAdminRole, canAssignRole };
```

- [ ] **Step 4: Run the unit test**

Run: `cd server && node --test tests/permissions.test.js`
Expected: `# pass 7`.

- [ ] **Step 5: Rewrite `authorize.js`**

Replace `server/src/middleware/authorize.js` entirely:

```js
const ApiError = require('../core/ApiError');
const { ROLES } = require('../config/constants');
const { hasPermission } = require('../core/permissions');

/**
 * Role-based gate. Usage: authorize('admin', 'teacher').
 * The owner (super_admin) satisfies any check that admits 'admin'.
 */
const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const role = req.user.role;
  const ok = roles.includes(role) || (role === ROLES.SUPER_ADMIN && roles.includes(ROLES.ADMIN));
  if (!ok) return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
  next();
};

/** Permission gate. Usage: requirePermission(PERMISSIONS.USERS_CREATE). All listed permissions are required. */
const requirePermission = (...permissions) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  const missing = permissions.find((p) => !hasPermission(req.user.role, p));
  if (missing) return next(ApiError.forbidden(`Missing permission: ${missing}`, 'FORBIDDEN'));
  next();
};

module.exports = authorize;
module.exports.authorize = authorize;
module.exports.requirePermission = requirePermission;
```

- [ ] **Step 6: Sweep every `role === 'admin'` comparison through `isAdminRole()`**

Each edit below adds `const { isAdminRole } = require('../core/permissions');` (path adjusted per file) near the other requires, then changes the comparison.

`server/src/middleware/authenticate.js:74`
```js
    if (settings.maintenanceMode && !isAdminRole(user.role)) {
```

`server/src/middleware/courseAccess.js:26` and `:59`
```js
  if (isAdminRole(req.user.role)) return next();
```

`server/src/modules/announcements/announcements.routes.js:91`
```js
  if (!isAdminRole(req.user.role) && !isAuthor) throw ApiError.forbidden('Not your announcement');
```

`server/src/modules/courses/courses.controller.js:9` and `:15`
```js
  if (!isAdminRole(req.user.role)) delete req.body.teacher;
```

`server/src/modules/courses/courses.service.js:64`
```js
    const isStaff = isAdminRole(user.role) || String(course.teacher) === String(user.id);
```

`server/src/modules/files/files.service.js:42`
```js
    if (!isAdminRole(actor.role) && String(asset.uploadedBy) !== String(actor.id)) {
```

`server/src/modules/qa/qa.routes.js:52` and `:81`
```js
  const isStaff = isAdminRole(req.user.role) || String(course?.teacher) === String(req.user.id);
```

`server/src/modules/search/search.routes.js:40` and `:52` — replace `user.role === 'admin'` with `isAdminRole(user.role)` in both ternaries.

`server/src/modules/videos/videos.service.js:343`
```js
    if (!isAdminRole(user.role)) {
```

- [ ] **Step 7: Move admin-module and platform routes to `requirePermission`**

`server/src/modules/admin/admin.routes.js` — replace lines 1–8 (requires) so they read:

```js
const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/authorize');
const asyncHandler = require('../../core/asyncHandler');
const { validate, paginationSchema, objectId } = require('../../middleware/validate');
const { passwordRule } = require('../auth/auth.validators');
const { PERMISSIONS: P } = require('../../core/permissions');
const AdminService = require('./admin.service');
```

Replace the `userListQuery` role enum with `z.enum(['super_admin', 'admin', 'teacher', 'student']).optional()`.

Replace `router.use(authenticate, authorize('admin'));` with `router.use(authenticate);` and add the permission gate to every route (the service calls are unchanged in this task; Task 5 changes their signatures):

```js
router.post('/users', requirePermission(P.USERS_CREATE), validate(createUserSchema), …);
router.get('/users', requirePermission(P.USERS_VIEW), validate(userListQuery, 'query'), …);
router.get('/users/:userId', requirePermission(P.USERS_VIEW), …);
router.put('/users/:userId', requirePermission(P.USERS_UPDATE), validate(updateUserSchema), …);
router.post('/users/:userId/status', requirePermission(P.USERS_SUSPEND), validate(statusSchema), …);
router.post('/users/:userId/reset-password', requirePermission(P.USERS_RESET_PASSWORD), validate(resetPasswordSchema), …);
router.post('/users/:userId/force-logout', requirePermission(P.USERS_FORCE_LOGOUT), …);
router.delete('/users/:userId', requirePermission(P.USERS_DELETE), …);
router.get('/sessions', requirePermission(P.SESSIONS_VIEW), validate(paginationSchema, 'query'), …);
router.post('/sessions/:sessionId/terminate', requirePermission(P.SESSIONS_REVOKE), …);
router.get('/settings', requirePermission(P.SETTINGS_VIEW), …);
router.put('/settings', requirePermission(P.SETTINGS_MANAGE), validate(settingsSchema), …);
router.get('/audit-logs', requirePermission(P.AUDIT_VIEW), validate(auditQuery, 'query'), …);
router.get('/login-history', requirePermission(P.LOGIN_HISTORY_VIEW), validate(…, 'query'), …);
```

`server/src/modules/enrollments/enrollments.routes.js` — add `const { requirePermission } = require('../../middleware/authorize');` and `const { PERMISSIONS: P } = require('../../core/permissions');`, then:

```js
router.post('/courses/:courseId/codes', requirePermission(P.ACCESS_CODES_MANAGE), requireCourseOwnership, validate(generateCodesSchema), c.generateCodes);
router.get('/courses/:courseId/codes', requirePermission(P.ACCESS_CODES_MANAGE), requireCourseOwnership, validate(paginationSchema, 'query'), c.listCodes);
router.post('/courses/:courseId/codes/:codeId/revoke', requirePermission(P.ACCESS_CODES_MANAGE), requireCourseOwnership, c.revokeCode);
router.post('/courses/:courseId/students', requirePermission(P.ENROLLMENTS_MANAGE), requireCourseOwnership, validate(assignSchema), c.assignStudent);
```

`server/src/modules/analytics/analytics.routes.js:23,27` → `requirePermission(P.ANALYTICS_GLOBAL)` (import as above).
`server/src/modules/anticheat/anticheat.routes.js:41` → `requirePermission(P.ANTICHEAT_PLATFORM)`.
`server/src/modules/announcements/announcements.routes.js:52` → `requirePermission(P.ANNOUNCEMENTS_GLOBAL)`.
`server/src/modules/files/files.routes.js:35` → `requirePermission(P.FILES_GLOBAL)`.

Leave every `authorize('teacher', 'admin')` and `authorize('student')` as it is.

- [ ] **Step 8: Run lint and the whole suite**

Run: `cd server && npm run lint && npm test 2>&1 | tail -8`
Expected: lint clean; `# pass 36` (29 smoke + 7 permissions), `# fail 0`.

- [ ] **Step 9: Commit**

```bash
git add server/src server/tests/permissions.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(rbac): four roles, central permission map, requirePermission middleware

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Bootstrap seeding, env hardening, `.env.example`, scripts

**Files:**
- Create: `server/src/scripts/seed.js`, `server/.env.example`, `client/.env.example`, `server/tests/seed.test.js`
- Modify: `server/src/config/env.js`, `server/src/seed.js` (full rewrite), `server/src/server.js:9-12`, `server/package.json` (scripts), `server/src/config/constants.js` (AUDIT_ACTIONS), `server/.env` (add the new variables with real values — never committed)

**Interfaces:**
- Produces: `seed()` idempotent; `env.SUPER_ADMIN_*`, `env.DEFAULT_ADMIN_*`, `env.ALLOWED_ORIGINS`, `env.REFRESH_COOKIE_SAMESITE`; audit actions `ADMIN_CREATED`.
- `env.ADMIN_PASSWORD` is now optional and has **no default**.

- [ ] **Step 1: Write the failing seed tests**

Create `server/tests/seed.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers/harness');

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.stop(); });

const env = () => require('../src/config/env');
const User = () => require('../src/models/User');
const seed = () => require('../src/seed')();

test('bootstrap created the owner and Abdullah exactly once', async () => {
  const owner = await User().findOne({ role: 'super_admin' });
  assert.ok(owner, 'owner exists');
  assert.equal(owner.username, 'owner');
  assert.equal(owner.mustChangePassword, true);
  assert.equal(owner.emailVerified, true);
  const abdullah = await User().findOne({ username: 'abdullah.dabbas' });
  assert.ok(abdullah, 'abdullah exists');
  assert.equal(abdullah.role, 'admin');
  assert.equal(abdullah.name, 'Abdullah Dabbas');
  assert.equal(abdullah.mustChangePassword, true);

  const before = await User().countDocuments();
  await seed();
  await seed();
  assert.equal(await User().countDocuments(), before, 'rerunning seed creates nothing');
});

test('production with no owner and no SUPER_ADMIN_* refuses', async () => {
  const e = env();
  const saved = { NODE_ENV: e.NODE_ENV, SUPER_ADMIN_EMAIL: e.SUPER_ADMIN_EMAIL };
  await User().deleteMany({ role: 'super_admin' });
  e.NODE_ENV = 'production';
  e.SUPER_ADMIN_EMAIL = undefined;
  try {
    await assert.rejects(seed(), /owner/i);
  } finally {
    Object.assign(e, saved);
  }
  await seed(); // dev mode: recreates the owner
  assert.ok(await User().findOne({ role: 'super_admin' }));
});

test('production with an owner present seeds nothing else', async () => {
  const e = env();
  const saved = e.NODE_ENV;
  const before = await User().countDocuments();
  e.NODE_ENV = 'production';
  try {
    await seed();
  } finally {
    e.NODE_ENV = saved;
  }
  assert.equal(await User().countDocuments(), before);
});

test('legacy dev admin is only seeded when ADMIN_PASSWORD is set', async () => {
  const e = env();
  const saved = e.ADMIN_PASSWORD;
  await User().deleteOne({ username: 'admin' });
  e.ADMIN_PASSWORD = undefined;
  try {
    await seed();
    assert.equal(await User().findOne({ username: 'admin' }), null);
  } finally {
    e.ADMIN_PASSWORD = saved;
  }
  await seed();
  assert.ok(await User().findOne({ username: 'admin' }));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && node --test tests/seed.test.js`
Expected: the first test fails (`owner exists`).

- [ ] **Step 3: Harden `env.js`**

Replace the whole `envSchema` in `server/src/config/env.js` with:

```js
// '' in .env means "unset" for optional values.
const blankToUndefined = (v) => (v === '' ? undefined : v);
const optional = (schema) => z.preprocess(blankToUndefined, schema.optional());
const passwordRule = z.string().min(8).max(128).regex(/[a-z]/, 'needs a lowercase letter').regex(/[A-Z]/, 'needs an uppercase letter').regex(/\d/, 'needs a digit');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/lms-platform'),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Master key used to wrap per-video encryption keys and sign stream URLs.
  // If absent in development, a deterministic key derived from JWT_SECRET is used.
  MEDIA_MASTER_KEY: optional(z.string().min(32)),

  CLIENT_URL: z.string().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default(''),
  REFRESH_COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).default('lax'),

  // Owner (super_admin) bootstrap — created once by `npm run seed` / dev startup.
  SUPER_ADMIN_NAME: z.string().min(2).max(100).default('Platform Owner'),
  SUPER_ADMIN_USERNAME: z.string().min(3).max(50).default('owner'),
  SUPER_ADMIN_EMAIL: optional(z.string().email()),
  SUPER_ADMIN_INITIAL_PASSWORD: optional(passwordRule),

  // Default operational administrator (Abdullah Dabbas).
  DEFAULT_ADMIN_NAME: z.string().min(2).max(100).default('Abdullah Dabbas'),
  DEFAULT_ADMIN_USERNAME: z.string().min(3).max(50).default('abdullah.dabbas'),
  DEFAULT_ADMIN_EMAIL: optional(z.string().email()),
  DEFAULT_ADMIN_INITIAL_PASSWORD: optional(passwordRule),

  // Legacy development admin — never seeded in production, no default password.
  ADMIN_EMAIL: optional(z.string().email()),
  ADMIN_PASSWORD: optional(passwordRule),

  STORAGE_ROOT: optional(z.string()),
  LOG_DIR: optional(z.string()),
  MAX_UPLOAD_MB: z.coerce.number().default(2048),
  CHUNK_SIZE_MB: z.coerce.number().default(8),

  SMTP_HOST: optional(z.string()),
  SMTP_PORT: optional(z.coerce.number()),
  SMTP_USER: optional(z.string()),
  SMTP_PASS: optional(z.string()),
  SMTP_FROM: z.string().default('LMS Platform <no-reply@lms.local>'),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
});
```

Keep the existing `safeParse` / error printing, the `MEDIA_MASTER_KEY` derivation block, `STORAGE_ROOT`, and the `LOG_DIR` default from Task 1. Add `module.exports.passwordRule = passwordRule;` is **not** needed — `auth.validators.js` keeps its own copy (config must not import modules).

- [ ] **Step 4: Add `ADMIN_CREATED` (and the other new actions) to `AUDIT_ACTIONS`**

In `server/src/config/constants.js`, inside `AUDIT_ACTIONS`, add a new group after the `// users` group:

```js
    // ownership & devices
    'ADMIN_CREATED', 'ADMIN_DISABLED', 'OWNER_ACTION_BLOCKED', 'SECURITY_SETTING_CHANGED',
    'DEVICE_BOUND', 'DEVICE_CHANGED', 'DEVICE_LOGIN_REJECTED', 'DEVICE_REVOKED',
    'DEVICE_FINGERPRINT_DRIFT', 'TOKEN_REUSE_DETECTED', 'POLICY_RELOGIN',
```

- [ ] **Step 5: Rewrite `seed.js`**

Replace `server/src/seed.js` entirely:

```js
const env = require('./config/env');
const { logger } = require('./config/logger');
const { ROLES } = require('./config/constants');

/**
 * Idempotent bootstrap. Creates, once each and only when absent:
 *   1. the platform owner (super_admin) from SUPER_ADMIN_*
 *   2. the default operational admin from DEFAULT_ADMIN_*
 *   3. the legacy `admin` development account (never in production)
 *   4. the settings singleton
 * Never modifies an existing account. Never logs a password.
 * Production with no owner and no SUPER_ADMIN_* configuration throws.
 */
const seed = async () => {
  const User = require('./models/User');
  const PlatformSetting = require('./models/PlatformSetting');
  const audit = require('./core/audit');
  const isProd = env.NODE_ENV === 'production';

  // 1. Owner
  const owner = await User.findOne({ role: ROLES.SUPER_ADMIN, deletedAt: null });
  if (!owner) {
    if (env.SUPER_ADMIN_EMAIL && env.SUPER_ADMIN_INITIAL_PASSWORD) {
      const created = await User.create({
        name: env.SUPER_ADMIN_NAME,
        username: env.SUPER_ADMIN_USERNAME,
        email: env.SUPER_ADMIN_EMAIL,
        password: env.SUPER_ADMIN_INITIAL_PASSWORD,
        role: ROLES.SUPER_ADMIN,
        status: 'active',
        emailVerified: true,
        mustChangePassword: true,
      });
      await audit({ user: created._id, action: 'USER_CREATED', targetUser: created._id, meta: { bootstrap: 'owner', role: ROLES.SUPER_ADMIN } });
      logger.info(`Owner account created (username: ${created.username}) — password change required at first login`);
    } else if (isProd) {
      throw new Error('No owner account exists and SUPER_ADMIN_EMAIL / SUPER_ADMIN_INITIAL_PASSWORD are not set. Configure them and run: npm run seed');
    } else {
      logger.warn('No owner account and SUPER_ADMIN_* not configured — owner bootstrap skipped');
    }
  }

  // 2. Default operational admin
  const defaultAdmin = await User.findOne({ username: env.DEFAULT_ADMIN_USERNAME });
  if (!defaultAdmin) {
    if (env.DEFAULT_ADMIN_INITIAL_PASSWORD) {
      const created = await User.create({
        name: env.DEFAULT_ADMIN_NAME,
        username: env.DEFAULT_ADMIN_USERNAME,
        email: env.DEFAULT_ADMIN_EMAIL || undefined,
        password: env.DEFAULT_ADMIN_INITIAL_PASSWORD,
        role: ROLES.ADMIN,
        status: 'active',
        emailVerified: true,
        mustChangePassword: true,
      });
      await audit({ user: created._id, action: 'ADMIN_CREATED', targetUser: created._id, meta: { bootstrap: true } });
      logger.info(`Default admin created (username: ${created.username}) — password change required at first login`);
    } else {
      logger.warn(`Default admin "${env.DEFAULT_ADMIN_USERNAME}" not present and DEFAULT_ADMIN_INITIAL_PASSWORD not set — skipped`);
    }
  }

  // 3. Legacy development admin
  if (!isProd && env.ADMIN_PASSWORD) {
    const legacy = await User.findOne({ username: 'admin' });
    if (!legacy) {
      await User.create({
        name: 'Platform Administrator',
        username: 'admin',
        email: env.ADMIN_EMAIL || undefined,
        password: env.ADMIN_PASSWORD,
        role: ROLES.ADMIN,
        status: 'active',
        emailVerified: true,
        mustChangePassword: false,
      });
      logger.info('Development admin seeded (username: admin / password from ADMIN_PASSWORD)');
    }
  }

  // 4. Settings singleton
  await PlatformSetting.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', values: {} } },
    { upsert: true }
  );
};

module.exports = seed;
```

- [ ] **Step 6: Production startup guard and the `seed` script**

In `server/src/server.js`, replace lines 9–12:

```js
const start = async () => {
  await connectDB();
  await seed();
  startJobs();
```
with
```js
const start = async () => {
  await connectDB();
  if (env.NODE_ENV === 'production') {
    const User = require('./models/User');
    const hasOwner = await User.exists({ role: 'super_admin', deletedAt: null });
    if (!hasOwner) {
      logger.error('No owner account exists. Run: npm run seed (with SUPER_ADMIN_* configured) before starting in production.');
      process.exit(1);
    }
  } else {
    await seed();
  }
  startJobs();
```

Create `server/src/scripts/seed.js`:

```js
/** Explicit bootstrap: `npm run seed`. Safe to run repeatedly. */
const { connectDB, disconnectDB } = require('../config/db');
const { logger } = require('../config/logger');
const seed = require('../seed');

connectDB()
  .then(seed)
  .then(async () => { logger.info('Seed complete'); await disconnectDB(); process.exit(0); })
  .catch(async (err) => { logger.error(`Seed failed: ${err.message}`); await disconnectDB().catch(() => {}); process.exit(1); });
```

Add to `server/package.json` scripts: `"seed": "node src/scripts/seed.js"`.

- [ ] **Step 7: `.env.example` files and the real `.env`**

Create `server/.env.example`:

```ini
# ── Runtime ─────────────────────────────────────────────────────────────
NODE_ENV=development            # development | test | production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/lms-platform   # production: a replica-set URI; the in-memory fallback is dev-only

# ── Secrets (REQUIRED, 32+ random bytes each, all different) ────────────
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=
JWT_REFRESH_SECRET=
MEDIA_MASTER_KEY=               # REQUIRED in production. Never rotate casually: it wraps every stored video key.
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Client / CORS ───────────────────────────────────────────────────────
CLIENT_URL=http://localhost:5173
ALLOWED_ORIGINS=                # comma-separated extra origins (e.g. capacitor://localhost,http://localhost for Android)
REFRESH_COOKIE_SAMESITE=lax     # lax (same-site deployment) | none (cross-site, HTTPS only) | strict

# ── Platform owner (super_admin) — created once by `npm run seed` ───────
SUPER_ADMIN_NAME=Platform Owner
SUPER_ADMIN_USERNAME=owner
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_INITIAL_PASSWORD=   # forced change at first login; never logged

# ── Default operational admin — created once by `npm run seed` ──────────
DEFAULT_ADMIN_NAME=Abdullah Dabbas
DEFAULT_ADMIN_USERNAME=abdullah.dabbas
DEFAULT_ADMIN_EMAIL=
DEFAULT_ADMIN_INITIAL_PASSWORD=

# ── Legacy development admin (username `admin`) — ignored in production ─
ADMIN_EMAIL=
ADMIN_PASSWORD=                 # unset = not seeded

# ── Storage / uploads ───────────────────────────────────────────────────
STORAGE_ROOT=                   # default: ./storage — use a dedicated volume in production
LOG_DIR=                        # default: ./logs
MAX_UPLOAD_MB=2048
CHUNK_SIZE_MB=8

# ── Mail (unset = messages are logged instead of sent; dev only) ────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=LMS Platform <no-reply@lms.local>

LOG_LEVEL=info
```

Create `client/.env.example`:

```ini
VITE_API_URL=http://localhost:5000/api/v1
```

Append to the real `server/.env` (not committed) the owner and default-admin block with the value the user supplied and generated passwords:

```bash
OWNER_PW=$(node -e "const c=require('crypto');const s='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';let p='';for(let i=0;i<14;i++)p+=s[c.randomInt(s.length)];console.log('Aa1'+p)")
ADMIN_PW=$(node -e "const c=require('crypto');const s='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';let p='';for(let i=0;i<14;i++)p+=s[c.randomInt(s.length)];console.log('Aa1'+p)")
cat >> server/.env <<EOF

# Owner bootstrap (forced password change at first login)
SUPER_ADMIN_NAME=Platform Owner
SUPER_ADMIN_USERNAME=owner
SUPER_ADMIN_EMAIL=atoofeh8@gmail.com
SUPER_ADMIN_INITIAL_PASSWORD=$OWNER_PW

# Default operational admin
DEFAULT_ADMIN_NAME=Abdullah Dabbas
DEFAULT_ADMIN_USERNAME=abdullah.dabbas
DEFAULT_ADMIN_EMAIL=
DEFAULT_ADMIN_INITIAL_PASSWORD=$ADMIN_PW

ALLOWED_ORIGINS=
REFRESH_COOKIE_SAMESITE=lax
EOF
echo "Owner initial password: $OWNER_PW"; echo "Abdullah initial password: $ADMIN_PW"
```

The two generated passwords are printed **once** to the terminal for the operator and appear nowhere else. `DEFAULT_ADMIN_EMAIL` stays blank until the user supplies it.

- [ ] **Step 8: Run the seed tests and the whole suite**

Run: `cd server && npm run lint && npm test 2>&1 | tail -8`
Expected: lint clean; `# pass 40`, `# fail 0`.

- [ ] **Step 9: Commit**

```bash
git add server/src server/tests/seed.test.js server/package.json server/.env.example client/.env.example
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(bootstrap): owner + default admin seeding, no default admin password, production owner guard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Owner protections in the admin service

**Files:**
- Create: `server/tests/owner.test.js`
- Modify: `server/src/modules/admin/admin.service.js` (full rewrite), `server/src/modules/admin/admin.routes.js` (pass `req.user` instead of `req.user.id`)

**Interfaces:**
- Produces: every `AdminService` method takes `actor` = `req.user` (`{ id, role, name, email }`) as its first argument instead of `adminId`.
- Produces: `AdminService.assertCanManage(actor, targetUser, intent)` — throws `ApiError` (`SELF_ACTION` 400, `OWNER_PROTECTED` 403, `FORBIDDEN` 403); writes `OWNER_ACTION_BLOCKED` audit.
- Produces: `AdminService.OWNER_ONLY_SETTINGS` (array).
- Consumes: `PERMISSIONS`, `hasPermission`, `canAssignRole`, `isAdminRole` from Task 3; harness from Task 1; seeded owner/Abdullah from Task 4.

- [ ] **Step 1: Write the failing owner tests**

Create `server/tests/owner.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, owner, abdullah, admin;
before(async () => {
  app = await startApp();
  api = app.api;
  owner = await app.loginAndOnboard(CREDENTIALS.owner.username, CREDENTIALS.owner.password, { deviceId: 'dev-owner' });
  abdullah = await app.loginAndOnboard(CREDENTIALS.abdullah.username, CREDENTIALS.abdullah.password, { deviceId: 'dev-abd' });
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });

test('the owner is super_admin and Abdullah is admin', async () => {
  const r = await as(owner, 'GET', '/admin/users?role=super_admin');
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 1);
  assert.equal(r.data.items[0].username, 'owner');
  assert.equal(abdullah.user.role, 'admin');
  assert.equal(abdullah.user.name, 'Abdullah Dabbas');
});

test('Abdullah can view but not mutate the owner', async () => {
  const ownerId = owner.user.id;
  const view = await as(abdullah, 'GET', `/admin/users/${ownerId}`);
  assert.equal(view.status, 200);

  const attempts = [
    as(abdullah, 'PUT', `/admin/users/${ownerId}`, { name: 'Hijacked' }),
    as(abdullah, 'POST', `/admin/users/${ownerId}/status`, { status: 'suspended' }),
    as(abdullah, 'POST', `/admin/users/${ownerId}/reset-password`, { password: 'Newpass@123' }),
    as(abdullah, 'POST', `/admin/users/${ownerId}/force-logout`),
    as(abdullah, 'DELETE', `/admin/users/${ownerId}`),
  ];
  for (const r of await Promise.all(attempts)) {
    assert.equal(r.status, 403, JSON.stringify(r.data));
    assert.equal(r.data.code, 'OWNER_PROTECTED');
  }
  const logs = await as(owner, 'GET', `/admin/audit-logs?action=OWNER_ACTION_BLOCKED&userId=${abdullah.user.id}&limit=50`);
  assert.equal(logs.status, 200);
  assert.ok(logs.data.items.length >= 5, 'each blocked attempt is audited');
  assert.equal(String(logs.data.items[0].targetUser._id), String(ownerId));

  const still = await as(owner, 'GET', '/auth/me');
  assert.equal(still.status, 200, 'owner session untouched');
});

test('Abdullah cannot promote himself, create an admin, or create a super_admin', async () => {
  const self = await as(abdullah, 'PUT', `/admin/users/${abdullah.user.id}`, { role: 'admin' });
  assert.equal(self.status, 400);
  assert.equal(self.data.code, 'SELF_ACTION');

  const mkAdmin = await as(abdullah, 'POST', '/admin/users', { name: 'Another Admin', username: 'admin2', password: 'Admin@12345', role: 'admin' });
  assert.equal(mkAdmin.status, 403);

  const mkOwner = await as(abdullah, 'POST', '/admin/users', { name: 'Fake Owner', username: 'owner2', password: 'Owner@12345', role: 'super_admin' });
  assert.equal(mkOwner.status, 400);
  const mkOwner2 = await as(owner, 'POST', '/admin/users', { name: 'Fake Owner', username: 'owner2', password: 'Owner@12345', role: 'super_admin' });
  assert.equal(mkOwner2.status, 400, 'not even the owner can create a second owner through the API');
});

test('Abdullah can create students and teachers', async () => {
  const s = await as(abdullah, 'POST', '/admin/users', { name: 'Stu', username: 'stu1', password: 'Learn@1234', role: 'student', mustChangePassword: false });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const t = await as(abdullah, 'POST', '/admin/users', { name: 'Tea', username: 'tea1', password: 'Teach@1234', role: 'teacher', mustChangePassword: false });
  assert.equal(t.status, 201, JSON.stringify(t.data));
});

test('admin-on-admin mutation requires admins.manage (owner only)', async () => {
  const r = await as(admin, 'PUT', `/admin/users/${abdullah.user.id}`, { name: 'Renamed by peer' });
  assert.equal(r.status, 403);
  const ok = await as(owner, 'PUT', `/admin/users/${abdullah.user.id}`, { name: 'Abdullah Dabbas' });
  assert.equal(ok.status, 200);
});

test('owner-only settings are rejected for admins and audited for the owner', async () => {
  const blocked = await as(abdullah, 'PUT', '/admin/settings', { maxLoginAttempts: 7, platformName: 'Should not persist' });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'OWNER_PROTECTED');
  const current = await as(owner, 'GET', '/admin/settings');
  assert.notEqual(current.data.settings.platformName, 'Should not persist', 'nothing written when any key is owner-only');

  const allowed = await as(abdullah, 'PUT', '/admin/settings', { platformName: 'Alahliyya LMS' });
  assert.equal(allowed.status, 200);

  const ownerChange = await as(owner, 'PUT', '/admin/settings', { maxLoginAttempts: 7 });
  assert.equal(ownerChange.status, 200);
  assert.equal(ownerChange.data.settings.maxLoginAttempts, 7);
  const logs = await as(owner, 'GET', '/admin/audit-logs?action=SECURITY_SETTING_CHANGED&limit=5');
  assert.ok(logs.data.items.length >= 1);
  assert.deepEqual(logs.data.items[0].meta.keys, ['maxLoginAttempts']);
});

test('owner can suspend Abdullah (ADMIN_DISABLED audited) and reactivate him', async () => {
  const susp = await as(owner, 'POST', `/admin/users/${abdullah.user.id}/status`, { status: 'suspended' });
  assert.equal(susp.status, 200);
  const me = await as(abdullah, 'GET', '/auth/me');
  assert.equal(me.status, 403);
  assert.equal(me.data.code, 'ACCOUNT_SUSPENDED');
  const logs = await as(owner, 'GET', '/admin/audit-logs?action=ADMIN_DISABLED&limit=5');
  assert.ok(logs.data.items.length >= 1);
  const back = await as(owner, 'POST', `/admin/users/${abdullah.user.id}/status`, { status: 'active' });
  assert.equal(back.status, 200);
});

test('owner cannot mutate their own account through admin routes', async () => {
  const r = await as(owner, 'PUT', `/admin/users/${owner.user.id}`, { role: 'student' });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, 'SELF_ACTION');
});

test('ADMIN_CREATED is audited when the owner creates an admin', async () => {
  const r = await as(owner, 'POST', '/admin/users', { name: 'Ops Admin', username: 'ops', password: 'Admin@12345', role: 'admin' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const logs = await as(owner, 'GET', '/admin/audit-logs?action=ADMIN_CREATED&limit=5');
  assert.ok(logs.data.items.some((l) => String(l.targetUser?._id) === String(r.data.id)));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && node --test tests/owner.test.js`
Expected: several failures (`OWNER_PROTECTED` not returned, `SELF_ACTION` missing, settings not blocked).

- [ ] **Step 3: Rewrite `admin.service.js`**

Replace `server/src/modules/admin/admin.service.js` entirely:

```js
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { paginatedQuery } = require('../../core/pagination');
const { invalidateSettingsCache, SETTING_DEFAULTS, getSettings } = require('../../config/settingsCache');
const { ROLES } = require('../../config/constants');
const { PERMISSIONS: P, hasPermission, canAssignRole, isAdminRole } = require('../../core/permissions');
const User = require('../../models/User');
const Session = require('../../models/Session');
const LoginHistory = require('../../models/LoginHistory');
const AuditLog = require('../../models/AuditLog');
const PlatformSetting = require('../../models/PlatformSetting');
const Enrollment = require('../../models/Enrollment');

/** Settings keys only the owner may change. */
const OWNER_ONLY_SETTINGS = ['sessionTimeoutMinutes', 'maxLoginAttempts', 'lockoutMinutes', 'requireEmailVerification', 'deviceBindingEnabled'];

class AdminService {
  static OWNER_ONLY_SETTINGS = OWNER_ONLY_SETTINGS;

  /**
   * Single guard for every mutating admin action.
   * actor: req.user ({ id, role }); target: User document; intent: string label for the audit row.
   */
  static async assertCanManage(actor, target, intent, ip) {
    if (String(actor.id) === String(target._id)) {
      throw ApiError.badRequest('You cannot perform this action on your own account', 'SELF_ACTION');
    }
    if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
      await audit({ user: actor.id, action: 'OWNER_ACTION_BLOCKED', targetUser: target._id, ip, meta: { intent } });
      throw ApiError.forbidden('The platform owner account is protected', 'OWNER_PROTECTED');
    }
    if (target.role === ROLES.ADMIN && !hasPermission(actor.role, P.ADMINS_MANAGE)) {
      throw ApiError.forbidden('Only the platform owner can manage administrator accounts', 'FORBIDDEN');
    }
  }

  static async #loadTarget(userId) {
    const user = await User.findOne({ _id: userId, deletedAt: null });
    if (!user) throw ApiError.notFound('User not found');
    return user;
  }

  static async #killSessions(userId, reason) {
    await Session.updateMany(
      { user: userId, isActive: true },
      { $set: { isActive: false, endedAt: new Date(), endReason: reason } }
    );
  }

  // ── User management ─────────────────────────────────────────────────

  static async createUser(actor, { name, username, email, password, role, mustChangePassword }, ip) {
    if (role === ROLES.SUPER_ADMIN) {
      throw ApiError.badRequest('The owner account can only be created by the bootstrap seed', 'ROLE_NOT_ASSIGNABLE');
    }
    if (!canAssignRole(actor.role, role)) {
      throw ApiError.forbidden(`You cannot create accounts with role "${role}"`, 'FORBIDDEN');
    }
    const user = await User.create({
      name, username, email: email?.toLowerCase(), password, role,
      mustChangePassword: mustChangePassword ?? true,
      emailVerified: false,
      createdBy: actor.id,
    });
    await audit({ user: actor.id, action: role === ROLES.ADMIN ? 'ADMIN_CREATED' : 'USER_CREATED', targetUser: user._id, ip, meta: { role } });
    return user.toPublicJSON();
  }

  static async listUsers({ page, limit, search, role, status }) {
    const filter = { deletedAt: null };
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { username: regex }, { email: regex }];
    }
    return paginatedQuery(User, filter, { page, limit, sort: { createdAt: -1 } });
  }

  static async getUserDetail(userId) {
    const [user, sessions, history, enrollments] = await Promise.all([
      User.findOne({ _id: userId, deletedAt: null }),
      Session.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
      LoginHistory.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean(),
      Enrollment.find({ student: userId }).populate('course', 'title').lean(),
    ]);
    if (!user) throw ApiError.notFound('User not found');
    return { user: user.toPublicJSON(), sessions, loginHistory: history, enrollments };
  }

  static async updateUser(actor, userId, data, ip) {
    const user = await AdminService.#loadTarget(userId);
    const roleChanged = data.role && data.role !== user.role;
    await AdminService.assertCanManage(actor, user, roleChanged ? 'role_change' : 'update', ip);
    if (roleChanged && !canAssignRole(actor.role, data.role)) {
      throw ApiError.forbidden(`You cannot assign role "${data.role}"`, 'FORBIDDEN');
    }

    if (data.name) user.name = data.name;
    if (data.email !== undefined) user.email = data.email?.toLowerCase() || undefined;
    if (roleChanged) {
      user.role = data.role;
      user.tokenVersion += 1;
    }
    await user.save();

    if (roleChanged) {
      await AdminService.#killSessions(userId, 'admin_force_logout');
      await audit({ user: actor.id, action: 'ROLE_CHANGED', targetUser: userId, ip, meta: { role: data.role } });
    } else {
      await audit({ user: actor.id, action: 'USER_UPDATED', targetUser: userId, ip });
    }
    return user.toPublicJSON();
  }

  static async setUserStatus(actor, userId, status, ip) {
    const user = await AdminService.#loadTarget(userId);
    await AdminService.assertCanManage(actor, user, 'status', ip);
    const wasAdmin = isAdminRole(user.role);
    user.status = status;
    user.tokenVersion += 1; // invalidate outstanding tokens
    await user.save();
    if (status !== 'active') await AdminService.#killSessions(userId, 'admin_force_logout');
    const action = status === 'suspended' ? 'USER_SUSPENDED' : status === 'banned' ? 'USER_BANNED' : 'USER_ACTIVATED';
    await audit({ user: actor.id, action, targetUser: userId, ip });
    if (wasAdmin && status !== 'active') {
      await audit({ user: actor.id, action: 'ADMIN_DISABLED', targetUser: userId, ip, meta: { status } });
    }
    return user.toPublicJSON();
  }

  static async deleteUser(actor, userId, ip) {
    const user = await AdminService.#loadTarget(userId);
    await AdminService.assertCanManage(actor, user, 'delete', ip);
    user.deletedAt = new Date();
    user.status = 'banned';
    user.tokenVersion += 1;
    // Free the unique keys for future reuse while preserving the record.
    user.username = `deleted_${Date.now()}_${user.username}`.slice(0, 50);
    user.email = undefined;
    await user.save();
    await AdminService.#killSessions(userId, 'admin_force_logout');
    await Enrollment.updateMany({ student: userId, status: 'active' }, { $set: { status: 'removed' } });
    await audit({ user: actor.id, action: 'USER_DELETED', targetUser: userId, ip });
  }

  static async resetUserPassword(actor, userId, newPassword, ip) {
    const user = await User.findOne({ _id: userId, deletedAt: null }).select('+password');
    if (!user) throw ApiError.notFound('User not found');
    await AdminService.assertCanManage(actor, user, 'reset_password', ip);
    user.password = newPassword;
    user.mustChangePassword = true;
    user.tokenVersion += 1;
    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
    await user.save();
    await AdminService.#killSessions(userId, 'password_changed');
    await audit({ user: actor.id, action: 'PASSWORD_RESET', targetUser: userId, ip });
    return { message: 'Password reset. User must change it at next login.' };
  }

  // ── Session / device management ────────────────────────────────────

  static async listActiveSessions({ page, limit }) {
    return paginatedQuery(Session, { isActive: true }, {
      page, limit,
      populate: { path: 'user', select: 'name username role' },
      sort: { lastActivityAt: -1 },
    });
  }

  static async forceLogout(actor, sessionId, ip) {
    const session = await Session.findById(sessionId);
    if (!session || !session.isActive) throw ApiError.notFound('Active session not found');
    const target = await AdminService.#loadTarget(session.user);
    await AdminService.assertCanManage(actor, target, 'force_logout', ip);
    session.isActive = false;
    session.endedAt = new Date();
    session.endReason = 'admin_force_logout';
    await session.save();
    await audit({ user: actor.id, action: 'FORCE_LOGOUT', targetUser: session.user, ip, meta: { sessionId } });
    return { message: 'Session terminated' };
  }

  static async forceLogoutUser(actor, userId, ip) {
    const user = await AdminService.#loadTarget(userId);
    await AdminService.assertCanManage(actor, user, 'force_logout', ip);
    await AdminService.#killSessions(userId, 'admin_force_logout');
    user.tokenVersion += 1;
    await user.save();
    await audit({ user: actor.id, action: 'FORCE_LOGOUT', targetUser: userId, ip, meta: { all: true } });
    return { message: 'All sessions for user terminated' };
  }

  // ── Platform settings ──────────────────────────────────────────────

  static async getPlatformSettings() {
    const settings = await getSettings();
    return { settings, defaults: SETTING_DEFAULTS, ownerOnlyKeys: OWNER_ONLY_SETTINGS };
  }

  static async updateSettings(actor, values, ip) {
    // Whitelist: only known settings keys are persisted.
    const clean = {};
    for (const key of Object.keys(SETTING_DEFAULTS)) {
      if (values[key] !== undefined) clean[key] = values[key];
    }
    const securityKeys = Object.keys(clean).filter((k) => OWNER_ONLY_SETTINGS.includes(k));
    if (securityKeys.length && !hasPermission(actor.role, P.SECURITY_MANAGE)) {
      await audit({ user: actor.id, action: 'OWNER_ACTION_BLOCKED', ip, meta: { intent: 'security_settings', keys: securityKeys } });
      throw ApiError.forbidden(`Only the platform owner can change: ${securityKeys.join(', ')}`, 'OWNER_PROTECTED');
    }

    const doc = await PlatformSetting.findOneAndUpdate(
      { key: 'global' },
      { $set: { updatedBy: actor.id }, $setOnInsert: { key: 'global' } },
      { upsert: true, new: true }
    );
    doc.values = { ...doc.values, ...clean };
    doc.markModified('values');
    await doc.save();
    invalidateSettingsCache();

    if (clean.maintenanceMode !== undefined) {
      await audit({ user: actor.id, action: clean.maintenanceMode ? 'MAINTENANCE_ON' : 'MAINTENANCE_OFF', ip });
    }
    if (securityKeys.length) {
      await audit({ user: actor.id, action: 'SECURITY_SETTING_CHANGED', ip, meta: { keys: securityKeys } });
    }
    await audit({ user: actor.id, action: 'SETTINGS_UPDATED', ip, meta: { keys: Object.keys(clean) } });
    return AdminService.getPlatformSettings();
  }

  // ── Audit & login logs ─────────────────────────────────────────────

  static async auditLogs({ page, limit, action, userId, from, to }) {
    const filter = {};
    if (action) filter.action = action;
    if (userId) filter.$or = [{ user: userId }, { targetUser: userId }];
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    return paginatedQuery(AuditLog, filter, {
      page, limit,
      populate: [
        { path: 'user', select: 'name username role' },
        { path: 'targetUser', select: 'name username' },
        { path: 'course', select: 'title' },
      ],
      sort: { createdAt: -1 },
    });
  }

  static async loginHistory({ page, limit, success }) {
    const filter = {};
    if (success !== undefined) filter.success = success;
    return paginatedQuery(LoginHistory, filter, {
      page, limit,
      populate: { path: 'user', select: 'name username role' },
      sort: { createdAt: -1 },
    });
  }
}

module.exports = AdminService;
```

- [ ] **Step 4: Pass `req.user` from the routes**

In `server/src/modules/admin/admin.routes.js`, change every call that passed `req.user.id` as the first argument to pass `req.user`:

```js
AdminService.createUser(req.user, req.body, req.ip)
AdminService.updateUser(req.user, req.params.userId, req.body, req.ip)
AdminService.setUserStatus(req.user, req.params.userId, req.body.status, req.ip)
AdminService.resetUserPassword(req.user, req.params.userId, req.body.password, req.ip)
AdminService.forceLogoutUser(req.user, req.params.userId, req.ip)
AdminService.deleteUser(req.user, req.params.userId, req.ip)
AdminService.forceLogout(req.user, req.params.sessionId, req.ip)
AdminService.updateSettings(req.user, req.body, req.ip)
```

- [ ] **Step 5: Run owner tests, then the suite**

Run: `cd server && node --test tests/owner.test.js && npm run lint && npm test 2>&1 | tail -8`
Expected: owner file `# pass 9`; full suite `# pass 49`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/admin server/tests/owner.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(owner): assertCanManage guard, owner-only settings, ADMIN_CREATED/ADMIN_DISABLED audits

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: RBAC matrix test

**Files:**
- Create: `server/tests/rbac.test.js`

**Interfaces:**
- Consumes: harness; seeded accounts; `requirePermission` routes from Task 3; guards from Task 5. No production code should need to change — if a scenario fails, the fix belongs in the module the failure names.

- [ ] **Step 1: Write the matrix**

Create `server/tests/rbac.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, owner, admin, t1, t2, s1, s2, courseId, attemptId;
before(async () => {
  app = await startApp();
  api = app.api;
  owner = await app.loginAndOnboard(CREDENTIALS.owner.username, CREDENTIALS.owner.password, { deviceId: 'dev-owner' });
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  await app.createUser(admin.token, { name: 'Ada', username: 'ada', password: 'Teach@1234', role: 'teacher' }, 'dev-admin');
  await app.createUser(admin.token, { name: 'Bob', username: 'bob', password: 'Teach@1234', role: 'teacher' }, 'dev-admin');
  await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  await app.createUser(admin.token, { name: 'Sue', username: 'sue', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  t1 = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada' });
  t2 = await app.loginAs('bob', 'Teach@1234', { deviceId: 'dev-bob' });
  s1 = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam' });
  s2 = await app.loginAs('sue', 'Learn@1234', { deviceId: 'dev-sue' });

  const course = await api('POST', '/courses', { token: t1.token, deviceId: t1.deviceId, body: { title: 'RBAC 101', category: 'Test', isPublished: true } });
  courseId = course.data._id;
  await api('POST', `/enrollments/courses/${courseId}/students`, { token: admin.token, deviceId: 'dev-admin', body: { student: 'sam' } });
  const q = await api('POST', `/quizzes/courses/${courseId}/questions`, {
    token: t1.token, deviceId: t1.deviceId,
    body: { type: 'true_false', text: 'RBAC is enforced server-side.', options: [{ id: 'true', text: 'True', isCorrect: true }, { id: 'false', text: 'False', isCorrect: false }] },
  });
  const quiz = await api('POST', `/quizzes/courses/${courseId}`, { token: t1.token, deviceId: t1.deviceId, body: { title: 'Q', questions: [q.data._id], isPublished: true } });
  const attempt = await api('POST', `/quizzes/courses/${courseId}/${quiz.data._id}/start`, { token: s1.token, deviceId: s1.deviceId });
  attemptId = attempt.data.attemptId;
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });
const forbidden = (r, label) => assert.equal(r.status, 403, `${label}: ${JSON.stringify(r.data)}`);

test('student is denied every teacher, admin and owner endpoint', async () => {
  forbidden(await as(s1, 'GET', '/admin/users'), 'admin users');
  forbidden(await as(s1, 'POST', '/admin/users', { name: 'X', username: 'x1', password: 'Learn@1234', role: 'student' }), 'create user');
  forbidden(await as(s1, 'PUT', '/admin/settings', { platformName: 'x' }), 'settings');
  forbidden(await as(s1, 'GET', '/analytics/admin'), 'admin analytics');
  forbidden(await as(s1, 'GET', '/anticheat/platform'), 'anticheat platform');
  forbidden(await as(s1, 'GET', '/courses/mine'), 'teacher course list');
  forbidden(await as(s1, 'POST', '/courses', { title: 'Nope' }), 'create course');
  forbidden(await as(s1, 'POST', `/enrollments/courses/${courseId}/codes`, { count: 1 }), 'codes');
});

test('student cannot read another student\'s attempt or touch another enrollment', async () => {
  forbidden(await as(s2, 'GET', `/quizzes/attempts/${attemptId}`), 'foreign attempt');
  forbidden(await as(s2, 'POST', `/enrollments/courses/${courseId}/students/${s1.user.id}/expire`, { expiresAt: null }), 'foreign enrollment');
  const own = await as(s1, 'GET', `/quizzes/attempts/${attemptId}`);
  assert.equal(own.status, 200);
});

test('teacher manages own course but not a colleague\'s', async () => {
  const own = await as(t1, 'PUT', `/courses/${courseId}`, { description: 'mine' });
  assert.equal(own.status, 200);
  forbidden(await as(t2, 'PUT', `/courses/${courseId}`, { description: 'not mine' }), 'foreign course update');
  forbidden(await as(t2, 'GET', `/courses/${courseId}`), 'foreign course read');
  forbidden(await as(t2, 'GET', `/enrollments/courses/${courseId}/students`), 'foreign roster');
});

test('teacher cannot reach admin capabilities', async () => {
  forbidden(await as(t1, 'POST', '/admin/users', { name: 'X', username: 'x2', password: 'Admin@12345', role: 'admin' }), 'create admin');
  forbidden(await as(t1, 'PUT', '/admin/settings', { platformName: 'x' }), 'settings');
  forbidden(await as(t1, 'POST', `/enrollments/courses/${courseId}/codes`, { count: 1 }), 'codes');
  forbidden(await as(t1, 'POST', `/enrollments/courses/${courseId}/students`, { student: 'sue' }), 'assign');
  forbidden(await as(t1, 'GET', '/admin/audit-logs'), 'audit');
});

test('admin manages ordinary users, courses and codes', async () => {
  const stu = await as(admin, 'POST', '/admin/users', { name: 'New Stu', username: 'newstu', password: 'Learn@1234', role: 'student' });
  assert.equal(stu.status, 201);
  const tea = await as(admin, 'POST', '/admin/users', { name: 'New Tea', username: 'newtea', password: 'Teach@1234', role: 'teacher' });
  assert.equal(tea.status, 201);
  const codes = await as(admin, 'POST', `/enrollments/courses/${courseId}/codes`, { count: 1, maxUses: 1 });
  assert.equal(codes.status, 201);
  const upd = await as(admin, 'PUT', `/courses/${courseId}`, { description: 'admin edit' });
  assert.equal(upd.status, 200);
  const susp = await as(admin, 'POST', `/admin/users/${stu.data.id}/status`, { status: 'suspended' });
  assert.equal(susp.status, 200);
  const dash = await as(admin, 'GET', '/analytics/admin');
  assert.equal(dash.status, 200);
});

test('admin cannot create admins, promote self, or write owner-only settings', async () => {
  forbidden(await as(admin, 'POST', '/admin/users', { name: 'A2', username: 'a2', password: 'Admin@12345', role: 'admin' }), 'create admin');
  const self = await as(admin, 'PUT', `/admin/users/${admin.user.id}`, { role: 'super_admin' });
  assert.equal(self.status, 400);
  const promote = await as(admin, 'PUT', `/admin/users/${t1.user.id}`, { role: 'admin' });
  forbidden(promote, 'promote teacher to admin');
  const sec = await as(admin, 'PUT', '/admin/settings', { sessionTimeoutMinutes: 15 });
  forbidden(sec, 'owner-only setting');
  assert.equal(sec.data.code, 'OWNER_PROTECTED');
});

test('owner can do all of it', async () => {
  const a = await as(owner, 'POST', '/admin/users', { name: 'Owner-made Admin', username: 'oadmin', password: 'Admin@12345', role: 'admin' });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const promote = await as(owner, 'PUT', `/admin/users/${t2.user.id}`, { role: 'admin' });
  assert.equal(promote.status, 200);
  const sec = await as(owner, 'PUT', '/admin/settings', { sessionTimeoutMinutes: 15 });
  assert.equal(sec.status, 200);
  const course = await as(owner, 'PUT', `/courses/${courseId}`, { description: 'owner edit' });
  assert.equal(course.status, 200);
  const codes = await as(owner, 'POST', `/enrollments/courses/${courseId}/codes`, { count: 1 });
  assert.equal(codes.status, 201);
  const audit = await as(owner, 'GET', '/admin/audit-logs?limit=5');
  assert.equal(audit.status, 200);
});

test('super_admin passes authorize(\'admin\') on legacy routes', async () => {
  const r = await as(owner, 'GET', '/courses/mine');
  assert.equal(r.status, 200);
  const g = await as(owner, 'POST', '/announcements/global', { title: 'Hello', body: 'From the owner' });
  assert.equal(g.status, 201, JSON.stringify(g.data));
});
```

- [ ] **Step 2: Run it**

Run: `cd server && node --test tests/rbac.test.js`
Expected: `# pass 8`. If `teacher cannot reach admin capabilities` fails on `assign`, confirm `enrollments.routes.js` has `requirePermission(P.ENROLLMENTS_MANAGE)` on that route (Task 3 Step 7). If `super_admin passes authorize('admin')` fails on `/courses/mine`, confirm `courses.controller.myCourses` still treats non-teachers as "all courses" (it does — `role === 'teacher'` branch only).

- [ ] **Step 3: Full suite and commit**

Run: `cd server && npm test 2>&1 | tail -8` → `# pass 57`, `# fail 0`.

```bash
git add server/tests/rbac.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "test: RBAC matrix across student, teacher, admin and owner

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `Device` model, session fields, settings default, migration runner

**Files:**
- Create: `server/src/models/Device.js`, `server/src/models/Migration.js`, `server/src/scripts/migrate.js`, `server/src/migrations/001-roles-and-devices.js`
- Modify: `server/src/models/Session.js:10-30`, `server/src/config/settingsCache.js:12-30`, `server/package.json` (scripts), `server/tests/seed.test.js` (append migration tests)

**Interfaces:**
- Produces: `Device` model (fields per spec §7.1; indexes `{ user: 1 }` unique partial on `status: 'active'`, `{ user: 1, createdAt: -1 }`).
- Produces: `Session.device` (ObjectId|null), `Session.deviceKeyHash` (String|null, `select: false`), `endReason` values `device_revoked`, `device_mismatch`, `policy_relogin`.
- Produces: `runMigrations({ dryRun, forceRelogin, log }) → Promise<{ applied: string[], skipped: string[] }>` exported from `scripts/migrate.js`.
- Produces: `SETTING_DEFAULTS.deviceBindingEnabled === true`.

- [ ] **Step 1: Append failing migration tests to `seed.test.js`**

Append to `server/tests/seed.test.js`:

```js
test('migration dry-run records nothing and changes nothing', async () => {
  const { runMigrations } = require('../src/scripts/migrate');
  const Migration = require('../src/models/Migration');
  const before = await User().find().select('tokenVersion').lean();
  const result = await runMigrations({ dryRun: true, forceRelogin: true, log: () => {} });
  assert.ok(result.skipped.includes('001-roles-and-devices'));
  assert.equal(await Migration.countDocuments(), 0);
  const after = await User().find().select('tokenVersion').lean();
  assert.deepEqual(after, before);
});

test('migration --force-relogin bumps every tokenVersion and ends sessions, once', async () => {
  const { runMigrations } = require('../src/scripts/migrate');
  const Migration = require('../src/models/Migration');
  const Session = require('../src/models/Session');
  const admin = await app.loginAs('admin', 'Admin@12345', { deviceId: 'dev-admin-mig' });
  const before = Object.fromEntries((await User().find().select('tokenVersion').lean()).map((u) => [String(u._id), u.tokenVersion]));

  const first = await runMigrations({ forceRelogin: true, log: () => {} });
  assert.deepEqual(first.applied, ['001-roles-and-devices']);
  assert.equal(await Migration.countDocuments({ name: '001-roles-and-devices' }), 1);
  for (const u of await User().find().select('tokenVersion').lean()) {
    assert.equal(u.tokenVersion, before[String(u._id)] + 1);
  }
  assert.equal(await Session.countDocuments({ isActive: true }), 0);
  const me = await app.api('GET', '/auth/me', { token: admin.token, deviceId: 'dev-admin-mig' });
  assert.equal(me.status, 401);

  const second = await runMigrations({ forceRelogin: true, log: () => {} });
  assert.deepEqual(second.applied, []);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd server && node --test tests/seed.test.js`
Expected: the two new tests fail with `Cannot find module '../src/scripts/migrate'`.

- [ ] **Step 3: Create the `Device` and `Migration` models**

Create `server/src/models/Device.js`:

```js
const mongoose = require('mongoose');

/**
 * Authorized device for an account. The partial unique index on { user }
 * where status is 'active' makes the DATABASE guarantee at most one active
 * device per user — concurrent first logins cannot both bind.
 * The device credential (the client's random device id) is stored only as a
 * SHA-256 hash; publicId is a short display handle derived from it.
 */
const deviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceKeyHash: { type: String, required: true, select: false },
    publicId: { type: String, required: true },
    fingerprintHash: { type: String, default: null },

    platform: { type: String, enum: ['web', 'android', 'ios', 'other'], default: 'web' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    deviceType: { type: String, default: 'desktop' },
    model: { type: String, default: '' },
    appVersion: { type: String, default: '' },

    firstAuthorizedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    lastIp: { type: String, default: '' },

    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revocationReason: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true }
);

deviceSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
deviceSchema.index({ user: 1, createdAt: -1 });

deviceSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    publicId: this.publicId,
    platform: this.platform,
    browser: this.browser,
    os: this.os,
    deviceType: this.deviceType,
    model: this.model,
    appVersion: this.appVersion,
    firstAuthorizedAt: this.firstAuthorizedAt,
    lastSeenAt: this.lastSeenAt,
    lastIp: this.lastIp,
    status: this.status,
    revokedAt: this.revokedAt,
    revocationReason: this.revocationReason,
  };
};

module.exports = mongoose.model('Device', deviceSchema);
```

Create `server/src/models/Migration.js`:

```js
const mongoose = require('mongoose');

/** One row per applied data migration (see src/scripts/migrate.js). */
const migrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    appliedAt: { type: Date, default: Date.now },
  },
  { collection: '_migrations' }
);

module.exports = mongoose.model('Migration', migrationSchema);
```

- [ ] **Step 4: Extend `Session` and settings defaults**

In `server/src/models/Session.js`, after the `isActive` line add:

```js
    // Authorized-device binding: the session is pinned to the device that created it.
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', default: null },
    deviceKeyHash: { type: String, default: null, select: false },
```

and extend the `endReason` enum to:

```js
      enum: [null, 'logout', 'new_device_login', 'admin_force_logout', 'inactivity_timeout', 'password_changed',
        'refresh_rotated_reuse', 'device_revoked', 'device_mismatch', 'policy_relogin'],
```

In `server/src/config/settingsCache.js`, inside `DEFAULTS` after `requireEmailVerification: true,` add:

```js
  deviceBindingEnabled: true, // one account ↔ one authorized device (owner-only setting)
```

- [ ] **Step 5: Migration runner and migration 001**

Create `server/src/migrations/001-roles-and-devices.js`:

```js
const { ROLES } = require('../config/constants');

/**
 * Four-role hierarchy + Device collection.
 * Role values are unchanged (admin stays admin; the owner is created by the
 * seed), so this verifies data, ensures the Device indexes, and optionally
 * forces every user to sign in again under the device policy.
 */
module.exports = {
  name: '001-roles-and-devices',
  async up({ dryRun, forceRelogin, log }) {
    const User = require('../models/User');
    const Session = require('../models/Session');
    const Device = require('../models/Device');
    const audit = require('../core/audit');

    const counts = await User.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$role', n: { $sum: 1 } } },
    ]);
    for (const c of counts) log(`  role ${c._id}: ${c.n} user(s)`);
    const unknown = counts.filter((c) => !Object.values(ROLES).includes(c._id));
    if (unknown.length) throw new Error(`Unknown role values present: ${unknown.map((u) => u._id).join(', ')}`);

    log('  ensure Device indexes (unique active device per user)');
    if (!dryRun) await Device.syncIndexes();

    if (forceRelogin) {
      const users = await User.countDocuments({});
      const sessions = await Session.countDocuments({ isActive: true });
      log(`  force re-login: bump tokenVersion for ${users} user(s), end ${sessions} active session(s)`);
      if (!dryRun) {
        await User.updateMany({}, { $inc: { tokenVersion: 1 } });
        await Session.updateMany({ isActive: true }, { $set: { isActive: false, endedAt: new Date(), endReason: 'policy_relogin' } });
        await audit({ action: 'POLICY_RELOGIN', meta: { users, sessions, migration: '001-roles-and-devices' } });
      }
    }
  },
};
```

Create `server/src/scripts/migrate.js`:

```js
/**
 * Data migrations: `npm run migrate [-- --dry-run] [-- --force-relogin]`.
 * Applies every file in src/migrations (sorted) that is not yet recorded in
 * the _migrations collection. --dry-run prints intended operations only.
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const runMigrations = async ({ dryRun = false, forceRelogin = false, log = console.log } = {}) => {
  const Migration = require('../models/Migration');
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.js')).sort();
  const done = new Set((await Migration.find().lean()).map((m) => m.name));
  const applied = [];
  const skipped = [];

  for (const file of files) {
    const migration = require(path.join(MIGRATIONS_DIR, file));
    if (done.has(migration.name)) { skipped.push(migration.name); continue; }
    log(`${dryRun ? '[dry-run] ' : ''}migration ${migration.name}`);
    await migration.up({ dryRun, forceRelogin, log });
    if (dryRun) { skipped.push(migration.name); continue; }
    await Migration.create({ name: migration.name });
    applied.push(migration.name);
  }
  return { applied, skipped };
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const { connectDB, disconnectDB } = require('../config/db');
  const { logger } = require('../config/logger');
  connectDB()
    .then(() => runMigrations({ dryRun: args.includes('--dry-run'), forceRelogin: args.includes('--force-relogin') }))
    .then(async (r) => {
      logger.info(`Migrations applied: ${r.applied.join(', ') || 'none'}; skipped: ${r.skipped.join(', ') || 'none'}`);
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error(`Migration failed: ${err.message}`);
      await disconnectDB().catch(() => {});
      process.exit(1);
    });
}

module.exports = { runMigrations };
```

Add to `server/package.json` scripts: `"migrate": "node src/scripts/migrate.js"`.

- [ ] **Step 6: Run the seed/migration tests, lint, suite**

Run: `cd server && node --test tests/seed.test.js && npm run lint && npm test 2>&1 | tail -8`
Expected: seed file `# pass 6`; full suite `# pass 59`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add server/src server/tests/seed.test.js server/package.json
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(devices): Device model with DB-enforced single active device, session pinning fields, migration runner

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Enumeration-safe login with device binding

**Files:**
- Create: `server/src/modules/auth/device.service.js`
- Modify: `server/src/modules/auth/auth.service.js:1-115` (imports + `login`), `server/src/modules/auth/auth.controller.js:20-33` (`login`), `server/src/modules/auth/auth.validators.js:12-18` (`loginSchema`)
- Test: `server/tests/devices.test.js` (part 1 — created here, extended in Task 10)

**Interfaces:**
- Produces: `DeviceService.hashDeviceId(deviceId) → hex sha256`; `DeviceService.publicIdFor(deviceId, userId) → 8 uppercase hex chars`; `DeviceService.bindOrVerify({ user, deviceId, fingerprint, ip, ua: { browser, os, deviceType }, platform, appVersion }) → Promise<{ device, rejected: boolean }>`; `DeviceService.normalizePlatform(header) → 'web'|'android'|'ios'|'other'`.
- Produces: `AuthService.login({ …, platform, appVersion })` — throws `403 DEVICE_NOT_AUTHORIZED` after the password check; new sessions carry `device` and `deviceKeyHash`.
- Consumes: `Device`, `Session` fields from Task 7; `SETTING_DEFAULTS.deviceBindingEnabled`.

- [ ] **Step 1: Write the failing device tests (part 1)**

Create `server/tests/devices.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

const DEVICE_MSG = 'This account is already linked to another device. Contact an administrator or request a device reset.';
const GENERIC_MSG = 'Invalid username or password';

let app, api, admin, owner, samId;
before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  owner = await app.loginAndOnboard(CREDENTIALS.owner.username, CREDENTIALS.owner.password, { deviceId: 'dev-owner' });
  const sam = await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  samId = sam.id;
});
after(async () => { await app.stop(); });

const login = (username, password, deviceId, extra = {}) =>
  api('POST', '/auth/login', { deviceId, body: { username, password, deviceId }, ...extra });
const auditRows = async (action, userId) => {
  const r = await api('GET', `/admin/audit-logs?action=${action}&userId=${userId}&limit=50`, { token: owner.token, deviceId: 'dev-owner' });
  return r.data.items;
};

let tokenA;

test('first login binds device A (DEVICE_BOUND)', async () => {
  const r = await login('sam', 'Learn@1234', 'dev-sam-A');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  tokenA = r.data.accessToken;
  assert.equal((await auditRows('DEVICE_BOUND', samId)).length, 1);
});

test('same device logs in again', async () => {
  const r = await login('sam', 'Learn@1234', 'dev-sam-A');
  assert.equal(r.status, 200);
  tokenA = r.data.accessToken;
  assert.equal((await auditRows('DEVICE_BOUND', samId)).length, 1, 'no second bind row');
});

test('different device is rejected and the trusted device keeps working', async () => {
  const r = await login('sam', 'Learn@1234', 'dev-sam-B');
  assert.equal(r.status, 403);
  assert.equal(r.data.code, 'DEVICE_NOT_AUTHORIZED');
  assert.equal(r.data.message, DEVICE_MSG);
  assert.equal((await auditRows('DEVICE_LOGIN_REJECTED', samId)).length, 1);

  const me = await api('GET', '/auth/me', { token: tokenA, deviceId: 'dev-sam-A' });
  assert.equal(me.status, 200, 'device A session untouched by the rejected attempt');
});

test('wrong password from a foreign device gets the generic message, not the device message', async () => {
  const r = await login('sam', 'WrongPass1', 'dev-sam-B');
  assert.equal(r.status, 401);
  assert.equal(r.data.message, GENERIC_MSG);
});

test('unknown user and wrong password are indistinguishable', async () => {
  const unknown = await login('nobody', 'Learn@1234', 'dev-x');
  const wrong = await login('sam', 'WrongPass1', 'dev-sam-A');
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.data.message, wrong.data.message);
  assert.equal(unknown.data.code, wrong.data.code);
});

test('concurrent first logins: exactly one device binds', async () => {
  await app.createUser(admin.token, { name: 'Race', username: 'race', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const [r1, r2] = await Promise.all([login('race', 'Learn@1234', 'dev-race-1'), login('race', 'Learn@1234', 'dev-race-2')]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 403], JSON.stringify([r1.data, r2.data]));
  const winner = r1.status === 200 ? { token: r1.data.accessToken, deviceId: 'dev-race-1' } : { token: r2.data.accessToken, deviceId: 'dev-race-2' };
  const loser = r1.status === 200 ? r2 : r1;
  assert.equal(loser.data.code, 'DEVICE_NOT_AUTHORIZED');
  const me = await api('GET', '/auth/me', { token: winner.token, deviceId: winner.deviceId });
  assert.equal(me.status, 200);
});

test('deviceBindingEnabled=false disables the one-device rule (single session still applies)', async () => {
  await app.createUser(admin.token, { name: 'Free', username: 'free', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const off = await api('PUT', '/admin/settings', { token: owner.token, deviceId: 'dev-owner', body: { deviceBindingEnabled: false } });
  assert.equal(off.status, 200);
  try {
    const a = await login('free', 'Learn@1234', 'dev-free-1');
    assert.equal(a.status, 200);
    const b = await login('free', 'Learn@1234', 'dev-free-2');
    assert.equal(b.status, 200);
    const oldA = await api('GET', '/auth/me', { token: a.data.accessToken, deviceId: 'dev-free-1' });
    assert.equal(oldA.status, 401, 'single active session still enforced');
  } finally {
    await api('PUT', '/admin/settings', { token: owner.token, deviceId: 'dev-owner', body: { deviceBindingEnabled: true } });
  }
});

test('fingerprint drift on the trusted device is logged, not rejected', async () => {
  const r = await login('sam', 'Learn@1234', 'dev-sam-A', { fingerprint: 'fp-after-browser-update' });
  assert.equal(r.status, 200);
  tokenA = r.data.accessToken;
  const r2 = await login('sam', 'Learn@1234', 'dev-sam-A', { fingerprint: 'fp-changed-again' });
  assert.equal(r2.status, 200);
  tokenA = r2.data.accessToken;
  assert.ok((await auditRows('DEVICE_FINGERPRINT_DRIFT', samId)).length >= 1);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd server && node --test tests/devices.test.js`
Expected: `first login binds` fails on the `DEVICE_BOUND` count; `different device is rejected` fails (status 200).

- [ ] **Step 3: Create `device.service.js`**

Create `server/src/modules/auth/device.service.js`:

```js
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { securityLogger } = require('../../config/logger');
const { sha256, safeEqual } = require('../../core/cryptoUtils');
const Device = require('../../models/Device');
const Session = require('../../models/Session');
const User = require('../../models/User');

const PLATFORMS = new Set(['web', 'android', 'ios']);

/**
 * One account ↔ one authorized device.
 * The device credential is the client's random device id; only its SHA-256
 * is stored. The Device collection's partial unique index guarantees a single
 * active device per user even under concurrent first logins.
 */
class DeviceService {
  static hashDeviceId(deviceId) {
    return sha256(String(deviceId));
  }

  static publicIdFor(deviceId, userId) {
    return sha256(`${deviceId}:${userId}`).slice(0, 8).toUpperCase();
  }

  static normalizePlatform(header) {
    const v = String(header || 'web').toLowerCase();
    return PLATFORMS.has(v) ? v : 'other';
  }

  /**
   * Called by login after the password is verified.
   * Returns { device, rejected }. Never throws for a foreign device — the
   * caller records LoginHistory and audits before failing the request.
   */
  static async bindOrVerify({ user, deviceId, fingerprint, ip, ua = {}, platform = 'web', appVersion = '' }) {
    const keyHash = DeviceService.hashDeviceId(deviceId);
    const fingerprintHash = fingerprint ? sha256(String(fingerprint)) : null;

    let active = await Device.findOne({ user: user._id, status: 'active' }).select('+deviceKeyHash');

    if (!active) {
      const hadPrevious = await Device.exists({ user: user._id, status: 'revoked' });
      const publicId = DeviceService.publicIdFor(deviceId, user._id);
      try {
        active = await Device.create({
          user: user._id,
          deviceKeyHash: keyHash,
          publicId,
          fingerprintHash,
          platform,
          browser: ua.browser || '',
          os: ua.os || '',
          deviceType: ua.deviceType || 'desktop',
          appVersion: appVersion || '',
          firstAuthorizedAt: new Date(),
          lastSeenAt: new Date(),
          lastIp: ip || '',
          status: 'active',
        });
        await audit({
          user: user._id, action: hadPrevious ? 'DEVICE_CHANGED' : 'DEVICE_BOUND', targetUser: user._id,
          ip, deviceId: publicId, meta: { platform, browser: ua.browser, os: ua.os },
        });
        return { device: active, rejected: false };
      } catch (err) {
        if (err.code !== 11000) throw err;
        // Lost the race: another login bound a device a moment ago.
        active = await Device.findOne({ user: user._id, status: 'active' }).select('+deviceKeyHash');
        if (!active) throw err;
      }
    }

    if (!safeEqual(active.deviceKeyHash, keyHash)) {
      return { device: active, rejected: true };
    }

    if (active.fingerprintHash && fingerprintHash && active.fingerprintHash !== fingerprintHash) {
      securityLogger.warn('DEVICE_FINGERPRINT_DRIFT', { user: String(user._id), device: active.publicId });
      await audit({ user: user._id, action: 'DEVICE_FINGERPRINT_DRIFT', targetUser: user._id, ip, deviceId: active.publicId });
    }
    active.lastSeenAt = new Date();
    active.lastIp = ip || active.lastIp;
    if (fingerprintHash) active.fingerprintHash = fingerprintHash;
    if (appVersion) active.appVersion = appVersion;
    active.platform = platform;
    if (ua.browser) active.browser = ua.browser;
    if (ua.os) active.os = ua.os;
    await active.save();
    return { device: active, rejected: false };
  }

  /**
   * Revoke the target's authorized device: end every session, bump
   * tokenVersion, audit. The next login from any device binds fresh.
   */
  static async revoke({ targetUserId, actor, reason, ip, self = false }) {
    const now = new Date();
    const revoked = await Device.updateMany(
      { user: targetUserId, status: 'active' },
      { $set: { status: 'revoked', revokedAt: now, revokedBy: actor.id, revocationReason: reason } }
    );
    await Session.updateMany(
      { user: targetUserId, isActive: true },
      { $set: { isActive: false, endedAt: now, endReason: 'device_revoked' } }
    );
    await User.updateOne({ _id: targetUserId }, { $inc: { tokenVersion: 1 } });
    await audit({ user: actor.id, action: 'DEVICE_REVOKED', targetUser: targetUserId, ip, meta: { reason, self, devices: revoked.modifiedCount } });
    return { revoked: revoked.modifiedCount };
  }

  static async activeFor(userId) {
    const device = await Device.findOne({ user: userId, status: 'active' });
    return device ? device.toPublicJSON() : null;
  }

  static async historyFor(userId, limit = 20) {
    const rows = await Device.find({ user: userId, status: 'revoked' }).sort({ revokedAt: -1 }).limit(limit)
      .populate('revokedBy', 'name username');
    return rows.map((d) => ({ ...d.toPublicJSON(), revokedBy: d.revokedBy ? { name: d.revokedBy.name, username: d.revokedBy.username } : null }));
  }

  /** Throws unless the presented device id matches the session's pinned hash. */
  static assertSessionDevice(session, presentedDeviceId) {
    if (!session.deviceKeyHash) return;
    if (!presentedDeviceId || !safeEqual(DeviceService.hashDeviceId(presentedDeviceId), session.deviceKeyHash)) {
      throw ApiError.unauthorized('Your session has ended. Please sign in again.', 'SESSION_TERMINATED');
    }
  }
}

module.exports = DeviceService;
```

- [ ] **Step 4: Rewrite `AuthService.login` and its imports**

In `server/src/modules/auth/auth.service.js`, replace lines 1–11 (imports) with:

```js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { UAParser } = require('ua-parser-js');
const env = require('../../config/env');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { sendMail, templates } = require('../../core/mailer');
const { sha256, randomToken, safeEqual } = require('../../core/cryptoUtils');
const { getSettings } = require('../../config/settingsCache');
const User = require('../../models/User');
const Session = require('../../models/Session');
const LoginHistory = require('../../models/LoginHistory');
const DeviceService = require('./device.service');

// Compared against when the username is unknown so response timing does not reveal account existence.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-password', 12);
const GENERIC_CREDENTIALS_MESSAGE = 'Invalid username or password';
const DEVICE_NOT_AUTHORIZED_MESSAGE = 'This account is already linked to another device. Contact an administrator or request a device reset.';
```

Replace the whole `login` method (from `/** Login. Enforces …` through the closing `}` of the method, currently lines 35–115) with:

```js
  /**
   * Login, in enumeration-safe order:
   *   password → (only then) lock / ban / suspension → device binding → session.
   * A wrong password always yields the generic message, whatever the account state.
   * The single-active-session policy still applies: a new login ends other sessions.
   */
  static async login({ username, password, deviceId, fingerprint, rememberMe, userAgent, ip, platform = 'web', appVersion = '' }) {
    const settings = await getSettings();
    const device = parseDevice(userAgent);
    const historyBase = { username, ip, userAgent, deviceId: deviceId || '', fingerprint: fingerprint || '', ...device };

    const fail = async (user, reason, message, status = 401, code, extraAudit) => {
      await LoginHistory.create({ ...historyBase, user: user?._id, success: false, reason });
      await audit({ user: user?._id, action: 'LOGIN_FAILED', ip, deviceId, meta: { username, reason } });
      if (extraAudit) await audit({ user: user?._id, action: extraAudit, targetUser: user?._id, ip, deviceId, meta: { reason } });
      throw new ApiError(status, message, code);
    };

    if (!deviceId) throw ApiError.badRequest('Device ID is required', 'DEVICE_REQUIRED');

    const user = await User.findOne({ username: username.toLowerCase(), deletedAt: null })
      .select('+password +failedLoginAttempts +lockedUntil');

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return fail(null, 'unknown_user', GENERIC_CREDENTIALS_MESSAGE);
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      user.failedLoginAttempts += 1;
      let reason = 'bad_password';
      if (user.failedLoginAttempts >= (settings.maxLoginAttempts || 5)) {
        user.lockedUntil = new Date(Date.now() + (settings.lockoutMinutes || 15) * 60000);
        user.failedLoginAttempts = 0;
        reason = 'locked';
        await user.save();
        await audit({ user: user._id, action: 'ACCOUNT_LOCKED', ip, deviceId });
      } else {
        await user.save();
      }
      return fail(user, reason, GENERIC_CREDENTIALS_MESSAGE);
    }

    // Password is correct — account state may now be disclosed.
    if (user.status === 'banned') return fail(user, 'banned', 'This account has been banned', 403, 'ACCOUNT_BANNED');
    if (user.status === 'suspended') return fail(user, 'suspended', 'This account is suspended', 403, 'ACCOUNT_SUSPENDED');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return fail(user, 'locked', `Account locked. Try again in ${mins} minute(s).`, 423, 'ACCOUNT_LOCKED');
    }

    // Reset lockout counters, stamp login.
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    // ONE ACCOUNT, ONE AUTHORIZED DEVICE.
    let boundDevice = null;
    if (settings.deviceBindingEnabled !== false) {
      const result = await DeviceService.bindOrVerify({ user, deviceId, fingerprint, ip, ua: device, platform, appVersion });
      if (result.rejected) {
        return fail(user, 'device_not_authorized', DEVICE_NOT_AUTHORIZED_MESSAGE, 403, 'DEVICE_NOT_AUTHORIZED', 'DEVICE_LOGIN_REJECTED');
      }
      boundDevice = result.device;
    }

    // SINGLE ACTIVE SESSION: terminate every other session for this user.
    const terminated = await Session.updateMany(
      { user: user._id, isActive: true },
      { $set: { isActive: false, endedAt: new Date(), endReason: 'new_device_login' } }
    );
    if (terminated.modifiedCount > 0) {
      await audit({ user: user._id, action: 'SESSION_TERMINATED', ip, deviceId, meta: { count: terminated.modifiedCount, cause: 'new_login' } });
    }

    const session = await Session.create({
      user: user._id,
      refreshTokenHash: 'pending',
      deviceId,
      device: boundDevice?._id || null,
      deviceKeyHash: DeviceService.hashDeviceId(deviceId),
      fingerprint: fingerprint || null,
      userAgent,
      ip,
      rememberMe: !!rememberMe,
      ...device,
    });

    const tokens = AuthService.signTokens(user, session._id, rememberMe);
    session.refreshTokenHash = sha256(tokens.refreshToken);
    await session.save();

    await LoginHistory.create({ ...historyBase, user: user._id, success: true });
    await audit({ user: user._id, action: 'LOGIN', ip, deviceId });

    return { user: user.toPublicJSON(), session, ...tokens };
  }
```

- [ ] **Step 5: Controller passes platform and app version**

In `server/src/modules/auth/auth.controller.js`, replace the `login` handler (lines 20–33) with:

```js
const login = asyncHandler(async (req, res) => {
  const { username, password, deviceId, fingerprint, rememberMe } = req.body;
  const result = await AuthService.login({
    username,
    password,
    deviceId: deviceId || req.headers['x-device-id'],
    fingerprint: fingerprint || req.headers['x-fingerprint'],
    rememberMe,
    userAgent: req.headers['user-agent'] || '',
    ip: clientIp(req),
    platform: DeviceService.normalizePlatform(req.headers['x-client-platform']),
    appVersion: String(req.headers['x-app-version'] || '').slice(0, 40),
  });
  res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(rememberMe));
  res.json({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken });
});
```

and add `const DeviceService = require('./device.service');` after the `AuthService` require. (Task 9 changes the response body.)

- [ ] **Step 6: Run device tests part 1, lint, suite**

Run: `cd server && node --test tests/devices.test.js && npm run lint && npm test 2>&1 | tail -8`
Expected: devices file `# pass 8`; full suite `# pass 67`, `# fail 0`. The smoke suite's admin/teacher/student logins each use one fixed device id, so nothing there changes.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/auth server/tests/devices.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(auth): enumeration-safe login order and one-account/one-device binding

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Refresh-token transport (cookie-only for web, native body copy, Origin allowlist)

**Files:**
- Modify: `server/src/modules/auth/auth.controller.js` (`cookieOptions`, `login`, `refresh`, `changePassword`, new `isNativeClient`), `server/src/modules/auth/auth.routes.js:9-16`, `server/src/middleware/security.js` (allowlist, `requireAllowedOrigin`, CORS headers)
- Test: `server/tests/auth.test.js` (part 1 — created here, extended in Task 11)

**Interfaces:**
- Produces: `require('../../middleware/security')` → `{ applySecurity, sanitizeRequest, requireAllowedOrigin, allowedOrigins: Set<string> }`.
- Produces: `POST /auth/login|refresh|change-password` body is `{ user, accessToken }` for web; `{ user, accessToken, refreshToken }` when `x-client-platform` ∈ {android, ios}. `POST /auth/refresh` reads the cookie, or the body **only** for native clients.
- Produces: `403 ORIGIN_NOT_ALLOWED` on `/auth/refresh` and `/auth/logout` when an `Origin` header is present and not allowlisted.

- [ ] **Step 1: Write the failing transport tests**

Create `server/tests/auth.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin;
before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  for (const u of [
    { name: 'Web User', username: 'webby', password: 'Learn@1234', role: 'student' },
    { name: 'Droid User', username: 'droid', password: 'Learn@1234', role: 'student' },
    { name: 'Cookie User', username: 'cookie', password: 'Learn@1234', role: 'student' },
  ]) await app.createUser(admin.token, u, 'dev-admin');
});
after(async () => { await app.stop(); });

const login = (username, password, deviceId, extra = {}) =>
  api('POST', '/auth/login', { deviceId, body: { username, password, deviceId }, ...extra });

test('web login: refresh token only in an httpOnly cookie, never in the body', async () => {
  const r = await login('webby', 'Learn@1234', 'dev-web');
  assert.equal(r.status, 200);
  assert.ok(r.data.accessToken);
  assert.equal(r.data.refreshToken, undefined);
  const cookie = r.setCookies.find((c) => c.startsWith('lms_refresh='));
  assert.ok(cookie, 'refresh cookie set');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Path=\/api\/v1\/auth/);
  assert.match(cookie, /SameSite=Lax/i);
});

test('native login (x-client-platform: android) also returns the refresh token in the body', async () => {
  const r = await login('droid', 'Learn@1234', 'dev-droid', { platform: 'android' });
  assert.equal(r.status, 200);
  assert.ok(r.data.refreshToken, 'body copy for Keystore storage');
  const refreshed = await api('POST', '/auth/refresh', { deviceId: 'dev-droid', platform: 'android', body: { refreshToken: r.data.refreshToken } });
  assert.equal(refreshed.status, 200, JSON.stringify(refreshed.data));
  assert.ok(refreshed.data.refreshToken, 'rotated token returned to native client');
});

test('web refresh works from the cookie and rotates it', async () => {
  const r = await login('cookie', 'Learn@1234', 'dev-cookie');
  const first = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: r.cookies });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.ok(first.data.accessToken);
  assert.equal(first.data.refreshToken, undefined);
  assert.ok(first.cookies.includes('lms_refresh='), 'new cookie issued');
  assert.notEqual(first.cookies, r.cookies, 'cookie rotated');

  const replay = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: r.cookies });
  assert.equal(replay.status, 401, 'old cookie is single-use');
  assert.equal(replay.data.code, 'SESSION_TERMINATED');
  const logs = await api('GET', '/admin/audit-logs?action=TOKEN_REUSE_DETECTED&limit=5', { token: admin.token, deviceId: 'dev-admin' });
  assert.ok(logs.data.items.length >= 1);

  const after = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: first.cookies });
  assert.equal(after.status, 401, 'reuse killed the whole session, including the newest token');
});

test('web refresh ignores a body refresh token', async () => {
  const r = await login('webby', 'Learn@1234', 'dev-web', { platform: 'android' });
  const bodyOnly = await api('POST', '/auth/refresh', { deviceId: 'dev-web', body: { refreshToken: r.data.refreshToken } });
  assert.equal(bodyOnly.status, 401);
  assert.equal(bodyOnly.data.code, 'NO_REFRESH');
});

test('refresh and logout enforce the Origin allowlist', async () => {
  const r = await login('cookie', 'Learn@1234', 'dev-cookie');
  const bad = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: r.cookies, headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
  assert.equal(bad.data.code, 'ORIGIN_NOT_ALLOWED');
  const good = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: r.cookies, headers: { Origin: 'http://localhost:5173' } });
  assert.equal(good.status, 200, JSON.stringify(good.data));
  const badLogout = await api('POST', '/auth/logout', { deviceId: 'dev-cookie', token: good.data.accessToken, headers: { Origin: 'https://evil.example' } });
  assert.equal(badLogout.status, 403);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd server && node --test tests/auth.test.js`
Expected: `refreshToken` present in the web body; Origin test returns 200 instead of 403.

- [ ] **Step 3: Security middleware — allowlist and `requireAllowedOrigin`**

In `server/src/middleware/security.js`, add after the `env` require:

```js
const ApiError = require('../core/ApiError');

/** Origins allowed to make credentialed requests: the SPA plus ALLOWED_ORIGINS (e.g. Capacitor origins). */
const allowedOrigins = new Set(
  [env.CLIENT_URL, ...env.ALLOWED_ORIGINS.split(',')].map((s) => s.trim()).filter(Boolean)
);

/**
 * CSRF backstop for cookie-bearing auth routes. Browsers always send Origin
 * on cross-site POSTs; a request with no Origin (native WebView, curl) is
 * allowed — it is covered by the httpOnly cookie policy and device pinning.
 */
const requireAllowedOrigin = (req, _res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.has(origin)) return next();
  next(ApiError.forbidden('Origin not allowed', 'ORIGIN_NOT_ALLOWED'));
};
```

Replace the `cors({ … })` call with:

```js
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-fingerprint', 'x-client-platform', 'x-app-version'],
    })
  );
```

and export: `module.exports = { applySecurity, sanitizeRequest, requireAllowedOrigin, allowedOrigins };`

- [ ] **Step 4: Controller — cookie options, native detection, response bodies**

In `server/src/modules/auth/auth.controller.js` replace everything from `const REFRESH_COOKIE` through the `refresh` handler with:

```js
const REFRESH_COOKIE = 'lms_refresh';
const NATIVE_PLATFORMS = new Set(['android', 'ios']);

/** Native apps keep the refresh token in Keystore-backed storage; the web never sees it in JS. */
const isNativeClient = (req) => NATIVE_PLATFORMS.has(String(req.headers['x-client-platform'] || '').toLowerCase());

const cookieOptions = (rememberMe) => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || env.REFRESH_COOKIE_SAMESITE === 'none',
  sameSite: env.REFRESH_COOKIE_SAMESITE,
  path: '/api/v1/auth',
  maxAge: (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000,
});

const clientIp = (req) => req.ip || req.socket?.remoteAddress || '';

const authBody = (req, result) => ({
  user: result.user,
  accessToken: result.accessToken,
  ...(isNativeClient(req) && { refreshToken: result.refreshToken }),
});

const login = asyncHandler(async (req, res) => {
  const { username, password, deviceId, fingerprint, rememberMe } = req.body;
  const result = await AuthService.login({
    username,
    password,
    deviceId: deviceId || req.headers['x-device-id'],
    fingerprint: fingerprint || req.headers['x-fingerprint'],
    rememberMe,
    userAgent: req.headers['user-agent'] || '',
    ip: clientIp(req),
    platform: DeviceService.normalizePlatform(req.headers['x-client-platform']),
    appVersion: String(req.headers['x-app-version'] || '').slice(0, 40),
  });
  res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(rememberMe));
  res.json(authBody(req, result));
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || (isNativeClient(req) ? req.body?.refreshToken : undefined);
  const result = await AuthService.refresh(token, { ip: clientIp(req), deviceId: req.headers['x-device-id'] });
  res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(false));
  res.json(authBody(req, result));
});
```

In `changePassword`, replace `res.json(result);` with `res.json(authBody(req, result));`.

- [ ] **Step 5: Route-level Origin check**

In `server/src/modules/auth/auth.routes.js`, add `const { requireAllowedOrigin } = require('../../middleware/security');` and change:

```js
router.post('/refresh', requireAllowedOrigin, validate(v.refreshSchema), c.refresh);
…
router.post('/logout', requireAllowedOrigin, c.logout);
```

- [ ] **Step 6: Rename the reuse audit**

In `AuthService.refresh` (auth.service.js), the reuse branch currently audits `SESSION_TERMINATED` with `cause: 'refresh_reuse_detected'`. Change it to write both:

```js
      await audit({ user: user._id, action: 'TOKEN_REUSE_DETECTED', ip, meta: { sessionId: String(session._id) } });
      await audit({ user: user._id, action: 'SESSION_TERMINATED', ip, meta: { cause: 'refresh_reuse_detected' } });
```

- [ ] **Step 7: Run auth tests, lint, suite**

Run: `cd server && node --test tests/auth.test.js && npm run lint && npm test 2>&1 | tail -8`
Expected: auth file `# pass 5`; full suite `# pass 72`, `# fail 0`.

- [ ] **Step 8: Commit**

```bash
git add server/src/middleware/security.js server/src/modules/auth server/tests/auth.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(auth): refresh token cookie-only for web, native body copy, Origin allowlist on cookie routes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Per-request device validation, revocation routes, full device matrix

**Files:**
- Modify: `server/src/middleware/authenticate.js:38-58`, `server/src/modules/auth/auth.service.js` (`refresh`, `logout`), `server/src/modules/auth/auth.controller.js` (`logout`, new `myDevice`), `server/src/modules/auth/auth.routes.js`, `server/src/modules/auth/auth.validators.js` (new `logoutSchema`), `server/src/modules/admin/admin.routes.js` (device routes), `server/src/modules/admin/admin.service.js` (`getUserDevice`, `revokeUserDevice`)
- Test: `server/tests/devices.test.js` (append part 2)

**Interfaces:**
- Produces: `GET /admin/users/:userId/device → { active, history }`; `POST /admin/users/:userId/device/revoke { reason } → { revoked }`; `GET /auth/device → { active }`; `POST /auth/logout { forgetDevice?: boolean }`.
- Produces: `authenticate` ends the session and returns `401 SESSION_TERMINATED` when `x-device-id` does not match the session's `deviceKeyHash`; audit `DEVICE_MISMATCH`.
- Produces: `AuthService.refresh(token, { ip, deviceId })` rejects device mismatch the same way.
- Consumes: `DeviceService` (Task 8), `assertCanManage` (Task 5).

- [ ] **Step 1: Append the failing device tests (part 2)**

Append to `server/tests/devices.test.js`:

```js
test('an access token presented from another device ends the session', async () => {
  const fresh = await login('sam', 'Learn@1234', 'dev-sam-A');
  tokenA = fresh.data.accessToken;
  const spoof = await api('GET', '/auth/me', { token: tokenA, deviceId: 'dev-sam-B' });
  assert.equal(spoof.status, 401);
  assert.equal(spoof.data.code, 'SESSION_TERMINATED');
  const dead = await api('GET', '/auth/me', { token: tokenA, deviceId: 'dev-sam-A' });
  assert.equal(dead.status, 401, 'the session was ended, not just the one request');
  assert.ok((await auditRows('DEVICE_MISMATCH', samId)).length >= 1);
});

test('a device id alone (no token) is worthless', async () => {
  const r = await api('GET', '/auth/me', { deviceId: 'dev-sam-A' });
  assert.equal(r.status, 401);
});

test('refresh from another device ends the session', async () => {
  const fresh = await login('sam', 'Learn@1234', 'dev-sam-A');
  const bad = await api('POST', '/auth/refresh', { deviceId: 'dev-sam-B', cookie: fresh.cookies });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.code, 'SESSION_TERMINATED');
  const again = await api('POST', '/auth/refresh', { deviceId: 'dev-sam-A', cookie: fresh.cookies });
  assert.equal(again.status, 401, 'session gone');
});

test('admin sees the authorized device; revoke needs a reason', async () => {
  const fresh = await login('sam', 'Learn@1234', 'dev-sam-A');
  tokenA = fresh.data.accessToken;
  const view = await api('GET', `/admin/users/${samId}/device`, { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(view.status, 200, JSON.stringify(view.data));
  assert.ok(view.data.active, 'active device present');
  assert.equal(view.data.active.platform, 'web');
  assert.equal(view.data.active.publicId.length, 8);
  assert.equal(view.data.active.deviceKeyHash, undefined, 'hash never leaves the server');

  const noReason = await api('POST', `/admin/users/${samId}/device/revoke`, { token: admin.token, deviceId: 'dev-admin', body: {} });
  assert.equal(noReason.status, 400);
});

test('lost-device flow: revoke → old device dead → new device binds (DEVICE_CHANGED) → old device rejected', async () => {
  const revoke = await api('POST', `/admin/users/${samId}/device/revoke`, { token: admin.token, deviceId: 'dev-admin', body: { reason: 'Student reported the laptop stolen' } });
  assert.equal(revoke.status, 200, JSON.stringify(revoke.data));
  assert.equal(revoke.data.revoked, 1);
  assert.equal((await auditRows('DEVICE_REVOKED', samId)).length, 1);

  const dead = await api('GET', '/auth/me', { token: tokenA, deviceId: 'dev-sam-A' });
  assert.equal(dead.status, 401);

  const b = await login('sam', 'Learn@1234', 'dev-sam-B');
  assert.equal(b.status, 200, JSON.stringify(b.data));
  assert.equal((await auditRows('DEVICE_CHANGED', samId)).length, 1);

  const a = await login('sam', 'Learn@1234', 'dev-sam-A');
  assert.equal(a.status, 403);
  assert.equal(a.data.code, 'DEVICE_NOT_AUTHORIZED');

  const hist = await api('GET', `/admin/users/${samId}/device`, { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(hist.data.history.length, 1);
  assert.equal(hist.data.history[0].revocationReason, 'Student reported the laptop stolen');
  assert.equal(hist.data.history[0].revokedBy.username, 'admin');
});

test('student can see their own device and forget it on logout', async () => {
  await app.createUser(admin.token, { name: 'Forget', username: 'fg', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const g1 = await login('fg', 'Learn@1234', 'dev-fg-1');
  const mine = await api('GET', '/auth/device', { token: g1.data.accessToken, deviceId: 'dev-fg-1' });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.active.status, 'active');

  const out = await api('POST', '/auth/logout', { token: g1.data.accessToken, deviceId: 'dev-fg-1', body: { forgetDevice: true } });
  assert.equal(out.status, 200);
  const g2 = await login('fg', 'Learn@1234', 'dev-fg-2');
  assert.equal(g2.status, 200, 'a new device can bind after "forget this device"');
});

test('plain logout keeps the device authorization', async () => {
  await app.createUser(admin.token, { name: 'Keep', username: 'kp', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const k1 = await login('kp', 'Learn@1234', 'dev-kp-1');
  const out = await api('POST', '/auth/logout', { token: k1.data.accessToken, deviceId: 'dev-kp-1', body: {} });
  assert.equal(out.status, 200);
  const other = await login('kp', 'Learn@1234', 'dev-kp-2');
  assert.equal(other.status, 403, 'still bound to dev-kp-1');
  const same = await login('kp', 'Learn@1234', 'dev-kp-1');
  assert.equal(same.status, 200);
});

test('admin cannot reset the owner device; the owner can reset an admin device', async () => {
  const blocked = await api('POST', `/admin/users/${owner.user.id}/device/revoke`, { token: admin.token, deviceId: 'dev-admin', body: { reason: 'attempt' } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'OWNER_PROTECTED');

  const abdullah = await app.loginAndOnboard(CREDENTIALS.abdullah.username, CREDENTIALS.abdullah.password, { deviceId: 'dev-abd' });
  const ok = await api('POST', `/admin/users/${abdullah.user.id}/device/revoke`, { token: owner.token, deviceId: 'dev-owner', body: { reason: 'Owner-initiated reset' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const dead = await api('GET', '/auth/me', { token: abdullah.token, deviceId: 'dev-abd' });
  assert.equal(dead.status, 401);
  const rebound = await login(CREDENTIALS.abdullah.username, CREDENTIALS.abdullah.password, 'dev-abd-new');
  assert.equal(rebound.status, 200);
});

test('an admin cannot revoke another admin device', async () => {
  const abdId = (await api('GET', '/admin/users?search=abdullah', { token: owner.token, deviceId: 'dev-owner' })).data.items[0]._id;
  const r = await api('POST', `/admin/users/${abdId}/device/revoke`, { token: admin.token, deviceId: 'dev-admin', body: { reason: 'peer attempt' } });
  assert.equal(r.status, 403);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd server && node --test tests/devices.test.js`
Expected: the spoof test gets 200; device routes 404.

- [ ] **Step 3: `authenticate` pins the session to its device**

In `server/src/middleware/authenticate.js`:

- add `const DeviceService = require('../modules/auth/device.service');` and `const audit = require('../core/audit');` to the requires;
- change `Session.findById(decoded.sid)` to `Session.findById(decoded.sid).select('+deviceKeyHash')`;
- immediately after the `if (!session || !session.isActive) { … }` block, add:

```js
    // Device pinning: the session only works from the device that created it.
    if (session.deviceKeyHash) {
      const presented = req.headers['x-device-id'];
      try {
        DeviceService.assertSessionDevice(session, presented);
      } catch (err) {
        session.isActive = false;
        session.endedAt = new Date();
        session.endReason = 'device_mismatch';
        await session.save();
        audit({ user: user._id, action: 'DEVICE_MISMATCH', ip: req.ip, meta: { sessionId: String(session._id) } });
        throw err;
      }
    }
```

- [ ] **Step 4: `refresh` and `logout` in the service**

In `AuthService.refresh`, change the session lookup to `Session.findById(decoded.sid).select('+refreshTokenHash +deviceKeyHash')` and, right after the `if (!session || !session.isActive)` check, add:

```js
    if (session.deviceKeyHash) {
      try {
        DeviceService.assertSessionDevice(session, deviceId);
      } catch (err) {
        session.isActive = false;
        session.endedAt = new Date();
        session.endReason = 'device_mismatch';
        await session.save();
        await audit({ user: user._id, action: 'DEVICE_MISMATCH', ip, meta: { sessionId: String(session._id), during: 'refresh' } });
        throw err;
      }
    }
```

(the signature is already `refresh(refreshToken, { ip, deviceId } = {})` — Task 9 passes `deviceId`).

Replace `logout`:

```js
  static async logout(sessionId, userId, ip, { forgetDevice = false } = {}) {
    const session = await Session.findById(sessionId);
    if (session && session.isActive) {
      session.isActive = false;
      session.endedAt = new Date();
      session.endReason = 'logout';
      await session.save();
    }
    await audit({ user: userId, action: 'LOGOUT', ip });
    if (forgetDevice) {
      await DeviceService.revoke({ targetUserId: userId, actor: { id: userId }, reason: 'user_forget_device', ip, self: true });
    }
  }
```

- [ ] **Step 5: Controller, validators, routes**

`auth.validators.js` — add `const logoutSchema = z.object({ forgetDevice: z.boolean().optional().default(false) });` and export it.

`auth.controller.js` — replace `logout` and add `myDevice`:

```js
const logout = asyncHandler(async (req, res) => {
  await AuthService.logout(req.session._id, req.user.id, clientIp(req), { forgetDevice: !!req.body?.forgetDevice });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.json({ message: req.body?.forgetDevice ? 'Logged out and device forgotten' : 'Logged out' });
});

const myDevice = asyncHandler(async (req, res) => {
  res.json({ active: await DeviceService.activeFor(req.user.id) });
});
```

Export `myDevice`. In `auth.routes.js`:

```js
router.post('/logout', requireAllowedOrigin, validate(v.logoutSchema), c.logout);
router.get('/device', c.myDevice);
```

`admin.service.js` — add two methods (import `DeviceService` from `../auth/device.service`):

```js
  // ── Authorized devices ─────────────────────────────────────────────

  static async getUserDevice(userId) {
    await AdminService.#loadTarget(userId);
    const [active, history] = await Promise.all([DeviceService.activeFor(userId), DeviceService.historyFor(userId)]);
    return { active, history };
  }

  static async revokeUserDevice(actor, userId, reason, ip) {
    const user = await AdminService.#loadTarget(userId);
    await AdminService.assertCanManage(actor, user, 'device_reset', ip);
    return DeviceService.revoke({ targetUserId: userId, actor, reason, ip });
  }
```

`admin.routes.js` — add after the force-logout route:

```js
const revokeDeviceSchema = z.object({ reason: z.string().trim().min(3).max(300) });

router.get('/users/:userId/device', requirePermission(P.DEVICES_VIEW), asyncHandler(async (req, res) => {
  res.json(await AdminService.getUserDevice(req.params.userId));
}));
router.post('/users/:userId/device/revoke', requirePermission(P.DEVICES_RESET), validate(revokeDeviceSchema), asyncHandler(async (req, res) => {
  res.json(await AdminService.revokeUserDevice(req.user, req.params.userId, req.body.reason, req.ip));
}));
```

- [ ] **Step 6: Run device tests, lint, suite**

Run: `cd server && node --test tests/devices.test.js && npm run lint && npm test 2>&1 | tail -8`
Expected: devices file `# pass 17`; full suite `# pass 81`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add server/src server/tests/devices.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(devices): session pinned to device on every request, admin/self revocation, lost-device flow

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Authentication matrix

**Files:**
- Modify: `server/tests/auth.test.js` (append part 2)

- [ ] **Step 1: Append the matrix**

Append to `server/tests/auth.test.js`:

```js
const mk = (username, extra = {}) => app.createUser(admin.token, { name: username, username, password: 'Learn@1234', role: 'student', ...extra }, 'dev-admin');
const setStatus = (id, status) => api('POST', `/admin/users/${id}/status`, { token: admin.token, deviceId: 'dev-admin', body: { status } });

test('suspended / banned: wrong password is generic, right password is specific', async () => {
  const sus = await mk('sus');
  await setStatus(sus.id, 'suspended');
  const wrong = await login('sus', 'WrongPass1', 'dev-sus');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.message, 'Invalid username or password');
  const right = await login('sus', 'Learn@1234', 'dev-sus');
  assert.equal(right.status, 403);
  assert.equal(right.data.code, 'ACCOUNT_SUSPENDED');

  const ban = await mk('ban');
  await setStatus(ban.id, 'banned');
  const rightBan = await login('ban', 'Learn@1234', 'dev-ban');
  assert.equal(rightBan.status, 403);
  assert.equal(rightBan.data.code, 'ACCOUNT_BANNED');
});

test('lockout after N failures; a wrong password never reveals the lock', async () => {
  await mk('lock');
  for (let i = 0; i < 5; i++) {
    const r = await login('lock', 'WrongPass1', 'dev-lock');
    assert.equal(r.status, 401);
    assert.equal(r.data.message, 'Invalid username or password');
  }
  const locked = await login('lock', 'Learn@1234', 'dev-lock');
  assert.equal(locked.status, 423);
  assert.equal(locked.data.code, 'ACCOUNT_LOCKED');
  const wrongWhileLocked = await login('lock', 'WrongPass1', 'dev-lock');
  assert.equal(wrongWhileLocked.status, 401);
  assert.equal(wrongWhileLocked.data.message, 'Invalid username or password');
});

test('forced password change gates everything except onboarding', async () => {
  await mk('onboard', { mustChangePassword: true });
  const r = await login('onboard', 'Learn@1234', 'dev-onb');
  assert.equal(r.status, 200);
  assert.equal(r.data.user.mustChangePassword, true);
  const t = r.data.accessToken;
  const catalog = await api('GET', '/courses/catalog', { token: t, deviceId: 'dev-onb' });
  assert.equal(catalog.status, 403);
  assert.equal(catalog.data.code, 'ONBOARDING_REQUIRED');
  const me = await api('GET', '/auth/me', { token: t, deviceId: 'dev-onb' });
  assert.equal(me.status, 200);
  // Admin-created accounts are not email-verified; verification is required by default.
  const tooEarly = await api('POST', '/auth/set-password', { token: t, deviceId: 'dev-onb', body: { password: 'Newpass@123' } });
  assert.equal(tooEarly.status, 403);
  assert.equal(tooEarly.data.code, 'EMAIL_UNVERIFIED');
});

test('logout ends the session', async () => {
  await mk('bye');
  const r = await login('bye', 'Learn@1234', 'dev-bye');
  const out = await api('POST', '/auth/logout', { token: r.data.accessToken, deviceId: 'dev-bye', body: {} });
  assert.equal(out.status, 200);
  const me = await api('GET', '/auth/me', { token: r.data.accessToken, deviceId: 'dev-bye' });
  assert.equal(me.status, 401);
});

test('password change re-issues tokens and revokes the old ones', async () => {
  await mk('chg');
  const r = await login('chg', 'Learn@1234', 'dev-chg');
  const changed = await api('POST', '/auth/change-password', { token: r.data.accessToken, deviceId: 'dev-chg', body: { currentPassword: 'Learn@1234', newPassword: 'Learn@5678' } });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.ok(changed.data.accessToken);
  assert.equal(changed.data.refreshToken, undefined);
  const old = await api('GET', '/auth/me', { token: r.data.accessToken, deviceId: 'dev-chg' });
  assert.equal(old.status, 401, 'tokenVersion bumped');
  const fresh = await api('GET', '/auth/me', { token: changed.data.accessToken, deviceId: 'dev-chg' });
  assert.equal(fresh.status, 200);
  const relogin = await login('chg', 'Learn@5678', 'dev-chg');
  assert.equal(relogin.status, 200);
});

test('admin password reset forces onboarding and kills the session', async () => {
  const u = await mk('rst');
  const r = await login('rst', 'Learn@1234', 'dev-rst');
  const reset = await api('POST', `/admin/users/${u.id}/reset-password`, { token: admin.token, deviceId: 'dev-admin', body: { password: 'Temp@12345' } });
  assert.equal(reset.status, 200);
  const dead = await api('GET', '/auth/me', { token: r.data.accessToken, deviceId: 'dev-rst' });
  assert.equal(dead.status, 401);
  const again = await login('rst', 'Temp@12345', 'dev-rst');
  assert.equal(again.status, 200);
  assert.equal(again.data.user.mustChangePassword, true);
});

test('role change kills sessions; delete blocks login', async () => {
  const u = await mk('rol');
  const r = await login('rol', 'Learn@1234', 'dev-rol');
  const change = await api('PUT', `/admin/users/${u.id}`, { token: admin.token, deviceId: 'dev-admin', body: { role: 'teacher' } });
  assert.equal(change.status, 200, JSON.stringify(change.data));
  const dead = await api('GET', '/auth/me', { token: r.data.accessToken, deviceId: 'dev-rol' });
  assert.equal(dead.status, 401);

  const del = await api('DELETE', `/admin/users/${u.id}`, { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(del.status, 200);
  const gone = await login('rol', 'Learn@1234', 'dev-rol');
  assert.equal(gone.status, 401);
});
```

- [ ] **Step 2: Run auth tests and the suite**

Run: `cd server && node --test tests/auth.test.js && npm test 2>&1 | tail -8`
Expected: auth file `# pass 12`; full suite `# pass 88`, `# fail 0`. If `lockout` fails on the 423, confirm `settings.maxLoginAttempts` default is 5 in `settingsCache.js` (it is) and that `owner.test.js` runs in a separate process (it does — per-file isolation).

- [ ] **Step 3: Commit**

```bash
git add server/tests/auth.test.js
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "test: authentication matrix (status, lockout, onboarding gate, rotation, revocation)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Client — in-memory access token, cookie refresh, role-aware routing

**Files:**
- Create: `client/src/api/token.js`, `client/src/utils/roles.js`
- Modify: `client/src/api/axios.js` (full rewrite), `client/src/context/AuthContext.jsx` (full rewrite), `client/src/hooks/useAntiCheat.js:104-116`, `client/src/App.jsx:32-49`, `client/src/layouts/MainLayout.jsx:15-45,50`, `client/src/pages/auth/LoginPage.jsx:36-38,42-63,124-128`, `client/src/pages/auth/OnboardingPage.jsx:42-47`

**Interfaces:**
- Produces: `getAccessToken() / setAccessToken(t) / clearAccessToken()` from `api/token.js`.
- Produces: `refreshAccessToken() → Promise<{ user, accessToken }>` and `bootstrapSession() → Promise<user|null>` from `api/axios.js`.
- Produces: `isAdminRole(role)`, `roleMatches(role, roles)`, `homeFor(role)`, `ROLE_LABEL` from `utils/roles.js`.
- Produces: `useAuth().logout({ forgetDevice })`.
- Consumes: server responses from Tasks 9–10 (`{ user, accessToken }`, cookie refresh, `DEVICE_NOT_AUTHORIZED`).

- [ ] **Step 1: Token holder and role helpers**

Create `client/src/api/token.js`:

```js
/**
 * The access token lives only in memory. A page reload gets a new one from
 * the httpOnly refresh cookie (see bootstrapSession in axios.js). Nothing
 * token-related is ever written to localStorage.
 */
let accessToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => { accessToken = token || null; };
export const clearAccessToken = () => { accessToken = null; };

// Remove tokens persisted by earlier versions of the client.
try {
  localStorage.removeItem('lms_access_token');
  localStorage.removeItem('lms_refresh_token');
} catch { /* storage unavailable */ }
```

Create `client/src/utils/roles.js`:

```js
export const ROLE_LABEL = { student: 'Student', teacher: 'Instructor', admin: 'Administrator', super_admin: 'Owner' };

export const isAdminRole = (role) => role === 'admin' || role === 'super_admin';

/** Mirrors the server's authorize(): the owner satisfies any 'admin' check. */
export const roleMatches = (role, roles) => roles.includes(role) || (role === 'super_admin' && roles.includes('admin'));

export const homeFor = (role) => (isAdminRole(role) ? '/admin' : role === 'teacher' ? '/teacher' : '/student');
```

- [ ] **Step 2: Rewrite `axios.js`**

Replace `client/src/api/axios.js` entirely:

```js
import axios from 'axios';
import { getDeviceId, getFingerprint } from './fingerprint';
import { getAccessToken, setAccessToken, clearAccessToken } from './token';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // refresh token cookie
  headers: { 'Content-Type': 'application/json' },
});

let fingerprint = null;
getFingerprint().then((fp) => { fingerprint = fp; });

const deviceHeaders = () => ({
  'x-device-id': getDeviceId(),
  ...(fingerprint && { 'x-fingerprint': fingerprint }),
  'x-client-platform': 'web',
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  Object.assign(config.headers, deviceHeaders());
  return config;
});

/**
 * Exchange the httpOnly refresh cookie for a new access token. Uses a bare
 * axios call (not `api`) so the response interceptor cannot recurse.
 * A single in-flight refresh is shared by concurrent callers.
 */
let refreshing = null;
export const refreshAccessToken = () => {
  if (!refreshing) {
    refreshing = axios
      .post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true, headers: deviceHeaders() })
      .then(({ data }) => { setAccessToken(data.accessToken); return data; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

/** On page load: try the cookie; resolve the user or null. */
export const bootstrapSession = async () => {
  try {
    const { user } = await refreshAccessToken();
    return user;
  } catch {
    clearAccessToken();
    return null;
  }
};

const hardLogout = (reason) => {
  clearAccessToken();
  localStorage.removeItem('lms_user');
  if (reason) sessionStorage.setItem('lms_logout_reason', reason);
  if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
};

const SESSION_END_MESSAGES = {
  SESSION_TERMINATED: 'Your session has ended. Please sign in again.',
  SESSION_INACTIVE: 'You were signed out due to inactivity.',
  TOKEN_REVOKED: 'Your session has ended. Please sign in again.',
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.code;
    const status = error.response?.status;

    if (status === 401 && SESSION_END_MESSAGES[code]) {
      hardLogout(SESSION_END_MESSAGES[code]);
      return Promise.reject(error);
    }

    if (status === 401 && code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      try {
        const data = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        hardLogout('Your session expired. Please sign in again.');
        return Promise.reject(refreshErr);
      }
    }

    if (status === 401 && !original.url?.includes('/auth/login')) {
      hardLogout('Your session is invalid. Please sign in again.');
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export const apiError = (err, fallback = 'Something went wrong') => {
  const data = err?.response?.data;
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors
      .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
      .join(' · ');
  }
  return data?.message || err?.message || fallback;
};

export default api;
```

- [ ] **Step 3: Rewrite `AuthContext.jsx`**

Replace `client/src/context/AuthContext.jsx` entirely:

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { bootstrapSession } from '../api/axios';
import { setAccessToken, clearAccessToken } from '../api/token';
import { getDeviceId, getFingerprint } from '../api/fingerprint';

const AuthContext = createContext(null);

const readCachedUser = () => {
  try { return JSON.parse(localStorage.getItem('lms_user')) || null; } catch { return null; }
};

export function AuthProvider({ children }) {
  // Cached profile paints immediately; the cookie refresh below re-validates it.
  const [user, setUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bootstrapSession()
      .then((u) => {
        setUser(u);
        if (u) localStorage.setItem('lms_user', JSON.stringify(u));
        else localStorage.removeItem('lms_user');
      })
      .finally(() => setLoading(false));
  }, []);

  const applyAuth = useCallback((data) => {
    setAccessToken(data.accessToken);
    localStorage.setItem('lms_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (username, password, rememberMe) => {
    const fingerprint = await getFingerprint();
    const { data } = await api.post('/auth/login', {
      username, password, rememberMe, deviceId: getDeviceId(), fingerprint,
    });
    return applyAuth(data);
  }, [applyAuth]);

  const refreshProfile = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data);
    localStorage.setItem('lms_user', JSON.stringify(data));
    return data;
  }, []);

  const logout = useCallback(async ({ forgetDevice = false } = {}) => {
    try { await api.post('/auth/logout', { forgetDevice }); } catch { /* session may already be gone */ }
    clearAccessToken();
    localStorage.removeItem('lms_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, refreshProfile, applyAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

- [ ] **Step 4: The anti-cheat unload beacon reads the in-memory token**

In `client/src/hooks/useAntiCheat.js`, add `import { getAccessToken } from '../api/token';` and inside the `beforeunload` handler replace `const token = localStorage.getItem('lms_access_token');` with `const token = getAccessToken();`. Also add `'x-device-id'` to the beacon headers so the pinned session accepts it:

```js
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-device-id': localStorage.getItem('lms_device_id') || '' },
```

- [ ] **Step 5: Role-aware routing**

`client/src/App.jsx` — add `import { roleMatches, homeFor } from './utils/roles';` and replace `Protected` and `HomeRedirect`:

```jsx
function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Spinner full /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/onboarding" replace />;
  if (roles && !roleMatches(user.role, roles)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/onboarding" replace />;
  return <Navigate to={homeFor(user.role)} replace />;
}
```

`client/src/layouts/MainLayout.jsx` — import `{ isAdminRole, ROLE_LABEL }` from `../utils/roles`, delete the local `ROLE_LABEL` constant, and change `const nav = NAV[user?.role] || [];` to:

```jsx
  const nav = NAV[isAdminRole(user?.role) ? 'admin' : user?.role] || [];
```

`client/src/pages/auth/LoginPage.jsx` — import `{ homeFor }` from `../../utils/roles`; replace the redirect effect with:

```jsx
  useEffect(() => {
    if (user) navigate(homeFor(user.role), { replace: true });
  }, [user, navigate]);
```

add a `deviceBlocked` state and handle the device rejection in `submit`:

```jsx
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  …
    } catch (err) {
      if (err.response?.data?.code === 'DEVICE_NOT_AUTHORIZED') {
        setDeviceBlocked(true);
      } else {
        toast.error(apiError(err));
      }
    } finally {
```

and render the persistent banner directly under the `logoutReason` banner:

```jsx
          {deviceBlocked && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-300/70 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                <strong>This account is already linked to another device.</strong> Contact an administrator or request a device reset.
              </span>
            </div>
          )}
```

Reset `deviceBlocked` to `false` at the top of `submit`. Change the footer line to `One authorized device per account · Protected content · Encrypted media` and the fourth `FEATURES` entry text to `Your account is linked to one authorized device — nobody else can sign in as you.`

`client/src/pages/auth/OnboardingPage.jsx` — import `{ homeFor }` and replace the navigate line in `setNewPassword` with `navigate(homeFor(profile.role));`.

- [ ] **Step 6: Lint and build the client; smoke it against the server**

Run: `cd client && npm run lint && npm run build 2>&1 | tail -5`
Expected: lint clean; `✓ built in …`.

Manual check (two terminals): `cd server && npm run dev` and `cd client && npm run dev`, then in the browser: sign in as `admin` → reload the page (session survives via cookie, no `lms_access_token` key in DevTools → Application → Local Storage) → sign out. Open a second browser profile, sign in as the same user → the red "linked to another device" banner appears; the first profile is still signed in.

- [ ] **Step 7: Commit**

```bash
git add client/src
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(client): access token in memory, cookie refresh bootstrap, owner routing, device-blocked login state

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Client — owner-aware user management and settings

**Files:**
- Modify: `client/src/pages/admin/AdminUsers.jsx`, `client/src/pages/admin/AdminSettings.jsx`

**Interfaces:**
- Consumes: `GET /admin/users/:id/device`, `POST /admin/users/:id/device/revoke` (Task 10); `GET /admin/settings → { settings, defaults, ownerOnlyKeys }` (Task 5); `useAuth().user.role`.

- [ ] **Step 1: `AdminUsers.jsx`**

Apply these edits:

1. Imports: add `Smartphone` to the lucide import; add `import { useAuth } from '../../context/AuthContext';` and `import { ROLE_LABEL } from '../../utils/roles';`. Replace `ROLE_COLORS` with `const ROLE_COLORS = { super_admin: 'gold', admin: 'primary', teacher: 'blue', student: 'gray' };`.

2. Inside the component, after `const toast = useToast();`, add:

```jsx
  const { user: me } = useAuth();
  const isOwner = me?.role === 'super_admin';
  const [revokeModal, setRevokeModal] = useState(null); // { user }
  const [revokeReason, setRevokeReason] = useState('');

  /** Mirrors the server's assertCanManage: which rows may I act on? */
  const canManage = (u) => {
    if (u._id === me?.id) return false;
    if (u.role === 'super_admin') return false;
    if (u.role === 'admin' && !isOwner) return false;
    return true;
  };
```

3. Replace `viewDetail`:

```jsx
  const viewDetail = async (user) => {
    setDetailModal({ loading: true });
    const [{ data }, device] = await Promise.all([
      api.get(`/admin/users/${user._id}`),
      api.get(`/admin/users/${user._id}/device`).then((r) => r.data).catch(() => null),
    ]);
    setDetailModal({ ...data, device });
  };

  const revokeDevice = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${revokeModal.user.id}/device/revoke`, { reason: revokeReason });
      toast.success('Device revoked — the user is signed out everywhere and can sign in from a new device');
      setRevokeModal(null); setRevokeReason('');
      viewDetail({ _id: revokeModal.user.id });
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
```

4. Role filter options: add `{ value: 'super_admin', label: 'Owner' }` before Admins. Role badge in the table: `<Badge color={ROLE_COLORS[u.role]}>{ROLE_LABEL[u.role] || u.role}</Badge>`.

5. Row actions: wrap everything after the Details button in `{canManage(u) && (<> … </>)}` so a protected row shows only **Details**.

6. Create modal role options:

```jsx
              options={[
                { value: 'student', label: 'Student' },
                { value: 'teacher', label: 'Teacher' },
                ...(isOwner ? [{ value: 'admin', label: 'Administrator' }] : []),
              ]} />
```

7. Detail modal: after the "Recent sessions" block, insert the device panel:

```jsx
            <div>
              <p className="mb-2 flex items-center gap-2 font-semibold text-surface-800 dark:text-surface-100"><Smartphone size={15} /> Authorized device</p>
              {!detailModal.device?.active ? (
                <p className="text-xs text-surface-400">No authorized device — the next sign-in will bind one.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-surface-200 px-3 py-2 text-xs dark:border-surface-700">
                  <span className="font-mono font-semibold text-surface-800 dark:text-surface-100">{detailModal.device.active.publicId}</span>
                  <span className="text-surface-600 dark:text-surface-300">{detailModal.device.active.platform} · {detailModal.device.active.browser || '—'} · {detailModal.device.active.os || '—'}</span>
                  <span className="text-surface-400">first {new Date(detailModal.device.active.firstAuthorizedAt).toLocaleString()}</span>
                  <span className="text-surface-400">last seen {new Date(detailModal.device.active.lastSeenAt).toLocaleString()}</span>
                  {canManage({ _id: detailModal.user.id, role: detailModal.user.role }) && (
                    <Button size="sm" variant="ghost" className="ml-auto text-rose-500" onClick={() => setRevokeModal({ user: detailModal.user })}>Revoke device</Button>
                  )}
                </div>
              )}
              {detailModal.device?.history?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {detailModal.device.history.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-2 text-[11px] text-surface-400">
                      <Badge color="gray">revoked</Badge>
                      <span className="font-mono">{d.publicId}</span>
                      <span>{d.revocationReason}</span>
                      <span className="ml-auto">{d.revokedBy?.name ? `by ${d.revokedBy.name} · ` : ''}{new Date(d.revokedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
```

8. Add the revoke modal after the detail modal:

```jsx
      <Modal open={!!revokeModal} onClose={() => setRevokeModal(null)} title={`Revoke device — ${revokeModal?.user?.name || ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-surface-600 dark:text-surface-300">
            All sessions end immediately and the account can be signed in from a new device. This is recorded in the audit log.
          </p>
          <Input label="Reason" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="e.g. Student reported the laptop lost" />
          <Button className="w-full" variant="danger" loading={busy} onClick={revokeDevice} disabled={revokeReason.trim().length < 3}>Revoke device</Button>
        </div>
      </Modal>
```

- [ ] **Step 2: `AdminSettings.jsx`**

Apply these edits:

1. Add `import { useAuth } from '../../context/AuthContext';` and `import { Lock } from 'lucide-react';` (extend the existing lucide import). Inside the component: `const { user } = useAuth(); const isOwner = user?.role === 'super_admin'; const [ownerOnly, setOwnerOnly] = useState([]);`

2. In the load effect: `api.get('/admin/settings').then(({ data }) => { setSettings(data.settings); setOwnerOnly(data.ownerOnlyKeys || []); })`.

3. In `save`, build the payload and strip owner-only keys for non-owners:

```jsx
      const payload = { …the existing object… };
      if (!isOwner) for (const k of ownerOnly) delete payload[k];
      const { data } = await api.put('/admin/settings', payload);
```

4. Add a helper and use it on the four existing owner-only controls plus the new device-binding toggle:

```jsx
  const ownerTag = isOwner ? null : <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gold-600"><Lock size={10} /> Owner setting</span>;
  const lock = (k) => (!isOwner && ownerOnly.includes(k));
```

- Inactivity timeout `Select`: add `disabled={lock('sessionTimeoutMinutes')}`.
- Max failed logins / lockout `Input`s: `disabled={lock('maxLoginAttempts')}` / `disabled={lock('lockoutMinutes')}`.
- Email verification `Toggle`: `onChange={lock('requireEmailVerification') ? () => {} : setBool('requireEmailVerification')}`.
- New toggle in the Sessions card:

```jsx
        <Toggle label={<span>One authorized device per account {ownerTag}</span>}
          hint="A second device is refused until an administrator revokes the first one."
          checked={!!settings.deviceBindingEnabled}
          onChange={lock('deviceBindingEnabled') ? () => {} : setBool('deviceBindingEnabled')} />
```

and change the Sessions card heading to `<p …><Timer size={16} /> Sessions & authentication {ownerTag}</p>`.

(`Toggle` renders `label` inside a `<span>`, so a node is acceptable; if `Toggle` in `ui.jsx:112` renders it inside a string context, pass the string label and place `{ownerTag}` after the `Toggle` instead.)

- [ ] **Step 3: Lint, build, commit**

Run: `cd client && npm run lint && npm run build 2>&1 | tail -3` → clean.

```bash
git add client/src/pages/admin
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(client): owner-aware user actions, authorized-device panel with revoke, owner-only settings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Documentation matches the code

**Files:**
- Modify: `docs/SECURITY.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: `docs/SECURITY.md`**

Replace the **Authentication & sessions** section with:

```markdown
## Authentication & sessions

- **Accounts** are created only by administrators; there is no public registration. New accounts carry `mustChangePassword` and are confined to the onboarding endpoints (`/auth/verify-email`, `/auth/set-password`, `/auth/me`, `/auth/refresh`, `/auth/logout`, `/auth/resend-verification`) until they set a password.
- **Passwords**: bcrypt (cost 12), strength rules enforced server-side (8+ chars, upper/lower/digit). Reset/verification codes are stored as SHA-256 hashes with 15-minute expiry.
- **Enumeration-safe login**: the password is checked first (an unknown username still runs a bcrypt compare so timing matches). A wrong password always returns *Invalid username or password*. Lockout, suspension and ban are only disclosed once the password was correct. All attempts land in immutable `LoginHistory`.
- **Tokens**: short-lived access JWT (15 min) + rotating refresh token. Every token embeds a **session id**; the session document must still be active for the token to work. Refresh tokens are single-use — replaying a rotated token ends the session (`TOKEN_REUSE_DETECTED`).
- **Refresh-token storage**: the web client keeps the access token **in memory only** and never sees the refresh token — it travels solely in an `httpOnly` cookie scoped to `/api/v1/auth` (`SameSite` per `REFRESH_COOKIE_SAMESITE`, `Secure` in production). Nothing token-related is written to `localStorage`. Native clients that declare `x-client-platform: android|ios` additionally receive the refresh token in the response body for Keystore-backed storage; the server ignores a body refresh token from any other client.
- **CSRF**: `/auth/refresh` and `/auth/logout` reject any request whose `Origin` header is present and not in `CLIENT_URL` + `ALLOWED_ORIGINS`. Other state-changing calls are JWT-in-header, which cross-site forms cannot produce.
- **Single active session**: a new login ends every other session for the account. The evicted device receives `SESSION_TERMINATED` on its next request and sees "Your session has ended".
- **Brute force**: per-IP rate limits on credential endpoints + per-account lockout after N failures (owner-configurable count and duration).
- **Inactivity timeout**: `Session.lastActivityAt` is tracked (throttled writes); requests beyond the owner-configured idle window end the session. A background sweep closes sessions from vanished clients.
- **Global revocation**: `tokenVersion` on the user invalidates every outstanding token (password change/reset, role change, suspension, ban, delete, force-logout, device revocation).
```

Insert a new section after it:

```markdown
## One account, one authorized device

Every account is bound to a single authorized device.

- **Binding.** On the first successful login (after the password check) the server records a `Device` for the account: the SHA-256 of the client's random device id, a browser/OS fingerprint hash as a supporting signal, platform, and first/last-seen timestamps. The `Device` collection has a **partial unique index** on `{ user }` where `status: 'active'`, so the database — not application code — guarantees at most one active device; two simultaneous first logins result in exactly one binding.
- **Same device** logs in normally; last-seen, IP and fingerprint are refreshed. Fingerprint drift (browser updates) is logged (`DEVICE_FINGERPRINT_DRIFT`), never enforced.
- **Different device** is refused with `403 DEVICE_NOT_AUTHORIZED` — *This account is already linked to another device. Contact an administrator or request a device reset.* — and audited (`DEVICE_LOGIN_REJECTED`). The trusted device is unaffected. A wrong password from any device gets the generic credential message; device state is never disclosed before the password is verified.
- **Session pinning.** Every session stores the hash of the device that created it. Each authenticated request and every refresh must present the matching `x-device-id`; a mismatch ends the session (`DEVICE_MISMATCH` audit, `401 SESSION_TERMINATED`). A stolen token without the device id is useless.
- **Revocation.** An administrator (`devices.reset`) revokes a device with a reason: all sessions end, `tokenVersion` is bumped, `DEVICE_REVOKED` is audited, and the next login from any device binds fresh (`DEVICE_CHANGED`). A user may also "forget this device" on logout. Admins cannot reset the owner's device; only the owner can reset an admin's.
- **Policy switch.** `deviceBindingEnabled` (owner-only) turns the one-device rule off platform-wide; session pinning stays on.
- **Honest limit.** On the web, the device id lives in the browser's storage. Someone with both the password *and* a copy of that storage can sign in as the user; the design forces an attacker to obtain two secrets instead of one and makes every attempt visible in the audit log. Hardware-bound identity (WebAuthn/attestation) is the next step and is out of scope here. On Android the id is kept in Keystore-backed storage.
```

Replace the **Authorization** section's first bullet with:

```markdown
- Four roles: `super_admin` (owner), `admin`, `teacher`, `student`. A central permission map (`src/core/permissions.js`) drives `requirePermission()`; teacher/course routes additionally enforce ownership (`courseAccess`). The owner is created only by the bootstrap seed — no API accepts `role: 'super_admin'`. Admins cannot create or mutate other admins, cannot touch the owner (`OWNER_PROTECTED`, audited as `OWNER_ACTION_BLOCKED`), cannot act on their own account through admin routes (`SELF_ACTION`), and cannot change owner-only settings (`sessionTimeoutMinutes`, `maxLoginAttempts`, `lockoutMinutes`, `requireEmailVerification`, `deviceBindingEnabled`).
```

In **Auditability**, change "60+ action types" to "70+ action types (including device binding, rejection, revocation, owner-protection blocks and security-setting changes)".

- [ ] **Step 2: `docs/API.md`**

Update the header paragraph: `… require Authorization: Bearer <accessToken> plus an x-device-id header that must match the device the session was created from (optional x-fingerprint, x-client-platform, x-app-version).` Add `**O** owner (super_admin)` to the roles legend and note `Admin routes admit the owner.`

Replace the Auth table rows for login/refresh/logout and add the device row:

```markdown
| POST | `/login` | P | `{username, password, deviceId, fingerprint?, rememberMe?}` → `{user, accessToken}` + httpOnly refresh cookie (body also includes `refreshToken` when `x-client-platform` is `android`/`ios`). `403 DEVICE_NOT_AUTHORIZED` from a second device. Ends other sessions. |
| POST | `/refresh` | P | cookie (or body for native clients); rotates; reuse or device mismatch ends the session. Checks `Origin`. |
| POST | `/logout` | A | `{forgetDevice?: boolean}` — ends the session; with `forgetDevice` also revokes the authorized device. Checks `Origin`. |
| GET | `/device` | A | caller's authorized device (public fields) |
```

Replace the Admin section with:

```markdown
## Admin — `/admin` (permission-gated; AD and O)
`POST/GET /users` (creating an `admin` is O only; `super_admin` is never creatable), `GET/PUT /users/:id`, `POST /users/:id/status` (active/suspended/banned), `POST /users/:id/reset-password`, `POST /users/:id/force-logout`, `DELETE /users/:id` (soft), `GET /users/:id/device`, `POST /users/:id/device/revoke {reason}`, `GET /sessions`, `POST /sessions/:id/terminate`, `GET/PUT /settings` (owner-only keys → `403 OWNER_PROTECTED` for AD), `GET /audit-logs`, `GET /login-history`.
Mutations targeting the owner, or an admin by a non-owner, return `403 OWNER_PROTECTED` / `403 FORBIDDEN`; targeting yourself returns `400 SELF_ACTION`.
```

In Enrollments, mark codes and direct assignment as `(AD/O)`.

- [ ] **Step 3: `docs/ARCHITECTURE.md`**

- Modules table `auth` row: `login/refresh/logout, device binding & revocation, email verification, password lifecycle, own sessions & login history` (remove "registration").
- Modules table `admin` row: append `, owner protections, authorized devices`.
- Data model **Identity** bullet: `User (soft-delete, four roles, status, lockout, tokenVersion), Session (single-active enforcement, device pinning, refresh hash), Device (one active per user — partial unique index), LoginHistory`.
- Change "Data model (18 collections)" to "Data model (26 collections)" and add **Ops**: `Migration (_migrations — applied data migrations)`.
- Add a section:

```markdown
## Bootstrap & migrations

- `npm run seed` — idempotent: creates the owner (`SUPER_ADMIN_*`), the default admin (`DEFAULT_ADMIN_*`) and, outside production, the legacy `admin` (`ADMIN_PASSWORD`). Development startup runs it automatically; production startup only verifies an owner exists and exits otherwise.
- `npm run migrate [-- --dry-run] [-- --force-relogin]` — applies `src/migrations/*` not yet recorded in `_migrations`. `--force-relogin` bumps every `tokenVersion` and ends every session so the institution re-binds under the device policy.
```

- [ ] **Step 4: `README.md`**

Replace the default-admin sentence with:

```markdown
Accounts are bootstrapped from `server/.env` by `npm run seed` (run automatically in development): the **owner** (`SUPER_ADMIN_*`), the default **administrator** Abdullah Dabbas (`DEFAULT_ADMIN_*`) and, in development only, `admin` (`ADMIN_PASSWORD`). Every bootstrapped account must change its password at first login. There is no default password.
```

Replace the roles table with:

```markdown
| Capability | Student | Teacher | Admin | Owner |
|---|---|---|---|---|
| Enroll (code / public catalog), watch videos, read PDFs | ✔ | — | — | — |
| Take quizzes, submit assignments, earn certificates | ✔ | — | — | — |
| Bookmarks, favorites, progress, Q&A, notifications | ✔ | reply | ✔ | ✔ |
| Create/edit **own** courses, curriculum, videos, quizzes | — | ✔ | ✔ (any) | ✔ (any) |
| Grade essays & assignments, view stats, cheat reports | — | own courses | all | all |
| Roster: view, remove a student, set per-student expiry | — | own courses | all | all |
| Access codes, assign students directly | — | — | ✔ | ✔ |
| Create students & teachers, suspend/ban/delete, reset passwords | — | — | ✔ | ✔ |
| Revoke a user's authorized device | — | — | students & teachers | anyone |
| Force logout, session monitor, audit logs, announcements | — | — | ✔ | ✔ |
| Platform settings, maintenance mode | — | — | ✔ | ✔ |
| Create/suspend administrators, security policy (timeouts, lockout, device binding) | — | — | — | ✔ |

Teachers cannot touch other teachers' courses; admins cannot touch the owner or other admins (enforced server-side).
```

In **Key features**, replace the "Single active session" bullet with:

```markdown
- **One account, one authorized device** — the first login binds the device; a second device is refused until an administrator revokes the first. Sessions are pinned to their device, refresh tokens rotate, and the web client never stores a token in JavaScript-readable storage. Owner-configurable inactivity timeout and lockout.
```

Update the test sentence: `Run the API test suite: cd server && npm test (six node:test files against an isolated in-memory MongoDB and temp storage: smoke journey, permissions, RBAC, owner protections, device binding, authentication, bootstrap/migrations).`

Production checklist: add `0. Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_INITIAL_PASSWORD (and DEFAULT_ADMIN_*), then run npm run seed once. The server refuses to start in production without an owner.`

- [ ] **Step 5: `CLAUDE.md`**

- Commands: `npm test` description → `runs node --test over tests/*.test.js — six files sharing tests/helpers/harness.js (in-memory MongoDB, temp STORAGE_ROOT/LOG_DIR). Filter with node --test --test-name-pattern "<name>" tests/<file>.` Add `npm run lint` for the server, `npm run seed`, `npm run migrate -- --dry-run`.
- Replace the default-admin sentence: `Bootstrap accounts come from server/.env (SUPER_ADMIN_*, DEFAULT_ADMIN_*, dev-only ADMIN_PASSWORD) via src/seed.js; production never seeds a default password.`
- Backend architecture: `authorize(role) / requirePermission(perm) / courseAccess(resource)` in the flow; add `core/permissions.js` (permission map, `isAdminRole`, `canAssignRole`), `modules/auth/device.service.js`, `models/Device.js`; models count "26"; modules note "each owns up to four files (routes, controller, service, validators); smaller modules inline the controller".
- Security invariants: add `Four roles; the owner (super_admin) is bootstrap-only and protected by AdminService.assertCanManage — never add a route that accepts role super_admin or bypasses that guard.` and `One authorized device per account: Device partial unique index + session deviceKeyHash pinning in authenticate/refresh. Refresh tokens are cookie-only on the web (body copy only for x-client-platform: android|ios).`

- [ ] **Step 6: Commit**

```bash
git add docs README.md CLAUDE.md
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "docs: roles, owner protections, device binding, token storage — match the implementation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Final verification

- [ ] **Step 1: Everything, from clean**

Run:
```bash
cd server && npm run lint && npm test 2>&1 | tail -12
cd ../client && npm run lint && npm run build 2>&1 | tail -3
cd .. && git status --short
```
Expected: server lint clean; `# pass 88`, `# fail 0`; client lint clean and build succeeds; `git status` shows nothing uncommitted (the real `.env` is ignored).

- [ ] **Step 2: Real-server proof of the device flow**

`cd server && npm run dev` (in-memory Mongo; the owner and Abdullah are seeded from `.env` with the generated passwords from Task 4). With the client running: sign in as `abdullah.dabbas` in browser profile A (onboarding → set password), then attempt the same account in profile B → device-blocked banner; A still works. In profile A as the owner: Users → Abdullah → Details → Revoke device (reason) → A's Abdullah session ends on its next request; B can now sign in. Record the outcome in the final report — this is the Phase 75 evidence for the web; Android repeats it in its own spec.

- [ ] **Step 3: Tag the milestone**

```bash
git tag -a identity-access-v1 -m "Identity & Access hardening complete"
```
