'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * A device id that survives reinstalling the app.
 *
 * The single-device rule means a student who loses their device id is locked
 * out until an administrator resets it by hand. On the phones that is solved
 * by deriving the id from a platform identifier rather than from app storage;
 * this is the same idea on Windows, built on the machine's `MachineGuid`,
 * which Windows writes once at installation and does not change when a
 * program is removed and installed again.
 *
 * The raw GUID never leaves this process and is never sent anywhere: what the
 * page and the server see is a salted SHA-256 of it. That keeps a hardware
 * identifier out of the database while still being stable.
 *
 * A Windows that will not give up the GUID — an unusual policy, a stripped
 * image — falls back to a random id kept beside the app's own data. That one
 * does not survive a reinstall, which is the ordinary web behaviour and no
 * worse than it.
 */
const SALT = 'feker.desktop.device.v1';

// Assembled rather than written as a literal so no layer between here and the
// registry can eat the separators.
const SEPARATOR = String.fromCharCode(92);
const CRYPTO_KEY = ['HKLM', 'SOFTWARE', 'Microsoft', 'Cryptography'].join(SEPARATOR);

const machineGuid = () => {
  try {
    const out = execFileSync('reg', ['query', CRYPTO_KEY, '/v', 'MachineGuid'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    });
    const found = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/);
    return found ? found[1].toLowerCase() : null;
  } catch {
    return null;
  }
};

/** The random fallback, written once beside the app's own data. */
const storedFallback = (userDataDir) => {
  const file = path.join(userDataDir, 'device-id');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(existing)) return existing;
  } catch { /* first run, or unreadable — a fresh one is written below */ }
  const fresh = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(file, fresh, { mode: 0o600 });
  } catch { /* a read-only profile still gets an id, just not a lasting one */ }
  return fresh;
};

let cached = null;

/** 64 hex characters, comfortably past the server's 8-character minimum. */
const deviceId = (userDataDir) => {
  if (cached) return cached;
  const guid = machineGuid();
  cached = guid
    ? crypto.createHash('sha256').update(`${SALT}:${guid}`).digest('hex')
    : storedFallback(userDataDir);
  return cached;
};

/** Which of the two answered, for the diagnostics panel. Never the value. */
const deviceIdSource = () => (machineGuid() ? 'machine' : 'profile');

module.exports = { deviceId, deviceIdSource };
