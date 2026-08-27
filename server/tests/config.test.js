const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { redactUrl } = require('../src/core/redact');

test('redactUrl hides stream tokens, codes and refresh tokens but keeps the path', () => {
  assert.equal(redactUrl('/api/v1/videos/abc/stream?token=SECRET.TOKEN&range=1'), '/api/v1/videos/abc/stream?token=[redacted]&range=1');
  assert.equal(redactUrl('/api/v1/auth/verify?code=123456'), '/api/v1/auth/verify?code=[redacted]');
  assert.equal(redactUrl('/api/v1/auth/refresh?refreshToken=x.y.z'), '/api/v1/auth/refresh?refreshToken=[redacted]');
  assert.equal(redactUrl('/api/v1/courses?page=2'), '/api/v1/courses?page=2');
  assert.equal(redactUrl('/api/v1/health'), '/api/v1/health');
});

/** Boot config/env.js in a child process with the given environment; return exit code + output. */
const bootEnv = (extra) => {
  const r = spawnSync(process.execPath, ['-e', "require('./src/config/env'); console.log('OK')"], {
    cwd: path.join(__dirname, '..'),
    env: {
      PATH: process.env.PATH, NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://x/y', JWT_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), MEDIA_MASTER_KEY: 'c'.repeat(40),
      SUPER_ADMIN_EMAIL: 'o@x.io', SUPER_ADMIN_INITIAL_PASSWORD: 'Owner@12345',
      ...extra,
    },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('production refuses equal secrets', () => {
  assert.equal(bootEnv({}).code, 0, 'distinct secrets boot');
  const same = bootEnv({ JWT_REFRESH_SECRET: 'a'.repeat(40) });
  assert.equal(same.code, 1);
  assert.match(same.out, /must be different/i);
  const media = bootEnv({ MEDIA_MASTER_KEY: 'a'.repeat(40) });
  assert.equal(media.code, 1);
  const prev = bootEnv({ MEDIA_MASTER_KEY_PREVIOUS: 'c'.repeat(40) });
  assert.equal(prev.code, 1);
});

test('production requires MEDIA_MASTER_KEY and accepts a previous key for rotation', () => {
  assert.equal(bootEnv({ MEDIA_MASTER_KEY: '' }).code, 1);
  assert.equal(bootEnv({ MEDIA_MASTER_KEY_PREVIOUS: 'd'.repeat(40), MEDIA_KEY_VERSION: '2' }).code, 0);
});

const freshCrypto = () => {
  delete require.cache[require.resolve('../src/config/env')];
  delete require.cache[require.resolve('../src/core/cryptoUtils')];
  return require('../src/core/cryptoUtils');
};

test('media keys: wrap under v1, rotate to v2 with the previous key, unwrap both', () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'x'.repeat(40); process.env.JWT_REFRESH_SECRET = 'y'.repeat(40);
  process.env.MEDIA_MASTER_KEY = 'k1'.repeat(20); process.env.MEDIA_KEY_VERSION = '1';
  delete process.env.MEDIA_MASTER_KEY_PREVIOUS;
  let cu = freshCrypto();
  const key = Buffer.alloc(32, 7);
  const v1 = cu.wrapKey(key);
  assert.equal(v1.keyVersion, 1);
  assert.ok(cu.unwrapKey(v1.wrapped, 1).equals(key));

  process.env.MEDIA_MASTER_KEY_PREVIOUS = process.env.MEDIA_MASTER_KEY;
  process.env.MEDIA_MASTER_KEY = 'k2'.repeat(20); process.env.MEDIA_KEY_VERSION = '2';
  cu = freshCrypto();
  assert.ok(cu.unwrapKey(v1.wrapped, 1).equals(key), 'old video still decrypts via PREVIOUS');
  const v2 = cu.wrapKey(key);
  assert.equal(v2.keyVersion, 2);
  assert.ok(cu.unwrapKey(v2.wrapped, 2).equals(key));
  assert.throws(() => cu.unwrapKey(v1.wrapped, 3), /MEDIA_KEY_UNAVAILABLE/);
});
