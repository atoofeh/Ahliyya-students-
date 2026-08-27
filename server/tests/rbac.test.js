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
  t1 = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-01' });
  t2 = await app.loginAs('bob', 'Teach@1234', { deviceId: 'dev-bob-01' });
  s1 = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-01' });
  s2 = await app.loginAs('sue', 'Learn@1234', { deviceId: 'dev-sue-01' });

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
  forbidden(await as(admin, 'POST', '/admin/users', { name: 'A2', username: 'adm2', password: 'Admin@12345', role: 'admin' }), 'create admin');
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
