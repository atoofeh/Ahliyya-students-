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
  // hpp collapses repeated/array params to a single value before validation, so the
  // request is either normalised (200, plain string search) or rejected (400) — never a crash.
  const arr = await api('GET', '/admin/users?search[]=a&search[]=b', { token: admin.token, deviceId: 'dev-admin' });
  assert.ok([200, 400].includes(arr.status), `array-for-string: ${arr.status}`);
  if (arr.status === 200) assert.ok(Array.isArray(arr.data.items));
  const where = await api('GET', '/admin/audit-logs?action[$where]=1', { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(where.status, 400);
  const id = await api('GET', '/admin/users/{"$gt":""}', { token: admin.token, deviceId: 'dev-admin' });
  assert.ok([400, 404].includes(id.status));
  const bad = await api('GET', '/admin/users/not-an-id', { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'INVALID_ID');
});
