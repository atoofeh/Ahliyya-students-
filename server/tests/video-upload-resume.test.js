process.env.CHUNK_SIZE_MB = String(4 / 1024 / 1024);
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Writable } = require('node:stream');
const { startApp, CREDENTIALS } = require('./helpers/harness');

let app, api, teacher, courseId;
before(async () => {
  app = await startApp();
  api = app.api;
  const admin = await app.loginAs(CREDENTIALS.admin.username, CREDENTIALS.admin.password, { deviceId: 'upload-admin-001' });
  await app.createUser(admin.token, { name: 'Upload Teacher', username: 'uploadteacher', password: 'Teach@1234', role: 'teacher' }, admin.deviceId);
  teacher = await app.loginAs('uploadteacher', 'Teach@1234', { deviceId: 'upload-teacher-001' });
  courseId = (await api('POST', '/courses', { token: teacher.token, deviceId: teacher.deviceId, body: { title: 'Resume upload fixtures' } })).data._id;
});
after(async () => { await app.stop(); });

const initialize = async () => {
  const result = await api('POST', `/videos/courses/${courseId}/uploads`, { token: teacher.token, deviceId: teacher.deviceId,
    body: { originalName: 'fixture.mp4', sizeBytes: 12, mimeType: 'video/mp4' },
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.chunkSize, 4);
  return result.data;
};
const chunk = async (uploadId, index, bytes = Buffer.alloc(4, 0x41)) => {
  const form = new FormData();
  form.append('chunkIndex', String(index));
  form.append('chunk', new Blob([bytes]), `chunk-${index}`);
  const response = await fetch(`${app.baseUrl}/api/v1/videos/uploads/${uploadId}/chunks`, { method: 'POST', body: form,
    headers: { Authorization: `Bearer ${teacher.token}`, 'x-device-id': teacher.deviceId },
  });
  return { status: response.status, data: await response.json() };
};
const complete = (uploadId) => api('POST', `/videos/uploads/${uploadId}/complete`, { token: teacher.token, deviceId: teacher.deviceId });
const settledVideo = async (videoId) => {
  const Video = require('../src/models/Video');
  for (let attempt = 0; attempt < 60; attempt++) {
    const video = await Video.findById(videoId).lean();
    if (video.status !== 'processing') return video;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('upload did not leave processing');
};

test('concurrent retries keep a unique chunk inventory and resume reports confirmed chunks', async () => {
  const upload = await initialize();
  const responses = await Promise.all([0, 0, 0, 0, 1, 2].map((index) => chunk(upload.uploadId, index)));
  for (const response of responses) assert.equal(response.status, 200, JSON.stringify(response.data));
  const status = await api('GET', `/videos/uploads/${upload.uploadId}/status`, { token: teacher.token, deviceId: teacher.deviceId });
  assert.deepEqual(status.data.receivedChunks.sort(), [0, 1, 2]);
  const { STORAGE } = require('../src/middleware/uploads');
  assert.deepEqual((await fs.promises.readdir(path.join(STORAGE.tmp, `upload-${upload.uploadId}`))).sort(), ['chunk-0', 'chunk-1', 'chunk-2']);
});

test('truncated and malformed chunks are rejected without marking them received', async () => {
  const upload = await initialize();
  const truncated = await chunk(upload.uploadId, 0, Buffer.alloc(3));
  assert.equal(truncated.status, 400);
  assert.equal(truncated.data.code, 'CHUNK_SIZE_MISMATCH');
  for (const index of ['0.5', '0junk', '-1', '']) assert.equal((await chunk(upload.uploadId, index)).status, 400);
  const Video = require('../src/models/Video');
  assert.deepEqual((await Video.findById(upload.videoId)).receivedChunks, []);
});

test('duplicate legacy inventory cannot hide missing chunks', async () => {
  const upload = await initialize();
  const Video = require('../src/models/Video');
  await Video.updateOne({ _id: upload.videoId }, { $set: { receivedChunks: [0, 0, 0] } });
  const result = await complete(upload.uploadId);
  assert.equal(result.status, 400);
  assert.equal(result.data.code, 'CHUNKS_MISSING');
  assert.equal((await Video.findById(upload.videoId)).status, 'uploading');
});

test('concurrent completion requests claim assembly once', async () => {
  const upload = await initialize();
  await Promise.all([0, 1, 2].map((index) => chunk(upload.uploadId, index)));
  const responses = await Promise.all(Array.from({ length: 5 }, () => complete(upload.uploadId)));
  for (const response of responses) assert.equal(response.status, 200, JSON.stringify(response.data));
  const video = await settledVideo(upload.videoId);
  assert.equal(video.status, 'failed', 'synthetic bytes are deliberately not a video container');
  const AuditLog = require('../src/models/AuditLog');
  assert.equal(await AuditLog.countDocuments({ action: 'VIDEO_UPLOADED', resource: `video:${upload.videoId}` }), 1);
});

test('assembly write failure marks the upload failed and leaves the API alive', async () => {
  const upload = await initialize();
  await Promise.all([0, 1, 2].map((index) => chunk(upload.uploadId, index)));
  const original = fs.createWriteStream;
  fs.createWriteStream = (filename, ...args) => String(filename).includes(`assembled-${upload.uploadId}`)
    ? new Writable({ write(_chunk, _encoding, callback) { callback(new Error('Synthetic disk write failure')); } })
    : original(filename, ...args);
  try {
    assert.equal((await complete(upload.uploadId)).status, 200);
    const video = await settledVideo(upload.videoId);
    assert.equal(video.status, 'failed');
    assert.match(video.processingError, /Synthetic disk write failure/);
    const health = await fetch(`${app.baseUrl}/api/health`);
    assert.equal(health.status, 200);
  } finally { fs.createWriteStream = original; }
});
