/**
 * The watch allowance.
 *
 * A student may watch a lesson video a limited number of whole times. The unit
 * is playback, not clicks: opening the player and closing it again costs
 * nothing, and dragging the scrubber to the end costs nothing either. Only
 * seconds actually played count, and only a whole video's worth of them makes
 * a view.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, ada, sam, courseId, videoId;
const DURATION = 100; // seconds — keeps the arithmetic obvious

before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Ada', username: 'ada', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  ada = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-0001' });
  sam = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-0001' });

  const course = await api('POST', '/courses', {
    token: ada.token, deviceId: ada.deviceId, body: { title: 'Watched Course', category: 'Test', isPublished: true },
  });
  courseId = course.data._id;
  await api('POST', `/enrollments/courses/${courseId}/students`, {
    token: admin.token, deviceId: 'dev-admin-01', body: { student: 'sam' },
  });

  const Video = require('../src/models/Video');
  const video = await Video.create({
    course: courseId, title: 'Lecture 1', uploadedBy: ada.user.id, status: 'ready',
    uploadId: 'views-test-1', totalChunks: 1, declaredSize: 1024,
    sizeBytes: 1024, durationSeconds: DURATION,
  });
  videoId = String(video._id);
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });
const token = (s) => as(s, 'POST', `/videos/${videoId}/token`);
/** Report `seconds` of real playback, in the chunks the player would send. */
const watch = async (s, seconds) => {
  let left = seconds;
  let pos = 0;
  while (left > 0) {
    const delta = Math.min(left, 30);
    pos += delta;
    await as(s, 'POST', `/videos/${videoId}/progress`, {
      lessonId: videoId, positionSeconds: pos % DURATION, watchedDelta: delta,
    });
    left -= delta;
  }
};
const viewsOf = async () => {
  const VideoView = require('../src/models/VideoView');
  return VideoView.findOne({ student: sam.user.id, video: videoId }).lean();
};

test('opening the player without watching costs nothing', async () => {
  const first = await token(sam);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.viewsUsed, 0);
  assert.equal(first.data.viewsRemaining, 4, 'four whole watches to start with');

  // Ten more openings, no playback reported.
  for (let i = 0; i < 10; i += 1) assert.equal((await token(sam)).status, 200);
  const row = await viewsOf();
  assert.equal(row, null, 'merely asking for the video must not record a view');
});

test('part of a video is not a view', async () => {
  await watch(sam, 60); // 60 of 100 seconds
  const row = await viewsOf();
  assert.equal(row.completedViews, 0, 'most of a video is still not one view');
  assert.equal(row.watchedSeconds, 60);
  assert.equal((await token(sam)).data.viewsRemaining, 4);
});

test('finishing it counts one, and the leftover carries on', async () => {
  await watch(sam, 60); // 120 total → one whole view, 20 towards the next
  const row = await viewsOf();
  assert.equal(row.completedViews, 1);
  assert.equal(row.secondsThisView, 20, 'the remainder counts towards the next view, it is not discarded');
  assert.equal((await token(sam)).data.viewsRemaining, 3);
});

test('a long sitting spends more than one view', async () => {
  await watch(sam, 200); // 20 + 200 = 220 → two more whole views, 20 left over
  const row = await viewsOf();
  assert.equal(row.completedViews, 3);
  assert.equal(row.secondsThisView, 20);
  assert.equal((await token(sam)).data.viewsRemaining, 1);
});

test('the fourth view spends the allowance and the video stops opening', async () => {
  await watch(sam, 80); // 20 + 80 = 100 → the fourth
  assert.equal((await viewsOf()).completedViews, 4);

  const denied = await token(sam);
  assert.equal(denied.status, 403);
  assert.equal(denied.data.code, 'VIDEO_VIEW_LIMIT');
  assert.match(denied.data.message, /maximum of 4 times/);
});

test('the refusal is audited, so a teacher can see who ran out', async () => {
  const logs = await as(admin, 'GET', '/admin/audit-logs?limit=50');
  const entry = logs.data.items.find((l) => l.action === 'VIDEO_VIEWS_EXHAUSTED');
  assert.ok(entry, 'hitting the limit was not recorded');
  assert.equal(entry.meta.limit, 4);
});

test('the teacher can see who has watched what, and give a student their views back', async () => {
  const list = await as(ada, 'GET', `/videos/courses/${courseId}/${videoId}/views`);
  assert.equal(list.status, 200);
  const row = list.data.items.find((r) => r.student?.username === 'sam');
  assert.equal(row.completedViews, 4);
  assert.equal(row.exhausted, true);

  const reset = await as(ada, 'POST', `/videos/courses/${courseId}/${videoId}/views/${sam.user.id}/reset`);
  assert.equal(reset.status, 200, JSON.stringify(reset.data));

  const after = await token(sam);
  assert.equal(after.status, 200, 'the student can watch again after a reset');
  assert.equal(after.data.viewsRemaining, 4);
  assert.equal((await viewsOf()).watchedSeconds, 400, 'the total watched is history and is kept');
});

test('a student cannot reset their own allowance, and neither can another teacher', async () => {
  await app.createUser(admin.token, { name: 'Zoe', username: 'zoe', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  const zoe = await app.loginAs('zoe', 'Teach@1234', { deviceId: 'dev-zoe-0001' });

  assert.equal((await as(sam, 'POST', `/videos/courses/${courseId}/${videoId}/views/${sam.user.id}/reset`)).status, 403);
  assert.equal((await as(zoe, 'POST', `/videos/courses/${courseId}/${videoId}/views/${sam.user.id}/reset`)).status, 403);
  assert.equal((await as(sam, 'GET', `/videos/courses/${courseId}/${videoId}/views`)).status, 403);
});

test('staff are not rationed on their own material', async () => {
  await watch(ada, 500); // far past any limit
  for (let i = 0; i < 3; i += 1) {
    const t = await token(ada);
    assert.equal(t.status, 200, 'a teacher must not be locked out of their own video');
    assert.equal(t.data.viewsRemaining, undefined, 'and is not shown an allowance');
  }
});

test('setting the limit to zero turns the rule off entirely', async () => {
  const { invalidateSettingsCache } = require('../src/config/settingsCache');
  const VideoView = require('../src/models/VideoView');
  // Far past any allowance.
  await VideoView.updateOne({ student: sam.user.id, video: videoId }, { $set: { completedViews: 99 } });

  assert.equal((await token(sam)).status, 403, 'still limited while the setting stands');

  assert.equal((await as(admin, 'PUT', '/admin/settings', { maxVideoViews: 0 })).status, 200);
  invalidateSettingsCache();

  const open = await token(sam);
  assert.equal(open.status, 200, 'a limit of zero must let everyone through');
  assert.equal(open.data.viewsRemaining, null, 'and report no allowance to count down');

  await as(admin, 'PUT', '/admin/settings', { maxVideoViews: 4 });
  invalidateSettingsCache();
});
