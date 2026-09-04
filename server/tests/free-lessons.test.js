/**
 * Free lessons — the replacement for public courses.
 *
 * A teacher lists a course and marks individual lessons free. Any signed-in
 * user can then find the course and open exactly those lessons; everything
 * else still needs an enrollment. Self-enrolment no longer exists at all.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, ada, zoe, sam, sue;
let listed, hidden, draft;

const makeCourse = async (session, body) =>
  (await api('POST', '/courses', { token: session.token, deviceId: session.deviceId, body })).data;

/** A course with one free lesson and one paid lesson. */
const buildCurriculum = async (session, courseId) => {
  const section = (await api('POST', `/courses/${courseId}/sections`, {
    token: session.token, deviceId: session.deviceId, body: { title: 'Week 1' },
  })).data;
  const lesson = async (title, extra) => (await api('POST', `/courses/${courseId}/lessons`, {
    token: session.token, deviceId: session.deviceId,
    body: { section: section._id, title, type: 'text', content: `notes for ${title}`, ...extra },
  })).data;
  return {
    free: await lesson('Free intro', { isFree: true }),
    paid: await lesson('Paid deep dive', { isFree: false }),
    unpublished: await lesson('Free but unpublished', { isFree: true, isPublished: false }),
  };
};

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

  listed = await makeCourse(ada, { title: 'Listed Course', category: 'Test', visibility: 'listed', isPublished: true });
  listed.lessons = await buildCurriculum(ada, listed._id);

  hidden = await makeCourse(ada, { title: 'Hidden Course', category: 'Test', visibility: 'hidden', isPublished: true });
  hidden.lessons = await buildCurriculum(ada, hidden._id);

  draft = await makeCourse(ada, { title: 'Draft Course', category: 'Test', visibility: 'listed', isPublished: false });
  draft.lessons = await buildCurriculum(ada, draft._id);

  await api('POST', `/enrollments/courses/${listed._id}/students`, {
    token: admin.token, deviceId: 'dev-admin-01', body: { student: 'sam' },
  });
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });
const lessonPath = (course, key) => `/courses/${course._id}/lessons/${course.lessons[key]._id}`;

test('the public-course visibility is gone from the API', async () => {
  const rejected = await as(ada, 'POST', '/courses', { title: 'Old style', category: 'Test', visibility: 'public' });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.data.code, 'VALIDATION_ERROR');
  // A course created with no visibility must not be discoverable by default.
  const quiet = await makeCourse(ada, { title: 'Default Visibility', category: 'Test', isPublished: true });
  assert.equal(quiet.visibility, 'hidden');
});

test('open self-enrolment no longer exists', async () => {
  const gone = await as(sue, 'POST', `/enrollments/courses/${listed._id}/enroll`);
  assert.equal(gone.status, 404, 'students must not be able to enrol themselves any more');
  assert.equal((await as(sue, 'GET', `/courses/${listed._id}`)).data.code, 'NOT_ENROLLED');
});

test('the catalog lists only listed, published courses', async () => {
  const catalog = await as(sue, 'GET', '/courses/catalog');
  const found = catalog.data.items.map((c) => c.title);
  assert.ok(found.includes('Listed Course'));
  assert.ok(!found.includes('Hidden Course'), 'a hidden course appeared in the catalog');
  assert.ok(!found.includes('Draft Course'), 'an unpublished course appeared in the catalog');
});

test('a signed-in outsider can preview a listed course, seeing only its free lessons', async () => {
  const preview = await as(sue, 'GET', `/courses/${listed._id}/preview`);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.course.title, 'Listed Course');
  assert.equal(preview.data.enrolled, false);
  assert.deepEqual(preview.data.freeLessons.map((l) => l.title), ['Free intro'],
    'the preview must expose the free lesson and nothing else');
  assert.equal(preview.data.lessonCount, 2);
  // The preview is a shop window, not the curriculum.
  assert.equal(preview.data.course.completionThreshold, undefined);
});

test('a free lesson opens for anyone signed in; the rest of the course does not', async () => {
  const free = await as(sue, 'GET', lessonPath(listed, 'free'));
  assert.equal(free.status, 200, JSON.stringify(free.data));
  assert.equal(free.data.title, 'Free intro');
  assert.equal(free.data.content, 'notes for Free intro');

  const paid = await as(sue, 'GET', lessonPath(listed, 'paid'));
  assert.equal(paid.status, 403);
  assert.equal(paid.data.code, 'NOT_ENROLLED');

  // Another teacher is just as much an outsider here.
  assert.equal((await as(zoe, 'GET', lessonPath(listed, 'free'))).status, 200);
  assert.equal((await as(zoe, 'GET', lessonPath(listed, 'paid'))).status, 403);

  // And a signature is still required.
  assert.equal((await api('GET', lessonPath(listed, 'free'))).status, 401);
});

test('previewing does not create progress for someone who is not enrolled', async () => {
  const LessonProgress = require('../src/models/LessonProgress');
  await as(sue, 'GET', lessonPath(listed, 'free'));
  const rows = await LessonProgress.countDocuments({ student: sue.user.id });
  assert.equal(rows, 0, 'a preview viewer must not get progress records');
});

test('free lessons on a hidden or unpublished course stay shut', async () => {
  for (const course of [hidden, draft]) {
    assert.equal((await as(sue, 'GET', `/courses/${course._id}/preview`)).status, 404, `${course.title} preview`);
    assert.equal((await as(sue, 'GET', lessonPath(course, 'free'))).status, 403, `${course.title} free lesson`);
  }
});

test('an unpublished lesson is not free even when the flag is set', async () => {
  assert.equal((await as(sue, 'GET', lessonPath(listed, 'unpublished'))).status, 403);
  const preview = await as(sue, 'GET', `/courses/${listed._id}/preview`);
  assert.ok(!preview.data.freeLessons.some((l) => l.title === 'Free but unpublished'));
});

test('un-marking a lesson closes it again immediately', async () => {
  const path = lessonPath(listed, 'free');
  assert.equal((await as(sue, 'GET', path)).status, 200);
  await as(ada, 'PUT', `/courses/${listed._id}/lessons/${listed.lessons.free._id}`, { isFree: false });
  assert.equal((await as(sue, 'GET', path)).status, 403, 'the lesson stayed open after the teacher un-marked it');
  await as(ada, 'PUT', `/courses/${listed._id}/lessons/${listed.lessons.free._id}`, { isFree: true });
  assert.equal((await as(sue, 'GET', path)).status, 200);
});

test('only the course staff can mark a lesson free', async () => {
  const attempt = await as(zoe, 'PUT', `/courses/${listed._id}/lessons/${listed.lessons.paid._id}`, { isFree: true });
  assert.equal(attempt.status, 403);
  assert.equal((await as(sue, 'GET', lessonPath(listed, 'paid'))).status, 403);
});

test('enrolled students and course staff are unaffected', async () => {
  assert.equal((await as(sam, 'GET', lessonPath(listed, 'paid'))).status, 200);
  assert.equal((await as(ada, 'GET', lessonPath(hidden, 'paid'))).status, 200);
  assert.equal((await as(admin, 'GET', lessonPath(hidden, 'paid'))).status, 200);
});

test('a video on a free lesson streams for an outsider; one on a paid lesson does not', async () => {
  const Video = require('../src/models/Video');
  const mk = async (courseId, title) => Video.create({
    course: courseId, title, uploadedBy: ada.user.id, status: 'ready',
    uploadId: `test-${title.replace(/\W/g, '')}`, totalChunks: 1, declaredSize: 1024,
    sizeBytes: 1024, durationSeconds: 10,
  });
  const freeVideo = await mk(listed._id, 'Free clip');
  const paidVideo = await mk(listed._id, 'Paid clip');
  const setVideo = (lessonId, videoId) => as(ada, 'PUT', `/courses/${listed._id}/lessons/${lessonId}`, { type: 'video', video: String(videoId) });
  await setVideo(listed.lessons.free._id, freeVideo._id);
  await setVideo(listed.lessons.paid._id, paidVideo._id);

  const allowed = await as(sue, 'POST', `/videos/${freeVideo._id}/token`);
  assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
  assert.ok(allowed.data.token);

  const denied = await as(sue, 'POST', `/videos/${paidVideo._id}/token`);
  assert.equal(denied.status, 403, 'a paid lesson\'s video handed out a stream token to an outsider');

  // Another teacher gets the same treatment: free yes, paid no.
  assert.equal((await as(zoe, 'POST', `/videos/${freeVideo._id}/token`)).status, 200);
  assert.equal((await as(zoe, 'POST', `/videos/${paidVideo._id}/token`)).status, 403);

  // Un-marking the lesson closes the video with it.
  await as(ada, 'PUT', `/courses/${listed._id}/lessons/${listed.lessons.free._id}`, { isFree: false });
  assert.equal((await as(sue, 'POST', `/videos/${freeVideo._id}/token`)).status, 403);
  await as(ada, 'PUT', `/courses/${listed._id}/lessons/${listed.lessons.free._id}`, { isFree: true });
});

test('a document on a free lesson opens for an outsider; one on a paid lesson does not', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const upload = async (name) => {
    const form = new FormData();
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), name);
    const res = await fetch(`${app.baseUrl}/api/v1/files/courses/${listed._id}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ada.token}`, 'x-device-id': ada.deviceId },
      body: form,
    });
    assert.equal(res.status, 201);
    return res.json();
  };
  const freeDoc = await upload('free-notes.pdf');
  const paidDoc = await upload('paid-notes.pdf');

  const attach = (lessonId, fileAsset) => as(ada, 'PUT', `/courses/${listed._id}/lessons/${lessonId}`, { type: 'pdf', fileAsset: String(fileAsset) });
  await attach(listed.lessons.free._id, freeDoc._id);
  await attach(listed.lessons.paid._id, paidDoc._id);

  const content = (session, fileId) => api('GET', `/files/${fileId}/content`, { token: session.token, deviceId: session.deviceId });
  assert.equal((await content(sue, freeDoc._id)).status, 200, 'a free lesson\'s document was refused to a signed-in outsider');
  assert.equal((await content(sue, paidDoc._id)).status, 403, 'a paid lesson\'s document was served to an outsider');
  assert.equal((await content(zoe, freeDoc._id)).status, 200);
  assert.equal((await content(zoe, paidDoc._id)).status, 403);

  // Un-marking the lesson closes the document with it.
  await as(ada, 'PUT', `/courses/${listed._id}/lessons/${listed.lessons.free._id}`, { isFree: false });
  assert.equal((await content(sue, freeDoc._id)).status, 403);
  await as(ada, 'PUT', `/courses/${listed._id}/lessons/${listed.lessons.free._id}`, { isFree: true });
});

test('a quiz question image is never free, even alongside a free lesson', async () => {
  // A real upload through the real path — scope 'question', not a lesson's file.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const form = new FormData();
  form.append('scope', 'question');
  form.append('file', new Blob([png], { type: 'image/png' }), 'answer-key.png');
  const res = await fetch(`${app.baseUrl}/api/v1/files/courses/${listed._id}/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ada.token}`, 'x-device-id': ada.deviceId },
    body: form,
  });
  assert.equal(res.status, 201);
  const asset = await res.json();
  assert.equal(asset.scope, 'question');

  const outsider = await api('GET', `/files/${asset._id}/content`, { token: sue.token, deviceId: sue.deviceId });
  assert.equal(outsider.status, 403, 'a quiz question image was served to a non-enrolled student');
  const enrolled = await api('GET', `/files/${asset._id}/content`, { token: sam.token, deviceId: sam.deviceId });
  assert.equal(enrolled.status, 200);
});
