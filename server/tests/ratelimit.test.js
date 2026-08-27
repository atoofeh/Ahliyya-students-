process.env.RATE_LIMIT_MULTIPLIER = '1';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin;
before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  await app.createUser(admin.token, { name: 'Alpha', username: 'alpha', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  await app.createUser(admin.token, { name: 'Beta', username: 'beta', password: 'Learn@1234', role: 'student' }, 'dev-admin');
});
after(async () => { await app.stop(); });

const login = (username, ip, i = 0) => api('POST', '/auth/login', {
  deviceId: `dev-${username}-000${i % 10}`, headers: { 'X-Forwarded-For': ip },
  body: { username, password: 'WrongPass1', deviceId: `dev-${username}-000${i % 10}` },
});

test('per-username bucket: 10 failures for one account from many IPs → 429; another account is unaffected', async () => {
  for (let i = 0; i < 10; i++) {
    const r = await login('alpha', `10.0.0.${i + 1}`, i);
    assert.equal(r.status, 401, `attempt ${i + 1}`);
  }
  const blocked = await login('alpha', '10.0.0.99');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.code, 'RATE_LIMITED');
  const other = await login('beta', '10.0.0.99');
  assert.equal(other.status, 401, 'same IP, different account still reaches the password check');
});

test('per-IP bucket: 30 attempts from one address → 429 regardless of username', async () => {
  let last;
  for (let i = 0; i < 30; i++) last = await login(`ghost${i}`, '10.9.9.9', i);
  assert.equal(last.status, 401);
  const blocked = await login('ghost99', '10.9.9.9');
  assert.equal(blocked.status, 429);
});

test('quiz autosave bucket: 120 writes per minute per IP', async () => {
  const s = await app.loginAs('beta', 'Learn@1234', { deviceId: 'dev-beta-quiz' });
  let last;
  for (let i = 0; i < 120; i++) {
    last = await api('POST', '/quizzes/attempts/000000000000000000000000/answers', { token: s.token, deviceId: 'dev-beta-quiz', headers: { 'X-Forwarded-For': '10.7.7.7' }, body: { answers: [] } });
  }
  assert.equal(last.status, 404, 'unknown attempt, but not rate limited yet');
  const blocked = await api('POST', '/quizzes/attempts/000000000000000000000000/answers', { token: s.token, deviceId: 'dev-beta-quiz', headers: { 'X-Forwarded-For': '10.7.7.7' }, body: { answers: [] } });
  assert.equal(blocked.status, 429);
});
