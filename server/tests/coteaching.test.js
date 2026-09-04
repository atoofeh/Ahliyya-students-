/**
 * Co-teaching and the teacher's authority over their own roster.
 *
 * The whole point of Course.coTeachers is that an accepted colleague is
 * indistinguishable from the creator everywhere authority is checked. These
 * tests assert both halves: the co-teacher gains the authority, and a teacher
 * who was never invited gains nothing.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, ada, bob, carl, sam, courseId, inviteId;

before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Ada', username: 'ada', email: 'ada@test.local', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Bob', username: 'bob', email: 'bob@test.local', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Carl', username: 'carl', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  ada = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-0001' });
  bob = await app.loginAs('bob', 'Teach@1234', { deviceId: 'dev-bob-0001' });
  carl = await app.loginAs('carl', 'Teach@1234', { deviceId: 'dev-carl-001' });
  sam = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-0001' });

  const course = await api('POST', '/courses', {
    token: ada.token, deviceId: ada.deviceId,
    body: { title: 'Shared Course', category: 'Test', isPublished: true },
  });
  courseId = course.data._id;
  await api('POST', `/enrollments/courses/${courseId}/students`, {
    token: admin.token, deviceId: 'dev-admin-01', body: { student: 'sam' },
  });
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });

test('an uninvited teacher has no access to the course', async () => {
  assert.equal((await as(bob, 'GET', `/courses/${courseId}`)).status, 403);
  assert.equal((await as(bob, 'PUT', `/courses/${courseId}`, { description: 'nope' })).status, 403);
  assert.equal((await as(bob, 'GET', `/co-teaching/courses/${courseId}`)).status, 403);
});

test('only a teacher account can be invited, and never twice', async () => {
  const student = await as(ada, 'POST', `/co-teaching/courses/${courseId}/invite`, { teacher: 'sam' });
  assert.equal(student.status, 400);
  assert.equal(student.data.code, 'TEACHER_NOT_FOUND');

  // A missing account gets the identical answer — no username probing.
  const ghost = await as(ada, 'POST', `/co-teaching/courses/${courseId}/invite`, { teacher: 'nobodyhere' });
  assert.equal(ghost.data.code, 'TEACHER_NOT_FOUND');
  assert.equal(ghost.data.message, student.data.message);

  const self = await as(ada, 'POST', `/co-teaching/courses/${courseId}/invite`, { teacher: 'ada' });
  assert.equal(self.data.code, 'ALREADY_CO_TEACHER');

  const first = await as(ada, 'POST', `/co-teaching/courses/${courseId}/invite`, { teacher: 'bob@test.local' });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  inviteId = first.data._id;

  const again = await as(ada, 'POST', `/co-teaching/courses/${courseId}/invite`, { teacher: 'bob' });
  assert.equal(again.status, 409);
  assert.equal(again.data.code, 'INVITE_EXISTS');
});

test('an invitation can only be answered by the teacher it names', async () => {
  const mine = await as(bob, 'GET', '/co-teaching/invitations');
  assert.equal(mine.data.items.length, 1);
  assert.equal(mine.data.items[0].course.title, 'Shared Course');

  assert.equal((await as(carl, 'GET', '/co-teaching/invitations')).data.items.length, 0);
  assert.equal((await as(carl, 'POST', `/co-teaching/invitations/${inviteId}/accept`)).status, 404);
  assert.equal((await as(sam, 'POST', `/co-teaching/invitations/${inviteId}/accept`)).status, 404);
  // Still Bob's to answer.
  assert.equal((await as(bob, 'GET', '/co-teaching/invitations')).data.items.length, 1);
});

test('accepting grants the same authority as the creator', async () => {
  const accept = await as(bob, 'POST', `/co-teaching/invitations/${inviteId}/accept`);
  assert.equal(accept.status, 200, JSON.stringify(accept.data));

  assert.equal((await as(bob, 'GET', `/courses/${courseId}`)).status, 200);
  assert.equal((await as(bob, 'PUT', `/courses/${courseId}`, { description: 'co-taught' })).status, 200);
  assert.equal((await as(bob, 'GET', `/enrollments/courses/${courseId}/students`)).status, 200);
  assert.equal((await as(bob, 'POST', `/courses/${courseId}/sections`, { title: 'Bob week' })).status, 201);

  // And the course now appears in his own course list.
  const mine = await as(bob, 'GET', '/courses/mine');
  assert.ok(mine.data.items.some((c) => String(c._id) === String(courseId)), 'co-taught course missing from /courses/mine');

  // The invitation is spent.
  assert.equal((await as(bob, 'GET', '/co-teaching/invitations')).data.items.length, 0);
  assert.equal((await as(bob, 'POST', `/co-teaching/invitations/${inviteId}/accept`)).status, 404);

  const roster = await as(ada, 'GET', `/co-teaching/courses/${courseId}`);
  assert.equal(roster.data.coTeachers.length, 1);
  assert.equal(roster.data.coTeachers[0].username, 'bob');
  assert.equal(roster.data.pendingInvites.length, 0);
});

test('accepting does not leak authority to any other teacher', async () => {
  assert.equal((await as(carl, 'GET', `/courses/${courseId}`)).status, 403);
  assert.equal((await as(carl, 'DELETE', `/enrollments/courses/${courseId}/students/${sam.user.id}`)).status, 403);
  assert.equal((await as(carl, 'POST', `/co-teaching/courses/${courseId}/invite`, { teacher: 'bob' })).status, 403);
});

test('a teacher can remove a student from their own course', async () => {
  assert.equal((await as(sam, 'GET', `/courses/${courseId}`)).status, 200);

  const kick = await as(ada, 'DELETE', `/enrollments/courses/${courseId}/students/${sam.user.id}`);
  assert.equal(kick.status, 200, JSON.stringify(kick.data));

  const after = await as(sam, 'GET', `/courses/${courseId}`);
  assert.equal(after.status, 403);
  assert.equal(after.data.code, 'NOT_ENROLLED');
});

test('a co-teacher can remove a student too, but cannot remove a teacher', async () => {
  await api('POST', `/enrollments/courses/${courseId}/students`, {
    token: admin.token, deviceId: 'dev-admin-01', body: { student: 'sam' },
  });
  assert.equal((await as(bob, 'DELETE', `/enrollments/courses/${courseId}/students/${sam.user.id}`)).status, 200);

  // Bob did not create the course, so he cannot rearrange its teaching staff —
  // otherwise an invited colleague could remove the person who invited them.
  const coup = await as(bob, 'DELETE', `/co-teaching/courses/${courseId}/teachers/${ada.user.id}`);
  assert.equal(coup.status, 403);
  assert.equal(coup.data.code, 'NOT_COURSE_CREATOR');
});

test('the creator can remove a co-teacher, and access ends immediately', async () => {
  const creator = await as(ada, 'DELETE', `/co-teaching/courses/${courseId}/teachers/${ada.user.id}`);
  assert.equal(creator.data.code, 'CANNOT_REMOVE_CREATOR');

  assert.equal((await as(ada, 'DELETE', `/co-teaching/courses/${courseId}/teachers/${bob.user.id}`)).status, 200);
  assert.equal((await as(bob, 'GET', `/courses/${courseId}`)).status, 403);
  assert.equal((await as(bob, 'PUT', `/courses/${courseId}`, { description: 'still mine?' })).status, 403);

  const mine = await as(bob, 'GET', '/courses/mine');
  assert.ok(!mine.data.items.some((c) => String(c._id) === String(courseId)));

  // Removing twice is a clean 404, not a silent success.
  assert.equal((await as(ada, 'DELETE', `/co-teaching/courses/${courseId}/teachers/${bob.user.id}`)).status, 404);
});

test('an invitation can be declined, and withdrawn before it is answered', async () => {
  const inv = await as(ada, 'POST', `/co-teaching/courses/${courseId}/invite`, { teacher: 'bob' });
  assert.equal(inv.status, 201);
  assert.equal((await as(bob, 'POST', `/co-teaching/invitations/${inv.data._id}/decline`)).status, 200);
  assert.equal((await as(bob, 'GET', '/co-teaching/invitations')).data.items.length, 0);
  assert.equal((await as(bob, 'GET', `/courses/${courseId}`)).status, 403);

  const second = await as(ada, 'POST', `/co-teaching/courses/${courseId}/invite`, { teacher: 'bob' });
  assert.equal(second.status, 201, 'declining must free the slot for a new invitation');
  assert.equal((await as(ada, 'POST', `/co-teaching/courses/${courseId}/invites/${second.data._id}/cancel`)).status, 200);
  assert.equal((await as(bob, 'GET', '/co-teaching/invitations')).data.items.length, 0);
  assert.equal((await as(bob, 'POST', `/co-teaching/invitations/${second.data._id}/accept`)).status, 404);
});

test('students and unauthenticated callers cannot touch the co-teaching API', async () => {
  assert.equal((await as(sam, 'GET', '/co-teaching/invitations')).data.items.length, 0);
  assert.equal((await as(sam, 'POST', `/co-teaching/courses/${courseId}/invite`, { teacher: 'bob' })).status, 403);
  assert.equal((await api('GET', '/co-teaching/invitations')).status, 401);
});
