const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers/harness');

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.stop(); });

const env = () => require('../src/config/env');
const User = () => require('../src/models/User');
const seed = () => require('../src/seed')();

test('bootstrap created the owner and Abdullah exactly once', async () => {
  const owner = await User().findOne({ role: 'super_admin' });
  assert.ok(owner, 'owner exists');
  assert.equal(owner.username, 'owner');
  assert.equal(owner.mustChangePassword, true);
  assert.equal(owner.emailVerified, true);
  const abdullah = await User().findOne({ username: 'abdullah.dabbas' });
  assert.ok(abdullah, 'abdullah exists');
  assert.equal(abdullah.role, 'admin');
  assert.equal(abdullah.name, 'Abdullah Dabbas');
  assert.equal(abdullah.mustChangePassword, true);

  const before = await User().countDocuments();
  await seed();
  await seed();
  assert.equal(await User().countDocuments(), before, 'rerunning seed creates nothing');
});

test('production with no owner and no SUPER_ADMIN_* refuses', async () => {
  const e = env();
  const saved = { NODE_ENV: e.NODE_ENV, SUPER_ADMIN_EMAIL: e.SUPER_ADMIN_EMAIL };
  await User().deleteMany({ role: 'super_admin' });
  e.NODE_ENV = 'production';
  e.SUPER_ADMIN_EMAIL = undefined;
  try {
    await assert.rejects(seed(), /owner/i);
  } finally {
    Object.assign(e, saved);
  }
  await seed(); // dev mode: recreates the owner
  assert.ok(await User().findOne({ role: 'super_admin' }));
});

test('production with an owner present seeds nothing else', async () => {
  const e = env();
  const saved = e.NODE_ENV;
  const before = await User().countDocuments();
  e.NODE_ENV = 'production';
  try {
    await seed();
  } finally {
    e.NODE_ENV = saved;
  }
  assert.equal(await User().countDocuments(), before);
});

test('legacy dev admin is only seeded when ADMIN_PASSWORD is set', async () => {
  const e = env();
  const saved = e.ADMIN_PASSWORD;
  await User().deleteOne({ username: 'admin' });
  e.ADMIN_PASSWORD = undefined;
  try {
    await seed();
    assert.equal(await User().findOne({ username: 'admin' }), null);
  } finally {
    e.ADMIN_PASSWORD = saved;
  }
  await seed();
  assert.ok(await User().findOne({ username: 'admin' }));
});

test('migration dry-run records nothing and changes nothing', async () => {
  const { runMigrations } = require('../src/scripts/migrate');
  const Migration = require('../src/models/Migration');
  const before = await User().find().select('tokenVersion').lean();
  const result = await runMigrations({ dryRun: true, forceRelogin: true, log: () => {} });
  assert.ok(result.skipped.includes('001-roles-and-devices'));
  assert.equal(await Migration.countDocuments(), 0);
  const after = await User().find().select('tokenVersion').lean();
  assert.deepEqual(after, before);
});

test('migration --force-relogin bumps every tokenVersion and ends sessions, once', async () => {
  const { runMigrations } = require('../src/scripts/migrate');
  const Migration = require('../src/models/Migration');
  const Session = require('../src/models/Session');
  const admin = await app.loginAs('admin', 'Admin@12345', { deviceId: 'dev-admin-mig' });
  const before = Object.fromEntries((await User().find().select('tokenVersion').lean()).map((u) => [String(u._id), u.tokenVersion]));

  const first = await runMigrations({ forceRelogin: true, log: () => {} });
  assert.ok(first.applied.includes('001-roles-and-devices'));
  assert.ok(first.applied.includes('002-rewrap-media-keys'), 'every pending migration runs');
  assert.equal(await Migration.countDocuments({ name: '001-roles-and-devices' }), 1);
  for (const u of await User().find().select('tokenVersion').lean()) {
    assert.equal(u.tokenVersion, before[String(u._id)] + 1);
  }
  assert.equal(await Session.countDocuments({ isActive: true }), 0);
  const me = await app.api('GET', '/auth/me', { token: admin.token, deviceId: 'dev-admin-mig' });
  assert.equal(me.status, 401);

  const second = await runMigrations({ forceRelogin: true, log: () => {} });
  assert.deepEqual(second.applied, []);
});
