const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, owner, abdullah, admin;
before(async () => {
  app = await startApp();
  api = app.api;
  owner = await app.loginAndOnboard(CREDENTIALS.owner.username, CREDENTIALS.owner.password, { deviceId: 'dev-owner' });
  abdullah = await app.loginAndOnboard(CREDENTIALS.abdullah.username, CREDENTIALS.abdullah.password, { deviceId: 'dev-abdullah' });
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });

test('the owner is super_admin and Abdullah is admin', async () => {
  const r = await as(owner, 'GET', '/admin/users?role=super_admin');
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 1);
  assert.equal(r.data.items[0].username, 'owner');
  assert.equal(abdullah.user.role, 'admin');
  assert.equal(abdullah.user.name, 'Abdullah Dabbas');
});

test('Abdullah can view but not mutate the owner', async () => {
  const ownerId = owner.user.id;
  const view = await as(abdullah, 'GET', `/admin/users/${ownerId}`);
  assert.equal(view.status, 200);

  const attempts = [
    as(abdullah, 'PUT', `/admin/users/${ownerId}`, { name: 'Hijacked' }),
    as(abdullah, 'POST', `/admin/users/${ownerId}/status`, { status: 'suspended' }),
    as(abdullah, 'POST', `/admin/users/${ownerId}/reset-password`, { password: 'Newpass@123' }),
    as(abdullah, 'POST', `/admin/users/${ownerId}/force-logout`),
    as(abdullah, 'DELETE', `/admin/users/${ownerId}`),
  ];
  for (const r of await Promise.all(attempts)) {
    assert.equal(r.status, 403, JSON.stringify(r.data));
    assert.equal(r.data.code, 'OWNER_PROTECTED');
  }
  const logs = await as(owner, 'GET', `/admin/audit-logs?action=OWNER_ACTION_BLOCKED&userId=${abdullah.user.id}&limit=50`);
  assert.equal(logs.status, 200);
  assert.ok(logs.data.items.length >= 5, 'each blocked attempt is audited');
  assert.equal(String(logs.data.items[0].targetUser._id), String(ownerId));

  const still = await as(owner, 'GET', '/auth/me');
  assert.equal(still.status, 200, 'owner session untouched');
});

test('Abdullah cannot promote himself, create an admin, or create a super_admin', async () => {
  const self = await as(abdullah, 'PUT', `/admin/users/${abdullah.user.id}`, { role: 'admin' });
  assert.equal(self.status, 400);
  assert.equal(self.data.code, 'SELF_ACTION');

  const mkAdmin = await as(abdullah, 'POST', '/admin/users', { name: 'Another Admin', username: 'admin2', password: 'Admin@12345', role: 'admin' });
  assert.equal(mkAdmin.status, 403);

  const mkOwner = await as(abdullah, 'POST', '/admin/users', { name: 'Fake Owner', username: 'owner2', password: 'Owner@12345', role: 'super_admin' });
  assert.equal(mkOwner.status, 400);
  const mkOwner2 = await as(owner, 'POST', '/admin/users', { name: 'Fake Owner', username: 'owner2', password: 'Owner@12345', role: 'super_admin' });
  assert.equal(mkOwner2.status, 400, 'not even the owner can create a second owner through the API');
});

test('Abdullah can create students and teachers', async () => {
  const s = await as(abdullah, 'POST', '/admin/users', { name: 'Stu', username: 'stu1', password: 'Learn@1234', role: 'student', mustChangePassword: false });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const t = await as(abdullah, 'POST', '/admin/users', { name: 'Tea', username: 'tea1', password: 'Teach@1234', role: 'teacher', mustChangePassword: false });
  assert.equal(t.status, 201, JSON.stringify(t.data));
});

test('admin-on-admin mutation requires admins.manage (owner only)', async () => {
  const r = await as(admin, 'PUT', `/admin/users/${abdullah.user.id}`, { name: 'Renamed by peer' });
  assert.equal(r.status, 403);
  const ok = await as(owner, 'PUT', `/admin/users/${abdullah.user.id}`, { name: 'Abdullah Dabbas' });
  assert.equal(ok.status, 200);
});

test('owner-only settings are rejected for admins and audited for the owner', async () => {
  const blocked = await as(abdullah, 'PUT', '/admin/settings', { maxLoginAttempts: 7, platformName: 'Should not persist' });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'OWNER_PROTECTED');
  const current = await as(owner, 'GET', '/admin/settings');
  assert.notEqual(current.data.settings.platformName, 'Should not persist', 'nothing written when any key is owner-only');

  const allowed = await as(abdullah, 'PUT', '/admin/settings', { platformName: 'Alahliyya LMS' });
  assert.equal(allowed.status, 200);

  const ownerChange = await as(owner, 'PUT', '/admin/settings', { maxLoginAttempts: 7 });
  assert.equal(ownerChange.status, 200);
  assert.equal(ownerChange.data.settings.maxLoginAttempts, 7);
  const logs = await as(owner, 'GET', '/admin/audit-logs?action=SECURITY_SETTING_CHANGED&limit=5');
  assert.ok(logs.data.items.length >= 1);
  assert.deepEqual(logs.data.items[0].meta.keys, ['maxLoginAttempts']);
});

test('owner can suspend Abdullah (ADMIN_DISABLED audited) and reactivate him', async () => {
  const susp = await as(owner, 'POST', `/admin/users/${abdullah.user.id}/status`, { status: 'suspended' });
  assert.equal(susp.status, 200);
  const me = await as(abdullah, 'GET', '/auth/me');
  assert.equal(me.status, 403);
  assert.equal(me.data.code, 'ACCOUNT_SUSPENDED');
  const logs = await as(owner, 'GET', '/admin/audit-logs?action=ADMIN_DISABLED&limit=5');
  assert.ok(logs.data.items.length >= 1);
  const back = await as(owner, 'POST', `/admin/users/${abdullah.user.id}/status`, { status: 'active' });
  assert.equal(back.status, 200);
});

test('owner cannot mutate their own account through admin routes', async () => {
  const r = await as(owner, 'PUT', `/admin/users/${owner.user.id}`, { role: 'student' });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, 'SELF_ACTION');
});

test('ADMIN_CREATED is audited when the owner creates an admin', async () => {
  const r = await as(owner, 'POST', '/admin/users', { name: 'Ops Admin', username: 'ops', password: 'Admin@12345', role: 'admin' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const logs = await as(owner, 'GET', '/admin/audit-logs?action=ADMIN_CREATED&limit=5');
  assert.ok(logs.data.items.some((l) => String(l.targetUser?._id) === String(r.data.id)));
});
