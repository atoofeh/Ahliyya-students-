const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

/**
 * Image questions. An image is an attachment on the *prompt* and works with any
 * answer format; `image_choice` is the separate case where the options themselves
 * are pictures. Both have to reach the student, and a quiz the teacher has not
 * published yet must say so rather than claim it does not exist.
 */
let app, api, admin, teacher, student, courseId, T, S;

const upload = async (bytes, { name = 'diagram.png', type = 'image/png', scope = 'question' } = {}) => {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), name);
  form.append('scope', scope);
  const res = await fetch(`${app.baseUrl}/api/v1/files/courses/${courseId}/images`, {
    method: 'POST', body: form,
    headers: { Authorization: `Bearer ${teacher.token}`, 'x-device-id': teacher.deviceId },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Tea', username: 'tea', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Stu', username: 'stu', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  teacher = await app.loginAs('tea', 'Teach@1234', { deviceId: 'dev-tea-0001' });
  student = await app.loginAs('stu', 'Learn@1234', { deviceId: 'dev-stu-0001' });
  T = { token: teacher.token, deviceId: teacher.deviceId };
  S = { token: student.token, deviceId: student.deviceId };
  courseId = (await api('POST', '/courses', { ...T, body: { title: 'Anatomy', isPublished: true } })).data._id;
  await api('POST', `/enrollments/courses/${courseId}/students`, {
    token: admin.token, deviceId: 'dev-admin-01', body: { student: 'stu' },
  });
});
after(async () => { await app.stop(); });

test('an image rides on any answer format, and reaches the student who has to answer it', async () => {
  const img = await upload(PNG);
  assert.equal(img.status, 201, JSON.stringify(img.data));

  // Not a choice question — the image is the prompt, the answer is typed.
  const question = await api('POST', `/quizzes/courses/${courseId}/questions`, {
    ...T,
    body: { type: 'short_answer', text: 'Name the bone arrowed in the image', image: img.data._id, correctAnswers: ['femur'] },
  });
  assert.equal(question.status, 201, JSON.stringify(question.data));
  assert.equal(question.data.image, img.data._id);

  const quiz = await api('POST', `/quizzes/courses/${courseId}`, {
    ...T, body: { title: 'Bones', questions: [question.data._id], isPublished: true },
  });
  assert.equal(quiz.status, 201, JSON.stringify(quiz.data));

  const attempt = await api('POST', `/quizzes/courses/${courseId}/${quiz.data._id}/start`, S);
  assert.equal(attempt.status, 201, JSON.stringify(attempt.data));
  assert.equal(attempt.data.questions[0].image, img.data._id, 'the image must survive into the attempt snapshot');

  // And the enrolled student must actually be allowed to fetch it.
  const served = await fetch(`${app.baseUrl}/api/v1/files/${img.data._id}/content`, {
    headers: { Authorization: `Bearer ${student.token}`, 'x-device-id': student.deviceId },
  });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
});

test('an image-choice option counts as filled when it has a picture but no text', async () => {
  const [a, b] = await Promise.all([upload(PNG, { name: 'a.png' }), upload(PNG, { name: 'b.png' })]);
  const question = await api('POST', `/quizzes/courses/${courseId}/questions`, {
    ...T,
    body: {
      type: 'image_choice', text: 'Which scan shows a fracture?',
      options: [{ id: 'a', image: a.data._id, isCorrect: true }, { id: 'b', image: b.data._id }],
    },
  });
  assert.equal(question.status, 201, JSON.stringify(question.data));

  const quiz = (await api('POST', `/quizzes/courses/${courseId}`, {
    ...T, body: { title: 'Scans', questions: [question.data._id], isPublished: true },
  })).data;
  const attempt = await api('POST', `/quizzes/courses/${courseId}/${quiz._id}/start`, S);
  const served = attempt.data.questions[0].options.map((o) => o.image).sort();
  assert.deepEqual(served, [a.data._id, b.data._id].sort(), 'option pictures must reach the student');
});

test('an image-choice option with neither text nor a picture is rejected, not saved blank', async () => {
  const blank = await api('POST', `/quizzes/courses/${courseId}/questions`, {
    ...T,
    body: {
      type: 'image_choice', text: 'Which one?',
      options: [{ id: 'a', isCorrect: true }, { id: 'b' }],
    },
  });
  assert.equal(blank.status, 400, 'a question whose options are all blank is unanswerable');
  assert.match(blank.data.message, /text or an image/i);
});

test('a student sent to a quiz the teacher never published is told that, not that it does not exist', async () => {
  const question = (await api('POST', `/quizzes/courses/${courseId}/questions`, {
    ...T, body: { type: 'short_answer', text: 'Draft question', correctAnswers: ['x'] },
  })).data;
  const draft = (await api('POST', `/quizzes/courses/${courseId}`, {
    ...T, body: { title: 'Not published yet', questions: [question._id] },
  })).data;
  assert.equal(draft.isPublished, false);

  const start = await api('POST', `/quizzes/courses/${courseId}/${draft._id}/start`, S);
  assert.equal(start.status, 403, JSON.stringify(start.data));
  assert.equal(start.data.code, 'QUIZ_NOT_PUBLISHED');
  assert.doesNotMatch(start.data.message, /not found/i);
});

test('a quiz id that belongs to no quiz is still a plain 404', async () => {
  const missing = await api('POST', `/quizzes/courses/${courseId}/6aa0000000000000000000aa/start`, S);
  assert.equal(missing.status, 404);
  assert.match(missing.data.message, /not found/i);
});
