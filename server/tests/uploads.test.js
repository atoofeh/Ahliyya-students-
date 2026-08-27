const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, teacher, courseId, env;
before(async () => {
  app = await startApp();
  api = app.api;
  env = require('../src/config/env');
  const admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin' });
  await app.createUser(admin.token, { name: 'Tea', username: 'tea', password: 'Teach@1234', role: 'teacher' }, 'dev-admin');
  teacher = await app.loginAs('tea', 'Teach@1234', { deviceId: 'dev-tea-01' });
  courseId = (await api('POST', '/courses', { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Uploads' } })).data._id;
});
after(async () => { await app.stop(); });

/** multipart upload helper — the harness api() is JSON-only. */
const upload = async (urlPath, { name, type, bytes, token = teacher.token, deviceId = teacher.deviceId, field = 'file', extra = {} }) => {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), name);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await fetch(`${app.baseUrl}/api/v1${urlPath}`, {
    method: 'POST', body: form,
    headers: { Authorization: `Bearer ${token}`, 'x-device-id': deviceId },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const PDF = Buffer.from('%PDF-1.4\n%fake\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const MZ = Buffer.from('MZ\x90\x00 not really a pdf');

test('MIME must match the extension; content must match the magic bytes', async () => {
  const good = await upload(`/files/courses/${courseId}/documents`, { name: 'notes.pdf', type: 'application/pdf', bytes: PDF });
  assert.equal(good.status, 201, JSON.stringify(good.data));
  const wrongMime = await upload(`/files/courses/${courseId}/documents`, { name: 'notes.pdf', type: 'image/png', bytes: PDF });
  assert.equal(wrongMime.status, 400);
  assert.equal(wrongMime.data.code, 'BAD_FILE_TYPE');
  const pngAsPdf = await upload(`/files/courses/${courseId}/documents`, { name: 'notes.pdf', type: 'application/pdf', bytes: PNG });
  assert.equal(pngAsPdf.status, 400);
  assert.equal(pngAsPdf.data.code, 'BAD_FILE_CONTENT');
  const exe = await upload(`/files/courses/${courseId}/documents`, { name: 'setup.txt', type: 'text/plain', bytes: MZ }); // .txt has no magic rule, so the executable heuristic is what rejects it
  assert.equal(exe.status, 400);
  assert.equal(exe.data.code, 'MALWARE_SUSPECTED');
});

test('SVG is rejected for avatars and question images, allowed for course thumbnails and served as an attachment', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const avatar = await upload('/files/avatar', { name: 'me.svg', type: 'image/svg+xml', bytes: svg });
  assert.equal(avatar.status, 400);
  const question = await upload(`/files/courses/${courseId}/images`, { name: 'q.svg', type: 'image/svg+xml', bytes: svg, extra: { scope: 'question' } });
  assert.equal(question.status, 400);
  const thumb = await upload(`/files/courses/${courseId}/images`, { name: 't.svg', type: 'image/svg+xml', bytes: svg, extra: { scope: 'thumbnail' } });
  assert.equal(thumb.status, 201, JSON.stringify(thumb.data));
  const res = await fetch(`${app.baseUrl}/api/v1/files/${thumb.data._id}/content`, { headers: { Authorization: `Bearer ${teacher.token}`, 'x-device-id': teacher.deviceId } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /^attachment/);
});

/** Minimal clamd stand-in speaking the INSTREAM protocol. */
const fakeClamd = (verdict) => new Promise((resolve) => {
  const server = net.createServer((sock) => {
    let seenCommand = false;
    sock.on('data', (chunk) => {
      if (!seenCommand && chunk.toString('latin1').startsWith('zINSTREAM')) seenCommand = true;
      // The zero-length chunk terminates the stream.
      if (seenCommand && chunk.length >= 4 && chunk.subarray(-4).equals(Buffer.alloc(4))) {
        sock.end(verdict === 'ok' ? 'stream: OK\0' : 'stream: Eicar-Test-Signature FOUND\0');
      }
    });
  });
  server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => new Promise((r) => server.close(r)) }));
});

test('ClamAV: FOUND rejects, OK accepts, unreachable daemon fails closed', async () => {
  const found = await fakeClamd('found');
  env.CLAMAV_HOST = '127.0.0.1'; env.CLAMAV_PORT = found.port;
  const rejected = await upload(`/files/courses/${courseId}/documents`, { name: 'eicar.pdf', type: 'application/pdf', bytes: PDF });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.data.code, 'MALWARE_SUSPECTED');
  await found.close();

  const ok = await fakeClamd('ok');
  env.CLAMAV_PORT = ok.port;
  const accepted = await upload(`/files/courses/${courseId}/documents`, { name: 'clean.pdf', type: 'application/pdf', bytes: PDF });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.data));
  await ok.close();

  env.CLAMAV_PORT = 1; // nothing listens here
  const down = await upload(`/files/courses/${courseId}/documents`, { name: 'later.pdf', type: 'application/pdf', bytes: PDF });
  assert.equal(down.status, 503);
  assert.equal(down.data.code, 'SCANNER_UNAVAILABLE');
  env.CLAMAV_HOST = undefined;
});

test('an assembled "video" that is not a media container is marked failed', async () => {
  const init = await api('POST', `/videos/courses/${courseId}/uploads`, { token: teacher.token, deviceId: teacher.deviceId, body: { originalName: 'lecture.mp4', sizeBytes: 64, mimeType: 'video/mp4' } });
  assert.equal(init.status, 201, JSON.stringify(init.data));
  const chunk = await upload(`/videos/uploads/${init.data.uploadId}/chunks`, { name: 'chunk-0', type: 'application/octet-stream', bytes: Buffer.alloc(64, 0x41), field: 'chunk', extra: { chunkIndex: '0' } });
  assert.equal(chunk.status, 200, JSON.stringify(chunk.data));
  const done = await api('POST', `/videos/uploads/${init.data.uploadId}/complete`, { token: teacher.token, deviceId: teacher.deviceId });
  assert.equal(done.status, 200);
  const Video = require('../src/models/Video');
  for (let i = 0; i < 40; i++) {
    const v = await Video.findById(init.data.videoId).lean();
    if (v.status !== 'processing') { assert.equal(v.status, 'failed'); assert.match(v.processingError, /container/i); return; }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail('video never left processing');
});
