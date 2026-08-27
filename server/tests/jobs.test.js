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
  const a = await api('POST', `/assignments/courses/${course._id}`, { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Due soon', dueAt } });
  assert.equal(a.status, 201, JSON.stringify(a.data));
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
