# Security Sweep + Security Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the nine findings in the spec (log leakage, NAT-hostile rate limits, unprotected autosave, weak upload validation, secret hygiene, in-memory job dedupe, missing adversarial tests) and give the owner a Security Center and an Admins page.

**Architecture:** Every server change is a small, contained edit to an existing seam (`rateLimiters`, `uploads.scanBuffer`, `cryptoUtils.wrapKey`, the reminder job) plus one new model (`DeviceResetRequest`) and one new core module (`clamav`). New admin endpoints live in the existing `admin` module and reuse `assertCanManage`. The client adds two owner-only pages and reorganises navigation from one list in `utils/roles.js`.

**Tech Stack:** unchanged — Express 4, Mongoose 8, Zod, `node:test`, React 19. No new npm dependencies (ClamAV is spoken to over a raw TCP socket).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-27-security-sweep-design.md`. Findings F1–F9 and decisions 1–5 refer to it.
- `server/storage/` and `server/logs/` remain read-only; tests write only under `os.tmpdir()`.
- Every new audit action goes into `AUDIT_ACTIONS` first (`DEVICE_RESET_REQUESTED`, `DEVICE_RESET_REQUEST_RESOLVED`, `MEDIA_KEY_REWRAPPED`).
- Test fixtures: device ids ≥ 8 chars, usernames ≥ 3 chars, passwords match the strength rule.
- Rate-limit numbers, verbatim: login per-IP **30 / 15 min**, login per-username **10 / 15 min**, refresh **60 / 15 min**, quiz writes **120 / min**, reset-request **3 / hour per IP** and **3 / day per username**.
- User-facing reset-request reply, verbatim: *If the account exists, an administrator will review the request.*
- Commit after every task; trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`; commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit …`. Branch: `feat/security-sweep` (already created).
- Run `cd server && npm run lint && npm test` after every task; `cd client && npm run build` after client tasks.

---

## File map

**Create**
- `server/src/core/redact.js` — `redactUrl(url)`.
- `server/src/core/clamav.js` — `scanWithClamd(buffer, { host, port, timeoutMs }) → { clean, threat }`.
- `server/src/models/DeviceResetRequest.js`.
- `server/src/migrations/002-rewrap-media-keys.js`.
- `server/src/modules/admin/security.service.js` — overview, device list, reset-request queue.
- `server/tests/config.test.js`, `ratelimit.test.js`, `quiz-autosave.test.js`, `uploads.test.js`, `jobs.test.js`, `injection.test.js`, `idor.test.js`, `security-center.test.js`.
- `client/src/pages/admin/AdminAdmins.jsx`, `client/src/pages/admin/AdminSecurity.jsx`.

**Modify**
- `server/src/app.js`, `core/mailer.js`, `config/env.js`, `config/constants.js`, `middleware/rateLimiters.js`, `middleware/uploads.js`, `core/cryptoUtils.js`, `models/Video.js`, `models/QuizAttempt.js`, `models/Assignment.js`, `jobs/index.js`, `modules/videos/videos.service.js`, `modules/quizzes/quizzes.validators.js`, `modules/quizzes/quizzes.controller.js`, `modules/quizzes/quizzes.service.js`, `modules/quizzes/quizzes.routes.js`, `modules/auth/auth.routes.js`, `modules/auth/auth.controller.js`, `modules/auth/auth.validators.js`, `modules/auth/device.service.js`, `modules/admin/admin.routes.js`, `modules/files/files.routes.js`, `tests/helpers/harness.js`.
- `client/src/utils/roles.js`, `layouts/MainLayout.jsx`, `App.jsx`, `pages/admin/AdminUsers.jsx`, `pages/student/QuizRunner.jsx`, `pages/auth/LoginPage.jsx`.
- `docs/SECURITY.md`, `docs/API.md`, `README.md`, `CLAUDE.md`, `server/.env.example`.

---

### Task 1: Log redaction, production mail guard, new env keys

**Files:**
- Create: `server/src/core/redact.js`, `server/tests/config.test.js`
- Modify: `server/src/app.js:17-23`, `server/src/core/mailer.js:26-31`, `server/src/config/env.js` (schema + post-parse checks), `server/src/server.js` (SMTP warning), `server/src/middleware/rateLimiters.js:1-6`, `server/tests/helpers/harness.js` (set `RATE_LIMIT_MULTIPLIER=100`), `server/.env.example`

**Interfaces:**
- Produces: `redactUrl(url: string) → string` — replaces the values of `token`, `code`, `refreshToken` query params with `[redacted]`.
- Produces: `env.RATE_LIMIT_MULTIPLIER` (number ≥ 1, default 1), `env.CLAMAV_HOST` (optional), `env.CLAMAV_PORT` (default 3310), `env.CLAMAV_TIMEOUT_MS` (default 15000), `env.MEDIA_KEY_VERSION` (int ≥ 1, default 1), `env.MEDIA_MASTER_KEY_PREVIOUS` (optional, min 32).
- Produces: production exits when any two of `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MEDIA_MASTER_KEY` are equal, or `MEDIA_MASTER_KEY === MEDIA_MASTER_KEY_PREVIOUS`.

- [ ] **Step 1: Failing tests**

Create `server/tests/config.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { redactUrl } = require('../src/core/redact');

test('redactUrl hides stream tokens, codes and refresh tokens but keeps the path', () => {
  assert.equal(redactUrl('/api/v1/videos/abc/stream?token=SECRET.TOKEN&range=1'), '/api/v1/videos/abc/stream?token=[redacted]&range=1');
  assert.equal(redactUrl('/api/v1/auth/verify?code=123456'), '/api/v1/auth/verify?code=[redacted]');
  assert.equal(redactUrl('/api/v1/auth/refresh?refreshToken=x.y.z'), '/api/v1/auth/refresh?refreshToken=[redacted]');
  assert.equal(redactUrl('/api/v1/courses?page=2'), '/api/v1/courses?page=2');
  assert.equal(redactUrl('/api/v1/health'), '/api/v1/health');
});

/** Boot config/env.js in a child process with the given environment; return exit code + stderr. */
const bootEnv = (extra) => {
  const r = spawnSync(process.execPath, ['-e', "require('./src/config/env'); console.log('OK')"], {
    cwd: path.join(__dirname, '..'),
    env: {
      PATH: process.env.PATH, NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://x/y', JWT_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), MEDIA_MASTER_KEY: 'c'.repeat(40),
      SUPER_ADMIN_EMAIL: 'o@x.io', SUPER_ADMIN_INITIAL_PASSWORD: 'Owner@12345',
      ...extra,
    },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('production refuses equal secrets', () => {
  assert.equal(bootEnv({}).code, 0, 'distinct secrets boot');
  const same = bootEnv({ JWT_REFRESH_SECRET: 'a'.repeat(40) });
  assert.equal(same.code, 1);
  assert.match(same.out, /must be different/i);
  const media = bootEnv({ MEDIA_MASTER_KEY: 'a'.repeat(40) });
  assert.equal(media.code, 1);
  const prev = bootEnv({ MEDIA_MASTER_KEY_PREVIOUS: 'c'.repeat(40) });
  assert.equal(prev.code, 1);
});

test('production requires MEDIA_MASTER_KEY and accepts a previous key for rotation', () => {
  assert.equal(bootEnv({ MEDIA_MASTER_KEY: '' }).code, 1);
  assert.equal(bootEnv({ MEDIA_MASTER_KEY_PREVIOUS: 'd'.repeat(40), MEDIA_KEY_VERSION: '2' }).code, 0);
});
```

Note: `bootEnv` deliberately does not load `.env` from disk — `dotenv` only fills variables that are unset, and every required one is set explicitly, so the developer's real `.env` cannot leak into the assertion.

- [ ] **Step 2: Run to see it fail** — `cd server && node --test tests/config.test.js` → `Cannot find module '../src/core/redact'`.

- [ ] **Step 3: Implement**

Create `server/src/core/redact.js`:

```js
const SENSITIVE_QUERY_KEYS = ['token', 'code', 'refreshToken'];

/** Strip secret-bearing query values from a URL before it reaches a log line. */
const redactUrl = (url = '') => {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const base = url.slice(0, q);
  const params = url.slice(q + 1).split('&').map((pair) => {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    return SENSITIVE_QUERY_KEYS.includes(key) ? `${key}=[redacted]` : pair;
  });
  return `${base}?${params.join('&')}`;
};

module.exports = { redactUrl, SENSITIVE_QUERY_KEYS };
```

`server/src/app.js` — import `const { redactUrl } = require('./core/redact');` and change the log line to:

```js
    logger.http?.(`${req.method} ${redactUrl(req.originalUrl)} ${res.statusCode} ${Date.now() - start}ms`);
```

`server/src/core/mailer.js` — change the dev preview condition:

```js
    if (!env.SMTP_HOST && env.NODE_ENV !== 'production') {
      logger.info(`📧 [dev mail] to=${to} subject="${subject}"`, { preview: (text || '').slice(0, 200) });
    }
```

`server/src/server.js` — after `await connectDB();` add:

```js
  if (env.NODE_ENV === 'production' && !env.SMTP_HOST) {
    logger.warn('SMTP is not configured — verification and password-reset emails cannot be delivered.');
  }
```

`server/src/config/env.js` — add to the schema (after `REFRESH_COOKIE_SAMESITE`):

```js
  RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).default(1),

  // Media key rotation: new videos wrap with MEDIA_MASTER_KEY (MEDIA_KEY_VERSION);
  // videos wrapped under the previous version unwrap with MEDIA_MASTER_KEY_PREVIOUS.
  MEDIA_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  MEDIA_MASTER_KEY_PREVIOUS: optional(z.string().min(32)),

  // Optional ClamAV daemon (fail-closed when set but unreachable).
  CLAMAV_HOST: optional(z.string()),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().default(15000),
```

and after the media-key derivation block:

```js
if (env.NODE_ENV === 'production') {
  const pairs = [
    ['JWT_SECRET', 'JWT_REFRESH_SECRET'], ['JWT_SECRET', 'MEDIA_MASTER_KEY'],
    ['JWT_REFRESH_SECRET', 'MEDIA_MASTER_KEY'], ['MEDIA_MASTER_KEY', 'MEDIA_MASTER_KEY_PREVIOUS'],
  ];
  for (const [a, b] of pairs) {
    if (env[a] && env[b] && env[a] === env[b]) {
      console.error(`❌ ${a} and ${b} must be different values.`);
      process.exit(1);
    }
  }
}
```

`server/src/middleware/rateLimiters.js` — replace the `TEST_MULTIPLIER` lines:

```js
// RATE_LIMIT_MULTIPLIER scales every bucket (the test harness sets 100; production leaves 1).
const MULTIPLIER = env.RATE_LIMIT_MULTIPLIER;
```
and `max: max * MULTIPLIER`.

`server/tests/helpers/harness.js` — add `process.env.RATE_LIMIT_MULTIPLIER = process.env.RATE_LIMIT_MULTIPLIER || '100';` next to the other env lines (a test may pre-set `1`).

`server/.env.example` — add under Secrets: `MEDIA_KEY_VERSION=1`, `MEDIA_MASTER_KEY_PREVIOUS=`, and a new block:

```ini
# ── Malware scanning (optional; when CLAMAV_HOST is set, uploads fail closed if clamd is unreachable)
CLAMAV_HOST=
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=15000
RATE_LIMIT_MULTIPLIER=1
```

- [ ] **Step 4: Verify** — `cd server && node --test tests/config.test.js` → 3 pass; `npm run lint && npm test` → 91 pass.
- [ ] **Step 5: Commit** — `git add server && git -c … commit -m "sec(logging): redact tokens from request logs, no mail previews in production, secret-distinctness and media-key-version env"`.

---

### Task 2: Two-bucket login limiting and new rate buckets

**Files:**
- Modify: `server/src/middleware/rateLimiters.js`, `server/src/modules/auth/auth.routes.js:9-11`, `server/src/modules/quizzes/quizzes.routes.js:15-16`
- Create: `server/tests/ratelimit.test.js`

**Interfaces:**
- Produces: `loginIpLimiter`, `loginAccountLimiter`, `refreshLimiter`, `quizWriteLimiter`, `resetRequestIpLimiter`, `resetRequestAccountLimiter` exported from `rateLimiters.js` (`loginLimiter` removed).

- [ ] **Step 1: Failing test**

Create `server/tests/ratelimit.test.js` (sets the multiplier **before** the harness loads env):

```js
process.env.RATE_LIMIT_MULTIPLIER = '1';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin;
before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  await app.createUser(admin.token, { name: 'Alpha', username: 'alpha', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  await app.createUser(admin.token, { name: 'Beta', username: 'beta', password: 'Learn@1234', role: 'student' }, 'dev-admin');
});
after(async () => { await app.stop(); });

const login = (username, ip, i = 0) => api('POST', '/auth/login', {
  deviceId: `dev-${username}-000${i % 10}`, headers: { 'X-Forwarded-For': ip },
  body: { username, password: 'WrongPass1', deviceId: `dev-${username}-000${i % 10}` },
});

test('per-username bucket: 10 failures for one account from many IPs → 429; another account is unaffected', async () => {
  for (let i = 0; i < 10; i++) {
    const r = await login('alpha', `10.0.0.${i + 1}`, i);
    assert.equal(r.status, 401, `attempt ${i + 1}`);
  }
  const blocked = await login('alpha', '10.0.0.99');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.code, 'RATE_LIMITED');
  const other = await login('beta', '10.0.0.99');
  assert.equal(other.status, 401, 'same IP, different account still reaches the password check');
});

test('per-IP bucket: 30 attempts from one address → 429 regardless of username', async () => {
  let last;
  for (let i = 0; i < 30; i++) last = await login(`ghost${i}`, '10.9.9.9', i);
  assert.equal(last.status, 401);
  const blocked = await login('ghost99', '10.9.9.9');
  assert.equal(blocked.status, 429);
});

test('quiz autosave bucket: 120 writes per minute per IP', async () => {
  const s = await app.loginAs('beta', 'Learn@1234', { deviceId: 'dev-beta-quiz' });
  let last;
  for (let i = 0; i < 120; i++) {
    last = await api('POST', '/quizzes/attempts/000000000000000000000000/answers', { token: s.token, deviceId: 'dev-beta-quiz', headers: { 'X-Forwarded-For': '10.7.7.7' }, body: { answers: [] } });
  }
  assert.equal(last.status, 404, 'unknown attempt, but not rate limited yet');
  const blocked = await api('POST', '/quizzes/attempts/000000000000000000000000/answers', { token: s.token, deviceId: 'dev-beta-quiz', headers: { 'X-Forwarded-For': '10.7.7.7' }, body: { answers: [] } });
  assert.equal(blocked.status, 429);
});
```

(The reset-request buckets are asserted in Task 7's test once the endpoint exists.)

- [ ] **Step 2: Run to see it fail** — first test: 11th attempt returns 401 (only per-IP exists, 10/15 min per IP with distinct IPs).

- [ ] **Step 3: Implement**

`server/src/middleware/rateLimiters.js` — replace the exports with:

```js
const accountKey = (req) => `u:${String(req.body?.username || req.ip || '').toLowerCase()}`;

module.exports = {
  // Login: a relaxed per-IP bucket (a lecture hall shares one NAT) plus a strict per-account bucket.
  loginIpLimiter: build(15 * 60 * 1000, 30, 'Too many login attempts from this network. Try again in 15 minutes.'),
  loginAccountLimiter: build(15 * 60 * 1000, 10, 'Too many login attempts for this account. Try again in 15 minutes.', { keyGenerator: accountKey }),
  refreshLimiter: build(15 * 60 * 1000, 60, 'Too many session refreshes. Slow down.'),
  passwordLimiter: build(15 * 60 * 1000, 5, 'Too many password attempts. Try again later.'),
  verificationLimiter: build(15 * 60 * 1000, 20, 'Too many verification attempts. Try again later.'),
  codeRedemptionLimiter: build(15 * 60 * 1000, 10, 'Too many code attempts. Try again later.'),
  resetRequestIpLimiter: build(60 * 60 * 1000, 3, 'Too many device-reset requests. Try again later.'),
  resetRequestAccountLimiter: build(24 * 60 * 60 * 1000, 3, 'Too many device-reset requests for this account today.', { keyGenerator: accountKey }),
  quizWriteLimiter: build(60 * 1000, 120, 'Too many quiz saves. Slow down.'),
  uploadLimiter: build(60 * 1000, 120, 'Upload rate exceeded. Slow down.'),
  chunkLimiter: build(60 * 1000, 900, 'Upload rate exceeded. Slow down.'),
  searchLimiter: build(60 * 1000, 60, 'Too many searches. Slow down.'),
  generalLimiter: build(60 * 1000, 300, 'Too many requests. Please slow down.', {
    skip: (req) => CHUNK_UPLOAD_PATH.test(req.originalUrl),
  }),
  antiCheatLimiter: build(60 * 1000, 240, 'Event rate exceeded.'),
};
```

`express-rate-limit` v7 warns when a custom `keyGenerator` does not use its IPv6 helper; the account key is not an IP, so pass `validate: { keyGeneratorIpFallback: false }` in the `build` options for the two account limiters (add `...options` already spreads it).

`auth.routes.js`:
```js
const { loginIpLimiter, loginAccountLimiter, refreshLimiter, passwordLimiter, verificationLimiter } = require('../../middleware/rateLimiters');
router.post('/login', loginIpLimiter, loginAccountLimiter, validate(v.loginSchema), c.login);
router.post('/refresh', refreshLimiter, requireAllowedOrigin, validate(v.refreshSchema), c.refresh);
```

`quizzes.routes.js` — import `quizWriteLimiter` and add it before `authorize('student')` on the `/answers` and `/submit` routes.

- [ ] **Step 4: Verify** — `node --test tests/ratelimit.test.js` → 3 pass; `npm run lint && npm test` → 94 pass (the general limiter is 300 × 100 in the harness, so other files are unaffected).
- [ ] **Step 5: Commit** — `"sec(ratelimit): per-account login bucket, refresh and quiz-write buckets, reset-request buckets"`.

---

### Task 3: Quiz autosave stale-write protection

**Files:**
- Modify: `server/src/models/QuizAttempt.js` (add `answersSavedAt`), `server/src/modules/quizzes/quizzes.validators.js:65`, `quizzes.controller.js` (`saveAnswers`), `quizzes.service.js` (`saveAnswers`), `client/src/pages/student/QuizRunner.jsx:99-107`
- Create: `server/tests/quiz-autosave.test.js`

**Interfaces:**
- Produces: `POST /quizzes/attempts/:id/answers { answers, clientSavedAt? }` → `{ saved: true, savedAt }` or `{ saved: false, stale: true, savedAt }`.
- Produces: `QuizService.saveAnswers(attemptId, studentId, answers, clientSavedAt?)`.

- [ ] **Step 1: Failing test**

Create `server/tests/quiz-autosave.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, teacher, student, attemptId, qid;
before(async () => {
  app = await startApp();
  api = app.api;
  const admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  await app.createUser(admin.token, { name: 'Tea', username: 'tea', password: 'Teach@1234', role: 'teacher' }, 'dev-admin');
  await app.createUser(admin.token, { name: 'Stu', username: 'stu', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  teacher = await app.loginAs('tea', 'Teach@1234', { deviceId: 'dev-tea-01' });
  student = await app.loginAs('stu', 'Learn@1234', { deviceId: 'dev-stu-01' });
  const course = (await api('POST', '/courses', { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Autosave', isPublished: true } })).data;
  await api('POST', `/enrollments/courses/${course._id}/students`, { token: admin.token, deviceId: 'dev-admin', body: { student: 'stu' } });
  const q = (await api('POST', `/quizzes/courses/${course._id}/questions`, { token: teacher.token, deviceId: teacher.deviceId, body: { type: 'short_answer', text: 'Capital of Jordan?', correctAnswers: ['amman'] } })).data;
  qid = q._id;
  const quiz = (await api('POST', `/quizzes/courses/${course._id}`, { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Q', questions: [qid], isPublished: true } })).data;
  attemptId = (await api('POST', `/quizzes/courses/${course._id}/${quiz._id}/start`, { token: student.token, deviceId: student.deviceId })).data.attemptId;
});
after(async () => { await app.stop(); });

const save = (text, clientSavedAt) => api('POST', `/quizzes/attempts/${attemptId}/answers`, {
  token: student.token, deviceId: student.deviceId, body: { answers: [{ questionId: qid, textAnswer: text }], clientSavedAt },
});
const current = async () => (await api('GET', `/quizzes/attempts/${attemptId}`, { token: student.token, deviceId: student.deviceId })).data.answers[0]?.textAnswer;

test('a stale autosave never overwrites a newer one', async () => {
  const t1 = new Date(Date.now() - 20000).toISOString();
  const t2 = new Date(Date.now() - 10000).toISOString();
  const newer = await save('Amman', t2);
  assert.equal(newer.status, 200);
  assert.equal(newer.data.saved, true);
  const older = await save('Amm', t1);
  assert.equal(older.status, 200);
  assert.equal(older.data.saved, false);
  assert.equal(older.data.stale, true);
  assert.equal(await current(), 'Amman');
});

test('saves without a client timestamp still work; submit always wins', async () => {
  const r = await save('amman ');
  assert.equal(r.data.saved, true);
  const submit = await api('POST', `/quizzes/attempts/${attemptId}/submit`, {
    token: student.token, deviceId: student.deviceId, body: { answers: [{ questionId: qid, textAnswer: 'Amman' }] },
  });
  assert.equal(submit.status, 200, JSON.stringify(submit.data));
  assert.equal(submit.data.score, 1);
});
```

- [ ] **Step 2: Run to see it fail** — `older.data.stale` is `undefined`; `current()` is `'Amm'`.

- [ ] **Step 3: Implement**

`QuizAttempt.js` — after `answers`: `answersSavedAt: { type: Date, default: null },`.

`quizzes.validators.js`:
```js
const saveAnswersSchema = z.object({ answers: z.array(answerSchema).max(500), clientSavedAt: z.coerce.date().optional() });
```

`quizzes.controller.js`:
```js
const saveAnswers = asyncHandler(async (req, res) => {
  res.json(await QuizService.saveAnswers(req.params.attemptId, req.user.id, req.body.answers, req.body.clientSavedAt));
});
```

`quizzes.service.js` — replace `saveAnswers`:
```js
  /** Autosave answers during the attempt. A payload older than the last saved one is ignored (slow request overtaken by a newer save). */
  static async saveAnswers(attemptId, studentId, answers, clientSavedAt) {
    const attempt = await QuizAttempt.findOne({ _id: attemptId, student: studentId, status: 'in_progress' })
      .select('+questionsSnapshot.correctAnswers +questionsSnapshot.options.isCorrect');
    if (!attempt) throw ApiError.notFound('Active attempt not found');
    if (attempt.deadlineAt && new Date() > new Date(attempt.deadlineAt.getTime() + 30000)) {
      await QuizService.#finalizeAttempt(attempt, { autoSubmitted: true });
      throw ApiError.forbidden('Time is up — attempt auto-submitted', 'TIME_UP');
    }
    if (clientSavedAt && attempt.answersSavedAt && clientSavedAt < attempt.answersSavedAt) {
      return { saved: false, stale: true, savedAt: attempt.answersSavedAt };
    }
    const validIds = new Set(attempt.questionsSnapshot.map((q) => String(q.questionId)));
    attempt.answers = answers.filter((a) => validIds.has(String(a.questionId)));
    attempt.answersSavedAt = clientSavedAt || new Date();
    await attempt.save();
    return { saved: true, savedAt: attempt.answersSavedAt };
  }
```

`QuizRunner.jsx` autosave effect:
```jsx
    const interval = setInterval(() => {
      const payload = buildAnswerPayload(answers, attempt.questions);
      api.post(`/quizzes/attempts/${attempt.attemptId}/answers`, { answers: payload, clientSavedAt: new Date().toISOString() }).catch(() => {});
    }, 15000);
```

- [ ] **Step 4: Verify** — `node --test tests/quiz-autosave.test.js` → 2 pass; `npm run lint && npm test` → 96; `cd client && npm run build`.
- [ ] **Step 5: Commit** — `"sec(quiz): autosave ignores stale payloads (clientSavedAt vs answersSavedAt)"`.

---

### Task 4: Upload hardening — MIME allowlist, SVG policy, ClamAV seam, video container sniff

**Files:**
- Create: `server/src/core/clamav.js`, `server/tests/uploads.test.js`
- Modify: `server/src/middleware/uploads.js` (`persistUpload`, `scanBuffer`, new `ALLOWED_MIME`), `server/src/modules/files/files.routes.js` (avatar/question image SVG rejection, SVG served as attachment), `server/src/modules/videos/videos.service.js` (`#processUpload` sniff), `server/src/config/constants.js` (UPLOAD.ALLOWED_MIME)

**Interfaces:**
- Produces: `scanWithClamd(buffer, { host, port, timeoutMs }) → Promise<{ clean: boolean, threat: string|null }>`; throws on connection/timeout errors.
- Produces: `scanBuffer(buffer, originalName) → { clean, threat }` where `threat === 'scanner_unavailable'` when ClamAV is configured but unreachable; `persistUpload` maps that to `503 SCANNER_UNAVAILABLE`.
- Produces: `persistUpload(file, kind, { allowSvg = false })`.

- [ ] **Step 1: Failing tests**

Create `server/tests/uploads.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, teacher, courseId, env;
before(async () => {
  app = await startApp();
  api = app.api;
  env = require('../src/config/env');
  const admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  await app.createUser(admin.token, { name: 'Tea', username: 'tea', password: 'Teach@1234', role: 'teacher' }, 'dev-admin');
  teacher = await app.loginAs('tea', 'Teach@1234', { deviceId: 'dev-tea-01' });
  courseId = (await api('POST', '/courses', { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Uploads' } })).data._id;
});
after(async () => { await app.stop(); });

/** multipart upload helper — the harness api() is JSON-only. */
const upload = async (urlPath, { name, type, bytes, token = teacher.token, deviceId = teacher.deviceId, field = 'file', extra = {} }) => {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), name);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await fetch(`${app.baseUrl}/api/v1${urlPath}`, {
    method: 'POST', body: form,
    headers: { Authorization: `Bearer ${token}`, 'x-device-id': deviceId },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const PDF = Buffer.from('%PDF-1.4\n%fake\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const MZ = Buffer.from('MZ\x90\x00 not really a pdf');

test('MIME must match the extension; content must match the magic bytes', async () => {
  const good = await upload(`/files/courses/${courseId}/documents`, { name: 'notes.pdf', type: 'application/pdf', bytes: PDF });
  assert.equal(good.status, 201, JSON.stringify(good.data));
  const wrongMime = await upload(`/files/courses/${courseId}/documents`, { name: 'notes.pdf', type: 'image/png', bytes: PDF });
  assert.equal(wrongMime.status, 400);
  assert.equal(wrongMime.data.code, 'BAD_FILE_TYPE');
  const pngAsPdf = await upload(`/files/courses/${courseId}/documents`, { name: 'notes.pdf', type: 'application/pdf', bytes: PNG });
  assert.equal(pngAsPdf.status, 400);
  assert.equal(pngAsPdf.data.code, 'BAD_FILE_CONTENT');
  const exe = await upload(`/files/courses/${courseId}/documents`, { name: 'setup.pdf', type: 'application/pdf', bytes: MZ });
  assert.equal(exe.status, 400);
  assert.equal(exe.data.code, 'MALWARE_SUSPECTED');
});

test('SVG is rejected for avatars and question images, allowed for course thumbnails and served as an attachment', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const avatar = await upload('/files/avatar', { name: 'me.svg', type: 'image/svg+xml', bytes: svg });
  assert.equal(avatar.status, 400);
  const question = await upload(`/files/courses/${courseId}/images`, { name: 'q.svg', type: 'image/svg+xml', bytes: svg, extra: { scope: 'question' } });
  assert.equal(question.status, 400);
  const thumb = await upload(`/files/courses/${courseId}/images`, { name: 't.svg', type: 'image/svg+xml', bytes: svg, extra: { scope: 'thumbnail' } });
  assert.equal(thumb.status, 201, JSON.stringify(thumb.data));
  const res = await fetch(`${app.baseUrl}/api/v1/files/${thumb.data._id}/content`, { headers: { Authorization: `Bearer ${teacher.token}`, 'x-device-id': teacher.deviceId } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /^attachment/);
});

/** Minimal clamd stand-in speaking the INSTREAM protocol. */
const fakeClamd = (verdict) => new Promise((resolve) => {
  const server = net.createServer((sock) => {
    let seenCommand = false;
    sock.on('data', (chunk) => {
      if (!seenCommand && chunk.toString('latin1').startsWith('zINSTREAM')) seenCommand = true;
      // The zero-length chunk terminates the stream.
      if (seenCommand && chunk.length >= 4 && chunk.subarray(-4).equals(Buffer.alloc(4))) {
        sock.end(verdict === 'ok' ? 'stream: OK\0' : 'stream: Eicar-Test-Signature FOUND\0');
      }
    });
  });
  server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => new Promise((r) => server.close(r)) }));
});

test('ClamAV: FOUND rejects, OK accepts, unreachable daemon fails closed', async () => {
  const found = await fakeClamd('found');
  env.CLAMAV_HOST = '127.0.0.1'; env.CLAMAV_PORT = found.port;
  const rejected = await upload(`/files/courses/${courseId}/documents`, { name: 'eicar.pdf', type: 'application/pdf', bytes: PDF });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.data.code, 'MALWARE_SUSPECTED');
  await found.close();

  const ok = await fakeClamd('ok');
  env.CLAMAV_PORT = ok.port;
  const accepted = await upload(`/files/courses/${courseId}/documents`, { name: 'clean.pdf', type: 'application/pdf', bytes: PDF });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.data));
  await ok.close();

  env.CLAMAV_PORT = 1; // nothing listens here
  const down = await upload(`/files/courses/${courseId}/documents`, { name: 'later.pdf', type: 'application/pdf', bytes: PDF });
  assert.equal(down.status, 503);
  assert.equal(down.data.code, 'SCANNER_UNAVAILABLE');
  env.CLAMAV_HOST = undefined;
});

test('an assembled "video" that is not a media container is marked failed', async () => {
  const init = await api('POST', `/videos/courses/${courseId}/uploads`, { token: teacher.token, deviceId: teacher.deviceId, body: { originalName: 'lecture.mp4', sizeBytes: 64, mimeType: 'video/mp4' } });
  assert.equal(init.status, 201, JSON.stringify(init.data));
  const chunk = await upload(`/videos/uploads/${init.data.uploadId}/chunks`, { name: 'chunk-0', type: 'application/octet-stream', bytes: Buffer.alloc(64, 0x41), field: 'chunk', extra: { chunkIndex: '0' } });
  assert.equal(chunk.status, 200, JSON.stringify(chunk.data));
  const done = await api('POST', `/videos/uploads/${init.data.uploadId}/complete`, { token: teacher.token, deviceId: teacher.deviceId });
  assert.equal(done.status, 200);
  const Video = require('../src/models/Video');
  for (let i = 0; i < 40; i++) {
    const v = await Video.findById(init.data.videoId).lean();
    if (v.status !== 'processing') { assert.equal(v.status, 'failed'); assert.match(v.processingError, /container/i); return; }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail('video never left processing');
});
```

- [ ] **Step 2: Run to see it fail** — MIME mismatch returns 201; SVG avatar returns 201; ClamAV tests fail on `scanner` codes; the fake video ends `ready`.

- [ ] **Step 3: Implement**

`server/src/config/constants.js` — inside `UPLOAD`, add:

```js
    ALLOWED_MIME: {
      '.pdf': ['application/pdf'],
      '.doc': ['application/msword'],
      '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      '.ppt': ['application/vnd.ms-powerpoint'],
      '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      '.xls': ['application/vnd.ms-excel'],
      '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      '.zip': ['application/zip', 'application/x-zip-compressed'],
      '.txt': ['text/plain'],
      '.png': ['image/png'],
      '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'],
      '.webp': ['image/webp'],
      '.gif': ['image/gif'],
      '.svg': ['image/svg+xml'],
    },
```

Create `server/src/core/clamav.js`:

```js
const net = require('net');

/**
 * Minimal clamd client (INSTREAM over TCP). Sends the buffer in length-prefixed
 * chunks and reads the single-line verdict. Rejects on any transport error so
 * the caller can fail closed.
 */
const scanWithClamd = (buffer, { host, port, timeoutMs = 15000 }) => new Promise((resolve, reject) => {
  const socket = net.createConnection({ host, port });
  let reply = '';
  let settled = false;
  const done = (fn, v) => { if (!settled) { settled = true; socket.destroy(); fn(v); } };
  const timer = setTimeout(() => done(reject, new Error('clamd timeout')), timeoutMs);

  socket.once('connect', () => {
    socket.write('zINSTREAM\0');
    const CHUNK = 64 * 1024;
    for (let off = 0; off < buffer.length; off += CHUNK) {
      const slice = buffer.subarray(off, Math.min(off + CHUNK, buffer.length));
      const len = Buffer.alloc(4); len.writeUInt32BE(slice.length, 0);
      socket.write(Buffer.concat([len, slice]));
    }
    socket.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
  });
  socket.on('data', (d) => { reply += d.toString('latin1'); });
  socket.on('end', () => {
    clearTimeout(timer);
    const line = reply.replace(/\0/g, '').trim();
    if (/\bOK$/.test(line)) return done(resolve, { clean: true, threat: null });
    const m = /:\s*(.+?)\s+FOUND$/.exec(line);
    if (m) return done(resolve, { clean: false, threat: m[1] });
    done(reject, new Error(`unexpected clamd reply: ${line || '(empty)'}`));
  });
  socket.on('error', (err) => { clearTimeout(timer); done(reject, err); });
});

module.exports = { scanWithClamd };
```

`server/src/middleware/uploads.js`:

- Replace `scanBuffer` with:

```js
/**
 * Malware check. Always runs a heuristic pass (executable headers / script
 * extensions). When CLAMAV_HOST is configured the buffer is also streamed to
 * clamd; a daemon that cannot be reached FAILS CLOSED (threat 'scanner_unavailable').
 * The heuristic alone is not antivirus — see docs/SECURITY.md.
 */
const scanBuffer = async (buffer, originalName) => {
  const head = buffer.subarray(0, 2);
  if (head[0] === 0x4d && head[1] === 0x5a) return { clean: false, threat: 'Windows executable (MZ header)' };
  if (buffer.subarray(0, 4).toString('latin1') === '\x7fELF') return { clean: false, threat: 'ELF executable' };
  const lowered = originalName.toLowerCase();
  if (/\.(exe|bat|cmd|sh|ps1|msi|scr|vbs|js|jar|com)(\.|$)/.test(lowered)) return { clean: false, threat: 'Executable file type' };

  if (env.CLAMAV_HOST) {
    try {
      const { scanWithClamd } = require('../core/clamav');
      return await scanWithClamd(buffer, { host: env.CLAMAV_HOST, port: env.CLAMAV_PORT, timeoutMs: env.CLAMAV_TIMEOUT_MS });
    } catch (err) {
      require('../config/logger').logger.error(`ClamAV unavailable: ${err.message}`);
      return { clean: false, threat: 'scanner_unavailable' };
    }
  }
  return { clean: true, threat: null };
};
```

- Replace `persistUpload` signature and validation with:

```js
const persistUpload = async (file, kind, { allowSvg = false } = {}) => {
  const allowed = kind === 'images'
    ? UPLOAD.ALLOWED_IMAGE_TYPES
    : [...UPLOAD.ALLOWED_DOC_TYPES, ...UPLOAD.ALLOWED_IMAGE_TYPES];

  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowed.includes(ext) || (ext === '.svg' && !allowSvg)) {
    throw ApiError.badRequest(`File type ${ext || '(none)'} is not allowed here`, 'BAD_FILE_TYPE');
  }
  const mimes = UPLOAD.ALLOWED_MIME[ext] || [];
  if (!mimes.includes(String(file.mimetype || '').toLowerCase())) {
    throw ApiError.badRequest(`Declared type ${file.mimetype || '(none)'} does not match ${ext}`, 'BAD_FILE_TYPE');
  }
  if (!checkMagicBytes(file.buffer, ext)) {
    throw ApiError.badRequest('File content does not match its extension', 'BAD_FILE_CONTENT');
  }
  const scan = await scanBuffer(file.buffer, file.originalname || '');
  if (!scan.clean) {
    if (scan.threat === 'scanner_unavailable') throw new ApiError(503, 'Upload scanning is temporarily unavailable. Try again later.', 'SCANNER_UNAVAILABLE');
    throw ApiError.badRequest(`Upload rejected: ${scan.threat}`, 'MALWARE_SUSPECTED');
  }
  …(rest unchanged)
```

`files.service.js` — `upload(file, { …, allowSvg = false }, ip)` passes `{ allowSvg }` to `persistUpload`.

`files.routes.js` — the course-image route passes `allowSvg: req.body.scope === 'thumbnail'`; avatar and global routes leave it false. In `GET /:fileId/content`, compute `inline` as:

```js
  const inline = (asset.mimeType.startsWith('image/') && asset.mimeType !== 'image/svg+xml') || asset.mimeType === 'application/pdf';
```

`videos.service.js` — in `#processUpload`, after `const stat = await fs.promises.stat(assembledPath);` insert:

```js
    // Container sniff: ftyp box at offset 4 (mp4/mov/m4v) or EBML header (webm/mkv).
    const head = Buffer.alloc(12);
    const fd = await fs.promises.open(assembledPath, 'r');
    try { await fd.read(head, 0, 12, 0); } finally { await fd.close(); }
    const isIsoBmff = head.subarray(4, 8).toString('latin1') === 'ftyp';
    const isEbml = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    if (!isIsoBmff && !isEbml) {
      await fs.promises.unlink(assembledPath).catch(() => {});
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      throw new Error('Not a recognised video container (expected MP4/MOV/M4V or WebM/MKV)');
    }
```

(The existing `catch` in `completeUpload` already stores `processingError` and sets `status: 'failed'`.)

- [ ] **Step 4: Verify** — `node --test tests/uploads.test.js` → 4 pass; `npm run lint && npm test` → 100.
- [ ] **Step 5: Commit** — `"sec(uploads): MIME allowlist, SVG policy, ClamAV INSTREAM seam (fail closed), video container sniff"`.

---

### Task 5: Media-key versioning, rewrap migration, persistent reminder dedupe

**Files:**
- Modify: `server/src/core/cryptoUtils.js` (`wrapKey`, `unwrapKey`, `MASTER_KEYS`), `server/src/models/Video.js` (`encryption.keyVersion`), `server/src/modules/videos/videos.service.js` (wrap/unwrap calls), `server/src/models/Assignment.js` (`reminderSentAt`), `server/src/jobs/index.js` (reminder job), `server/src/config/constants.js` (`MEDIA_KEY_REWRAPPED`)
- Create: `server/src/migrations/002-rewrap-media-keys.js`, `server/tests/jobs.test.js`; extend `server/tests/config.test.js`

**Interfaces:**
- Produces: `wrapKey(keyBuffer) → { wrapped: string, keyVersion: number }`; `unwrapKey(wrappedB64, keyVersion = 1) → Buffer`; `masterKeyFor(version) → Buffer` (throws `MEDIA_KEY_UNAVAILABLE`).
- Produces: `Video.encryption.keyVersion` (Number, default 1).
- Produces: `assignmentDeadlineReminders()` exported from `jobs/index.js`; idempotent across processes via `Assignment.reminderSentAt`.

- [ ] **Step 1: Failing tests**

Append to `server/tests/config.test.js`:

```js
test('media keys: wrap under v1, rotate to v2 with the previous key, unwrap both', () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'x'.repeat(40); process.env.JWT_REFRESH_SECRET = 'y'.repeat(40);
  process.env.MEDIA_MASTER_KEY = 'k1'.repeat(20); process.env.MEDIA_KEY_VERSION = '1';
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/core/cryptoUtils')];
  let cu = require('../src/core/cryptoUtils');
  const key = Buffer.alloc(32, 7);
  const v1 = cu.wrapKey(key);
  assert.equal(v1.keyVersion, 1);
  assert.ok(cu.unwrapKey(v1.wrapped, 1).equals(key));

  process.env.MEDIA_MASTER_KEY_PREVIOUS = process.env.MEDIA_MASTER_KEY;
  process.env.MEDIA_MASTER_KEY = 'k2'.repeat(20); process.env.MEDIA_KEY_VERSION = '2';
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/core/cryptoUtils')];
  cu = require('../src/core/cryptoUtils');
  assert.ok(cu.unwrapKey(v1.wrapped, 1).equals(key), 'old video still decrypts via PREVIOUS');
  const v2 = cu.wrapKey(key);
  assert.equal(v2.keyVersion, 2);
  assert.ok(cu.unwrapKey(v2.wrapped, 2).equals(key));
  assert.throws(() => cu.unwrapKey(v1.wrapped, 3), /MEDIA_KEY_UNAVAILABLE/);
});
```

Create `server/tests/jobs.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api;
before(async () => {
  app = await startApp();
  api = app.api;
  const admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  await app.createUser(admin.token, { name: 'Tea', username: 'tea', password: 'Teach@1234', role: 'teacher' }, 'dev-admin');
  await app.createUser(admin.token, { name: 'Stu', username: 'stu', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const teacher = await app.loginAs('tea', 'Teach@1234', { deviceId: 'dev-tea-01' });
  const course = (await api('POST', '/courses', { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Jobs', isPublished: true } })).data;
  await api('POST', `/enrollments/courses/${course._id}/students`, { token: admin.token, deviceId: 'dev-admin', body: { student: 'stu' } });
  const dueAt = new Date(Date.now() + 6 * 3600000).toISOString();
  await api('POST', `/assignments/courses/${course._id}`, { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Due soon', dueAt } });
});
after(async () => { await app.stop(); });

test('assignment reminders are sent once, even when the job runs twice or concurrently', async () => {
  const { assignmentDeadlineReminders } = require('../src/jobs');
  const Notification = require('../src/models/Notification');
  const count = () => Notification.countDocuments({ type: 'deadline' });
  await Promise.all([assignmentDeadlineReminders(), assignmentDeadlineReminders()]);
  assert.equal(await count(), 1);
  await assignmentDeadlineReminders();
  assert.equal(await count(), 1);
});
```

- [ ] **Step 2: Run to see them fail** — `wrapKey` returns a string (no `keyVersion`); reminders count is 2.

- [ ] **Step 3: Implement**

`core/cryptoUtils.js` — replace the master key constant and wrap/unwrap:

```js
const deriveMaster = (secret) => crypto.createHash('sha256').update(secret).digest();
const MASTER_KEYS = new Map([[env.MEDIA_KEY_VERSION, deriveMaster(env.MEDIA_MASTER_KEY)]]);
if (env.MEDIA_MASTER_KEY_PREVIOUS && env.MEDIA_KEY_VERSION > 1) {
  MASTER_KEYS.set(env.MEDIA_KEY_VERSION - 1, deriveMaster(env.MEDIA_MASTER_KEY_PREVIOUS));
}

const masterKeyFor = (version) => {
  const key = MASTER_KEYS.get(Number(version));
  if (!key) throw new Error(`MEDIA_KEY_UNAVAILABLE: no master key for version ${version}`);
  return key;
};

/** Wrap a per-video key with the CURRENT master key. Returns the wrapped blob and its key version. */
const wrapKey = (keyBuffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKeyFor(env.MEDIA_KEY_VERSION), iv);
  const wrapped = Buffer.concat([cipher.update(keyBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { wrapped: Buffer.concat([iv, tag, wrapped]).toString('base64'), keyVersion: env.MEDIA_KEY_VERSION };
};

/** Unwrap a stored per-video key with the master key of the version it was wrapped under. */
const unwrapKey = (wrappedB64, keyVersion = 1) => {
  const raw = Buffer.from(wrappedB64, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const wrapped = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKeyFor(keyVersion), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
};
```
Export `masterKeyFor` too. (`signedUrl.js` derives its own signing key from `MEDIA_MASTER_KEY`; stream tokens are 5-minute so a rotation only invalidates in-flight tokens — acceptable and documented.)

`models/Video.js` — in `encryption`: `keyVersion: { type: Number, default: 1 },`.

`videos.service.js` — in `#processUpload`: `const { wrapped, keyVersion } = wrapKey(key); video.encryption = { wrappedKey: wrapped, iv: iv.toString('hex'), algorithm: 'aes-256-ctr', keyVersion };` and in `stream`: `const key = unwrapKey(video.encryption.wrappedKey, video.encryption.keyVersion || 1);` (also add `+encryption.keyVersion` to both `.select()` calls — it is not `select:false`, so no change needed).

Create `server/src/migrations/002-rewrap-media-keys.js`:

```js
/**
 * Re-wrap every stored per-video key under the CURRENT master key so
 * MEDIA_MASTER_KEY_PREVIOUS can be retired. Safe to re-run: videos already
 * on the current version are skipped.
 */
module.exports = {
  name: '002-rewrap-media-keys',
  async up({ dryRun, log }) {
    const env = require('../config/env');
    const Video = require('../models/Video');
    const { unwrapKey, wrapKey } = require('../core/cryptoUtils');
    const audit = require('../core/audit');
    const stale = await Video.find({ deletedAt: null, status: 'ready', 'encryption.keyVersion': { $ne: env.MEDIA_KEY_VERSION } })
      .select('+encryption.wrappedKey +encryption.iv');
    log(`  ${stale.length} video(s) wrapped under an older key version`);
    if (dryRun) return;
    let done = 0;
    for (const video of stale) {
      const key = unwrapKey(video.encryption.wrappedKey, video.encryption.keyVersion || 1);
      const { wrapped, keyVersion } = wrapKey(key);
      await Video.updateOne({ _id: video._id }, { $set: { 'encryption.wrappedKey': wrapped, 'encryption.keyVersion': keyVersion } });
      done += 1;
    }
    await audit({ action: 'MEDIA_KEY_REWRAPPED', meta: { videos: done, toVersion: env.MEDIA_KEY_VERSION } });
    log(`  re-wrapped ${done} video(s) to version ${env.MEDIA_KEY_VERSION}`);
  },
};
```

`config/constants.js` — add `'MEDIA_KEY_REWRAPPED'` to the ownership & devices group.

`models/Assignment.js` — add `reminderSentAt: { type: Date, default: null },`.

`jobs/index.js` — replace the reminder job:

```js
/** Remind students of assignments due within 24h. reminderSentAt is claimed atomically, so concurrent runs cannot double-send. */
const assignmentDeadlineReminders = async () => {
  const Assignment = require('../models/Assignment');
  const Enrollment = require('../models/Enrollment');
  const Submission = require('../models/Submission');
  const { notifyMany } = require('../modules/notifications/notifications.service');

  const soon = new Date(Date.now() + 24 * 3600000);
  for (;;) {
    const assignment = await Assignment.findOneAndUpdate(
      { deletedAt: null, isPublished: true, reminderSentAt: null, dueAt: { $gte: new Date(), $lte: soon } },
      { $set: { reminderSentAt: new Date() } },
      { new: true }
    ).populate('course', 'title');
    if (!assignment) break;

    const [enrollments, submissions] = await Promise.all([
      Enrollment.find({ course: assignment.course._id, status: 'active' }).select('student'),
      Submission.find({ assignment: assignment._id }).select('student'),
    ]);
    const submitted = new Set(submissions.map((s) => String(s.student)));
    const pending = enrollments.map((e) => e.student).filter((s) => !submitted.has(String(s)));
    await notifyMany(pending, {
      type: 'deadline',
      title: `Due soon: ${assignment.title}`,
      body: `${assignment.course.title} — due ${assignment.dueAt.toLocaleString()}`,
      link: `/student/courses/${assignment.course._id}`,
      course: assignment.course._id,
      email: true,
    });
  }
};
```
Remove `remindedAssignments`; export `assignmentDeadlineReminders`.

- [ ] **Step 4: Verify** — `node --test tests/config.test.js tests/jobs.test.js` → all pass; `npm run lint && npm test` → 102.
- [ ] **Step 5: Commit** — `"sec(media,jobs): versioned media master key with rewrap migration; atomic assignment-reminder dedupe"`.

---

### Task 6: Injection and IDOR sweeps

**Files:**
- Create: `server/tests/injection.test.js`, `server/tests/idor.test.js`
- Modify only what the tests reveal (expected: none — the guards exist; the tests pin them).

- [ ] **Step 1: Write the tests**

`server/tests/injection.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, teacher, courseId;
before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  await app.createUser(admin.token, { name: 'Tea', username: 'tea', password: 'Teach@1234', role: 'teacher' }, 'dev-admin');
  teacher = await app.loginAs('tea', 'Teach@1234', { deviceId: 'dev-tea-01' });
  courseId = (await api('POST', '/courses', { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Inject', description: 'clean' } })).data._id;
});
after(async () => { await app.stop(); });

test('operator objects in credentials are rejected by validation, never reach Mongo', async () => {
  const a = await api('POST', '/auth/login', { deviceId: 'dev-inj-0001', body: { username: { $ne: null }, password: 'x', deviceId: 'dev-inj-0001' } });
  assert.equal(a.status, 400);
  const b = await api('POST', '/auth/login', { deviceId: 'dev-inj-0001', body: { username: 'admin', password: { $gt: '' }, deviceId: 'dev-inj-0001' } });
  assert.equal(b.status, 400);
  const c = await api('POST', '/auth/forgot-password', { deviceId: 'dev-inj-0001', body: { email: { $regex: '.*' } } });
  assert.equal(c.status, 400);
});

test('operator and dotted keys inside an accepted body are stripped', async () => {
  const r = await api('PUT', `/courses/${courseId}`, { token: teacher.token, deviceId: teacher.deviceId, body: { description: 'still clean', $set: { teacher: admin.user.id }, 'teacher.$in': ['x'] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const course = (await api('GET', `/courses/${courseId}`, { token: teacher.token, deviceId: teacher.deviceId })).data.course;
  assert.equal(course.description, 'still clean');
  assert.equal(String(course.teacher._id || course.teacher.id), String(teacher.user.id), 'teacher not reassigned');
});

test('type confusion and $where in query/params are rejected', async () => {
  const arr = await api('GET', '/admin/users?search[]=a&search[]=b', { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(arr.status, 400);
  const where = await api('GET', '/admin/audit-logs?action[$where]=1', { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(where.status, 400);
  const id = await api('GET', '/admin/users/{"$gt":""}', { token: admin.token, deviceId: 'dev-admin' });
  assert.ok([400, 404].includes(id.status));
  const bad = await api('GET', '/admin/users/not-an-id', { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'INVALID_ID');
});
```

`server/tests/idor.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, t1, t2, s1, s2, c1, c2, fileC1, submissionS1, attemptS1, bookmarkS1, threadC1, videoC1;
before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  for (const [n, u, r] of [['Ada', 'ada', 'teacher'], ['Bob', 'bob', 'teacher'], ['Sam', 'sam', 'student'], ['Sue', 'sue', 'student']]) {
    await app.createUser(admin.token, { name: n, username: u, password: r === 'teacher' ? 'Teach@1234' : 'Learn@1234', role: r }, 'dev-admin');
  }
  t1 = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-01' });
  t2 = await app.loginAs('bob', 'Teach@1234', { deviceId: 'dev-bob-01' });
  s1 = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-01' });
  s2 = await app.loginAs('sue', 'Learn@1234', { deviceId: 'dev-sue-01' });
  const as = (s, m, p, body) => api(m, p, { token: s.token, deviceId: s.deviceId, body });
  c1 = (await as(t1, 'POST', '/courses', { title: 'C1', isPublished: true })).data._id;
  c2 = (await as(t2, 'POST', '/courses', { title: 'C2', isPublished: true })).data._id;
  await as(admin, 'POST', `/enrollments/courses/${c1}/students`, { student: 'sam' });
  await as(admin, 'POST', `/enrollments/courses/${c2}/students`, { student: 'sue' });

  const form = new FormData(); form.append('file', new Blob([Buffer.from('%PDF-1.4\n')], { type: 'application/pdf' }), 'c1.pdf');
  fileC1 = (await (await fetch(`${app.baseUrl}/api/v1/files/courses/${c1}/documents`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${t1.token}`, 'x-device-id': t1.deviceId } })).json())._id;

  const assignment = (await as(t1, 'POST', `/assignments/courses/${c1}`, { title: 'A1' })).data;
  submissionS1 = (await as(s1, 'POST', `/assignments/courses/${c1}/${assignment._id}/submit`, { text: 'my work' })).data._id;

  const section = (await as(t1, 'POST', `/courses/${c1}/sections`, { title: 'S' })).data;
  const lesson = (await as(t1, 'POST', `/courses/${c1}/lessons`, { section: section._id, title: 'L', type: 'text', content: 'x' })).data;
  bookmarkS1 = (await as(s1, 'POST', '/bookmarks', { lesson: lesson._id })).data._id;

  const q = (await as(t1, 'POST', `/quizzes/courses/${c1}/questions`, { type: 'true_false', text: 'T?', options: [{ id: 'true', text: 'T', isCorrect: true }, { id: 'false', text: 'F', isCorrect: false }] })).data;
  const quiz = (await as(t1, 'POST', `/quizzes/courses/${c1}`, { title: 'Q', questions: [q._id], isPublished: true })).data;
  attemptS1 = (await as(s1, 'POST', `/quizzes/courses/${c1}/${quiz._id}/start`)).data.attemptId;

  threadC1 = (await as(s1, 'POST', `/qa/courses/${c1}`, { title: 'Help', body: 'Question' })).data._id;
  videoC1 = (await as(t1, 'POST', `/videos/courses/${c1}/uploads`, { originalName: 'v.mp4', sizeBytes: 100 })).data.videoId;
});
after(async () => { await app.stop(); });

const as = (s, m, p, body) => api(m, p, { token: s.token, deviceId: s.deviceId, body });
const denied = (r, label) => assert.ok([403, 404].includes(r.status), `${label}: expected 403/404 got ${r.status} ${JSON.stringify(r.data)}`);

test('cross-course and cross-user object access is denied', async () => {
  denied(await as(s2, 'GET', `/files/${fileC1}/content`), 'file of another course');
  denied(await as(t2, 'GET', `/files/${fileC1}/content`), 'file of another teacher\'s course');
  denied(await as(t2, 'DELETE', `/files/${fileC1}`), 'delete another teacher\'s file');
  denied(await as(s2, 'GET', `/quizzes/attempts/${attemptS1}`), 'another student\'s attempt');
  denied(await as(t2, 'POST', `/assignments/submissions/${submissionS1}/grade`, { points: 100 }), 'grade a submission in another teacher\'s course');
  denied(await as(s2, 'DELETE', `/bookmarks/${bookmarkS1}`), 'another student\'s bookmark');
  denied(await as(s2, 'POST', `/qa/${threadC1}/replies`, { body: 'not enrolled' }), 'reply in a course not enrolled in');
  denied(await as(s2, 'POST', `/videos/${videoC1}/token`), 'stream token for another course');
  denied(await as(t2, 'GET', `/enrollments/courses/${c1}/students`), 'roster of another teacher');
  denied(await as(t2, 'GET', `/videos/courses/${c1}`), 'video list of another course');
  denied(await as(s1, 'POST', `/quizzes/attempts/${attemptS1}/grade`, { grades: [] }), 'student grading');
});

test('the rightful owners still succeed', async () => {
  assert.equal((await as(s1, 'GET', `/quizzes/attempts/${attemptS1}`)).status, 200);
  assert.equal((await as(t1, 'POST', `/assignments/submissions/${submissionS1}/grade`, { points: 90 })).status, 200);
  assert.equal((await as(s1, 'DELETE', `/bookmarks/${bookmarkS1}`)).status, 200);
});
```

- [ ] **Step 2: Run** — `node --test tests/injection.test.js tests/idor.test.js`. Expected: all pass. If `search[]=a` returns 200, the `paginationSchema` `search` coerces arrays — add `z.string()` is already strict; qs parses `search[]` to an array which `z.string()` rejects with 400. If any IDOR line returns 200, that is a real hole: fix in the owning route (add the missing ownership check) and note it in the commit.
- [ ] **Step 3: Full suite + commit** — `npm test` → 107. `"test: NoSQL-injection and IDOR sweeps"`.

---

### Task 7: Device-reset requests and Security Center endpoints

**Files:**
- Create: `server/src/models/DeviceResetRequest.js`, `server/src/modules/admin/security.service.js`, `server/tests/security-center.test.js`
- Modify: `server/src/config/constants.js` (`DEVICE_RESET_REQUESTED`, `DEVICE_RESET_REQUEST_RESOLVED`), `server/src/modules/auth/auth.validators.js` (`resetRequestSchema`), `auth.controller.js` (`requestDeviceReset`), `auth.routes.js`, `server/src/modules/admin/admin.routes.js` (security routes)

**Interfaces:**
- Produces: `POST /auth/device/reset-request { username, note? }` → `202 { message }` (public; `resetRequestIpLimiter` + `resetRequestAccountLimiter`).
- Produces: `GET /admin/device-requests?status=open|resolved|dismissed&page&limit` (`devices.view`); `POST /admin/device-requests/:id/resolve { action: 'revoke'|'dismiss', resolution? }` (`devices.reset`).
- Produces: `GET /admin/security/overview` (`audit.view`) → `{ activeSessions, failedLogins24h, lockedAccounts, deviceResets7d, openResetRequests, suspiciousEvents7d: [{ action, count }], recentSecurityAudit: [...] }`.
- Produces: `GET /admin/devices?search&status&page&limit` (`devices.view`) → paginated `{ items: [{ id, publicId, platform, browser, os, status, firstAuthorizedAt, lastSeenAt, lastIp, user: { id, name, username, role } }], meta }`.

- [ ] **Step 1: Failing test**

Create `server/tests/security-center.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, owner, admin, samId;
before(async () => {
  app = await startApp();
  api = app.api;
  owner = await app.loginAndOnboard(CREDENTIALS.owner.username, CREDENTIALS.owner.password, { deviceId: 'dev-owner' });
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  samId = (await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin')).id;
  await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-laptop' });
});
after(async () => { await app.stop(); });

const as = (s, m, p, body) => api(m, p, { token: s.token, deviceId: s.deviceId, body });
const request = (username, note, ip = '10.1.1.1') => api('POST', '/auth/device/reset-request', { deviceId: 'dev-req-000001', headers: { 'X-Forwarded-For': ip }, body: { username, note } });

test('reset requests: identical replies for known and unknown accounts', async () => {
  const known = await request('sam', 'Lost my laptop');
  const unknown = await request('nobody-here', 'Lost my laptop');
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(known.data, unknown.data);
  assert.equal(known.data.message, 'If the account exists, an administrator will review the request.');
});

test('owner sees the open request; resolving with revoke ends the student session', async () => {
  const list = await as(owner, 'GET', '/admin/device-requests?status=open');
  assert.equal(list.status, 200);
  const req = list.data.items.find((r) => r.username === 'sam');
  assert.ok(req, 'known-account request stored');
  assert.equal(req.user.username, 'sam');
  assert.equal(list.data.items.some((r) => r.username === 'nobody-here'), false, 'unknown accounts are not stored');

  const resolve = await as(admin, 'POST', `/admin/device-requests/${req._id}/resolve`, { action: 'revoke', resolution: 'Verified by phone' });
  assert.equal(resolve.status, 200, JSON.stringify(resolve.data));
  const dev = await as(admin, 'GET', `/admin/users/${samId}/device`);
  assert.equal(dev.data.active, null);
  const again = await as(owner, 'GET', '/admin/device-requests?status=resolved');
  assert.ok(again.data.items.some((r) => String(r._id) === String(req._id)));
});

test('admin cannot resolve a request that targets the owner with revoke', async () => {
  await request('owner', 'pretend');
  const req = (await as(owner, 'GET', '/admin/device-requests?status=open')).data.items.find((r) => r.username === 'owner');
  const r = await as(admin, 'POST', `/admin/device-requests/${req._id}/resolve`, { action: 'revoke' });
  assert.equal(r.status, 403);
  assert.equal(r.data.code, 'OWNER_PROTECTED');
  const dismiss = await as(owner, 'POST', `/admin/device-requests/${req._id}/resolve`, { action: 'dismiss', resolution: 'Not the owner' });
  assert.equal(dismiss.status, 200);
});

test('reset-request rate buckets', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await request(`user${i}`, 'x', '10.2.2.2')).status, 202);
  assert.equal((await request('user9', 'x', '10.2.2.2')).status, 429, 'per-IP: 3 per hour');
  for (let i = 0; i < 3; i++) assert.equal((await request('sue', 'x', `10.3.3.${i + 1}`)).status, 202);
  assert.equal((await request('sue', 'x', '10.3.3.9')).status, 429, 'per-username: 3 per day');
});

test('security overview counts move with events', async () => {
  const before = (await as(owner, 'GET', '/admin/security/overview')).data;
  await api('POST', '/auth/login', { deviceId: 'dev-sam-laptop', body: { username: 'sam', password: 'WrongPass1', deviceId: 'dev-sam-laptop' } });
  const after = (await as(owner, 'GET', '/admin/security/overview')).data;
  assert.equal(after.failedLogins24h, before.failedLogins24h + 1);
  assert.ok(after.activeSessions >= 2);
  assert.ok(Array.isArray(after.suspiciousEvents7d));
  assert.ok(after.recentSecurityAudit.length >= 1);
  assert.equal(typeof after.openResetRequests, 'number');
});

test('platform device list is paginated, searchable and hides hashes', async () => {
  const r = await as(owner, 'GET', '/admin/devices?search=sam');
  assert.equal(r.status, 200);
  assert.ok(r.data.meta);
  assert.ok(r.data.items.every((d) => d.deviceKeyHash === undefined));
  assert.ok(r.data.items.some((d) => d.user.username === 'sam'));
});
```

Note: the rate-bucket test runs with the harness multiplier (100), so the limits are 300/hour and 300/day — it would not trip. Put `process.env.RATE_LIMIT_MULTIPLIER = '1';` as the **first line** of this file (same trick as `ratelimit.test.js`). With `1`, `loginAccountLimiter` (10/15 min) is not a concern here: only the sam/wrong-password login and the setup logins touch it.

- [ ] **Step 2: Run to see it fail** — 404 on the new routes.

- [ ] **Step 3: Implement**

`config/constants.js` — add `'DEVICE_RESET_REQUESTED', 'DEVICE_RESET_REQUEST_RESOLVED'` to the ownership & devices group.

Create `server/src/models/DeviceResetRequest.js`:

```js
const mongoose = require('mongoose');

/** A student's self-service "I lost my device" request, reviewed by an administrator. */
const deviceResetRequestSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, lowercase: true, trim: true, maxlength: 50 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '', maxlength: 300 },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolution: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

deviceResetRequestSchema.index({ status: 1, createdAt: -1 });
deviceResetRequestSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('DeviceResetRequest', deviceResetRequestSchema);
```

`auth.validators.js` — `const resetRequestSchema = z.object({ username: z.string().min(3).max(50).trim().toLowerCase(), note: z.string().max(300).trim().optional().default('') });` + export.

`auth.controller.js`:
```js
const requestDeviceReset = asyncHandler(async (req, res) => {
  await DeviceService.requestReset({ username: req.body.username, note: req.body.note, ip: clientIp(req), userAgent: req.headers['user-agent'] || '' });
  res.status(202).json({ message: 'If the account exists, an administrator will review the request.' });
});
```
export it. `auth.routes.js` (public section):
```js
router.post('/device/reset-request', resetRequestIpLimiter, resetRequestAccountLimiter, validate(v.resetRequestSchema), c.requestDeviceReset);
```

`device.service.js` — add:
```js
  /** Store a reset request only when the account exists; the caller's reply is identical either way. */
  static async requestReset({ username, note, ip, userAgent }) {
    const DeviceResetRequest = require('../../models/DeviceResetRequest');
    const user = await User.findOne({ username: String(username).toLowerCase(), deletedAt: null }).select('_id');
    await audit({ user: user?._id, action: 'DEVICE_RESET_REQUESTED', targetUser: user?._id, ip, meta: { username, known: !!user } });
    if (!user) return null;
    const open = await DeviceResetRequest.findOne({ user: user._id, status: 'open' });
    if (open) return open; // one open request per account
    return DeviceResetRequest.create({ username, user: user._id, note, ip, userAgent });
  }
```

Create `server/src/modules/admin/security.service.js`:

```js
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { paginatedQuery } = require('../../core/pagination');
const Session = require('../../models/Session');
const LoginHistory = require('../../models/LoginHistory');
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');
const Device = require('../../models/Device');
const DeviceResetRequest = require('../../models/DeviceResetRequest');
const AdminService = require('./admin.service');
const DeviceService = require('../auth/device.service');

const SUSPICIOUS = ['DEVICE_LOGIN_REJECTED', 'DEVICE_MISMATCH', 'TOKEN_REUSE_DETECTED', 'OWNER_ACTION_BLOCKED', 'ACCOUNT_LOCKED'];
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

class SecurityService {
  static async overview() {
    const [activeSessions, failedLogins24h, lockedAccounts, deviceResets7d, openResetRequests, suspicious, recent] = await Promise.all([
      Session.countDocuments({ isActive: true }),
      LoginHistory.countDocuments({ success: false, createdAt: { $gte: daysAgo(1) } }),
      User.countDocuments({ deletedAt: null, lockedUntil: { $gt: new Date() } }),
      AuditLog.countDocuments({ action: 'DEVICE_REVOKED', createdAt: { $gte: daysAgo(7) } }),
      DeviceResetRequest.countDocuments({ status: 'open' }),
      AuditLog.aggregate([
        { $match: { action: { $in: SUSPICIOUS }, createdAt: { $gte: daysAgo(7) } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $project: { _id: 0, action: '$_id', count: 1 } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.find({ action: { $in: SUSPICIOUS } }).sort({ createdAt: -1 }).limit(20)
        .populate('user', 'name username role').populate('targetUser', 'name username').lean(),
    ]);
    return { activeSessions, failedLogins24h, lockedAccounts, deviceResets7d, openResetRequests, suspiciousEvents7d: suspicious, recentSecurityAudit: recent };
  }

  static async listDevices({ page, limit, search, status }) {
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const users = await User.find({ $or: [{ name: regex }, { username: regex }, { email: regex }] }).select('_id');
      filter.user = { $in: users.map((u) => u._id) };
    }
    const result = await paginatedQuery(Device, filter, {
      page, limit, sort: { lastSeenAt: -1 }, populate: { path: 'user', select: 'name username role' },
    });
    result.items = result.items.map((d) => ({
      id: d._id, publicId: d.publicId, platform: d.platform, browser: d.browser, os: d.os, status: d.status,
      firstAuthorizedAt: d.firstAuthorizedAt, lastSeenAt: d.lastSeenAt, lastIp: d.lastIp, revokedAt: d.revokedAt, revocationReason: d.revocationReason,
      user: d.user ? { id: d.user._id, name: d.user.name, username: d.user.username, role: d.user.role } : null,
    }));
    return result;
  }

  static async listResetRequests({ page, limit, status = 'open' }) {
    return paginatedQuery(DeviceResetRequest, { status }, {
      page, limit, sort: { createdAt: -1 },
      populate: [{ path: 'user', select: 'name username role' }, { path: 'resolvedBy', select: 'name username' }],
    });
  }

  static async resolveResetRequest(actor, requestId, { action, resolution }, ip) {
    const request = await DeviceResetRequest.findOne({ _id: requestId, status: 'open' });
    if (!request) throw ApiError.notFound('Open request not found');
    if (action === 'revoke') {
      await AdminService.revokeUserDevice(actor, request.user, resolution || `Device reset request approved`, ip);
    }
    request.status = action === 'revoke' ? 'resolved' : 'dismissed';
    request.resolvedBy = actor.id;
    request.resolvedAt = new Date();
    request.resolution = resolution || '';
    await request.save();
    await audit({ user: actor.id, action: 'DEVICE_RESET_REQUEST_RESOLVED', targetUser: request.user, ip, meta: { action, requestId: String(request._id) } });
    return request;
  }
}

module.exports = SecurityService;
```

(`AdminService.revokeUserDevice` already runs `assertCanManage`, which is what makes the owner-targeted revoke return `OWNER_PROTECTED` for an admin. `DeviceService` import is unused only if lint says so — drop it then.)

`admin.routes.js` — add (import `SecurityService`):

```js
// Security Center
const resolveSchema = z.object({ action: z.enum(['revoke', 'dismiss']), resolution: z.string().trim().max(300).optional() });
const deviceListQuery = paginationSchema.extend({ status: z.enum(['active', 'revoked']).optional() });
const requestListQuery = paginationSchema.extend({ status: z.enum(['open', 'resolved', 'dismissed']).optional() });

router.get('/security/overview', requirePermission(P.AUDIT_VIEW), asyncHandler(async (req, res) => {
  res.json(await SecurityService.overview());
}));
router.get('/devices', requirePermission(P.DEVICES_VIEW), validate(deviceListQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await SecurityService.listDevices(req.query));
}));
router.get('/device-requests', requirePermission(P.DEVICES_VIEW), validate(requestListQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await SecurityService.listResetRequests(req.query));
}));
router.post('/device-requests/:requestId/resolve', requirePermission(P.DEVICES_RESET), validate(resolveSchema), asyncHandler(async (req, res) => {
  res.json(await SecurityService.resolveResetRequest(req.user, req.params.requestId, req.body, req.ip));
}));
```

- [ ] **Step 4: Verify** — `node --test tests/security-center.test.js` → 6 pass; `npm run lint && npm test` → 113.
- [ ] **Step 5: Commit** — `"feat(security): device-reset requests, security overview, platform device list"`.

---

### Task 8: Client — navigation, Admins page, Security Center, reset-request form

**Files:**
- Create: `client/src/pages/admin/AdminAdmins.jsx`, `client/src/pages/admin/AdminSecurity.jsx`
- Modify: `client/src/utils/roles.js` (nav lists), `client/src/layouts/MainLayout.jsx` (use the lists), `client/src/App.jsx` (two owner routes), `client/src/pages/admin/AdminUsers.jsx` (role tabs + `initialRole` prop), `client/src/pages/auth/LoginPage.jsx` (reset-request form)

- [ ] **Step 1: Navigation from one place**

`utils/roles.js` — append:

```js
export const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: 'LayoutDashboard', end: true },
  { to: '/admin/users', label: 'Users', icon: 'Users' },
  { to: '/admin/courses', label: 'Courses', icon: 'BookOpen' },
  { to: '/admin/sessions', label: 'Sessions', icon: 'MonitorSmartphone' },
  { to: '/admin/anticheat', label: 'Cheat Reports', icon: 'ShieldAlert' },
  { to: '/admin/announcements', label: 'Announcements', icon: 'Megaphone' },
  { to: '/admin/audit', label: 'Audit', icon: 'ScrollText' },
  { to: '/admin/settings', label: 'Settings', icon: 'Settings' },
];
export const OWNER_NAV = [
  { to: '/admin/security', label: 'Security', icon: 'ShieldCheck' },
  { to: '/admin/admins', label: 'Admins', icon: 'UserCog' },
];
```

`MainLayout.jsx` — import `ShieldCheck, UserCog` from lucide; build an `ICONS` map `{ LayoutDashboard, Users, BookOpen, MonitorSmartphone, ShieldAlert, Megaphone, ScrollText, Settings, ShieldCheck, UserCog, GraduationCap, Award, Bookmark, Library }`; keep `NAV.student` and `NAV.teacher` as they are (converted to the same `{ icon: 'Name' }` string form), set `NAV.admin = ADMIN_NAV`; compute:

```jsx
  const base = NAV[isAdminRole(user?.role) ? 'admin' : user?.role] || [];
  const nav = user?.role === 'super_admin' ? [...base.slice(0, -1), ...OWNER_NAV, base[base.length - 1]] : base;
```
(Owner items sit before Settings.) Render `const Icon = ICONS[icon];`.

- [ ] **Step 2: Routes** — `App.jsx`: import the two pages and add

```jsx
                <Route path="/admin/security" element={<Protected roles={['super_admin']}><AdminSecurity /></Protected>} />
                <Route path="/admin/security/:tab" element={<Protected roles={['super_admin']}><AdminSecurity /></Protected>} />
                <Route path="/admin/admins" element={<Protected roles={['super_admin']}><AdminAdmins /></Protected>} />
```

- [ ] **Step 3: `AdminUsers` role tabs**

Above the filter row add `<Tabs tabs={[{ key: '', label: 'All' }, { key: 'student', label: 'Students' }, { key: 'teacher', label: 'Teachers' }, ...(isOwner ? [{ key: 'admin', label: 'Admins' }] : [])]} active={filters.role} onChange={(role) => { setPage(1); setFilters((f) => ({ ...f, role })); }} />` and remove the role `<Select>` (the tab is the filter). Accept an optional prop `initialRole` used as the initial `filters.role`.

- [ ] **Step 4: `AdminAdmins.jsx`**

```jsx
import { useEffect, useState, useCallback } from 'react';
import { Plus, KeyRound, LogOut, Smartphone, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { Card, Button, Modal, Input, Badge, Spinner, EmptyState, PageHeader } from '../../components/ui';

const STATUS_COLORS = { active: 'green', suspended: 'amber', banned: 'red' };

/** Owner-only: the administrators who run the institution day to day. */
export default function AdminAdmins() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [devices, setDevices] = useState({});
  const [createModal, setCreateModal] = useState(false);
  const [resetModal, setResetModal] = useState(null);
  const [revokeModal, setRevokeModal] = useState(null);
  const [reason, setReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });

  const load = useCallback(async () => {
    const { data } = await api.get('/admin/users', { params: { role: 'admin', limit: 100 } });
    setRows(data.items);
    const entries = await Promise.all(data.items.map((u) => api.get(`/admin/users/${u._id}/device`).then((r) => [u._id, r.data.active]).catch(() => [u._id, null])));
    setDevices(Object.fromEntries(entries));
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); await load(); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };

  const createAdmin = () => run(async () => {
    await api.post('/admin/users', { ...form, email: form.email || undefined, role: 'admin', mustChangePassword: true });
    setCreateModal(false); setForm({ name: '', username: '', email: '', password: '' });
  }, 'Administrator created — they must change their password at first sign-in');
  const setStatus = (u, status) => run(() => api.post(`/admin/users/${u._id}/status`, { status }), `${u.name} is now ${status}`);
  const forceLogout = (u) => run(() => api.post(`/admin/users/${u._id}/force-logout`), 'All sessions ended');
  const resetPassword = () => run(async () => { await api.post(`/admin/users/${resetModal._id}/reset-password`, { password: newPassword }); setResetModal(null); setNewPassword(''); }, 'Password reset');
  const revokeDevice = () => run(async () => { await api.post(`/admin/users/${revokeModal._id}/device/revoke`, { reason }); setRevokeModal(null); setReason(''); }, 'Device revoked');

  if (!rows) return <Spinner full />;
  return (
    <div className="space-y-5">
      <PageHeader title="Administrators" subtitle="Operational admins. Only you can create, suspend or reset them." gold
        actions={<Button variant="gold" onClick={() => setCreateModal(true)}><Plus size={15} /> New administrator</Button>} />
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <EmptyState icon={<ShieldCheck size={24} />} title="No administrators yet" /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-400 dark:border-surface-700">
              <th className="px-4 py-3">Administrator</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Device</th><th className="px-4 py-3">Last login</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u._id} className="border-b border-surface-100 dark:border-surface-700/50">
                  <td className="px-4 py-3"><p className="font-medium text-surface-800 dark:text-surface-100">{u.name}</p><p className="text-xs text-surface-400">@{u.username}{u.email && ` · ${u.email}`}</p></td>
                  <td className="px-4 py-3"><Badge color={STATUS_COLORS[u.status] || 'gray'}>{u.status}</Badge>{u.mustChangePassword && <Badge className="ml-1" color="amber">onboarding</Badge>}</td>
                  <td className="px-4 py-3 text-xs">{devices[u._id] ? <span className="font-mono">{devices[u._id].publicId} · {devices[u._id].platform}</span> : <span className="text-surface-400">none</span>}</td>
                  <td className="px-4 py-3 text-surface-400">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" title="Reset password" onClick={() => setResetModal(u)}><KeyRound size={14} /></Button>
                    <Button size="sm" variant="ghost" title="Force logout" onClick={() => forceLogout(u)}><LogOut size={14} /></Button>
                    {devices[u._id] && <Button size="sm" variant="ghost" title="Revoke device" onClick={() => setRevokeModal(u)}><Smartphone size={14} /></Button>}
                    {u.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'suspended')}>Suspend</Button> : <Button size="sm" variant="ghost" onClick={() => setStatus(u, 'active')}>Activate</Button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="New administrator">
        <div className="space-y-4">
          <Input label="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Username" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))} />
          <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label="Temporary password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} hint="8+ chars, upper + lower + digit. Forced change at first sign-in." />
          <Button className="w-full" loading={busy} onClick={createAdmin} disabled={!form.name || form.username.length < 3 || form.password.length < 8}>Create administrator</Button>
        </div>
      </Modal>
      <Modal open={!!resetModal} onClose={() => setResetModal(null)} title={`Reset password — ${resetModal?.name || ''}`}>
        <div className="space-y-4">
          <Input label="New temporary password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Button className="w-full" loading={busy} onClick={resetPassword} disabled={newPassword.length < 8}>Reset password</Button>
        </div>
      </Modal>
      <Modal open={!!revokeModal} onClose={() => setRevokeModal(null)} title={`Revoke device — ${revokeModal?.name || ''}`}>
        <div className="space-y-4">
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button className="w-full" variant="danger" loading={busy} onClick={revokeDevice} disabled={reason.trim().length < 3}>Revoke device</Button>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: `AdminSecurity.jsx`** — tabs `overview | devices | requests | policies` from `useParams().tab` (default `overview`), navigating with `navigate('/admin/security/' + key)`.

  - **Overview**: five `StatCard`s (`MonitorSmartphone` active sessions, `LogIn` failed logins 24 h — color `rose` when > 0, `Lock` locked accounts, `Smartphone` device resets 7 d, `Inbox` open requests — `gold` when > 0), a "Suspicious events (7 days)" list of `action → count` badges, and the recent security audit rows (action badge, actor, target, time) reusing the row markup from `AdminAudit.jsx`.
  - **Devices**: search input (300 ms debounce), status select, table (user, role, public id, platform · browser · os, first authorised, last seen, ip, status) with a Revoke button that opens the reason modal and calls `POST /admin/users/:userId/device/revoke`; `Pagination`.
  - **Requests**: status tabs open / resolved / dismissed; each row shows user, note, requested at, ip; open rows have **Approve & revoke** (reason prefilled "Device reset request approved") and **Dismiss** buttons calling `POST /admin/device-requests/:id/resolve`.
  - **Policies**: the five owner-only settings only (`sessionTimeoutMinutes` select, `maxLoginAttempts`, `lockoutMinutes`, `requireEmailVerification`, `deviceBindingEnabled`) with a Save button calling `PUT /admin/settings` with just those keys; a note that everything else lives in Settings.

  Data calls: `GET /admin/security/overview`, `GET /admin/devices`, `GET /admin/device-requests`, `GET /admin/settings`.

- [ ] **Step 6: `LoginPage` reset-request form** — under the device-blocked banner add a link "Request a device reset"; clicking shows a small inline form (username prefilled from the login field, optional note ≤ 300) posting to `/auth/device/reset-request`; on 202 show *Request sent. An administrator will review it.* and hide the form; on 429 show the server message.

- [ ] **Step 7: Verify** — `cd client && npx eslint src/pages/admin/AdminAdmins.jsx src/pages/admin/AdminSecurity.jsx src/utils/roles.js src/layouts/MainLayout.jsx src/App.jsx src/pages/admin/AdminUsers.jsx src/pages/auth/LoginPage.jsx && npm run build`. Manual: sign in as the owner → Security and Admins appear before Settings; an admin does not see them and `/admin/security` redirects home.
- [ ] **Step 8: Commit** — `"feat(client): owner Security Center, Admins page, reorganised admin nav, device-reset request form"`.

---

### Task 9: Docs, final verification, merge

- [ ] **Step 1: Docs**
  - `docs/SECURITY.md` — **File & video protection**: uploads are validated by extension, declared MIME, magic bytes and an executable-header heuristic; when `CLAMAV_HOST` is set every upload is also scanned by ClamAV and uploads fail closed if the daemon is unreachable; *the heuristic alone is not antivirus*. Add **Media key rotation** (versioned wrap, `MEDIA_MASTER_KEY_PREVIOUS`, `npm run migrate` → `002-rewrap-media-keys`, stream tokens are 5-minute so rotation only interrupts in-flight streams). **Brute force**: the two login buckets and the other new buckets. **One account, one device**: the reset-request flow (public, identical replies, 3/h per IP, 3/day per account, reviewed by admins in the Security Center). **Logging**: tokens/codes redacted from request logs; production never logs mail bodies. **XSS**: reviewed — no HTML rendering anywhere; lesson content, announcements, Q&A and feedback are rendered as text.
  - `docs/API.md` — `POST /auth/device/reset-request` (P, 202), `GET /admin/security/overview`, `GET /admin/devices`, `GET /admin/device-requests`, `POST /admin/device-requests/:id/resolve`; `POST /quizzes/attempts/:id/answers` gains `clientSavedAt`; new `503 SCANNER_UNAVAILABLE`.
  - `README.md` — Key features: mention ClamAV seam and the Security Center; production checklist: `CLAMAV_HOST`, distinct secrets, `MEDIA_KEY_VERSION`.
  - `CLAUDE.md` — `core/clamav.js`, `core/redact.js`, `modules/admin/security.service.js`, rate-limit buckets and `RATE_LIMIT_MULTIPLIER`, the `keyVersion` invariant (never rotate `MEDIA_MASTER_KEY` without setting PREVIOUS and running migration 002).
- [ ] **Step 2: Full verification** — `cd server && npm run lint && npm test` (expect 113 pass), `cd client && npm run build`, `git status` clean.
- [ ] **Step 3: Commit docs, then finish** — `"docs: security sweep — uploads/ClamAV, key rotation, rate buckets, reset requests, Security Center"`; then the finishing-a-development-branch flow (merge to `main`, re-run suite, tag `security-sweep-v1`).
