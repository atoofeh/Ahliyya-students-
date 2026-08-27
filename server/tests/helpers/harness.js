/**
 * Shared test harness. Requiring this file configures the environment BEFORE
 * src/config/env is loaded, so every test process runs against an in-memory
 * MongoDB with storage and logs under a throwaway temp directory.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-test-'));

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable-forces-memory';
process.env.STORAGE_ROOT = path.join(tmpDir, 'storage');
process.env.LOG_DIR = path.join(tmpDir, 'logs');
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.SMTP_HOST = '';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.SUPER_ADMIN_NAME = 'Test Owner';
process.env.SUPER_ADMIN_USERNAME = 'owner';
process.env.SUPER_ADMIN_EMAIL = 'owner@test.local';
process.env.SUPER_ADMIN_INITIAL_PASSWORD = 'Owner@12345';
process.env.DEFAULT_ADMIN_NAME = 'Abdullah Dabbas';
process.env.DEFAULT_ADMIN_USERNAME = 'abdullah.dabbas';
process.env.DEFAULT_ADMIN_EMAIL = 'abdullah@test.local';
process.env.DEFAULT_ADMIN_INITIAL_PASSWORD = 'Abdul@12345';

const CREDENTIALS = {
  admin: { username: 'admin', password: 'Admin@12345' },
  owner: { username: 'owner', password: 'Owner@12345' },
  abdullah: { username: 'abdullah.dabbas', password: 'Abdul@12345' },
};

const makeApi = (baseUrl) => async (method, path, opts = {}) => {
  const {
    token, body, deviceId = 'device-default-0001', fingerprint, platform, cookie, headers = {},
  } = opts;
  const h = {
    'Content-Type': 'application/json',
    'x-device-id': deviceId,
    ...(fingerprint && { 'x-fingerprint': fingerprint }),
    ...(platform && { 'x-client-platform': platform }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(cookie && { Cookie: cookie }),
    ...headers,
  };
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: h,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const cookies = setCookies.map((c) => c.split(';')[0]).join('; ');
  return { status: res.status, data, headers: res.headers, cookies, setCookies };
};

const startApp = async () => {
  const { connectDB, disconnectDB } = require('../../src/config/db');
  const app = require('../../src/app');
  const seed = require('../../src/seed');

  await connectDB();
  // Wait for every model's indexes (the Device partial unique index is load-bearing).
  const mongoose = require('mongoose');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seed();

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = makeApi(baseUrl);

  const loginAs = async (username, password, { deviceId = `device-${username}`, platform } = {}) => {
    const r = await api('POST', '/auth/login', { body: { username, password, deviceId }, deviceId, platform });
    if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status} ${r.data.message || ''} ${r.data.code || ''}`);
    return { token: r.data.accessToken, cookies: r.cookies, deviceId, user: r.data.user, data: r.data };
  };

  const loginAndOnboard = async (username, password, opts = {}) => {
    const session = await loginAs(username, password, opts);
    if (session.user?.mustChangePassword) {
      const r = await api('POST', '/auth/set-password', { token: session.token, deviceId: session.deviceId, body: { password } });
      if (r.status !== 200) throw new Error(`set-password ${username} failed: ${r.status} ${r.data.message || ''}`);
      session.user = r.data;
    }
    return session;
  };

  const createUser = async (adminToken, { name, username, email, password, role, mustChangePassword = false }, deviceId = 'device-admin') => {
    const r = await api('POST', '/admin/users', {
      token: adminToken, deviceId,
      body: { name, username, email, password, role, mustChangePassword },
    });
    if (r.status !== 201) throw new Error(`createUser ${username} failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  };

  const stop = async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { baseUrl, api, loginAs, loginAndOnboard, createUser, stop, tmpDir };
};

module.exports = { startApp, CREDENTIALS, tmpDir };
