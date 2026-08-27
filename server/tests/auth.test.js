const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin;
before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  for (const u of [
    { name: 'Web User', username: 'webby', password: 'Learn@1234', role: 'student' },
    { name: 'Droid User', username: 'droid', password: 'Learn@1234', role: 'student' },
    { name: 'Cookie User', username: 'cookie', password: 'Learn@1234', role: 'student' },
  ]) await app.createUser(admin.token, u, 'dev-admin');
});
after(async () => { await app.stop(); });

const login = (username, password, deviceId, extra = {}) =>
  api('POST', '/auth/login', { deviceId, body: { username, password, deviceId }, ...extra });

test('web login: refresh token only in an httpOnly cookie, never in the body', async () => {
  const r = await login('webby', 'Learn@1234', 'dev-web-01');
  assert.equal(r.status, 200);
  assert.ok(r.data.accessToken);
  assert.equal(r.data.refreshToken, undefined);
  const cookie = r.setCookies.find((c) => c.startsWith('lms_refresh='));
  assert.ok(cookie, 'refresh cookie set');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Path=\/api\/v1\/auth/);
  assert.match(cookie, /SameSite=Lax/i);
});

test('native login (x-client-platform: android) also returns the refresh token in the body', async () => {
  const r = await login('droid', 'Learn@1234', 'dev-droid', { platform: 'android' });
  assert.equal(r.status, 200);
  assert.ok(r.data.refreshToken, 'body copy for Keystore storage');
  const refreshed = await api('POST', '/auth/refresh', { deviceId: 'dev-droid', platform: 'android', body: { refreshToken: r.data.refreshToken } });
  assert.equal(refreshed.status, 200, JSON.stringify(refreshed.data));
  assert.ok(refreshed.data.refreshToken, 'rotated token returned to native client');
});

test('web refresh works from the cookie and rotates it', async () => {
  const r = await login('cookie', 'Learn@1234', 'dev-cookie');
  const first = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: r.cookies });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.ok(first.data.accessToken);
  assert.equal(first.data.refreshToken, undefined);
  assert.ok(first.cookies.includes('lms_refresh='), 'new cookie issued');
  assert.notEqual(first.cookies, r.cookies, 'cookie rotated');

  const replay = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: r.cookies });
  assert.equal(replay.status, 401, 'old cookie is single-use');
  assert.equal(replay.data.code, 'SESSION_TERMINATED');
  const logs = await api('GET', '/admin/audit-logs?action=TOKEN_REUSE_DETECTED&limit=5', { token: admin.token, deviceId: 'dev-admin' });
  assert.ok(logs.data.items.length >= 1);

  const after = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: first.cookies });
  assert.equal(after.status, 401, 'reuse killed the whole session, including the newest token');
});

test('web refresh ignores a body refresh token', async () => {
  const r = await login('webby', 'Learn@1234', 'dev-web-01', { platform: 'android' });
  const bodyOnly = await api('POST', '/auth/refresh', { deviceId: 'dev-web-01', body: { refreshToken: r.data.refreshToken } });
  assert.equal(bodyOnly.status, 401);
  assert.equal(bodyOnly.data.code, 'NO_REFRESH');
});

test('refresh and logout enforce the Origin allowlist', async () => {
  const r = await login('cookie', 'Learn@1234', 'dev-cookie');
  const bad = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: r.cookies, headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
  assert.equal(bad.data.code, 'ORIGIN_NOT_ALLOWED');
  const good = await api('POST', '/auth/refresh', { deviceId: 'dev-cookie', cookie: r.cookies, headers: { Origin: 'http://localhost:5173' } });
  assert.equal(good.status, 200, JSON.stringify(good.data));
  const badLogout = await api('POST', '/auth/logout', { deviceId: 'dev-cookie', token: good.data.accessToken, headers: { Origin: 'https://evil.example' } });
  assert.equal(badLogout.status, 403);
});
