/**
 * Push registration — the address a phone gives the server so a notification
 * can reach it with the app closed.
 *
 * Sending itself needs Firebase credentials and a live Google endpoint, so it
 * is not exercised here; what is, is everything around it that can go wrong
 * quietly: who a token belongs to, and whether it survives a sign-out.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, ada, sam;
const TOKEN = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = 'fcm-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Ada', username: 'ada', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  ada = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-0001' });
  sam = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-0001' });
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });
const tokensFor = async (session) => {
  const PushToken = require('../src/models/PushToken');
  return PushToken.find({ user: session.user.id }).lean();
};

test('a phone registers an address and it is recorded against the signed-in account', async () => {
  const r = await as(ada, 'POST', '/notifications/push-token', { token: TOKEN, platform: 'android' });
  assert.equal(r.status, 201, JSON.stringify(r.data));

  const rows = await tokensFor(ada);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token, TOKEN);
  assert.equal(rows[0].platform, 'android');
  assert.equal(rows[0].deviceId, ada.deviceId, 'the registration remembers which device it came from');
});

test('registering the same address twice does not duplicate it', async () => {
  assert.equal((await as(ada, 'POST', '/notifications/push-token', { token: TOKEN })).status, 201);
  assert.equal((await tokensFor(ada)).length, 1);
});

test('a rubbish token is rejected rather than stored', async () => {
  const short = await as(ada, 'POST', '/notifications/push-token', { token: 'nope' });
  assert.equal(short.status, 400);
  assert.equal(short.data.code, 'VALIDATION_ERROR');
  assert.equal((await as(ada, 'POST', '/notifications/push-token', {})).status, 400);
  assert.equal((await tokensFor(ada)).length, 1);
});

test('signing in as someone else on the same phone moves the address, it does not copy it', async () => {
  // The same handset, now used by a student. Its notifications must follow the
  // person signed in, never both.
  assert.equal((await as(sam, 'POST', '/notifications/push-token', { token: TOKEN })).status, 201);

  assert.equal((await tokensFor(ada)).length, 0, 'the previous account still had the phone registered');
  const mine = await tokensFor(sam);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].token, TOKEN);
});

test('a second phone is an additional address, not a replacement', async () => {
  assert.equal((await as(sam, 'POST', '/notifications/push-token', { token: OTHER })).status, 201);
  const rows = await tokensFor(sam);
  assert.equal(rows.length, 2, 'staff and students alike may hold more than one registration');
});

test('unregistering removes only that phone, and only for its owner', async () => {
  // Another account cannot unregister a token it does not own.
  assert.equal((await as(ada, 'DELETE', '/notifications/push-token', { token: TOKEN })).status, 200);
  assert.equal((await tokensFor(sam)).length, 2, 'a stranger removed someone else\'s registration');

  assert.equal((await as(sam, 'DELETE', '/notifications/push-token', { token: TOKEN })).status, 200);
  const left = await tokensFor(sam);
  assert.equal(left.length, 1);
  assert.equal(left[0].token, OTHER, 'the other phone stays registered');
});

test('the routes need a signed-in caller', async () => {
  assert.equal((await api('POST', '/notifications/push-token', { body: { token: TOKEN } })).status, 401);
  assert.equal((await api('DELETE', '/notifications/push-token', { body: { token: TOKEN } })).status, 401);
});

test('with no Firebase credentials the platform still notifies, it just cannot push', async () => {
  const { isPushConfigured, pushToUser } = require('../src/core/push');
  // The harness sets no FIREBASE_SERVICE_ACCOUNT_KEY.
  assert.equal(isPushConfigured(), false);
  assert.deepEqual(await pushToUser(sam.user.id, { title: 'x', body: 'y' }), { sent: 0, removed: 0 });

  // And a notification still lands in the bell, which is the part that must
  // never depend on Google being reachable.
  const { notifyUser } = require('../src/modules/notifications/notifications.service');
  await notifyUser(sam.user.id, { type: 'system', title: 'Still delivered', body: 'in the app' });
  const list = await as(sam, 'GET', '/notifications');
  assert.ok(list.data.items.some((n) => n.title === 'Still delivered'));
});
