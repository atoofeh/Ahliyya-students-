const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, teacher, otherTeacher, student, outsider, course, otherCourse;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=', 'base64');
const as = (session, method, url, body) => api(method, url, { token: session.token, deviceId: session.deviceId, body });

const upload = async (session, url, { name = 'photo.png', type = 'image/png', bytes = PNG, extra = {} } = {}) => {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), name);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  const response = await fetch(`${app.baseUrl}/api/v1${url}`, {
    method: 'POST', body: form,
    headers: { Authorization: `Bearer ${session.token}`, 'x-device-id': session.deviceId },
  });
  return { status: response.status, data: await response.json() };
};

const content = (session, fileId) => fetch(`${app.baseUrl}/api/v1/files/${fileId}/content`, {
  headers: { Authorization: `Bearer ${session.token}`, 'x-device-id': session.deviceId },
});

before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'announcement-admin' });
  for (const [username, role] of [['annteacher', 'teacher'], ['annother', 'teacher'], ['annstudent', 'student'], ['annoutsider', 'student']]) {
    await app.createUser(admin.token, { name: username, username, role, password: 'Test@12345' }, admin.deviceId);
  }
  teacher = await app.loginAs('annteacher', 'Test@12345', { deviceId: 'announcement-teacher' });
  otherTeacher = await app.loginAs('annother', 'Test@12345', { deviceId: 'announcement-other' });
  student = await app.loginAs('annstudent', 'Test@12345', { deviceId: 'announcement-student' });
  outsider = await app.loginAs('annoutsider', 'Test@12345', { deviceId: 'announcement-outsider' });
  course = (await as(teacher, 'POST', '/courses', { title: 'Photo announcements', isPublished: true })).data;
  otherCourse = (await as(otherTeacher, 'POST', '/courses', { title: 'Private other course', isPublished: true })).data;
  const enrolled = await as(admin, 'POST', `/enrollments/courses/${course._id}/students`, { student: 'annstudent' });
  assert.equal(enrolled.status, 201, JSON.stringify(enrolled.data));
});
after(async () => { await app.stop(); });

test('a course announcement carries a private photo that only course readers can fetch', async () => {
  const photo = await upload(teacher, `/files/courses/${course._id}/images`);
  assert.equal(photo.status, 201, JSON.stringify(photo.data));
  const created = await as(teacher, 'POST', `/announcements/courses/${course._id}`, {
    title: 'Class photo', body: 'Read this with the photo.', image: photo.data._id, requestId: randomUUID(),
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.image, photo.data._id);
  assert.equal(created.data.storagePath, undefined);

  const feed = await as(student, 'GET', '/announcements/feed');
  assert.equal(feed.data.find((a) => a._id === created.data._id)?.image, photo.data._id);
  const allowed = await content(student, photo.data._id);
  assert.equal(allowed.status, 200);
  assert.deepEqual(Buffer.from(await allowed.arrayBuffer()), PNG);
  const denied = await content(outsider, photo.data._id);
  assert.equal(denied.status, 403);
  await denied.arrayBuffer();
  const outsiderFeed = await as(outsider, 'GET', '/announcements/feed');
  assert.equal(outsiderFeed.data.some((a) => a._id === created.data._id), false);
});

test('students and unrelated teachers cannot publish or upload course announcement photos', async () => {
  const body = { title: 'Unauthorized', body: 'No access', requestId: randomUUID() };
  assert.equal((await as(student, 'POST', `/announcements/courses/${course._id}`, body)).status, 403);
  assert.equal((await as(otherTeacher, 'POST', `/announcements/courses/${course._id}`, body)).status, 403);
  assert.equal((await upload(student, `/files/courses/${course._id}/images`)).status, 403);
  assert.equal((await as(teacher, 'POST', '/announcements/global', body)).status, 403);
});

test('attachments must be the author’s raster photo in the same course and scope', async () => {
  const foreign = await upload(otherTeacher, `/files/courses/${otherCourse._id}/images`);
  const anotherAuthor = await upload(admin, `/files/courses/${course._id}/images`);
  const document = await upload(teacher, `/files/courses/${course._id}/documents`, {
    name: 'notes.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4\nnotes'),
  });
  const svg = await upload(teacher, `/files/courses/${course._id}/images`, {
    name: 'vector.svg', type: 'image/svg+xml', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), extra: { scope: 'thumbnail' },
  });
  for (const asset of [foreign, anotherAuthor, document, svg]) {
    assert.equal(asset.status, 201, JSON.stringify(asset.data));
    const rejected = await as(teacher, 'POST', `/announcements/courses/${course._id}`, {
      title: 'Invalid attachment', body: 'Should be refused', image: asset.data._id, requestId: randomUUID(),
    });
    assert.equal(rejected.status, 400, JSON.stringify(rejected.data));
    assert.equal(rejected.data.code, 'ANNOUNCEMENT_IMAGE_INVALID');
  }
});

test('parallel retries publish and notify only once; a new request can intentionally repeat the content', async () => {
  const Announcement = require('../src/models/Announcement');
  const Notification = require('../src/models/Notification');
  const body = { title: 'One pending send', body: 'Repeated clicks are one publish.', requestId: randomUUID() };
  const results = await Promise.all(Array.from({ length: 3 }, () => as(teacher, 'POST', `/announcements/courses/${course._id}`, body)));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 201]);
  assert.equal(new Set(results.map((r) => r.data._id)).size, 1);
  assert.equal(await Announcement.countDocuments({ author: teacher.user.id, requestId: body.requestId }), 1);
  assert.equal(await Notification.countDocuments({ user: student.user.id, title: `${course.title}: ${body.title}` }), 1);

  const changed = await as(teacher, 'POST', `/announcements/courses/${course._id}`, { ...body, body: 'Different content' });
  assert.equal(changed.status, 409);
  assert.equal(changed.data.code, 'ANNOUNCEMENT_REQUEST_REUSED');

  const intentional = await as(teacher, 'POST', `/announcements/courses/${course._id}`, { ...body, requestId: randomUUID() });
  assert.equal(intentional.status, 201);
  assert.notEqual(intentional.data._id, results[0].data._id);
  assert.equal(await Notification.countDocuments({ user: student.user.id, title: `${course.title}: ${body.title}` }), 2);
});

test('a global photo uses the authorized news upload and remains available to signed-in students', async () => {
  const photo = await upload(admin, '/files/news-image');
  assert.equal(photo.status, 201, JSON.stringify(photo.data));
  const body = { title: 'Global photo', body: 'For the whole platform', image: photo.data._id, requestId: randomUUID() };
  const created = await as(admin, 'POST', '/announcements/global', body);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const replay = await as(admin, 'POST', '/announcements/global', body);
  assert.equal(replay.status, 200);
  assert.equal(replay.data._id, created.data._id);
  const allowed = await content(outsider, photo.data._id);
  assert.equal(allowed.status, 200);
  assert.deepEqual(Buffer.from(await allowed.arrayBuffer()), PNG);
  const anonymous = await fetch(`${app.baseUrl}/api/v1/files/${photo.data._id}/content`);
  assert.equal(anonymous.status, 401);
  await anonymous.arrayBuffer();
});

test('invalid IDs, blank content, and deleted photos are rejected before publishing', async () => {
  const body = { title: 'Validation', body: 'Message', requestId: randomUUID() };
  assert.equal((await as(teacher, 'POST', `/announcements/courses/${course._id}`, { ...body, image: 'invalid' })).status, 400);
  assert.equal((await as(teacher, 'POST', `/announcements/courses/${course._id}`, { ...body, title: '   ' })).status, 400);
  const photo = await upload(teacher, `/files/courses/${course._id}/images`);
  const FileAsset = require('../src/models/FileAsset');
  await FileAsset.updateOne({ _id: photo.data._id }, { $set: { deletedAt: new Date() } });
  const rejected = await as(teacher, 'POST', `/announcements/courses/${course._id}`, { ...body, image: photo.data._id });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.data.code, 'ANNOUNCEMENT_IMAGE_INVALID');
});
