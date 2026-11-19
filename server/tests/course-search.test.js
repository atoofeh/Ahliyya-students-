/** Literal partial course search must compose with visibility and staff scope. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');
const Course = require('../src/models/Course');

let app, admin, teacher, colleague, student;
const courses = {};

before(async () => {
  app = await startApp();
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'search-admin-device' });
  for (const [username, role] of [['searchteacher', 'teacher'], ['searchcolleague', 'teacher'], ['searchstudent', 'student']]) {
    await app.createUser(admin.token, { name: username, username, password: 'Search@1234', role }, admin.deviceId);
  }
  teacher = await app.loginAs('searchteacher', 'Search@1234', { deviceId: 'search-teacher-device' });
  colleague = await app.loginAs('searchcolleague', 'Search@1234', { deviceId: 'search-colleague-device' });
  student = await app.loginAs('searchstudent', 'Search@1234', { deviceId: 'search-student-device' });
  const add = async (name, data) => {
    courses[name] = await Course.create({
      teacher: teacher.user.id, title: name, category: 'General', isPublished: true, visibility: 'listed', ...data,
    });
  };
  await add('title', { title: 'Biochemistry foundations' });
  await add('description', { title: 'Laboratory methods', description: 'Mitochondrial respiration and cell energy' });
  await add('category', { title: 'Theory and applications', category: 'Quantum sciences' });
  await add('tags', { title: 'Plant growth', tags: ['phototropic-laboratory'] });
  await add('arabic', { title: 'مبادئ الأحياء الدقيقة' });
  await add('literal', { title: 'Math [A+B].* (2026)? \\ notes' });
  await add('staffOwned', { title: 'Accessmatch creator course', visibility: 'hidden', isPublished: false });
  await add('staffShared', { title: 'Accessmatch shared course', teacher: colleague.user.id, coTeachers: [teacher.user.id] });
  await add('staffForeign', { title: 'Accessmatch other teacher course', teacher: colleague.user.id });
  await add('staffDeleted', { title: 'Accessmatch deleted course', deletedAt: new Date() });
  await add('visible', { title: 'Visibilityneedle listed course' });
  await add('hidden', { title: 'Visibilityneedle hidden course', visibility: 'hidden' });
  await add('draft', { title: 'Visibilityneedle draft course', isPublished: false });
  await add('deleted', { title: 'Visibilityneedle deleted course', deletedAt: new Date() });
  for (const [index, name] of ['Alpha', 'Beta', 'Gamma'].entries()) {
    await add(`page${name}`, { title: `Pagecase ${name}`, createdAt: new Date(2026, 0, index + 1) });
  }
});

after(async () => { await app?.stop(); });

const search = async (session, endpoint, query = {}) => {
  const response = await app.api('GET', `${endpoint}?${new URLSearchParams(query)}`, {
    token: session.token, deviceId: session.deviceId,
  });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
};
const ids = (result) => result.items.map((course) => String(course._id)).sort();
const expected = (...names) => names.map((name) => String(courses[name]._id)).sort();

for (const [field, query] of [['title', 'OCHEM'], ['description', 'chondri'], ['category', 'uantum'], ['tags', 'tropic']]) {
  test(`partial ${field} search works consistently for catalog, admin and teacher lists`, async () => {
    for (const [session, endpoint] of [[student, '/courses/catalog'], [admin, '/courses/mine'], [teacher, '/courses/mine']]) {
      const result = await search(session, endpoint, { search: `  ${query}  ` });
      assert.deepEqual(ids(result), expected(field), `${endpoint}: ${query}`);
      assert.equal(result.meta.total, 1);
    }
  });
}

test('Arabic substrings match without requiring a complete word', async () => {
  for (const [session, endpoint] of [[student, '/courses/catalog'], [admin, '/courses/mine'], [teacher, '/courses/mine']]) {
    assert.deepEqual(ids(await search(session, endpoint, { search: 'حياء' })), expected('arabic'));
  }
});

test('regular expression punctuation is treated literally and cannot match every course', async () => {
  for (const query of ['[A+B].*', '.*', '(2026)?', '\\']) {
    for (const [session, endpoint] of [[student, '/courses/catalog'], [admin, '/courses/mine'], [teacher, '/courses/mine']]) {
      const result = await search(session, endpoint, { search: query });
      assert.deepEqual(ids(result), expected('literal'), `${endpoint}: ${query}`);
    }
  }
});

test('empty and whitespace-only searches retain ordinary list visibility and staff scope', async () => {
  for (const [session, endpoint] of [[student, '/courses/catalog'], [admin, '/courses/mine'], [teacher, '/courses/mine']]) {
    const ordinary = await search(session, endpoint, { limit: 100 });
    const empty = await search(session, endpoint, { search: '', limit: 100 });
    const whitespace = await search(session, endpoint, { search: '   ', limit: 100 });
    assert.deepEqual(ids(empty), ids(ordinary));
    assert.deepEqual(ids(whitespace), ids(ordinary));
    assert.equal(empty.meta.total, ordinary.meta.total);
    assert.equal(whitespace.meta.total, ordinary.meta.total);
  }
});

test('search composes with creator and accepted co-teacher authorization', async () => {
  const result = await search(teacher, '/courses/mine', { search: 'accessmatch' });
  assert.deepEqual(ids(result), expected('staffOwned', 'staffShared'));
  assert.equal(result.meta.total, 2);
  assert.ok(!ids(result).includes(String(courses.staffForeign._id)), 'a matching foreign course must remain inaccessible');
  const byColleague = await search(colleague, '/courses/mine', { search: 'accessmatch' });
  assert.deepEqual(ids(byColleague), expected('staffShared', 'staffForeign'));
  const noMatch = await search(teacher, '/courses/mine', { search: 'definitelynotacoursetitle' });
  assert.deepEqual(noMatch.items, [], 'being course staff alone must not satisfy the search condition');
  assert.equal(noMatch.meta.total, 0);
});

test('catalog keeps hidden, draft and deleted courses out while staff lists retain authorized drafts', async () => {
  const catalog = await search(student, '/courses/catalog', { search: 'visibilityneedle' });
  assert.deepEqual(ids(catalog), expected('visible'));
  assert.equal(catalog.meta.total, 1);
  for (const session of [admin, teacher]) {
    const result = await search(session, '/courses/mine', { search: 'visibilityneedle' });
    assert.deepEqual(ids(result), expected('visible', 'hidden', 'draft'));
    assert.equal(result.meta.total, 3);
  }
});

test('filtered totals, page boundaries and results stay consistent across list endpoints', async () => {
  for (const [session, endpoint] of [[student, '/courses/catalog'], [admin, '/courses/mine'], [teacher, '/courses/mine']]) {
    const first = await search(session, endpoint, { search: 'PAGECASE', limit: 2, page: 1 });
    const second = await search(session, endpoint, { search: 'PAGECASE', limit: 2, page: 2 });
    assert.equal(first.items.length, 2);
    assert.equal(second.items.length, 1);
    assert.deepEqual([...ids(first), ...ids(second)].sort(), expected('pageAlpha', 'pageBeta', 'pageGamma'));
    assert.equal(first.meta.total, 3);
    assert.equal(second.meta.total, 3);
    assert.equal(first.meta.totalPages, 2);
    assert.equal(first.meta.hasNextPage, true);
    assert.equal(first.meta.hasPrevPage, false);
    assert.equal(second.meta.hasNextPage, false);
    assert.equal(second.meta.hasPrevPage, true);
    const beyond = await search(session, endpoint, { search: 'PAGECASE', limit: 2, page: 3 });
    assert.deepEqual(beyond.items, []);
    assert.equal(beyond.meta.total, 3);
  }
});

test('a student cannot use staff search to enumerate hidden or draft courses', async () => {
  const response = await app.api('GET', '/courses/mine?search=visibilityneedle', {
    token: student.token, deviceId: student.deviceId,
  });
  assert.equal(response.status, 403);
});
