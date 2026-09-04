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

test('question bucket: 20 questions per account, and one student cannot spend another\'s budget', async () => {
  await app.createUser(admin.token, { name: 'Tess', username: 'tess', password: 'Teach@1234', role: 'teacher' }, 'dev-admin');
  const teacher = await app.loginAs('tess', 'Teach@1234', { deviceId: 'dev-tess-0001' });
  const course = await api('POST', '/courses', {
    token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Rate Limited', category: 'Test', isPublished: true },
  });
  const courseId = course.data._id;
  // Fresh accounts: the login-bucket tests above have already spent alpha's and beta's.
  await app.createUser(admin.token, { name: 'Qasker', username: 'qasker', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  await app.createUser(admin.token, { name: 'Qmate', username: 'qmate', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  for (const student of ['qasker', 'qmate']) {
    await api('POST', `/enrollments/courses/${courseId}/students`, { token: admin.token, deviceId: 'dev-admin', body: { student } });
  }
  const alpha = await app.loginAs('qasker', 'Learn@1234', { deviceId: 'dev-qasker-01' });
  const beta = await app.loginAs('qmate', 'Learn@1234', { deviceId: 'dev-qmate-001' });

  const ask = (s, i) => api('POST', `/qa/courses/${courseId}`, {
    // Same network for both students — a class shares one NAT, so the bucket
    // must key on the account, not the address.
    token: s.token, deviceId: s.deviceId, headers: { 'X-Forwarded-For': '10.5.5.5' },
    body: { title: `Question ${i}`, body: 'Please explain.' },
  });

  let last;
  for (let i = 0; i < 20; i++) last = await ask(alpha, i);
  assert.equal(last.status, 201, 'the 20th question should still go through');
  const blocked = await ask(alpha, 21);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.code, 'RATE_LIMITED');

  const other = await ask(beta, 1);
  assert.equal(other.status, 201, 'a classmate on the same network must still be able to ask');
});
