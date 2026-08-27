const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, teacher, student, attemptId, qid;
before(async () => {
  app = await startApp();
  api = app.api;
  const admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  await app.createUser(admin.token, { name: 'Tea', username: 'tea', password: 'Teach@1234', role: 'teacher' }, 'dev-admin');
  await app.createUser(admin.token, { name: 'Stu', username: 'stu', password: 'Learn@1234', role: 'student' }, 'dev-admin');
  teacher = await app.loginAs('tea', 'Teach@1234', { deviceId: 'dev-tea-01' });
  student = await app.loginAs('stu', 'Learn@1234', { deviceId: 'dev-stu-01' });
  const course = (await api('POST', '/courses', { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Autosave', isPublished: true } })).data;
  await api('POST', `/enrollments/courses/${course._id}/students`, { token: admin.token, deviceId: 'dev-admin', body: { student: 'stu' } });
  const q = (await api('POST', `/quizzes/courses/${course._id}/questions`, { token: teacher.token, deviceId: teacher.deviceId, body: { type: 'short_answer', text: 'Capital of Jordan?', correctAnswers: ['amman'] } })).data;
  qid = q._id;
  const quiz = (await api('POST', `/quizzes/courses/${course._id}`, { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Q', questions: [qid], isPublished: true } })).data;
  attemptId = (await api('POST', `/quizzes/courses/${course._id}/${quiz._id}/start`, { token: student.token, deviceId: student.deviceId })).data.attemptId;
});
after(async () => { await app.stop(); });

const save = (text, clientSavedAt) => api('POST', `/quizzes/attempts/${attemptId}/answers`, {
  token: student.token, deviceId: student.deviceId, body: { answers: [{ questionId: qid, textAnswer: text }], clientSavedAt },
});
const current = async () => (await api('GET', `/quizzes/attempts/${attemptId}`, { token: student.token, deviceId: student.deviceId })).data.answers[0]?.textAnswer;

test('a stale autosave never overwrites a newer one', async () => {
  const t1 = new Date(Date.now() - 20000).toISOString();
  const t2 = new Date(Date.now() - 10000).toISOString();
  const newer = await save('Amman', t2);
  assert.equal(newer.status, 200);
  assert.equal(newer.data.saved, true);
  const older = await save('Amm', t1);
  assert.equal(older.status, 200);
  assert.equal(older.data.saved, false);
  assert.equal(older.data.stale, true);
  assert.equal(await current(), 'Amman');
});

test('saves without a client timestamp still work; submit always wins', async () => {
  const r = await save('amman ');
  assert.equal(r.data.saved, true);
  const submit = await api('POST', `/quizzes/attempts/${attemptId}/submit`, {
    token: student.token, deviceId: student.deviceId, body: { answers: [{ questionId: qid, textAnswer: 'Amman' }] },
  });
  assert.equal(submit.status, 200, JSON.stringify(submit.data));
  assert.equal(submit.data.score, 1);
});
