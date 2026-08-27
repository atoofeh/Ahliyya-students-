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

test('an access token presented from another device ends the session', async () => {
  const fresh = await login('sam', 'Learn@1234', 'dev-sam-A');
  tokenA = fresh.data.accessToken;
  const spoof = await api('GET', '/auth/me', { token: tokenA, deviceId: 'dev-sam-B' });
  assert.equal(spoof.status, 401);
  assert.equal(spoof.data.code, 'SESSION_TERMINATED');
  const dead = await api('GET', '/auth/me', { token: tokenA, deviceId: 'dev-sam-A' });
  assert.equal(dead.status, 401, 'the session was ended, not just the one request');
  assert.ok((await auditRows('DEVICE_MISMATCH', samId)).length >= 1);
});

test('a device id alone (no token) is worthless', async () => {
  const r = await api('GET', '/auth/me', { deviceId: 'dev-sam-A' });
  assert.equal(r.status, 401);
});

test('refresh from another device ends the session', async () => {
  const fresh = await login('sam', 'Learn@1234', 'dev-sam-A');
  const bad = await api('POST', '/auth/refresh', { deviceId: 'dev-sam-B', cookie: fresh.cookies });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.code, 'SESSION_TERMINATED');
  const again = await api('POST', '/auth/refresh', { deviceId: 'dev-sam-A', cookie: fresh.cookies });
  assert.equal(again.status, 401, 'session gone');
});

test('admin sees the authorized device; revoke needs a reason', async () => {
  const fresh = await login('sam', 'Learn@1234', 'dev-sam-A');
  tokenA = fresh.data.accessToken;
  const view = await api('GET', `/admin/users/${samId}/device`, { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(view.status, 200, JSON.stringify(view.data));
  assert.ok(view.data.active, 'active device present');
  assert.equal(view.data.active.platform, 'web');
  assert.equal(view.data.active.publicId.length, 8);
  assert.equal(view.data.active.deviceKeyHash, undefined, 'hash never leaves the server');

  const noReason = await api('POST', `/admin/users/${samId}/device/revoke`, { token: admin.token, deviceId: 'dev-admin', body: {} });
  assert.equal(noReason.status, 400);
});

test('lost-device flow: revoke → old device dead → new device binds (DEVICE_CHANGED) → old device rejected', async () => {
  const revoke = await api('POST', `/admin/users/${samId}/device/revoke`, { token: admin.token, deviceId: 'dev-admin', body: { reason: 'Student reported the laptop stolen' } });
  assert.equal(revoke.status, 200, JSON.stringify(revoke.data));
  assert.equal(revoke.data.revoked, 1);
  assert.equal((await auditRows('DEVICE_REVOKED', samId)).length, 1);

  const dead = await api('GET', '/auth/me', { token: tokenA, deviceId: 'dev-sam-A' });
  assert.equal(dead.status, 401);

  const b = await login('sam', 'Learn@1234', 'dev-sam-B');
  assert.equal(b.status, 200, JSON.stringify(b.data));
  assert.equal((await auditRows('DEVICE_CHANGED', samId)).length, 1);

  const a = await login('sam', 'Learn@1234', 'dev-sam-A');
  assert.equal(a.status, 403);
  assert.equal(a.data.code, 'DEVICE_NOT_AUTHORIZED');

  const hist = await api('GET', `/admin/users/${samId}/device`, { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(hist.data.history.length, 1);
  assert.equal(hist.data.history[0].revocationReason, 'Student reported the laptop stolen');
  assert.equal(hist.data.history[0].revokedBy.username, 'admin');
});

test('student can see their own device and forget it on logout', async () => {
  await app.createUser(admin.token, { name: 'Forget', username: 'fgt', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const g1 = await login('fgt', 'Learn@1234', 'dev-fg-1');
  const mine = await api('GET', '/auth/device', { token: g1.data.accessToken, deviceId: 'dev-fg-1' });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.active.status, 'active');

  const out = await api('POST', '/auth/logout', { token: g1.data.accessToken, deviceId: 'dev-fg-1', body: { forgetDevice: true } });
  assert.equal(out.status, 200);
  const g2 = await login('fgt', 'Learn@1234', 'dev-fg-2');
  assert.equal(g2.status, 200, 'a new device can bind after "forget this device"');
});

test('plain logout keeps the device authorization', async () => {
  await app.createUser(admin.token, { name: 'Keep', username: 'kpt', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const k1 = await login('kpt', 'Learn@1234', 'dev-kp-1');
  const out = await api('POST', '/auth/logout', { token: k1.data.accessToken, deviceId: 'dev-kp-1', body: {} });
  assert.equal(out.status, 200);
  const other = await login('kpt', 'Learn@1234', 'dev-kp-2');
  assert.equal(other.status, 403, 'still bound to dev-kp-1');
  const same = await login('kpt', 'Learn@1234', 'dev-kp-1');
  assert.equal(same.status, 200);
});

test('admin cannot reset the owner device; the owner can reset an admin device', async () => {
  const blocked = await api('POST', `/admin/users/${owner.user.id}/device/revoke`, { token: admin.token, deviceId: 'dev-admin', body: { reason: 'attempt' } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'OWNER_PROTECTED');

  const abdullah = await app.loginAndOnboard(CREDENTIALS.abdullah.username, CREDENTIALS.abdullah.password, { deviceId: 'dev-abdullah' });
  const ok = await api('POST', `/admin/users/${abdullah.user.id}/device/revoke`, { token: owner.token, deviceId: 'dev-owner', body: { reason: 'Owner-initiated reset' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const dead = await api('GET', '/auth/me', { token: abdullah.token, deviceId: 'dev-abdullah' });
  assert.equal(dead.status, 401);
  const rebound = await login(CREDENTIALS.abdullah.username, CREDENTIALS.abdullah.password, 'dev-abd-new');
  assert.equal(rebound.status, 200);
});

test('an admin cannot revoke another admin device', async () => {
  const abdId = (await api('GET', '/admin/users?search=abdullah', { token: owner.token, deviceId: 'dev-owner' })).data.items[0]._id;
  const r = await api('POST', `/admin/users/${abdId}/device/revoke`, { token: admin.token, deviceId: 'dev-admin', body: { reason: 'peer attempt' } });
  assert.equal(r.status, 403);
});
