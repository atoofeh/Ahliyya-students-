'use strict';
// Read-only targeted incident check. Output excludes credentials, device IDs and IPs.
const mongoose = require('/opt/lms/server/node_modules/mongoose');
const env = require('/opt/lms/server/src/config/env');
const { createHash } = require('node:crypto');
const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
(async () => {
  const connection = await mongoose.createConnection(env.MONGODB_URI, { autoIndex: false, autoCreate: false }).asPromise();
  try {
    const db = connection.db;
    const user = await db.collection('users').findOne({ username: 'anaszeidieh', deletedAt: null }, { projection: { _id: 1, role: 1, status: 1 } });
    if (!user) { console.log(JSON.stringify({ found: false })); return; }
    const devices = await db.collection('devices').find({ user: user._id }).sort({ createdAt: -1 }).limit(10).toArray();
    const attempts = await db.collection('loginhistories').find({ user: user._id, createdAt: { $gte: new Date('2026-11-10T00:00:00Z') } }).sort({ createdAt: -1 }).limit(35).toArray();
    const classifyId = (value) => /^[0-9a-f]{64}$/i.test(value || '') ? 'machine-or-native-hash' : /^[0-9a-f-]{36}$/i.test(value || '') ? 'profile-uuid' : 'other';
    const active = devices.filter((row) => row.status === 'active');
    const matchesActive = (row) => active.some((device) => digest(row.deviceId) === device.deviceKeyHash);
    const desktopAttempts = attempts.filter((row) => /FekerDesktop\//i.test(row.userAgent || ''));
    const describe = (row) => row ? { at: row.createdAt, success: row.success, reason: row.reason, desktopApp: /FekerDesktop\//i.test(row.userAgent || ''), os: row.os, idKind: classifyId(row.deviceId), matchesCurrentBinding: matchesActive(row), matchesRevokedBinding: devices.some((device) => device.status === 'revoked' && digest(row.deviceId) === device.deviceKeyHash) } : null;
    const lastDesktopSuccess = desktopAttempts.find((row) => row.success);
    const legacyBinding = desktopAttempts.find((row) => row.success && classifyId(row.deviceId) === 'profile-uuid' && matchesActive(row));
    const mismatch = desktopAttempts.find((row) => !row.success && row.reason === 'device_not_authorized' && classifyId(row.deviceId) === 'machine-or-native-hash' && !matchesActive(row));
    const migrations = await db.collection('auditlogs').countDocuments({ user: user._id, action: 'DEVICE_IDENTITY_MIGRATED' });
    const report = {
      found: true, accountActive: user.status === 'active',
      activeBindings: active.length, activePlatforms: [...new Set(active.map((row) => row.platform))],
      recentDesktopAttempts: desktopAttempts.length,
      mostRecentAttempt: describe(attempts[0]),
      lastSuccessfulDesktopLogin: describe(lastDesktopSuccess),
      latestRejectedDesktopLogin: describe(desktopAttempts.find((row) => !row.success)),
      latestDeviceDeniedDesktopLogin: describe(desktopAttempts.find((row) => row.reason === 'device_not_authorized')),
      mostRecentLoginMatchingAuthorizedDevice: describe(attempts.find((row) => row.success && matchesActive(row))),
      legacyDesktopBindingEvidence: !!legacyBinding,
      canonicalDesktopRejectionEvidence: !!mismatch,
      completedCompatibilityMigrations: migrations,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.close(); }
})().catch((error) => { console.error(error.name); process.exitCode = 1; });
