import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import axios, { AxiosError } from 'axios';

const tokenSource = await fs.readFile(new URL('../src/api/token.js', import.meta.url), 'utf8');
const apiSource = await fs.readFile(new URL('../src/api/axios.js', import.meta.url), 'utf8');
let sequence = 0;
globalThis.__authSessionFixtures = new Map();
const load = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const failure = (config, status, code) => new AxiosError('Request rejected', 'ERR_BAD_REQUEST', config, null, { status, data: { code }, headers: {}, config });

// Replace only platform/transport imports; exercise the real token and axios
// session code without opening sockets or using a real browser secure store.
const fixture = async ({ native = true, stored = 'remembered-token', store = new Map() } = {}) => {
  const id = ++sequence;
  if (stored) store.set('lms_refresh_token', stored);
  const localWrites = [];
  globalThis.localStorage = { removeItem() {}, setItem(...args) { localWrites.push(args); } };
  globalThis.sessionStorage = { setItem() {} };
  globalThis.window = { location: { pathname: '/student', href: '/student' } };
  const context = {
    store, secureReads: 0, failStore: false, calls: [],
    secure: {
      async get(key) { context.secureReads++; return store.get(key) || null; },
      async set(key, value) { if (!context.failStore) store.set(key, value); },
      async remove(key) { store.delete(key); },
    },
    native, getFingerprint: async () => 'fixture-fingerprint', resolveDeviceId: async () => 'fixture-device', currentDeviceId: () => 'fixture-device',
    handler: async () => ({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh', user: { id: 'fixture-user' } }),
  };
  globalThis.__authSessionFixtures.set(id, context);
  const reference = `globalThis.__authSessionFixtures.get(${id})`;
  const token = await load(tokenSource.replace("import { secure } from './native';", `const { secure } = ${reference};`));
  context.token = token;
  const adapter = async (config) => {
    context.calls.push(config);
    const data = await context.handler(config);
    return { status: 200, data, headers: {}, config };
  };
  const bare = axios.create({ adapter });
  context.axios = { create: (config) => axios.create({ ...config, adapter }), post: (...args) => bare.post(...args) };
  const api = await load(apiSource
    .replace("import axios from 'axios';", `const { axios } = ${reference};`)
    .replace("import { getFingerprint, resolveDeviceId, currentDeviceId } from './fingerprint';", `const { getFingerprint, resolveDeviceId, currentDeviceId } = ${reference};`)
    .replace(/import \{\s*getAccessToken[\s\S]*?\} from '\.\/token';/, `const { getAccessToken, setAccessToken, clearAccessToken, saveRefreshToken, readRefreshToken, clearRefreshToken } = ${reference}.token;`)
    .replace("import { isNative, platformName } from './native';", `const isNative = ${reference}.native; const platformName = () => isNative ? 'ios' : 'web';`)
    .replace('import.meta.env.VITE_API_URL', "'http://fixture.invalid/api/v1'")
    .replace('__APP_VERSION__', "'fixture'"));
  return { ...context, context, token, api, localWrites };
};

test('native remembered login persists across cold starts and keeps rotations persistent', async () => {
  const first = await fixture({ stored: null });
  await first.token.saveRefreshToken('login-refresh', { persist: true });
  assert.equal(first.store.get('lms_refresh_token'), 'login-refresh');
  const cold = await fixture({ stored: null, store: first.store });
  assert.equal(await cold.token.readRefreshToken(), 'login-refresh');
  await cold.api.refreshAccessToken();
  assert.equal(cold.store.get('lms_refresh_token'), 'fresh-refresh');
  assert.equal(cold.localWrites.length, 0, 'tokens never enter web storage');
});

test('unticked native login clears an older remembered login and rotates only in memory', async () => {
  const f = await fixture();
  await f.token.saveRefreshToken('temporary', { persist: false });
  await f.token.saveRefreshToken('temporary-rotated');
  assert.equal(await f.token.readRefreshToken(), 'temporary-rotated');
  assert.equal(f.store.has('lms_refresh_token'), false);
  const cold = await fixture({ stored: null, store: f.store });
  assert.equal(await cold.token.readRefreshToken(), null);
});

test('a transient native store failure keeps the latest token usable in this process', async () => {
  const f = await fixture();
  await f.token.readRefreshToken();
  f.context.failStore = true;
  await f.token.saveRefreshToken('latest-rotation');
  assert.equal(await f.token.readRefreshToken(), 'latest-rotation');
});

test('offline startup preserves remembered login and a later restore succeeds', async () => {
  const f = await fixture();
  f.context.handler = async (config) => { throw new AxiosError('Offline', 'ERR_NETWORK', config); };
  assert.equal(await f.api.bootstrapSession(), null);
  assert.equal(f.store.get('lms_refresh_token'), 'remembered-token');
  f.context.handler = async () => ({ accessToken: 'restored-access', refreshToken: 'rotated-refresh', user: { id: 'restored' } });
  assert.deepEqual(await f.api.bootstrapSession(), { id: 'restored' });
  assert.equal(f.store.get('lms_refresh_token'), 'rotated-refresh');
});

test('server errors preserve remembered login but an invalid refresh token clears it', async () => {
  const f = await fixture();
  f.context.handler = async (config) => { throw failure(config, 503, 'UNAVAILABLE'); };
  await f.api.bootstrapSession();
  assert.equal(f.store.get('lms_refresh_token'), 'remembered-token');
  f.context.handler = async (config) => { throw failure(config, 401, 'REFRESH_INVALID'); };
  await f.api.bootstrapSession();
  assert.equal(f.store.has('lms_refresh_token'), false);
});

test('a failed network refresh does not log out; the next request can recover', async () => {
  const f = await fixture();
  f.token.setAccessToken('expired');
  let offline = true;
  f.context.handler = async (config) => {
    if (config.url.includes('/auth/refresh')) {
      if (offline) throw new AxiosError('Offline', 'ERR_NETWORK', config);
      return { accessToken: 'restored', refreshToken: 'restored-refresh' };
    }
    if (config.headers.Authorization === 'Bearer expired') throw failure(config, 401, 'TOKEN_EXPIRED');
    return { ok: true };
  };
  await assert.rejects(f.api.default.get('/profile'), /Offline/);
  assert.equal(window.location.href, '/student');
  assert.equal(f.store.get('lms_refresh_token'), 'remembered-token');
  offline = false;
  assert.deepEqual((await f.api.default.get('/profile')).data, { ok: true });
  assert.equal(f.store.get('lms_refresh_token'), 'restored-refresh');
});

test('concurrent expired requests share one refresh-token rotation', async () => {
  const f = await fixture();
  f.token.setAccessToken('expired');
  let refreshes = 0;
  f.context.handler = async (config) => {
    if (config.url.includes('/auth/refresh')) {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { accessToken: 'restored', refreshToken: 'rotated' };
    }
    if (config.headers.Authorization === 'Bearer expired') throw failure(config, 401, 'TOKEN_EXPIRED');
    return { ok: true };
  };
  await Promise.all([f.api.default.get('/one'), f.api.default.get('/two')]);
  assert.equal(refreshes, 1);
});

test('web refresh uses cookies and never reads a native refresh token', async () => {
  const f = await fixture({ native: false });
  await f.api.refreshAccessToken();
  const request = f.context.calls.find((config) => config.url.includes('/auth/refresh'));
  assert.equal(request.withCredentials, true);
  assert.deepEqual(JSON.parse(request.data), {});
  assert.equal(f.context.secureReads, 0);
  assert.equal(f.localWrites.length, 0);
});
