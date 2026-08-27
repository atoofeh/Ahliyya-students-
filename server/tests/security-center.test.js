process.env.RATE_LIMIT_MULTIPLIER = '1';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, owner, admin, samId;
before(async () => {
  app = await startApp();
  api = app.api;
  owner = await app.loginAndOnboard(CREDENTIALS.owner.username, CREDENTIALS.owner.password, { deviceId: 'dev-owner' });
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  samId = (await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin')).id;
  await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-laptop' });
});
after(async () => { await app.stop(); });

const as = (s, m, p, body) => api(m, p, { token: s.token, deviceId: s.deviceId, body });
const request = (username, note, ip = '10.1.1.1') => api('POST', '/auth/device/reset-request', { deviceId: 'dev-req-000001', headers: { 'X-Forwarded-For': ip }, body: { username, note } });

test('reset requests: identical replies for known and unknown accounts', async () => {
  const known = await request('sam', 'Lost my laptop');
  const unknown = await request('nobody-here', 'Lost my laptop');
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(known.data, unknown.data);
  assert.equal(known.data.message, 'If the account exists, an administrator will review the request.');
});

test('owner sees the open request; resolving with revoke ends the student session', async () => {
  const list = await as(owner, 'GET', '/admin/device-requests?status=open');
  assert.equal(list.status, 200);
  const req = list.data.items.find((r) => r.username === 'sam');
  assert.ok(req, 'known-account request stored');
  assert.equal(req.user.username, 'sam');
  assert.equal(list.data.items.some((r) => r.username === 'nobody-here'), false, 'unknown accounts are not stored');

  const resolve = await as(admin, 'POST', `/admin/device-requests/${req._id}/resolve`, { action: 'revoke', resolution: 'Verified by phone' });
  assert.equal(resolve.status, 200, JSON.stringify(resolve.data));
  const dev = await as(admin, 'GET', `/admin/users/${samId}/device`);
  assert.equal(dev.data.active, null);
  const again = await as(owner, 'GET', '/admin/device-requests?status=resolved');
  assert.ok(again.data.items.some((r) => String(r._id) === String(req._id)));
});

test('admin cannot resolve a request that targets the owner with revoke', async () => {
  await request('owner', 'pretend');
  const req = (await as(owner, 'GET', '/admin/device-requests?status=open')).data.items.find((r) => r.username === 'owner');
  const r = await as(admin, 'POST', `/admin/device-requests/${req._id}/resolve`, { action: 'revoke' });
  assert.equal(r.status, 403);
  assert.equal(r.data.code, 'OWNER_PROTECTED');
  const dismiss = await as(owner, 'POST', `/admin/device-requests/${req._id}/resolve`, { action: 'dismiss', resolution: 'Not the owner' });
  assert.equal(dismiss.status, 200);
});

test('reset-request rate buckets', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await request(`user${i}`, 'x', '10.2.2.2')).status, 202);
  assert.equal((await request('user9', 'x', '10.2.2.2')).status, 429, 'per-IP: 3 per hour');
  for (let i = 0; i < 3; i++) assert.equal((await request('sue', 'x', `10.3.3.${i + 1}`)).status, 202);
  assert.equal((await request('sue', 'x', '10.3.3.9')).status, 429, 'per-username: 3 per day');
});

test('security overview counts move with events', async () => {
  const before = (await as(owner, 'GET', '/admin/security/overview')).data;
  await api('POST', '/auth/login', { deviceId: 'dev-sam-laptop', body: { username: 'sam', password: 'WrongPass1', deviceId: 'dev-sam-laptop' } });
  const after = (await as(owner, 'GET', '/admin/security/overview')).data;
  assert.equal(after.failedLogins24h, before.failedLogins24h + 1);
  assert.ok(after.activeSessions >= 2);
  assert.ok(Array.isArray(after.suspiciousEvents7d));
  assert.ok(after.recentSecurityAudit.length >= 1);
  assert.equal(typeof after.openResetRequests, 'number');
});

test('platform device list is paginated, searchable and hides hashes', async () => {
  const r = await as(owner, 'GET', '/admin/devices?search=sam');
  assert.equal(r.status, 200);
  assert.ok(r.data.meta);
  assert.ok(r.data.items.every((d) => d.deviceKeyHash === undefined));
  assert.ok(r.data.items.some((d) => d.user.username === 'sam'));
});
