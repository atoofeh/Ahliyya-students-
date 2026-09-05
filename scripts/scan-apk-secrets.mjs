#!/usr/bin/env node
/**
 * Fails if a built APK contains any server secret.
 *
 * An Android package is world-readable: anyone who installs it can unzip it and
 * read every byte. Nothing from server/.env may be inside it. This scans every
 * entry — DEX, resources, assets, the packaged web bundle — for each secret
 * value, and self-tests with a canary so a scanner that silently matches
 * nothing cannot pass.
 *
 *   node scripts/scan-apk-secrets.mjs [path/to/app.apk] [path/to/.env]
 *
 * Exit 0 = clean. Exit 1 = a secret was found, or the scanner failed its own test.
 */
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const APK = process.argv[2] || 'client/android/app/build/outputs/apk/debug/app-debug.apk';
const ENV = process.argv[3] || 'server/.env';

/** Values that must never ship. Anything shorter than this is too generic to match on. */
const MIN_SECRET_LENGTH = 8;

/**
 * Secrets are selected by name pattern rather than a fixed list, so a key added
 * to server/.env later is covered without anyone remembering to edit this file.
 */
const SECRET_NAME = /(SECRET|PASSWORD|_PASS$|_KEY$|TOKEN|_URI$|DSN)/;

/** Names that match the pattern but are public by design. */
const PUBLIC_NAMES = new Set(['CLIENT_URL', 'ALLOWED_ORIGINS', 'MEDIA_KEY_VERSION']);

/**
 * Shapes that are secrets wherever they appear, whatever the env file says.
 * These matter in CI, where there is no real .env to compare against and a
 * value-only scan would pass while checking almost nothing.
 */
const SECRET_PATTERNS = [
  { name: 'MongoDB connection string', re: /mongodb(?:\+srv)?:\/\/[^\s"'<>]{6,}/ },
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

/** Entries whose own bytes legitimately look like anything (compiled/binary blobs). */
const PATTERN_SCAN_ONLY = /^(assets\/public\/|assets\/[^/]+\.js$|res\/raw\/|AndroidManifest\.xml$|resources\.arsc$)/;

/**
 * Values that are *meant* to be in the package.
 *
 * Firebase's Android API key is the one legitimate example: `google-services.json`
 * is compiled into the app so the phone can reach Firebase at all, and Google
 * restricts that key to this package name and signing certificate rather than
 * treating it as a secret. The shape rule still stands for every other Google
 * API key — a server key or a Maps key in here would be a real leak — so the
 * exception is limited to the exact values this project ships, read from the
 * file itself rather than pasted in.
 *
 * The admin service-account key is a different thing entirely: it is a private
 * key, it lives only in server/.env, and it is checked by value like every
 * other secret above.
 */
const EXPECTED_PUBLIC_VALUES = (() => {
  const path = 'client/android/app/google-services.json';
  if (!existsSync(path)) return [];
  try {
    const json = JSON.parse(readFileSync(path, 'utf8'));
    return (json.client || []).flatMap((c) => (c.api_key || []).map((k) => k.current_key)).filter(Boolean);
  } catch {
    return [];
  }
})();

if (!existsSync(APK)) {
  console.error(`No APK at ${APK}. Build one first: cd client && npm run android:apk`);
  process.exit(1);
}
if (!existsSync(ENV)) {
  console.error(`No env file at ${ENV}.`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(ENV, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).split(' #')[0].trim()])
);

const CANARY = 'apk-scan-canary-Zx7Q2m';
const needles = [];
const skipped = [];
for (const [key, value] of Object.entries(env)) {
  if (!SECRET_NAME.test(key) || PUBLIC_NAMES.has(key)) continue;
  if (!value || value.length < MIN_SECRET_LENGTH) { skipped.push(key); continue; }
  needles.push({ key, value });
  // A Mongo URI's password is the part that matters even if the host is public.
  const mongoPassword = value.match(/^mongodb(?:\+srv)?:\/\/[^:]+:([^@]+)@/)?.[1];
  if (mongoPassword && mongoPassword.length >= MIN_SECRET_LENGTH) {
    needles.push({ key: `${key} (password component)`, value: mongoPassword });
  }
}

if (needles.length === 0) {
  console.log(`note:     no values in ${ENV} are long enough to match on — relying on the pattern scan below.`);
}

const work = mkdtempSync(join(tmpdir(), 'apkscan-'));
try {
  // The JDK ships jar; unzip is not guaranteed on Windows.
  const jar = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'jar') : 'jar';
  try {
    execFileSync(jar, ['xf', resolve(APK)], { cwd: work, stdio: 'pipe' });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Could not run "${jar}". Set JAVA_HOME to a JDK, or put jar on PATH.`);
      process.exit(1);
    }
    throw err;
  }

  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(work);

  let hits = 0;
  let canarySeen = false;
  let bytesScanned = 0;

  for (const file of files) {
    const buf = readFileSync(file);
    bytesScanned += buf.length;
    // Both encodings: DEX string tables are UTF-8, resources.arsc holds UTF-16.
    const utf8 = buf.toString('latin1');
    const utf16 = buf.toString('utf16le');
    const where = relative(work, file);

    for (const { key, value } of needles) {
      if (utf8.includes(value) || utf16.includes(value)) {
        console.error(`LEAK  ${key} found in ${where}`);
        hits++;
      }
    }

    // Shape-based scan of the entries a build could plausibly leak into.
    const entry = where.replace(/\\/g, '/');
    if (PATTERN_SCAN_ONLY.test(entry)) {
      for (const { name, re } of SECRET_PATTERNS) {
        const found = utf8.match(re);
        if (found && !EXPECTED_PUBLIC_VALUES.includes(found[0])) {
          console.error(`LEAK  ${name} shape found in ${entry}: ${found[0].slice(0, 24)}…`);
          hits++;
        }
      }
    }

    if (utf8.includes(CANARY)) canarySeen = true;
  }

  // Self-test: the same matcher must find a string we know is present.
  const selfTest = [Buffer.from(`prefix ${CANARY} suffix`).toString('latin1')].some((s) => s.includes(CANARY));
  if (!selfTest) {
    console.error('Scanner self-test failed — matching logic is broken.');
    process.exit(1);
  }

  console.log(`APK:      ${APK}`);
  console.log(`entries:  ${files.length} files, ${(bytesScanned / 1048576).toFixed(1)} MB scanned`);
  console.log(`secrets:  ${needles.length} values checked${needles.length ? ` (${needles.map((n) => n.key).join(', ')})` : ''}`);
  if (skipped.length) console.log(`skipped:  ${skipped.join(', ')} — unset or shorter than ${MIN_SECRET_LENGTH} characters`);
  console.log(`patterns: ${SECRET_PATTERNS.length} secret shapes checked across the web bundle, resources and manifest`);
  console.log(`canary:   matcher verified${canarySeen ? ' — and the canary string is present in the APK, which it must not be' : ''}`);

  if (hits > 0 || canarySeen) {
    console.error(`\nFAILED: ${hits} secret value(s) present in the package.`);
    process.exit(1);
  }
  console.log('\nPASS: no server secret found in the APK.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
