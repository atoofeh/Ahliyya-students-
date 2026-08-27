const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, t1, t2, s1, s2, c1, fileC1, submissionS1, attemptS1, bookmarkS1, threadC1, videoC1;
before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  for (const [n, u, r] of [['Ada', 'ada', 'teacher'], ['Bob', 'bob', 'teacher'], ['Sam', 'sam', 'student'], ['Sue', 'sue', 'student']]) {
    await app.createUser(admin.token, { name: n, username: u, password: r === 'teacher' ? 'Teach@1234' : 'Learn@1234', role: r }, 'dev-admin');
  }
  t1 = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-01' });
  t2 = await app.loginAs('bob', 'Teach@1234', { deviceId: 'dev-bob-01' });
  s1 = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-01' });
  s2 = await app.loginAs('sue', 'Learn@1234', { deviceId: 'dev-sue-01' });
  const as = (s, m, p, body) => api(m, p, { token: s.token, deviceId: s.deviceId, body });
  c1 = (await as(t1, 'POST', '/courses', { title: 'C1', isPublished: true })).data._id;
  const c2 = (await as(t2, 'POST', '/courses', { title: 'C2', isPublished: true })).data._id;
  await as(admin, 'POST', `/enrollments/courses/${c1}/students`, { student: 'sam' });
  await as(admin, 'POST', `/enrollments/courses/${c2}/students`, { student: 'sue' });

  const form = new FormData();
  form.append('file', new Blob([Buffer.from('%PDF-1.4\n')], { type: 'application/pdf' }), 'c1.pdf');
  fileC1 = (await (await fetch(`${app.baseUrl}/api/v1/files/courses/${c1}/documents`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${t1.token}`, 'x-device-id': t1.deviceId } })).json())._id;

  const assignment = (await as(t1, 'POST', `/assignments/courses/${c1}`, { title: 'A1' })).data;
  submissionS1 = (await as(s1, 'POST', `/assignments/courses/${c1}/${assignment._id}/submit`, { text: 'my work' })).data._id;

  const section = (await as(t1, 'POST', `/courses/${c1}/sections`, { title: 'S' })).data;
  const lesson = (await as(t1, 'POST', `/courses/${c1}/lessons`, { section: section._id, title: 'L', type: 'text', content: 'x' })).data;
  bookmarkS1 = (await as(s1, 'POST', '/bookmarks', { lesson: lesson._id })).data._id;

  const q = (await as(t1, 'POST', `/quizzes/courses/${c1}/questions`, { type: 'true_false', text: 'T?', options: [{ id: 'true', text: 'T', isCorrect: true }, { id: 'false', text: 'F', isCorrect: false }] })).data;
  const quiz = (await as(t1, 'POST', `/quizzes/courses/${c1}`, { title: 'Q', questions: [q._id], isPublished: true })).data;
  attemptS1 = (await as(s1, 'POST', `/quizzes/courses/${c1}/${quiz._id}/start`)).data.attemptId;

  threadC1 = (await as(s1, 'POST', `/qa/courses/${c1}`, { title: 'Help', body: 'Question' })).data._id;
  videoC1 = (await as(t1, 'POST', `/videos/courses/${c1}/uploads`, { originalName: 'v.mp4', sizeBytes: 100 })).data.videoId;
});
after(async () => { await app.stop(); });

const as = (s, m, p, body) => api(m, p, { token: s.token, deviceId: s.deviceId, body });
const denied = (r, label) => assert.ok([403, 404].includes(r.status), `${label}: expected 403/404 got ${r.status} ${JSON.stringify(r.data)}`);

test('cross-course and cross-user object access is denied', async () => {
  denied(await as(s2, 'GET', `/files/${fileC1}/content`), 'file of another course');
  denied(await as(t2, 'GET', `/files/${fileC1}/content`), 'file of another teacher\'s course');
  denied(await as(t2, 'DELETE', `/files/${fileC1}`), 'delete another teacher\'s file');
  denied(await as(s2, 'GET', `/quizzes/attempts/${attemptS1}`), 'another student\'s attempt');
  denied(await as(t2, 'POST', `/assignments/submissions/${submissionS1}/grade`, { points: 100 }), 'grade a submission in another teacher\'s course');
  denied(await as(s2, 'DELETE', `/bookmarks/${bookmarkS1}`), 'another student\'s bookmark');
  denied(await as(s2, 'POST', `/qa/${threadC1}/replies`, { body: 'not enrolled' }), 'reply in a course not enrolled in');
  denied(await as(s2, 'POST', `/videos/${videoC1}/token`), 'stream token for another course');
  denied(await as(t2, 'GET', `/enrollments/courses/${c1}/students`), 'roster of another teacher');
  denied(await as(t2, 'GET', `/videos/courses/${c1}`), 'video list of another course');
  denied(await as(s1, 'POST', `/quizzes/attempts/${attemptS1}/grade`, { grades: [] }), 'student grading');
});

test('the rightful owners still succeed', async () => {
  assert.equal((await as(s1, 'GET', `/quizzes/attempts/${attemptS1}`)).status, 200);
  assert.equal((await as(t1, 'POST', `/assignments/submissions/${submissionS1}/grade`, { points: 90 })).status, 200);
  assert.equal((await as(s1, 'DELETE', `/bookmarks/${bookmarkS1}`)).status, 200);
});
