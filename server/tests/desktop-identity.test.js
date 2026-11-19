const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { startApp, CREDENTIALS } = require('./helpers/harness');
const Device = require('../src/models/Device');
const Session = require('../src/models/Session');
const AuditLog = require('../src/models/AuditLog');
const DeviceService = require('../src/modules/auth/device.service');

const desktopAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36 FekerDesktop/1.0.0';
const password = 'Learn@1234';
let app, admin, sequence = 0;
before(async () => {
  app = await startApp();
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'desktop-test-admin' });
});
after(async () => { await app.stop(); });

const signIn = (username, deviceId, { platform = 'windows', agent = desktopAgent, body = {} } = {}) => app.api('POST', '/auth/login', {
  deviceId, platform, headers: { 'User-Agent': agent }, body: { username, password, deviceId, ...body },
});
const fixture = async ({ platform = 'web', agent = desktopAgent } = {}) => {
  const username = `desktop${++sequence}`;
  const user = await app.createUser(admin.token, { name: 'Desktop fixture', username, password, role: 'student' }, admin.deviceId);
  const legacy = randomUUID();
  const canonical = createHash('sha256').update(username).digest('hex');
  const initial = await signIn(username, legacy, { platform, agent });
  assert.equal(initial.status, 200, JSON.stringify(initial.data));
  const binding = await Device.findOne({ user: user.id, status: 'active' }).select('+deviceKeyHash');
  return { username, user, legacy, canonical, initial, binding };
};
const bindingFor = (f) => Device.findById(f.binding._id).select('+deviceKeyHash');
const upgradesFor = (f) => AuditLog.find({ user: f.user.id, action: 'DEVICE_IDENTITY_MIGRATED' });

test('legacy EXE profile upgrades to machine identity in the same single-device slot', async () => {
  const f = await fixture();
  const result = await signIn(f.username, f.canonical, { body: { desktopLegacyDeviceId: f.legacy, rememberMe: true } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.refreshToken, undefined, 'Windows keeps the httpOnly cookie');
  const device = await bindingFor(f);
  assert.equal(device.platform, 'windows');
  assert.equal(device.multiDevice, false);
  assert.equal(device.deviceKeyHash, DeviceService.hashDeviceId(f.canonical));
  assert.equal(device.publicId, DeviceService.publicIdFor(f.canonical, f.user.id));
  assert.equal(await Device.countDocuments({ user: f.user.id, status: 'active' }), 1);
  assert.equal((await upgradesFor(f)).length, 1);
  assert.equal((await app.api('GET', '/auth/me', { token: f.initial.data.accessToken, deviceId: f.legacy })).status, 401);
  assert.equal((await app.api('GET', '/auth/me', { token: result.data.accessToken, deviceId: f.canonical })).status, 200);
  const refreshed = await app.api('POST', '/auth/refresh', { cookie: result.cookies, deviceId: f.canonical, platform: 'windows', body: {} });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.data.refreshToken, undefined);

  const repeat = await signIn(f.username, f.canonical, { body: { desktopLegacyDeviceId: randomUUID() } });
  assert.equal(repeat.status, 200, 'already-upgraded identity wins over stale profile data');
  assert.equal((await upgradesFor(f)).length, 1, 'upgrade is not repeated');
});

test('missing or incorrect legacy proof leaves the authorized device and session unchanged', async () => {
  const f = await fixture();
  for (const body of [{}, { desktopLegacyDeviceId: randomUUID() }]) {
    const rejected = await signIn(f.username, f.canonical, { body });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.data.code, 'DEVICE_NOT_AUTHORIZED');
  }
  assert.equal((await bindingFor(f)).deviceKeyHash, f.binding.deviceKeyHash);
  assert.equal((await upgradesFor(f)).length, 0);
  assert.equal((await app.api('GET', '/auth/me', { token: f.initial.data.accessToken, deviceId: f.legacy })).status, 200);
});

test('Chrome-only history cannot be upgraded by claiming to be the Windows app', async () => {
  const f = await fixture({ agent: desktopAgent.replace(' FekerDesktop/1.0.0', '') });
  const result = await signIn(f.username, f.canonical, { body: { desktopLegacyDeviceId: f.legacy } });
  assert.equal(result.status, 403);
  assert.equal((await bindingFor(f)).deviceKeyHash, f.binding.deviceKeyHash);
  assert.equal((await upgradesFor(f)).length, 0);
});

test('web clients and requests without the EXE marker cannot trigger compatibility migration', async () => {
  const f = await fixture();
  for (const options of [{ platform: 'web' }, { agent: 'Mozilla/5.0 Chrome/142.0' }]) {
    const result = await signIn(f.username, f.canonical, { ...options, body: { desktopLegacyDeviceId: f.legacy } });
    assert.equal(result.status, 403);
  }
  assert.equal((await bindingFor(f)).deviceKeyHash, f.binding.deviceKeyHash);
});

test('native app access keeps its existing exception without migrating the browser binding', async () => {
  const f = await fixture();
  const result = await signIn(f.username, f.canonical, { platform: 'ios', body: { desktopLegacyDeviceId: f.legacy } });
  assert.equal(result.status, 200);
  assert.ok(result.data.refreshToken);
  assert.equal((await bindingFor(f)).deviceKeyHash, f.binding.deviceKeyHash);
  assert.equal((await upgradesFor(f)).length, 0);
  assert.equal(await Device.countDocuments({ user: f.user.id, status: 'active', multiDevice: false }), 1);
});

test('wrong password and suspended accounts cannot migrate a device', async () => {
  const f = await fixture();
  const wrong = await signIn(f.username, f.canonical, { body: { password: 'Incorrect@1234', desktopLegacyDeviceId: f.legacy } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.message, 'Invalid username or password');
  const suspend = await app.api('POST', `/admin/users/${f.user.id}/status`, { token: admin.token, deviceId: admin.deviceId, body: { status: 'suspended' } });
  assert.equal(suspend.status, 200);
  const suspended = await signIn(f.username, f.canonical, { body: { desktopLegacyDeviceId: f.legacy } });
  assert.equal(suspended.status, 403);
  assert.equal(suspended.data.code, 'ACCOUNT_SUSPENDED');
  assert.equal((await bindingFor(f)).deviceKeyHash, f.binding.deviceKeyHash);
  assert.equal((await upgradesFor(f)).length, 0);
});

test('malformed legacy proof and non-machine targets do not change a binding', async () => {
  const f = await fixture();
  const invalid = await signIn(f.username, f.canonical, { body: { desktopLegacyDeviceId: 'not-a-uuid' } });
  assert.equal(invalid.status, 400);
  const target = await signIn(f.username, 'another-profile-id', { body: { desktopLegacyDeviceId: f.legacy } });
  assert.equal(target.status, 403);
  assert.equal((await bindingFor(f)).deviceKeyHash, f.binding.deviceKeyHash);
});

test('an old refresh rejected during rollout can recover through a verified desktop login', async () => {
  const f = await fixture({ platform: 'windows' });
  const oldRefresh = await app.api('POST', '/auth/refresh', { cookie: f.initial.cookies, deviceId: f.canonical, platform: 'windows', body: {} });
  assert.equal(oldRefresh.status, 401);
  const result = await signIn(f.username, f.canonical, { body: { desktopLegacyDeviceId: f.legacy } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal((await bindingFor(f)).deviceKeyHash, DeviceService.hashDeviceId(f.canonical));
});

test('a revoked old UUID cannot replace a different currently authorized machine', async () => {
  const f = await fixture();
  const revoked = await app.api('POST', `/admin/users/${f.user.id}/device/revoke`, { token: admin.token, deviceId: admin.deviceId, body: { reason: 'Test replacement' } });
  assert.equal(revoked.status, 200, JSON.stringify(revoked.data));
  const replacement = 'b'.repeat(64);
  assert.equal((await signIn(f.username, replacement)).status, 200);
  const result = await signIn(f.username, f.canonical, { body: { desktopLegacyDeviceId: f.legacy } });
  assert.equal(result.status, 403);
  assert.equal((await upgradesFor(f)).length, 0);
});

test('two different machine IDs cannot both claim the same legacy device concurrently', async () => {
  const f = await fixture();
  const target = 'a'.repeat(64);
  const results = await Promise.all([f.canonical, target].map((id) => signIn(f.username, id, { body: { desktopLegacyDeviceId: f.legacy } })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 403], JSON.stringify(results.map((result) => result.data)));
  const winner = results[0].status === 200 ? f.canonical : target;
  assert.equal((await bindingFor(f)).deviceKeyHash, DeviceService.hashDeviceId(winner));
  assert.equal(await Device.countDocuments({ user: f.user.id, status: 'active' }), 1);
  assert.equal((await upgradesFor(f)).length, 1);
  assert.equal(await Session.countDocuments({ user: f.user.id, isActive: true }), 1);
});
