import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/api/fingerprint.js', import.meta.url), 'utf8');
const machine = 'ab'.repeat(32);
const legacy = 'ef2f8942-6219-46db-a20e-831d69f0c746';
const nativeIdentity = 'cd'.repeat(32);
let sequence = 0;
globalThis.__fingerprintFixtures = new Map();

// Replace the platform import only; run the actual identity module with an
// isolated local-storage facade and synthetic identities. No native IDs or
// production browser profiles are read by these checks.
async function fixture({ desktop = { platform: 'windows', deviceId: machine }, native = false, stored = legacy, storageFails = false } = {}) {
  const id = ++sequence;
  const state = { reads: [], writes: [], randomCalls: 0, nativeCalls: 0 };
  globalThis.__fingerprintFixtures.set(id, {
    isNative: native, desktop,
    nativeDeviceId: async () => { state.nativeCalls++; return nativeIdentity; },
    localStorage: {
      getItem(key) { state.reads.push(key); if (storageFails) throw new Error('Storage unavailable'); return stored; },
      setItem(...args) { state.writes.push(args); },
    },
    crypto: { randomUUID() { state.randomCalls++; return legacy; } },
  });
  const code = source.replace("import { isNative, nativeDeviceId, desktop } from './native';",
    `const { isNative, nativeDeviceId, desktop, localStorage, crypto } = globalThis.__fingerprintFixtures.get(${id});`);
  const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return { api, state };
}

test('legacy Windows profile credential is offered without changing the canonical machine ID', async () => {
  const { api, state } = await fixture();
  assert.equal(api.legacyDesktopDeviceId(), legacy);
  assert.equal(api.getDeviceId(), machine);
  assert.equal(await api.resolveDeviceId(), machine);
  assert.equal(api.currentDeviceId(), machine);
  assert.deepEqual(state.reads, ['lms_device_id']);
  assert.deepEqual(state.writes, []);
  assert.equal(state.randomCalls, 0);
});

test('a previously migrated Windows profile still keeps canonical identity on every resolution', async () => {
  const { api, state } = await fixture();
  assert.equal(await api.resolveDeviceId(), machine);
  assert.equal(api.legacyDesktopDeviceId(), legacy);
  assert.equal(await api.resolveDeviceId(), machine);
  assert.equal(api.currentDeviceId(), machine);
  assert.deepEqual(state.writes, []);
});

test('fresh desktop installs never generate a legacy credential or write browser storage', async () => {
  const { api, state } = await fixture({ stored: null });
  assert.equal(api.legacyDesktopDeviceId(), undefined);
  assert.equal(await api.resolveDeviceId(), machine);
  assert.deepEqual(state.writes, []);
  assert.equal(state.randomCalls, 0);
});

test('ordinary browser profiles never offer the desktop migration credential', async () => {
  const { api, state } = await fixture({ desktop: null });
  assert.equal(api.legacyDesktopDeviceId(), undefined);
  assert.deepEqual(state.reads, []);
  assert.equal(await api.resolveDeviceId(), legacy);
  assert.deepEqual(state.writes, []);
});

test('native mobile apps never offer the desktop migration credential', async () => {
  const { api, state } = await fixture({ native: true });
  assert.equal(api.legacyDesktopDeviceId(), undefined);
  assert.deepEqual(state.reads, []);
  assert.equal(await api.resolveDeviceId(), nativeIdentity);
  assert.equal(state.nativeCalls, 1);
  assert.deepEqual(state.writes, []);
});

test('desktop migration requires Windows and a valid machine identity', async () => {
  for (const desktop of [
    { platform: 'web', deviceId: machine }, { platform: 'windows', deviceId: null },
    { platform: 'windows', deviceId: legacy }, { platform: 'windows', deviceId: 'g'.repeat(64) },
  ]) {
    const { api, state } = await fixture({ desktop });
    assert.equal(api.legacyDesktopDeviceId(), undefined);
    assert.deepEqual(state.reads, []);
    assert.deepEqual(state.writes, []);
  }
});

test('malformed, non-UUID and current machine values cannot be sent as legacy credentials', async () => {
  for (const stored of ['', machine, 'unknown-profile', ` ${legacy}`, legacy.slice(1), 'ef2f8942-6219-46db-020e-831d69f0c746']) {
    const { api, state } = await fixture({ stored });
    assert.equal(api.legacyDesktopDeviceId(), undefined);
    assert.equal(await api.resolveDeviceId(), machine);
    assert.deepEqual(state.writes, []);
    assert.equal(state.randomCalls, 0);
  }
});

test('blocked local storage leaves canonical Windows sign-in usable', async () => {
  const { api, state } = await fixture({ storageFails: true });
  assert.equal(api.legacyDesktopDeviceId(), undefined);
  assert.equal(await api.resolveDeviceId(), machine);
  assert.deepEqual(state.writes, []);
  assert.equal(state.randomCalls, 0);
});
