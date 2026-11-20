/**
 * Completed course access test.
 *
 * Verifies that when a student finishes course requirements and their enrollment
 * status transitions to 'completed', they retain full access to course materials,
 * lessons, bookmarks, and files, rather than being locked out with NOT_ENROLLED.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');
const Enrollment = require('../src/models/Enrollment');
const User = require('../src/models/User');

let app, api, admin, teacher, student, studentDoc;
let course, section, lesson;

before(async () => {
  app = await startApp();
  api = app.api;

  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Teacher T', username: 'teachert', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Student S', username: 'students', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');

  teacher = await app.loginAs('teachert', 'Teach@1234', { deviceId: 'dev-teach-01' });
  student = await app.loginAs('students', 'Learn@1234', { deviceId: 'dev-stud-01' });
  studentDoc = await User.findOne({ username: 'students' });

  // Create course
  const courseRes = await api('POST', '/courses', {
    token: teacher.token,
    deviceId: teacher.deviceId,
    body: { title: 'Physiology', category: 'Medicine', visibility: 'listed', isPublished: true },
  });
  assert.equal(courseRes.status, 201);
  course = courseRes.data;

  // Add section & lesson
  const secRes = await api('POST', `/courses/${course._id}/sections`, {
    token: teacher.token,
    deviceId: teacher.deviceId,
    body: { title: 'Introduction' },
  });
  section = secRes.data;

  const lesRes = await api('POST', `/courses/${course._id}/lessons`, {
    token: teacher.token,
    deviceId: teacher.deviceId,
    body: { section: section._id, title: 'Cellular physiology', type: 'text', content: 'lesson content' },
  });
  lesson = lesRes.data;

  // Enroll student
  const enrRes = await api('POST', `/enrollments/courses/${course._id}/students`, {
    token: admin.token,
    deviceId: admin.deviceId,
    body: { student: 'students' },
  });
  assert.equal(enrRes.status, 201);
});

after(async () => {
  await app.stop();
});

test('active student can access course detail and lessons', async () => {
  const res = await api('GET', `/courses/${course._id}`, { token: student.token, deviceId: student.deviceId });
  assert.equal(res.status, 200);
  assert.equal(res.data.course._id, course._id);

  const lesRes = await api('GET', `/courses/${course._id}/lessons/${lesson._id}`, { token: student.token, deviceId: student.deviceId });
  assert.equal(lesRes.status, 200);
});

test('when enrollment status transitions to completed, student retains course access', async () => {
  // Simulate completion: status set to 'completed'
  const updateRes = await Enrollment.updateOne(
    { student: studentDoc._id, course: course._id },
    { $set: { status: 'completed', progressPercent: 100, completedAt: new Date() } }
  );
  assert.equal(updateRes.modifiedCount, 1);

  // Student should STILL have full access to course detail
  const res = await api('GET', `/courses/${course._id}`, { token: student.token, deviceId: student.deviceId });
  assert.equal(res.status, 200, 'Student with completed status must not be refused with 403 NOT_ENROLLED');
  assert.equal(res.data.course._id, course._id);

  // Student should STILL have access to lessons
  const lesRes = await api('GET', `/courses/${course._id}/lessons/${lesson._id}`, { token: student.token, deviceId: student.deviceId });
  assert.equal(lesRes.status, 200);

  // Course preview should reflect enrollment
  const prevRes = await api('GET', `/courses/${course._id}/preview`, { token: student.token, deviceId: student.deviceId });
  assert.equal(prevRes.status, 200);
  assert.equal(prevRes.data.enrolled, true);

  // Bookmarks should still work
  const bmRes = await api('POST', '/bookmarks', {
    token: student.token,
    deviceId: student.deviceId,
    body: { lesson: lesson._id, note: 'Important point' },
  });
  assert.equal(bmRes.status, 201);
});

test('completed student cannot be double-enrolled via code', async () => {
  // Generate code
  const codeRes = await api('POST', `/enrollments/courses/${course._id}/codes`, {
    token: admin.token,
    deviceId: admin.deviceId,
    body: { count: 1 },
  });
  assert.equal(codeRes.status, 201);
  const code = Array.isArray(codeRes.data) ? codeRes.data[0].code : codeRes.data.codes[0].code;

  // Redeem code by completed student should return 409 ALREADY_ENROLLED
  const redeemRes = await api('POST', '/enrollments/redeem', {
    token: student.token,
    deviceId: student.deviceId,
    body: { code },
  });
  assert.equal(redeemRes.status, 409);
  assert.equal(redeemRes.data.code, 'ALREADY_ENROLLED');
});
