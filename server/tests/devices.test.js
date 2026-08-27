const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

const DEVICE_MSG = 'This account is already linked to another device. Contact an administrator or request a device reset.';
const GENERIC_MSG = 'Invalid username or password';

let app, api, admin, owner, samId;
before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  owner = await app.loginAndOnboard(CREDENTIALS.owner.username, CREDENTIALS.owner.password, { deviceId: 'dev-owner' });
  const sam = await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  samId = sam.id;
});
after(async () => { await app.stop(); });

const login = (username, password, deviceId, extra = {}) =>
  api('POST', '/auth/login', { deviceId, body: { username, password, deviceId }, ...extra });
const auditRows = async (action, userId) => {
  const r = await api('GET', `/admin/audit-logs?action=${action}&userId=${userId}&limit=50`, { token: owner.token, deviceId: 'dev-owner' });
  return r.data.items;
};

let tokenA;

test('first login binds device A (DEVICE_BOUND)', async () => {
  const r = await login('sam', 'Learn@1234', 'dev-sam-A');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  tokenA = r.data.accessToken;
  assert.equal((await auditRows('DEVICE_BOUND', samId)).length, 1);
});

test('same device logs in again', async () => {
  const r = await login('sam', 'Learn@1234', 'dev-sam-A');
  assert.equal(r.status, 200);
  tokenA = r.data.accessToken;
  assert.equal((await auditRows('DEVICE_BOUND', samId)).length, 1, 'no second bind row');
});

test('different device is rejected and the trusted device keeps working', async () => {
  const r = await login('sam', 'Learn@1234', 'dev-sam-B');
  assert.equal(r.status, 403);
  assert.equal(r.data.code, 'DEVICE_NOT_AUTHORIZED');
  assert.equal(r.data.message, DEVICE_MSG);
  assert.equal((await auditRows('DEVICE_LOGIN_REJECTED', samId)).length, 1);

  const me = await api('GET', '/auth/me', { token: tokenA, deviceId: 'dev-sam-A' });
  assert.equal(me.status, 200, 'device A session untouched by the rejected attempt');
});

test('wrong password from a foreign device gets the generic message, not the device message', async () => {
  const r = await login('sam', 'WrongPass1', 'dev-sam-B');
  assert.equal(r.status, 401);
  assert.equal(r.data.message, GENERIC_MSG);
});

test('unknown user and wrong password are indistinguishable', async () => {
  const unknown = await login('nobody', 'Learn@1234', 'dev-x-0001');
  const wrong = await login('sam', 'WrongPass1', 'dev-sam-A');
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.data.message, wrong.data.message);
  assert.equal(unknown.data.code, wrong.data.code);
});

test('concurrent first logins: exactly one device binds', async () => {
  await app.createUser(admin.token, { name: 'Race', username: 'race', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const [r1, r2] = await Promise.all([login('race', 'Learn@1234', 'dev-race-1'), login('race', 'Learn@1234', 'dev-race-2')]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 403], JSON.stringify([r1.data, r2.data]));
  const winner = r1.status === 200 ? { token: r1.data.accessToken, deviceId: 'dev-race-1' } : { token: r2.data.accessToken, deviceId: 'dev-race-2' };
  const loser = r1.status === 200 ? r2 : r1;
  assert.equal(loser.data.code, 'DEVICE_NOT_AUTHORIZED');
  const me = await api('GET', '/auth/me', { token: winner.token, deviceId: winner.deviceId });
  assert.equal(me.status, 200);
});

test('deviceBindingEnabled=false disables the one-device rule (single session still applies)', async () => {
  await app.createUser(admin.token, { name: 'Free', username: 'free', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const off = await api('PUT', '/admin/settings', { token: owner.token, deviceId: 'dev-owner', body: { deviceBindingEnabled: false } });
  assert.equal(off.status, 200);
  try {
    const a = await login('free', 'Learn@1234', 'dev-free-1');
    assert.equal(a.status, 200);
    const b = await login('free', 'Learn@1234', 'dev-free-2');
    assert.equal(b.status, 200);
    const oldA = await api('GET', '/auth/me', { token: a.data.accessToken, deviceId: 'dev-free-1' });
    assert.equal(oldA.status, 401, 'single active session still enforced');
  } finally {
    await api('PUT', '/admin/settings', { token: owner.token, deviceId: 'dev-owner', body: { deviceBindingEnabled: true } });
  }
});

test('fingerprint drift on the trusted device is logged, not rejected', async () => {
  const r = await login('sam', 'Learn@1234', 'dev-sam-A', { fingerprint: 'fp-after-browser-update' });
  assert.equal(r.status, 200);
  tokenA = r.data.accessToken;
  const r2 = await login('sam', 'Learn@1234', 'dev-sam-A', { fingerprint: 'fp-changed-again' });
  assert.equal(r2.status, 200);
  tokenA = r2.data.accessToken;
  assert.ok((await auditRows('DEVICE_FINGERPRINT_DRIFT', samId)).length >= 1);
});
