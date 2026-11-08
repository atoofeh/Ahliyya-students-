/**
 * Where the index sits inside a stored video.
 *
 * A player decodes nothing until it holds the MP4 index (`moov`). Phones and
 * screen recorders write it after the media, which forces a player to fetch
 * the end of the file before the first frame — on a 700 MB lecture over mobile
 * data that reads as "the video doesn't play". The upload pipeline therefore
 * repackages such files so the index comes first.
 *
 * These tests drive the real chunked upload and then read the bytes back out
 * of the encrypted file on disk. They need ffmpeg to build the fixture (and
 * the feature itself is a no-op without it), so they skip when it is absent.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { startApp, CREDENTIALS } = require('./helpers/harness');

const execFileAsync = promisify(execFile);
let app, api, admin, ada, courseId, hasFfmpeg = false;

/** The first few top-level box types, in file order. */
const boxOrder = (buf) => {
  const types = [];
  let offset = 0;
  while (offset + 8 <= buf.length && types.length < 5) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    if (!/^[a-z0-9]{4}$/i.test(type)) break;
    let header = 8;
    if (size === 1) {
      if (offset + 16 > buf.length) break;
      size = Number(buf.readBigUInt64BE(offset + 8));
      header = 16;
    }
    types.push(type);
    if (size < header) break;
    offset += size;
  }
  return types;
};

/** A real, tiny MP4 whose index sits after the media — what phones produce. */
const makeIndexLastMp4 = async (dir) => {
  const plain = path.join(dir, 'index-last.mp4');
  await execFileAsync('ffmpeg', [
    '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', plain,
  ]);
  return plain;
};

/** Push a file through the chunked upload and wait for processing. */
const uploadVideo = async (filePath, title) => {
  const bytes = await fs.promises.readFile(filePath);
  const init = await api('POST', `/videos/courses/${courseId}/uploads`, {
    token: ada.token, deviceId: ada.deviceId,
    body: { title, originalName: path.basename(filePath), sizeBytes: bytes.length, mimeType: 'video/mp4' },
  });
  assert.equal(init.status, 201, JSON.stringify(init.data));

  const form = new FormData();
  form.append('chunk', new Blob([bytes]), 'chunk-0');
  form.append('chunkIndex', '0');
  const sent = await fetch(`${app.baseUrl}/api/v1/videos/uploads/${init.data.uploadId}/chunks`, {
    method: 'POST', body: form,
    headers: { Authorization: `Bearer ${ada.token}`, 'x-device-id': ada.deviceId },
  });
  assert.equal(sent.status, 200, await sent.text());

  const done = await api('POST', `/videos/uploads/${init.data.uploadId}/complete`, {
    token: ada.token, deviceId: ada.deviceId, body: {},
  });
  assert.equal(done.status, 200, JSON.stringify(done.data));

  const Video = require('../src/models/Video');
  const videoId = done.data.videoId;
  for (let i = 0; i < 100; i += 1) {
    const row = await Video.findById(videoId).lean();
    if (row?.status === 'ready') return videoId;
    if (row?.status === 'failed') throw new Error(`processing failed: ${row.processingError}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('video never became ready');
};

/** Decrypt the first bytes of the stored file, the way the stream route does. */
const storedHead = async (videoId, length = 4096) => {
  const Video = require('../src/models/Video');
  const { unwrapKey, createDecryptStreamAtOffset } = require('../src/core/cryptoUtils');
  const row = await Video.findById(videoId).select('+storagePath +encryption.wrappedKey +encryption.iv').lean();
  const key = unwrapKey(row.encryption.wrappedKey, row.encryption.keyVersion || 1);
  const iv = Buffer.from(row.encryption.iv, 'hex');
  const { decipher } = createDecryptStreamAtOffset(key, iv, 0);
  const chunks = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(row.storagePath, { start: 0, end: length - 1 })
      .on('error', reject)
      .pipe(decipher)
      .on('data', (c) => chunks.push(c))
      .on('end', resolve)
      .on('error', reject);
  });
  return { head: Buffer.concat(chunks), row };
};

before(async () => {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    await execFileAsync('ffprobe', ['-version']);
    hasFfmpeg = true;
  } catch { hasFfmpeg = false; }

  app = await startApp();
  api = app.api;
  admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'dev-admin-01' });
  await app.createUser(admin.token, { name: 'Ada', username: 'ada', password: 'Teach@1234', role: 'teacher' }, 'dev-admin-01');
  ada = await app.loginAs('ada', 'Teach@1234', { deviceId: 'dev-ada-0001' });
  const course = await api('POST', '/courses', {
    token: ada.token, deviceId: ada.deviceId, body: { title: 'Faststart Course', category: 'Test', isPublished: true },
  });
  courseId = course.data._id;
});
after(async () => { await app.stop(); });

test('a video whose index sits at the end is stored with the index first', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not installed — the pipeline stores uploads unchanged');

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'faststart-'));
  const plain = await makeIndexLastMp4(dir);

  // The fixture really is the awkward shape this test is about.
  const before = boxOrder(await fs.promises.readFile(plain));
  assert.ok(before.indexOf('mdat') < before.indexOf('moov'),
    `fixture should have its index last, got ${before.join(' ')}`);

  const videoId = await uploadVideo(plain, 'Index last');
  const { head, row } = await storedHead(videoId);
  const after = boxOrder(head);

  assert.equal(after[0], 'ftyp', `stored file should start with ftyp, got ${after.join(' ')}`);
  assert.ok(after.includes('moov'), `index should be at the front, got ${after.join(' ')}`);
  assert.ok(!after.includes('mdat') || after.indexOf('moov') < after.indexOf('mdat'),
    `index should come before the media, got ${after.join(' ')}`);

  // Range requests are measured against sizeBytes, so it must match the file
  // that was actually stored — the repackaging changes the length.
  const onDisk = await fs.promises.stat(row.storagePath);
  assert.equal(row.sizeBytes, onDisk.size, 'sizeBytes must match the stored file');
  assert.ok(row.durationSeconds > 0, 'duration should have been probed');
});

test('a video that already starts with its index is left alone', async (t) => {
  if (!hasFfmpeg) return t.skip('ffmpeg not installed');

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'faststart-'));
  const plain = path.join(dir, 'already-fine.mp4');
  await execFileAsync('ffmpeg', [
    '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', plain,
  ]);
  const original = await fs.promises.readFile(plain);
  assert.ok(boxOrder(original).indexOf('moov') < boxOrder(original).indexOf('mdat'));

  const videoId = await uploadVideo(plain, 'Already faststart');
  const { head, row } = await storedHead(videoId, original.length);

  assert.deepEqual(head.subarray(0, 64), original.subarray(0, 64),
    'a file that is already in the right shape should be stored byte for byte');
  assert.equal(row.sizeBytes, original.length);
});
