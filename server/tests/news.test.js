/**
 * The news feed.
 *
 * A wall the institution writes and everyone signed in reads. It is
 * deliberately not an announcement: nothing here notifies anybody, so a photo
 * of a prize-giving does not buzz three hundred phones.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, owner, admin, ada, sam;

before(async () => {
  app = await startApp();
  api = app.api;
  owner = await app.loginAndOnboard(CREDENTIALS.owner.username, CREDENTIALS.owner.password, { deviceId: 'dev-owner-01' });
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Ada', username: 'ada', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  ada = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-0001' });
  sam = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-0001' });
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });
const titles = (r) => r.data.items.map((p) => p.title);

test('an administrator posts, and everyone signed in can read it', async () => {
  const posted = await as(admin, 'POST', '/news', { title: 'Results are out', body: 'Collect them from the office.' });
  assert.equal(posted.status, 201, JSON.stringify(posted.data));
  assert.equal(posted.data.title, 'Results are out');

  for (const reader of [sam, ada, owner, admin]) {
    const feed = await as(reader, 'GET', '/news');
    assert.equal(feed.status, 200);
    assert.ok(titles(feed).includes('Results are out'), 'a signed-in reader could not see the feed');
  }
});

test('a post can be a picture with no words at all', async () => {
  const FileAsset = require('../src/models/FileAsset');
  const image = await FileAsset.create({
    uploadedBy: admin.user.id, scope: 'news', kind: 'images',
    originalName: 'graduation.png', storedName: 'g.png', mimeType: 'image/png',
    sizeBytes: 10, storagePath: '/dev/null',
  });
  const posted = await as(admin, 'POST', '/news', { images: [String(image._id)] });
  assert.equal(posted.status, 201, JSON.stringify(posted.data));
  assert.equal(posted.data.images.length, 1);
  assert.equal(posted.data.title, '');
});

test('an empty post is refused rather than filling the feed with nothing', async () => {
  const blank = await as(admin, 'POST', '/news', { title: '   ', body: '' });
  assert.equal(blank.status, 400);
  assert.equal(blank.data.code, 'VALIDATION_ERROR');
});

test('teachers and students can read the feed but never write to it', async () => {
  for (const reader of [ada, sam]) {
    assert.equal((await as(reader, 'POST', '/news', { body: 'let me in' })).status, 403);
  }
  const feed = await as(admin, 'GET', '/news');
  assert.ok(!feed.data.items.some((p) => p.body === 'let me in'));
});

test('pinned posts sit at the top, then the newest', async () => {
  await as(admin, 'POST', '/news', { title: 'Older notice' });
  await as(admin, 'POST', '/news', { title: 'Newest notice' });
  const pin = await as(admin, 'POST', '/news', { title: 'Open day', pinned: true });
  assert.equal(pin.status, 201);

  const feed = await as(sam, 'GET', '/news');
  assert.equal(titles(feed)[0], 'Open day', 'a pinned post must lead the feed');
  assert.equal(titles(feed)[1], 'Newest notice', 'and the rest are newest first');
});

test('a post can be edited and taken down, and both are audited', async () => {
  const post = (await as(admin, 'POST', '/news', { title: 'Typo heer' })).data;

  const fixed = await as(admin, 'PATCH', `/news/${post._id}`, { title: 'Typo here', body: 'fixed' });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.data.title, 'Typo here');

  assert.equal((await as(admin, 'DELETE', `/news/${post._id}`)).status, 200);
  assert.ok(!titles(await as(sam, 'GET', '/news')).includes('Typo here'), 'a removed post still showed');

  const logs = await as(owner, 'GET', '/admin/audit-logs?limit=60');
  for (const action of ['NEWS_POSTED', 'NEWS_UPDATED', 'NEWS_DELETED']) {
    assert.ok(logs.data.items.some((l) => l.action === action), `${action} was not audited`);
  }
});

test('a teacher cannot edit or remove somebody elses post', async () => {
  const post = (await as(admin, 'POST', '/news', { title: 'Staff only' })).data;
  assert.equal((await as(ada, 'PATCH', `/news/${post._id}`, { title: 'hijacked' })).status, 403);
  assert.equal((await as(ada, 'DELETE', `/news/${post._id}`)).status, 403);
  assert.ok(titles(await as(sam, 'GET', '/news')).includes('Staff only'));
});

test('the feed needs a signed-in reader', async () => {
  assert.equal((await api('GET', '/news')).status, 401);
  assert.equal((await api('POST', '/news', { body: { title: 'anon' } })).status, 401);
});

test('posting to the news feed notifies nobody', async () => {
  const before = (await as(sam, 'GET', '/notifications')).data.items.length;
  await as(admin, 'POST', '/news', { title: 'Quiet notice', body: 'should not buzz anyone' });
  const after = (await as(sam, 'GET', '/notifications')).data.items.length;
  assert.equal(after, before, 'the news feed must not push notifications — that is what announcements are for');
});
