/**
 * Enrollment packages and payments.
 *
 * Two rules carry the whole feature: a teacher sees which package a student
 * took but never what they paid, and the per-course figures cover every
 * student however they enrolled.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, owner, admin, ada, zoe, courseId;
const students = ['pam', 'pete', 'pia', 'paul'];

before(async () => {
  app = await startApp();
  api = app.api;
  owner = await app.loginAndOnboard(CREDENTIALS.owner.username, CREDENTIALS.owner.password, { deviceId: 'dev-owner-01' });
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Ada', username: 'ada', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Zoe', username: 'zoe', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  for (const s of students) {
    await app.createUser(admin.token, { name: s.toUpperCase(), username: s, password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  }
  ada = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-0001' });
  zoe = await app.loginAs('zoe', 'Teach@1234', { deviceId: 'dev-zoe-0001' });

  const course = await api('POST', '/courses', {
    token: ada.token, deviceId: ada.deviceId,
    body: { title: 'Paid Course', category: 'Test', isPublished: true },
  });
  courseId = course.data._id;
});
after(async () => { await app.stop(); });

const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });
const enrol = (student, body) => as(admin, 'POST', `/enrollments/courses/${courseId}/students`, { student, ...body });
const roster = async (session) => (await as(session, 'GET', `/enrollments/courses/${courseId}/students`)).data.items;
const rowFor = async (session, username) => (await roster(session)).find((e) => e.student?.username === username);

test('an administrator records the package and the amount when enrolling', async () => {
  const r = await enrol('pam', { package: 'mid', amountPaid: 40, paymentNote: 'cash' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.package, 'mid');
  assert.equal(r.data.amountPaid, 40);
  assert.equal(r.data.currency, 'JOD', 'the platform currency is the dinar, and the enrollment keeps it');

  await enrol('pete', { package: 'final', amountPaid: 45 });
  await enrol('pia', { package: 'full', amountPaid: 80 });
});

test('the package is required to be one of the three', async () => {
  const bad = await enrol('paul', { package: 'semester', amountPaid: 10 });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'VALIDATION_ERROR');
  const negative = await enrol('paul', { package: 'full', amountPaid: -5 });
  assert.equal(negative.status, 400);
});

test('enrolling without payment details still works and defaults to the full course', async () => {
  const r = await enrol('paul', {});
  assert.equal(r.status, 201);
  assert.equal(r.data.package, 'full');
  assert.equal(r.data.amountPaid, 0);
});

test('the teacher sees each student\'s package but never the money', async () => {
  const rows = await roster(ada);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((e) => e.student.username).sort(),
    [...students].sort(),
  );
  const pam = rows.find((e) => e.student.username === 'pam');
  assert.equal(pam.package, 'mid', 'the teacher needs to know which package a student took');

  for (const row of rows) {
    for (const field of ['amountPaid', 'currency', 'paymentNote', 'paymentRecordedBy', 'paymentRecordedAt']) {
      assert.equal(row[field], undefined, `the roster leaked ${field} to a teacher`);
    }
  }
});

test('an administrator and the owner do see the money', async () => {
  for (const staff of [admin, owner]) {
    const pam = await rowFor(staff, 'pam');
    assert.equal(pam.package, 'mid');
    assert.equal(pam.amountPaid, 40);
    assert.equal(pam.currency, 'JOD');
    assert.equal(pam.paymentNote, 'cash');
  }
});

test('a teacher cannot reach the payment endpoints at all', async () => {
  const patch = await as(ada, 'PATCH', `/enrollments/courses/${courseId}/students/${(await rowFor(admin, 'pam')).student._id}/payment`, { amountPaid: 999 });
  assert.equal(patch.status, 403, 'a teacher was allowed to edit a payment');

  const revenue = await as(ada, 'GET', `/enrollments/courses/${courseId}/revenue`);
  assert.equal(revenue.status, 403, 'a teacher was allowed to read the course revenue');

  // The amount is unchanged.
  assert.equal((await rowFor(admin, 'pam')).amountPaid, 40);
});

test('a teacher from another course reaches nothing here', async () => {
  assert.equal((await as(zoe, 'GET', `/enrollments/courses/${courseId}/students`)).status, 403);
  assert.equal((await as(zoe, 'GET', `/enrollments/courses/${courseId}/revenue`)).status, 403);
});

test('an administrator can correct a package or an amount, and it is audited', async () => {
  const pam = await rowFor(admin, 'pam');
  const fix = await as(admin, 'PATCH', `/enrollments/courses/${courseId}/students/${pam.student._id}/payment`, {
    package: 'full', amountPaid: 75, paymentNote: 'upgraded mid-term',
  });
  assert.equal(fix.status, 200, JSON.stringify(fix.data));
  assert.equal(fix.data.package, 'full');
  assert.equal(fix.data.amountPaid, 75);

  const after = await rowFor(admin, 'pam');
  assert.equal(after.amountPaid, 75);
  assert.equal((await rowFor(ada, 'pam')).package, 'full', 'the teacher sees the corrected package');

  const logs = await as(owner, 'GET', '/admin/audit-logs?limit=50');
  const entry = logs.data.items.find((l) => l.action === 'ENROLLMENT_PAYMENT_RECORDED');
  assert.ok(entry, 'the correction was not audited');
  assert.equal(entry.meta.before.amountPaid, 40);
  assert.equal(entry.meta.after.amountPaid, 75);
});

test('the course figures add up, split by package', async () => {
  const { status, data } = await as(admin, 'GET', `/enrollments/courses/${courseId}/revenue`);
  assert.equal(status, 200);
  assert.equal(data.course.currency, 'JOD');

  // pam 75 (full, corrected) + pete 45 (final) + pia 80 (full) + paul 0 (full)
  assert.equal(data.totals.students, 4);
  assert.equal(data.totals.collected, 200);
  assert.equal(data.totals.unrecorded, 1, 'paul paid nothing recorded');
  assert.equal(data.totals.average, 50);

  const by = Object.fromEntries(data.byPackage.map((p) => [p.package, p]));
  assert.deepEqual(Object.keys(by).sort(), ['final', 'full', 'mid']);
  assert.equal(by.mid.students, 0);
  assert.equal(by.final.students, 1);
  assert.equal(by.final.collected, 45);
  assert.equal(by.full.students, 3);
  assert.equal(by.full.collected, 155);
  assert.equal(by.full.average, Math.round((155 / 3) * 100) / 100);
});

test('a code carries its package and amount onto the student who redeems it', async () => {
  const codes = await as(admin, 'POST', `/enrollments/courses/${courseId}/codes`, {
    count: 1, maxUses: 1, package: 'mid', amountPaid: 35,
  });
  assert.equal(codes.status, 201);
  assert.equal(codes.data[0].package, 'mid');

  await app.createUser(admin.token, { name: 'Zed', username: 'zed', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  const zed = await app.loginAs('zed', 'Learn@1234', { deviceId: 'dev-zed-0001' });
  const redeemed = await as(zed, 'POST', '/enrollments/redeem', { code: codes.data[0].code });
  assert.equal(redeemed.status, 201, JSON.stringify(redeemed.data));

  const row = await rowFor(admin, 'zed');
  assert.equal(row.package, 'mid', 'a code redemption must not be missing from the figures');
  assert.equal(row.amountPaid, 35);

  const revenue = (await as(admin, 'GET', `/enrollments/courses/${courseId}/revenue`)).data;
  assert.equal(revenue.totals.students, 5);
  assert.equal(revenue.totals.collected, 235);
});

test('a student never receives payment fields for their own enrollment', async () => {
  const pam = await app.loginAs('pam', 'Learn@1234', { deviceId: 'dev-pam-0001' });
  const mine = await as(pam, 'GET', '/enrollments/mine');
  assert.equal(mine.status, 200);
  const row = mine.data.find((e) => String(e.course._id) === String(courseId));
  assert.ok(row, 'the student should still see the course');
  assert.equal(row.package, 'full');
  assert.equal(row.amountPaid, undefined, 'a student was sent an amount');
  assert.equal(row.paymentNote, undefined);
});

test('removing a student keeps their payment in the figures', async () => {
  const paul = await rowFor(admin, 'paul');
  assert.equal((await as(admin, 'DELETE', `/enrollments/courses/${courseId}/students/${paul.student._id}`)).status, 200);

  const revenue = (await as(admin, 'GET', `/enrollments/courses/${courseId}/revenue`)).data;
  assert.equal(revenue.totals.collected, 235, 'money already taken must not disappear from the books');
  assert.equal(revenue.totals.students, 4, 'but a removed student stops counting towards the head count');
});
