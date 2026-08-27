/**
 * End-to-end API smoke test. Boots the app on an ephemeral port against the
 * (in-memory-capable) database and walks the core user journeys:
 *
 *   admin login → create teacher & student → teacher builds course/quiz →
 *   codes → student enrolls → takes quiz (with anti-cheat events) →
 *   grading → analytics → admin controls (settings, force logout).
 *
 * Run: npm test
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable-forces-memory';

const assert = require('assert');

const { connectDB, disconnectDB } = require('../src/config/db');
const app = require('../src/app');
const seed = require('../src/seed');

let baseUrl;
let passed = 0;
const results = [];

const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    results.push(`  ✓ ${name}`);
  } catch (err) {
    results.push(`  ✗ ${name}: ${err.message}`);
    throw Object.assign(new Error(`${name} — ${err.message}`), { results });
  }
};

const api = async (method, path, { token, body, headers = {} } = {}) => {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': headers.deviceId || 'device-test-0001',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

const main = async () => {
  await connectDB();
  await seed();
  const server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  let adminToken, teacherToken, studentToken, courseId, sectionId, quizId, attemptId, studentId;

  await test('health check', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
  });

  await test('admin login', async () => {
    const { status, data } = await api('POST', '/auth/login', {
      body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@12345', deviceId: 'device-admin-01' },
    });
    assert.equal(status, 200, data.message);
    adminToken = data.accessToken;
  });

  await test('login rejects bad password + records history', async () => {
    const { status } = await api('POST', '/auth/login', {
      body: { username: 'admin', password: 'WrongPass1', deviceId: 'device-admin-01' },
    });
    assert.equal(status, 401);
  });

  await test('admin creates teacher', async () => {
    const { status, data } = await api('POST', '/admin/users', {
      token: adminToken,
      body: { name: 'Prof. Ada', username: 'ada', email: 'ada@lms.local', password: 'Teach@1234', role: 'teacher', mustChangePassword: false },
    });
    assert.equal(status, 201, data.message);
  });

  await test('admin creates student', async () => {
    const { status, data } = await api('POST', '/admin/users', {
      token: adminToken,
      body: { name: 'Student Sam', username: 'sam', email: 'sam@lms.local', password: 'Learn@1234', role: 'student', mustChangePassword: false },
    });
    assert.equal(status, 201, data.message);
    studentId = data.id;
  });

  await test('teacher login', async () => {
    const { status, data } = await api('POST', '/auth/login', {
      body: { username: 'ada', password: 'Teach@1234', deviceId: 'device-teach-01' },
    });
    assert.equal(status, 200, data.message);
    teacherToken = data.accessToken;
  });

  await test('teacher creates course', async () => {
    const { status, data } = await api('POST', '/courses', {
      token: teacherToken,
      body: { title: 'Intro to Networks', description: 'CCNA prep', category: 'IT', difficulty: 'beginner', visibility: 'private', isPublished: true },
    });
    assert.equal(status, 201, data.message);
    courseId = data._id;
  });

  await test('teacher adds section + lesson', async () => {
    const s = await api('POST', `/courses/${courseId}/sections`, { token: teacherToken, body: { title: 'Week 1' } });
    assert.equal(s.status, 201, s.data.message);
    sectionId = s.data._id;
    const l = await api('POST', `/courses/${courseId}/lessons`, {
      token: teacherToken,
      body: { section: sectionId, title: 'OSI Model', type: 'text', content: 'Seven layers...', durationMinutes: 10 },
    });
    assert.equal(l.status, 201, l.data.message);
  });

  await test('teacher creates questions (multiple types)', async () => {
    const mc = await api('POST', `/quizzes/courses/${courseId}/questions`, {
      token: teacherToken,
      body: {
        type: 'multiple_choice', text: 'Which layer routes packets?',
        options: [
          { id: 'a', text: 'Layer 2', isCorrect: false },
          { id: 'b', text: 'Layer 3', isCorrect: true },
          { id: 'c', text: 'Layer 7', isCorrect: false },
        ],
        points: 2, explanation: 'Network layer routes.', tags: ['osi'],
      },
    });
    assert.equal(mc.status, 201, JSON.stringify(mc.data));

    const tf = await api('POST', `/quizzes/courses/${courseId}/questions`, {
      token: teacherToken,
      body: {
        type: 'true_false', text: 'TCP is connectionless.',
        options: [
          { id: 'true', text: 'True', isCorrect: false },
          { id: 'false', text: 'False', isCorrect: true },
        ],
      },
    });
    assert.equal(tf.status, 201, JSON.stringify(tf.data));

    const sa = await api('POST', `/quizzes/courses/${courseId}/questions`, {
      token: teacherToken,
      body: { type: 'short_answer', text: 'Protocol for secure shell?', correctAnswers: ['ssh'], points: 1 },
    });
    assert.equal(sa.status, 201, JSON.stringify(sa.data));

    const fb = await api('POST', `/quizzes/courses/${courseId}/questions`, {
      token: teacherToken,
      body: { type: 'fill_blanks', text: 'HTTP uses port {{blank}} and HTTPS uses {{blank}}.', correctAnswers: ['80', '443'] },
    });
    assert.equal(fb.status, 201, JSON.stringify(fb.data));

    const essay = await api('POST', `/quizzes/courses/${courseId}/questions`, {
      token: teacherToken,
      body: { type: 'essay', text: 'Explain the three-way handshake.', points: 5 },
    });
    assert.equal(essay.status, 201, JSON.stringify(essay.data));
  });

  let questionIds;
  await test('teacher lists question bank (sees answers)', async () => {
    const { status, data } = await api('GET', `/quizzes/courses/${courseId}/questions?limit=50`, { token: teacherToken });
    assert.equal(status, 200);
    assert.equal(data.items.length, 5);
    questionIds = data.items.map((q) => q._id);
    const mc = data.items.find((q) => q.type === 'multiple_choice');
    assert.ok(mc.options.some((o) => o.isCorrect === true), 'teacher view must include isCorrect');
  });

  await test('teacher creates + publishes quiz', async () => {
    const { status, data } = await api('POST', `/quizzes/courses/${courseId}`, {
      token: teacherToken,
      body: {
        title: 'Week 1 Quiz', questions: questionIds, timeLimitMinutes: 30,
        passingScore: 50, maxAttempts: 2, isPublished: true,
        shuffleQuestions: false, shuffleAnswers: false, showResultsImmediately: true, showExplanations: true,
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
    quizId = data._id;
  });

  let accessCode;
  await test('teacher blocked from generating access codes', async () => {
    const { status } = await api('POST', `/enrollments/courses/${courseId}/codes`, {
      token: teacherToken, body: { count: 2, maxUses: 1 },
    });
    assert.equal(status, 403);
  });

  await test('admin generates access codes', async () => {
    const { status, data } = await api('POST', `/enrollments/courses/${courseId}/codes`, {
      token: adminToken, body: { count: 2, maxUses: 1 },
    });
    assert.equal(status, 201, JSON.stringify(data));
    accessCode = data[0].code;
  });

  await test('student login', async () => {
    const { status, data } = await api('POST', '/auth/login', {
      body: { username: 'sam', password: 'Learn@1234', deviceId: 'device-stud-01' },
    });
    assert.equal(status, 200, data.message);
    studentToken = data.accessToken;
  });

  await test('student blocked from course before enrollment', async () => {
    const { status } = await api('GET', `/courses/${courseId}`, { token: studentToken });
    assert.equal(status, 403);
  });

  await test('student redeems code + sees course', async () => {
    const r = await api('POST', '/enrollments/redeem', { token: studentToken, body: { code: accessCode } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const c = await api('GET', `/courses/${courseId}`, { token: studentToken });
    assert.equal(c.status, 200);
    assert.equal(c.data.curriculum.length, 1);
  });

  await test('student starts quiz — no answer leakage', async () => {
    const { status, data } = await api('POST', `/quizzes/courses/${courseId}/${quizId}/start`, { token: studentToken });
    assert.equal(status, 201, JSON.stringify(data));
    attemptId = data.attemptId;
    assert.equal(data.questions.length, 5);
    for (const q of data.questions) {
      assert.equal(q.correctAnswers, undefined, 'correctAnswers must not leak');
      assert.equal(q.explanation, undefined, 'explanation must not leak');
      for (const o of q.options || []) assert.equal(o.isCorrect, undefined, 'isCorrect must not leak');
    }
  });

  await test('anti-cheat events recorded', async () => {
    const { status, data } = await api('POST', '/anticheat/events', {
      token: studentToken,
      body: { attemptId, events: [{ type: 'tab_switch' }, { type: 'copy' }, { type: 'devtools_open' }] },
    });
    assert.equal(status, 200, JSON.stringify(data));
    assert.ok(data.riskScore > 0);
  });

  await test('student submits quiz — auto-grading + essay pending', async () => {
    const start = await api('GET', `/quizzes/attempts/${attemptId}`, { token: studentToken });
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
      token: studentToken, body: { answers },
    });
    assert.equal(status, 200, JSON.stringify(data.message));
    assert.equal(data.pendingManualGrading, true);
    // Auto-graded portion: 2 (mc) + 1 (tf) + 1 (sa) + 1 (fb) = 5 of 10 max.
    assert.equal(data.score, 5, `expected 5 got ${data.score}`);
  });

  await test('teacher grades essay — attempt finalized', async () => {
    const attempt = await api('GET', `/quizzes/attempts/${attemptId}`, { token: teacherToken });
    const essayQ = attempt.data.questionsSnapshot.find((q) => q.type === 'essay');
    const { status, data } = await api('POST', `/quizzes/attempts/${attemptId}/grade`, {
      token: teacherToken,
      body: { grades: [{ questionId: essayQ.questionId, points: 4, feedback: 'Good, mention flags explicitly.' }] },
    });
    assert.equal(status, 200, JSON.stringify(data));
    assert.equal(data.score, 9);
    assert.equal(data.status, 'graded');
    assert.equal(data.passed, true);
  });

  await test('cheat report visible to teacher', async () => {
    const { status, data } = await api('GET', `/anticheat/attempts/${attemptId}`, { token: teacherToken });
    assert.equal(status, 200);
    assert.equal(data.events.length, 3);
  });

  await test('quiz stats + student analytics', async () => {
    const s = await api('GET', `/quizzes/courses/${courseId}/${quizId}/stats`, { token: teacherToken });
    assert.equal(s.status, 200);
    assert.equal(s.data.attempts, 1);
    const d = await api('GET', '/analytics/student', { token: studentToken });
    assert.equal(d.status, 200);
    assert.equal(d.data.stats.enrolledCourses, 1);
  });

  await test('teacher forbidden from admin + other course isolation', async () => {
    const a = await api('GET', '/admin/users', { token: teacherToken });
    assert.equal(a.status, 403);
  });

  await test('teacher forbidden from enrolling student directly', async () => {
    const res = await api('POST', `/enrollments/courses/${courseId}/students`, {
      token: teacherToken, body: { student: 'sam' },
    });
    assert.equal(res.status, 403);
  });

  await test('admin can enroll student directly', async () => {
    const stud = await api('POST', '/admin/users', {
      token: adminToken,
      body: { name: 'Direct Student', username: 'directstud', email: 'direct@lms.local', password: 'Learn@1234', role: 'student', mustChangePassword: false },
    });
    assert.equal(stud.status, 201);

    const res = await api('POST', `/enrollments/courses/${courseId}/students`, {
      token: adminToken, body: { student: 'directstud' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
  });

  await test('single-session: second login kills first session', async () => {
    const second = await api('POST', '/auth/login', {
      body: { username: 'sam', password: 'Learn@1234', deviceId: 'device-stud-02' },
    });
    assert.equal(second.status, 200);
    const old = await api('GET', '/auth/me', { token: studentToken });
    assert.equal(old.status, 401);
    assert.equal(old.data.code, 'SESSION_TERMINATED');
    studentToken = second.data.accessToken;
  });

  await test('admin settings update + audit logs', async () => {
    const upd = await api('PUT', '/admin/settings', { token: adminToken, body: { sessionTimeoutMinutes: 45 } });
    assert.equal(upd.status, 200);
    assert.equal(upd.data.settings.sessionTimeoutMinutes, 45);
    const logs = await api('GET', '/admin/audit-logs?limit=50', { token: adminToken });
    assert.equal(logs.status, 200);
    assert.ok(logs.data.items.length >= 5);
  });

  await test('admin suspends student → student locked out', async () => {
    const users = await api('GET', '/admin/users?role=student', { token: adminToken });
    const sam = users.data.items.find((u) => u.username === 'sam');
    const susp = await api('POST', `/admin/users/${sam._id}/status`, { token: adminToken, body: { status: 'suspended' } });
    assert.equal(susp.status, 200);
    const me = await api('GET', '/auth/me', { token: studentToken });
    assert.ok([401, 403].includes(me.status));
    await api('POST', `/admin/users/${sam._id}/status`, { token: adminToken, body: { status: 'active' } });
  });

  await test('global search (admin)', async () => {
    const { status, data } = await api('GET', '/search?q=Networks', { token: adminToken });
    assert.equal(status, 200);
    assert.ok(data.courses.length >= 1);
  });

  console.log('\nSmoke test results:');
  console.log(results.join('\n'));
  console.log(`\n${passed} tests passed ✅`);

  server.close();
  await disconnectDB();
  process.exit(0);
};

main().catch(async (err) => {
  console.log('\nSmoke test results:');
  console.log((err.results || results).join('\n'));
  console.error(`\n❌ FAILED: ${err.message}`);
  process.exit(1);
});
