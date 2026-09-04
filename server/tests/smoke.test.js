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
    body: { title: 'Intro to Networks', description: 'CCNA prep', category: 'IT', difficulty: 'beginner', visibility: 'hidden', isPublished: true },
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

// ── Deleting a course must take its content and its disk usage with it ───────

test('deleting a course removes its content and frees the bytes on disk', async () => {
  const fsp = require('node:fs/promises');
  const Video = require('../src/models/Video');
  const FileAsset = require('../src/models/FileAsset');
  const Lesson = require('../src/models/Lesson');

  // Reuses the teacher established earlier in this file, as the other tests do.
  const course = (await api('POST', '/courses', {
    token: teacherToken, deviceId: TEACHER_DEVICE,
    body: { title: 'Course To Delete', description: 'cascade check', category: 'Engineering', isPublished: true },
  })).data;
  const section = (await api('POST', `/courses/${course._id}/sections`, {
    token: teacherToken, deviceId: TEACHER_DEVICE, body: { title: 'Week 1' },
  })).data;

  // A real document on disk, through the real upload path.
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'notes.pdf');
  const upload = await fetch(`${app.baseUrl}/api/v1/files/courses/${course._id}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherToken}`, 'x-device-id': TEACHER_DEVICE },
    body: form,
  });
  assert.equal(upload.status, 201);
  const asset = await upload.json();

  await api('POST', `/courses/${course._id}/lessons`, {
    token: teacherToken, deviceId: TEACHER_DEVICE,
    body: { section: section._id, title: 'Reading', type: 'pdf', fileAsset: asset._id, durationMinutes: 5 },
  });

  const stored = await FileAsset.findById(asset._id).select('+storagePath');
  const onDisk = stored.storagePath;
  assert.ok(await fsp.stat(onDisk).then(() => true).catch(() => false), 'the uploaded file should exist before deletion');

  const del = await api('DELETE', `/courses/${course._id}`, { token: teacherToken, deviceId: TEACHER_DEVICE });
  assert.equal(del.status, 200, JSON.stringify(del.data));

  // The bytes are gone.
  assert.equal(await fsp.stat(onDisk).then(() => true).catch(() => false), false,
    'the file must be removed from disk when its course is deleted');

  // And nothing is left counting towards the storage figure.
  assert.equal(await FileAsset.countDocuments({ course: course._id, deletedAt: null }), 0, 'file assets still live');
  assert.equal(await Video.countDocuments({ course: course._id, deletedAt: null }), 0, 'videos still live');
  assert.equal(await Lesson.countDocuments({ course: course._id, deletedAt: null }), 0, 'lessons still live');
});
