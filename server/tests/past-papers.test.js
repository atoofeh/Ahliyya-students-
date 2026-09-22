/**
 * Past questions, and the welcome tour that points students at them.
 *
 * The library is institution-wide on purpose: a student retaking an exam may
 * no longer be enrolled in anything, and those are exactly the people these
 * papers are for. Administrators curate it; everyone signed in reads it.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, admin, ada, sam;

// A real (tiny) PDF: the magic-byte check refuses anything that only claims to be one.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

const upload = async (session, { name = 'أجوبة عربي استدراكي.pdf', bytes = PDF, type = 'application/pdf', title, subject } = {}) => {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), name);
  if (title !== undefined) form.append('title', title);
  if (subject !== undefined) form.append('subject', subject);
  const res = await fetch(`${app.baseUrl}/api/v1/past-papers`, {
    method: 'POST', body: form,
    headers: { Authorization: `Bearer ${session.token}`, 'x-device-id': session.deviceId },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const as = (s, method, path, body) => api(method, path, { token: s.token, deviceId: s.deviceId, body });
const content = (s, id) => fetch(`${app.baseUrl}/api/v1/files/${id}/content`, {
  headers: { Authorization: `Bearer ${s.token}`, 'x-device-id': s.deviceId },
});

before(async () => {
  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Ada', username: 'ada', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  await app.createUser(admin.token, { name: 'Sam', username: 'sam', password: 'Learn@1234', role: 'student' }, 'dev-admin-01');
  ada = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-0001' });
  sam = await app.loginAs('sam', 'Learn@1234', { deviceId: 'dev-sam-0001' });
});
after(async () => { await app.stop(); });

// ── the library ──────────────────────────────────────────────────────

test('an administrator adds a paper, and a student with no enrolment can list and open it', async () => {
  const added = await upload(admin, { title: 'أجوبة عربي استدراكي', subject: 'اللغة العربية' });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  assert.equal(added.data.title, 'أجوبة عربي استدراكي');
  assert.equal(added.data.subject, 'اللغة العربية');
  assert.equal(added.data.storagePath, undefined, 'the disk path must never reach a client');

  const list = await as(sam, 'GET', '/past-papers');
  assert.equal(list.status, 200);
  assert.ok(list.data.items.some((p) => p._id === added.data._id), 'the student could not see the paper');

  // Sam is enrolled in nothing — the paper opens anyway.
  const res = await content(sam, added.data._id);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
});

test('a paper with no title is named after its file, not left blank', async () => {
  const added = await upload(admin, { name: 'past-maths-2025.pdf' });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  assert.equal(added.data.title, 'past-maths-2025');
});

test('students and teachers can read the library but never change it', async () => {
  for (const who of [sam, ada]) {
    const tried = await upload(who, { title: 'Not allowed' });
    assert.equal(tried.status, 403, `${who.user.username} was allowed to upload a paper`);
  }
  const [paper] = (await as(admin, 'GET', '/past-papers')).data.items;
  for (const who of [sam, ada]) {
    assert.equal((await as(who, 'PATCH', `/past-papers/${paper._id}`, { title: 'x' })).status, 403);
    assert.equal((await as(who, 'DELETE', `/past-papers/${paper._id}`)).status, 403);
  }
});

test('a file that only claims to be a PDF is refused', async () => {
  const fake = await upload(admin, { bytes: Buffer.from('MZ\x90\x00 not a pdf at all'), title: 'Sneaky' });
  assert.equal(fake.status, 400);
  assert.equal(fake.data.code, 'BAD_FILE_CONTENT');
});

test('an administrator can rename a paper and remove it', async () => {
  const added = await upload(admin, { title: 'Old name' });
  const renamed = await as(admin, 'PATCH', `/past-papers/${added.data._id}`, { title: 'أجوبة حاسوب استدراكي', subject: 'الحاسوب' });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.equal(renamed.data.title, 'أجوبة حاسوب استدراكي');

  assert.equal((await as(admin, 'DELETE', `/past-papers/${added.data._id}`)).status, 200);
  const list = await as(sam, 'GET', '/past-papers');
  assert.ok(!list.data.items.some((p) => p._id === added.data._id), 'a removed paper is still listed');
});

test('the library cannot be used to delete an ordinary file by id', async () => {
  const FileAsset = require('../src/models/FileAsset');
  const other = await FileAsset.create({
    uploadedBy: admin.user.id, scope: 'global', kind: 'documents',
    originalName: 'handbook.pdf', storedName: 'h.pdf', mimeType: 'application/pdf',
    sizeBytes: 10, storagePath: '/dev/null',
  });
  assert.equal((await as(admin, 'DELETE', `/past-papers/${other._id}`)).status, 404);
  assert.equal((await FileAsset.findById(other._id)).deletedAt, null, 'a non-paper file was deleted through the library');
});

// ── the welcome tour ─────────────────────────────────────────────────

test('a new account has not answered the tour, and answering it is remembered', async () => {
  const me = await as(sam, 'GET', '/auth/me');
  assert.equal(me.data.tourCompletedAt, null, 'a brand-new student should be asked');

  const answered = await as(sam, 'POST', '/auth/tour', { outcome: 'declined' });
  assert.equal(answered.status, 200, JSON.stringify(answered.data));
  assert.ok(answered.data.tourCompletedAt);

  const again = await as(sam, 'GET', '/auth/me');
  assert.ok(again.data.tourCompletedAt, 'the answer was not kept, so the student would be asked every time');
});

test('replaying the tour later keeps the first answer', async () => {
  const first = (await as(sam, 'GET', '/auth/me')).data.tourCompletedAt;
  await new Promise((r) => setTimeout(r, 15));
  const replay = await as(sam, 'POST', '/auth/tour', { outcome: 'completed' });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.tourCompletedAt, first);
});

test('an unknown tour outcome is refused', async () => {
  const bad = await as(ada, 'POST', '/auth/tour', { outcome: 'maybe' });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'VALIDATION_ERROR');
});

// ── the bulk import ──────────────────────────────────────────────────

test('the import script cleans copied Arabic file names and never imports a paper twice', async () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { run } = require('../src/scripts/import-past-papers');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'papers-'));
  // Built from char codes: a replacement character and a right-to-left mark,
  // the debris the real file names arrived with.
  const junk = String.fromCharCode(0xfffd, 0x200f);
  fs.writeFileSync(path.join(dir, `${junk}أجوبة انجليزي استدراكي .pdf`), PDF);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a paper');

  const first = await run(dir);
  assert.equal(first.length, 1, 'only the PDF should be considered');
  assert.equal(first[0].status, 'imported');
  assert.equal(first[0].title, 'أجوبة انجليزي استدراكي');
  assert.equal(first[0].subject, 'اللغة الإنجليزية');

  const second = await run(dir);
  assert.equal(second[0].status, 'skipped', 'a second run duplicated the paper');

  const listed = (await as(sam, 'GET', '/past-papers')).data.items.filter((p) => p.title === 'أجوبة انجليزي استدراكي');
  assert.equal(listed.length, 1);
});
