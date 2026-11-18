const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir } = require('./helpers/harness');
const Video = require('../src/models/Video');
const Session = require('../src/models/Session');
const AuditLog = require('../src/models/AuditLog');
const { generateVideoKey, wrapKey, createEncryptStream } = require('../src/core/cryptoUtils');
const { signStreamToken } = require('../src/core/signedUrl');

// Exercise the real HTTP stream route and CTR decryption without a database.
// The fixture deliberately ends off an AES block boundary.
const plaintext = Buffer.from(Array.from({ length: 1003 }, (_, i) => i % 251));
const videoId = 'stream-fixture';
let server, baseUrl, video, storedPath;
let activeSession = true;

const token = (ttlSeconds = 300) => signStreamToken({
  resourceId: videoId, userId: 'fixture-user', sessionId: 'fixture-session', ttlSeconds,
});

const request = (range, signedToken = token()) => fetch(`${baseUrl}/api/v1/videos/${videoId}/stream?token=${signedToken}`, {
  headers: range === undefined ? {} : { Range: range },
  signal: AbortSignal.timeout(5000),
});

before(async () => {
  const { key, iv } = generateVideoKey();
  const cipher = createEncryptStream(key, iv);
  storedPath = path.join(tmpDir, 'video-stream-fixture.enc');
  fs.writeFileSync(storedPath, Buffer.concat([cipher.update(plaintext), cipher.final()]));
  const { wrapped, keyVersion } = wrapKey(key);
  video = {
    _id: videoId, course: 'fixture-course', status: 'ready', mimeType: 'video/mp4',
    storagePath: storedPath, sizeBytes: plaintext.length,
    encryption: { wrappedKey: wrapped, iv: iv.toString('hex'), keyVersion },
  };
  mock.method(Video, 'findOne', () => ({ select: async () => video }));
  mock.method(Video, 'updateOne', () => ({ exec: async () => ({}) }));
  mock.method(Session, 'findById', async () => ({ isActive: activeSession }));
  mock.method(AuditLog, 'create', async () => ({}));

  const app = require('../src/app');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  mock.restoreAll();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

for (const [range, start, end] of [
  ['bytes=0-1', 0, 1],
  ['bytes=501-713', 501, 713],
  ['bytes=501-', 501, 1002],
  ['bytes=1002-9999', 1002, 1002],
  ['bytes=-100', 903, 1002],
  ['bytes=-1', 1002, 1002],
  ['bytes=-2000', 0, 1002],
  ['bytes=-999999999999999999999999999999', 0, 1002],
  ['bytes=1-999999999999999999999999999999', 1, 1002],
  ['bytes= 001-002', 1, 2],
]) {
  test(`stream ${range} returns the exact requested plaintext bytes`, async () => {
    const response = await request(range);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${plaintext.length}`);
    assert.equal(Number(response.headers.get('content-length')), end - start + 1);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), plaintext.subarray(start, end + 1));
  });
}

for (const range of ['bytes=-0', 'bytes=1003-', 'bytes=700-500', 'bytes=-', 'bytes=abc-def', 'bytes=1-2junk', 'bytes=999999999999999999999999999999-']) {
  test(`stream rejects invalid or unsatisfiable ${range}`, async () => {
    const response = await request(range);
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('content-range'), `bytes */${plaintext.length}`);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  });
}

for (const range of [undefined, 'items=0-1', 'bytes=0-1,10-11']) {
  test(`stream serves a complete response for ${range || 'no Range header'}`, async () => {
    const response = await request(range);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-range'), null);
    assert.equal(Number(response.headers.get('content-length')), plaintext.length);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), plaintext);
  });
}

test('range streaming still rejects expired tokens and ended sessions', async () => {
  const expired = await request('bytes=-100', token(-1));
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).code, 'STREAM_TOKEN_EXPIRED');

  activeSession = false;
  try {
    const ended = await request('bytes=-100');
    assert.equal(ended.status, 401);
    assert.equal((await ended.json()).code, 'SESSION_TERMINATED');
  } finally {
    activeSession = true;
  }
});

test('a file read error ends its response and subsequent streams still work', async () => {
  video.storagePath = path.join(tmpDir, 'missing-video.enc');
  try {
    await assert.rejects(async () => {
      const response = await request('bytes=1-2');
      await response.arrayBuffer();
    }, /fetch failed|terminated/);
  } finally {
    video.storagePath = storedPath;
  }
  const response = await request('bytes=501-713');
  assert.equal(response.status, 206);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), plaintext.subarray(501, 714));
});
