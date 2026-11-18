import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadChunks } from '../src/api/uploadChunks.js';

const file = new Blob(['abcdefghijkl']);
const options = (extra = {}) => ({ file, chunkSize: 2, totalChunks: 6, signal: new AbortController().signal, ...extra });
const statusError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status, headers: {} } });

test('uploads only missing chunks with at most three requests active', async () => {
  const indices = [], progress = [];
  let active = 0, maximum = 0;
  await uploadChunks(options({ receivedChunks: [0, 0, 4], onProgress: (value) => progress.push(value), postChunk: async (index, blob) => {
    indices.push(index); active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 3));
    assert.equal(await blob.text(), 'abcdefghijkl'.slice(index * 2, index * 2 + 2));
    active--;
  } }));
  assert.deepEqual(indices.sort(), [1, 2, 3, 5]);
  assert.equal(maximum, 3);
  assert.equal(progress.at(-1), 100);
});

test('transient network, server and rate-limit errors retry without counting failed chunks', async () => {
  let attempts = 0;
  const progress = [], delays = [];
  await uploadChunks(options({ totalChunks: 1, onProgress: (value) => progress.push(value), delay: async (value) => delays.push(value), postChunk: async () => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('Offline'), { code: 'ERR_NETWORK' });
    if (attempts === 2) throw statusError(503);
    if (attempts === 3) { const error = statusError(429); error.response.headers['retry-after'] = '8'; throw error; }
  } }));
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [1000, 2000, 8000]);
  assert.deepEqual(progress, [100]);
});

test('permanent failure cancels and settles sibling requests before returning', async () => {
  const rejected = statusError(403);
  const stopped = [];
  await assert.rejects(uploadChunks(options({ postChunk: async (index, blob, signal) => {
    if (index === 0) { await Promise.resolve(); throw rejected; }
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => { stopped.push(index); reject(signal.reason); }, { once: true }));
  } })), (error) => error === rejected);
  assert.deepEqual(stopped.sort(), [1, 2]);
});

test('pausing the final in-flight chunk prevents completion/progress even if its request resolves', async () => {
  const controller = new AbortController();
  let finish;
  const progress = [];
  const upload = uploadChunks(options({ totalChunks: 1, signal: controller.signal, onProgress: (value) => progress.push(value), postChunk: () => new Promise((resolve) => { finish = resolve; }) }));
  controller.abort();
  finish();
  await assert.rejects(upload, { name: 'AbortError' });
  assert.deepEqual(progress, []);
});

test('pause cancels retry backoff immediately', async () => {
  const controller = new AbortController();
  let enteredBackoff;
  const started = new Promise((resolve) => { enteredBackoff = resolve; });
  const upload = uploadChunks(options({ totalChunks: 1, signal: controller.signal,
    postChunk: async () => { enteredBackoff(); throw statusError(429); },
  }));
  await started;
  controller.abort();
  await assert.rejects(upload, { name: 'AbortError' });
});

test('an already complete inventory performs no extra requests', async () => {
  let requests = 0;
  await uploadChunks(options({ receivedChunks: [0, 1, 2, 3, 4, 5], postChunk: async () => { requests++; } }));
  assert.equal(requests, 0);
});
