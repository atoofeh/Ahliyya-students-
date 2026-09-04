/**
 * Q&A moderation: a student's question reaches the rest of the course only
 * after a teacher approves it. A rejected question must never become visible
 * to anyone but its author and the course staff.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, ada, zoe, sam, sue, courseId;

const ask = (session, title, body = 'Please explain.') =>
  api('POST', `/qa/courses/${courseId}`, { token: session.token, deviceId: session.deviceId, body: { title, body } });

const titles = (res) => res.data.items.map((t) => t.title);

before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Ada', username: 'ada', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Zoe', username: 'zoe', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Sue', username: 'sue', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  ada = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-0001' });
  zoe = await app.loginAs('zoe', 'Teach@1234', { deviceId: 'dev-zoe-0001' });
  sam = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-0001' });
  sue = await app.loginAs('sue', 'Learn@1234', { deviceId: 'dev-sue-0001' });

  const course = await api('POST', '/courses', {
    token: ada.token, deviceId: ada.deviceId, body: { title: 'Moderated Course', category: 'Test', isPublished: true },
  });
  courseId = course.data._id;
  for (const student of ['sam', 'sue']) {
    await api('POST', `/enrollments/courses/${courseId}/students`, {
      token: admin.token, deviceId: 'dev-admin-01', body: { student },
    });
  }
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });

test('a new question is held pending and notifies the teacher', async () => {
  const asked = await ask(sam, 'Is the exam open book?');
  assert.equal(asked.status, 201);
  assert.equal(asked.data.status, 'pending');

  const notes = await as(ada, 'GET', '/notifications');
  assert.ok(
    notes.data.items.some((n) => n.title.includes('awaiting approval')),
    'the course teacher was not notified of the new question'
  );
});

test('a pending question is invisible to other students but visible to its author', async () => {
  const other = await as(sue, 'GET', `/qa/courses/${courseId}`);
  assert.deepEqual(titles(other), [], 'a pending question leaked to another student');

  const author = await as(sam, 'GET', `/qa/courses/${courseId}`);
  assert.deepEqual(titles(author), ['Is the exam open book?']);
  assert.equal(author.data.items[0].status, 'pending');
});

test('the teacher sees the queue with a pending count and can filter it', async () => {
  const queue = await as(ada, 'GET', `/qa/courses/${courseId}?status=pending`);
  assert.equal(queue.status, 200);
  assert.equal(queue.data.pendingCount, 1);
  assert.deepEqual(titles(queue), ['Is the exam open book?']);
  assert.deepEqual(titles(await as(ada, 'GET', `/qa/courses/${courseId}?status=approved`)), []);
});

test('nobody may reply to a question that has not been approved', async () => {
  const threadId = (await as(sam, 'GET', `/qa/courses/${courseId}`)).data.items[0]._id;
  const bySue = await as(sue, 'POST', `/qa/${threadId}/replies`, { body: 'me too' });
  assert.equal(bySue.status, 403);
  assert.equal(bySue.data.code, 'QA_NOT_APPROVED');
  assert.equal((await as(sam, 'POST', `/qa/${threadId}/replies`, { body: 'bump' })).data.code, 'QA_NOT_APPROVED');
});

test('only the course teachers can moderate', async () => {
  const threadId = (await as(sam, 'GET', `/qa/courses/${courseId}`)).data.items[0]._id;
  assert.equal((await as(sam, 'POST', `/qa/${threadId}/approve`)).status, 403);
  assert.equal((await as(sue, 'POST', `/qa/${threadId}/reject`, {})).status, 403);
  assert.equal((await as(zoe, 'POST', `/qa/${threadId}/approve`)).status, 403);
  // Untouched.
  assert.equal((await as(ada, 'GET', `/qa/courses/${courseId}`)).data.pendingCount, 1);
});

test('a rejected question never reaches the rest of the course', async () => {
  const threadId = (await as(sam, 'GET', `/qa/courses/${courseId}`)).data.items[0]._id;
  const rejected = await as(ada, 'POST', `/qa/${threadId}/reject`, { reason: 'Covered in the syllabus.' });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.status, 'rejected');

  assert.deepEqual(titles(await as(sue, 'GET', `/qa/courses/${courseId}`)), [], 'a rejected question leaked');
  assert.equal((await as(sue, 'POST', `/qa/${threadId}/replies`, { body: 'hi' })).data.code, 'QA_NOT_APPROVED');

  // The author is told what happened rather than left wondering.
  const mine = await as(sam, 'GET', `/qa/courses/${courseId}`);
  assert.equal(mine.data.items[0].status, 'rejected');
  assert.equal(mine.data.items[0].rejectionReason, 'Covered in the syllabus.');
  const notes = await as(sam, 'GET', '/notifications');
  assert.ok(notes.data.items.some((n) => n.title.includes('not published')));
});

test('an approved question becomes visible and open for replies', async () => {
  await ask(sam, 'When is the deadline?');
  const threadId = (await as(ada, 'GET', `/qa/courses/${courseId}?status=pending`)).data.items[0]._id;
  assert.equal((await as(ada, 'POST', `/qa/${threadId}/approve`)).data.status, 'approved');

  assert.deepEqual(titles(await as(sue, 'GET', `/qa/courses/${courseId}`)), ['When is the deadline?']);
  assert.equal((await as(sue, 'POST', `/qa/${threadId}/replies`, { body: 'good question' })).status, 201);
  assert.equal((await as(ada, 'GET', `/qa/courses/${courseId}`)).data.pendingCount, 0);
});

test('a teacher answering a pending question approves it in the same step', async () => {
  await ask(sue, 'Can we use a calculator?');
  const threadId = (await as(ada, 'GET', `/qa/courses/${courseId}?status=pending`)).data.items[0]._id;

  const reply = await as(ada, 'POST', `/qa/${threadId}/replies`, { body: 'Yes, a basic one.' });
  assert.equal(reply.status, 201);
  assert.equal(reply.data.status, 'approved');
  assert.ok(titles(await as(sam, 'GET', `/qa/courses/${courseId}`)).includes('Can we use a calculator?'));
});

test("a teacher's own question does not wait for the teacher's approval", async () => {
  const posted = await ask(ada, 'Reminder: read chapter 4');
  assert.equal(posted.data.status, 'approved');
  assert.ok(titles(await as(sam, 'GET', `/qa/courses/${courseId}`)).includes('Reminder: read chapter 4'));
});

test('a student cannot fake the moderation state of their own question', async () => {
  const asked = await api('POST', `/qa/courses/${courseId}`, {
    token: sam.token, deviceId: sam.deviceId,
    body: { title: 'Sneaky', body: 'x', status: 'approved', moderatedBy: sam.user.id },
  });
  assert.equal(asked.status, 201);
  assert.equal(asked.data.status, 'pending', 'a student set their own question to approved');
  assert.equal(asked.data.moderatedBy, null);
  assert.ok(!titles(await as(sue, 'GET', `/qa/courses/${courseId}`)).includes('Sneaky'));
});
