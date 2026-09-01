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

const mk = (username, extra = {}) => app.createUser(admin.token, { name: username, username, password: 'Learn@1234', role: 'student', ...extra }, 'dev-admin');
const setStatus = (id, status) => api('POST', `/admin/users/${id}/status`, { token: admin.token, deviceId: 'dev-admin', body: { status } });

test('suspended / banned: wrong password is generic, right password is specific', async () => {
  const sus = await mk('sus');
  await setStatus(sus.id, 'suspended');
  const wrong = await login('sus', 'WrongPass1', 'dev-sus-01');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.message, 'Invalid username or password');
  const right = await login('sus', 'Learn@1234', 'dev-sus-01');
  assert.equal(right.status, 403);
  assert.equal(right.data.code, 'ACCOUNT_SUSPENDED');

  const ban = await mk('ban');
  await setStatus(ban.id, 'banned');
  const rightBan = await login('ban', 'Learn@1234', 'dev-ban-01');
  assert.equal(rightBan.status, 403);
  assert.equal(rightBan.data.code, 'ACCOUNT_BANNED');
});

test('lockout after N failures; a wrong password never reveals the lock', async () => {
  await mk('lock');
  for (let i = 0; i < 5; i++) {
    const r = await login('lock', 'WrongPass1', 'dev-lock');
    assert.equal(r.status, 401);
    assert.equal(r.data.message, 'Invalid username or password');
  }
  const locked = await login('lock', 'Learn@1234', 'dev-lock');
  assert.equal(locked.status, 423);
  assert.equal(locked.data.code, 'ACCOUNT_LOCKED');
  const wrongWhileLocked = await login('lock', 'WrongPass1', 'dev-lock');
  assert.equal(wrongWhileLocked.status, 401);
  assert.equal(wrongWhileLocked.data.message, 'Invalid username or password');
});

test('forced password change gates everything except onboarding', async () => {
  await mk('onboard', { mustChangePassword: true });
  const r = await login('onboard', 'Learn@1234', 'dev-onb-01');
  assert.equal(r.status, 200);
  assert.equal(r.data.user.mustChangePassword, true);
  const t = r.data.accessToken;
  const catalog = await api('GET', '/courses/catalog', { token: t, deviceId: 'dev-onb-01' });
  assert.equal(catalog.status, 403);
  assert.equal(catalog.data.code, 'ONBOARDING_REQUIRED');
  const me = await api('GET', '/auth/me', { token: t, deviceId: 'dev-onb-01' });
  assert.equal(me.status, 200);
  // Admin-created accounts are not email-verified; verification is required by default.
  const tooEarly = await api('POST', '/auth/set-password', { token: t, deviceId: 'dev-onb-01', body: { password: 'Newpass@123' } });
  assert.equal(tooEarly.status, 403);
  assert.equal(tooEarly.data.code, 'EMAIL_UNVERIFIED');
});

test('logout ends the session', async () => {
  await mk('bye');
  const r = await login('bye', 'Learn@1234', 'dev-bye-01');
  const out = await api('POST', '/auth/logout', { token: r.data.accessToken, deviceId: 'dev-bye-01', body: {} });
  assert.equal(out.status, 200);
  const me = await api('GET', '/auth/me', { token: r.data.accessToken, deviceId: 'dev-bye-01' });
  assert.equal(me.status, 401);
});

test('password change re-issues tokens and revokes the old ones', async () => {
  await mk('chg');
  const r = await login('chg', 'Learn@1234', 'dev-chg-01');
  const changed = await api('POST', '/auth/change-password', { token: r.data.accessToken, deviceId: 'dev-chg-01', body: { currentPassword: 'Learn@1234', newPassword: 'Learn@5678' } });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.ok(changed.data.accessToken);
  assert.equal(changed.data.refreshToken, undefined);
  const old = await api('GET', '/auth/me', { token: r.data.accessToken, deviceId: 'dev-chg-01' });
  assert.equal(old.status, 401, 'tokenVersion bumped');
  const fresh = await api('GET', '/auth/me', { token: changed.data.accessToken, deviceId: 'dev-chg-01' });
  assert.equal(fresh.status, 200);
  const relogin = await login('chg', 'Learn@5678', 'dev-chg-01');
  assert.equal(relogin.status, 200);
});

test('admin password reset forces onboarding and kills the session', async () => {
  const u = await mk('rst');
  const r = await login('rst', 'Learn@1234', 'dev-rst-01');
  const reset = await api('POST', `/admin/users/${u.id}/reset-password`, { token: admin.token, deviceId: 'dev-admin', body: { password: 'Temp@12345' } });
  assert.equal(reset.status, 200);
  const dead = await api('GET', '/auth/me', { token: r.data.accessToken, deviceId: 'dev-rst-01' });
  assert.equal(dead.status, 401);
  const again = await login('rst', 'Temp@12345', 'dev-rst-01');
  assert.equal(again.status, 200);
  assert.equal(again.data.user.mustChangePassword, true);
});

test('role change kills sessions; delete blocks login', async () => {
  const u = await mk('rol');
  const r = await login('rol', 'Learn@1234', 'dev-rol-01');
  const change = await api('PUT', `/admin/users/${u.id}`, { token: admin.token, deviceId: 'dev-admin', body: { role: 'teacher' } });
  assert.equal(change.status, 200, JSON.stringify(change.data));
  const dead = await api('GET', '/auth/me', { token: r.data.accessToken, deviceId: 'dev-rol-01' });
  assert.equal(dead.status, 401);

  const del = await api('DELETE', `/admin/users/${u.id}`, { token: admin.token, deviceId: 'dev-admin' });
  assert.equal(del.status, 200);
  const gone = await login('rol', 'Learn@1234', 'dev-rol-01');
  assert.equal(gone.status, 401);
});

// ── "Remember me" actually decides how long you stay signed in ───────────────

const refreshCookie = (r) => (r.setCookies || []).find((c) => c.startsWith('lms_refresh=')) || '';
const maxAgeOf = (cookie) => Number(cookie.match(/Max-Age=(\d+)/i)?.[1] || 0);

test('unticked "remember me" issues a session cookie, not a persistent one', async () => {
  await app.createUser(admin.token, { name: 'Forget Me', username: 'forgetme', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const r = await api('POST', '/auth/login', {
    deviceId: 'dev-forget-0001',
    body: { username: 'forgetme', password: 'Learn@1234', deviceId: 'dev-forget-0001', rememberMe: false },
  });
  assert.equal(r.status, 200);
  const cookie = refreshCookie(r);
  assert.ok(cookie, 'a refresh cookie is still set');
  assert.ok(!/Max-Age|Expires/i.test(cookie),
    `an unticked login must not outlive the browser session, got: ${cookie}`);
});

test('ticked "remember me" issues a 30-day cookie', async () => {
  await app.createUser(admin.token, { name: 'Remember Me', username: 'rememberme', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const r = await api('POST', '/auth/login', {
    deviceId: 'dev-remember-0001',
    body: { username: 'rememberme', password: 'Learn@1234', deviceId: 'dev-remember-0001', rememberMe: true },
  });
  assert.equal(r.status, 200);
  assert.ok(maxAgeOf(refreshCookie(r)) > 29 * 86400,
    `expected roughly 30 days, got ${refreshCookie(r)}`);
});

test('refreshing does not downgrade a remembered session', async () => {
  await app.createUser(admin.token, { name: 'Keep Me', username: 'keepme', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  const r = await api('POST', '/auth/login', {
    deviceId: 'dev-keep-0001', platform: 'android',
    body: { username: 'keepme', password: 'Learn@1234', deviceId: 'dev-keep-0001', rememberMe: true },
  });
  assert.equal(r.status, 200);
  const refreshed = await api('POST', '/auth/refresh', {
    deviceId: 'dev-keep-0001', platform: 'android', body: { refreshToken: r.data.refreshToken },
  });
  assert.equal(refreshed.status, 200);
  assert.ok(maxAgeOf(refreshCookie(refreshed)) > 29 * 86400,
    `a refresh must preserve the 30-day lifetime, got ${refreshCookie(refreshed)}`);
});
