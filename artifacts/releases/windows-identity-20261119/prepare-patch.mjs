import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('D:/Ahliyaa students');
const baseline = path.join(root, 'artifacts/diagnostics/windows-live-baseline');
const output = path.join(root, 'artifacts/releases/windows-identity-20261119/patch/server/src');
const expected = {
  'modules/auth/auth.service.js': '1aeb2f76ed2ad916f11de6535ebc41b83bd7eb653e0ccea0afb9083fb7948c86',
  'modules/auth/device.service.js': 'ab53cb0eddd6784b9c03e6c0892f6644472dfffa46cb5cf460deef823718837e',
  'modules/auth/auth.controller.js': '085389a73b0fb429605651e6db9afaf54792b79bc19ebc442717f12d4f3c2954',
  'modules/auth/auth.validators.js': 'd262bdb4f25f7307e725d872441565250aa705e2c819119bd3bc73d949923dd0',
  'models/Device.js': 'e7ee99136bd6a258853c37369b6a0f9eee18117a6ba23d4164317e48d13f62a5',
  'models/Session.js': 'fa9bd05cc9846249fdaec6ad49be773dfaa62adabb2b8c3ec75b2b96c5f437fc',
  'config/constants.js': 'a70781d5b2ad658b99c55ca8ea55a0515b18ed4ea070f4cdd8a9c98b5befc68c',
};
const replace = (source, from, to) => {
  if (source.split(from).length !== 2) throw new Error(`Expected one occurrence: ${from.slice(0, 70)}`);
  return source.replace(from, to);
};
const read = (file) => fs.readFileSync(path.join(root, 'server/src', file), 'utf8').replaceAll('\r\n', '\n');
const desktop = read('modules/auth/device.service.js');
const mismatch = desktop.slice(desktop.indexOf('    if (!multiDevice && !safeEqual(active.deviceKeyHash, keyHash)) {'), desktop.indexOf('\n    if (active.fingerprintHash'));
const helper = desktop.slice(desktop.indexOf('  static async #upgradeDesktopIdentity('), desktop.indexOf('  /**\n   * Revoke the target'));
const manifest = [];
for (const [file, sha256] of Object.entries(expected)) {
  const bytes = fs.readFileSync(path.join(baseline, path.basename(file)));
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Production baseline changed: ${file}`);
  let source = bytes.toString('utf8').replaceAll('\r\n', '\n');
  if (file === 'modules/auth/auth.service.js') {
    source = replace(source, 'deviceId, fingerprint, rememberMe, userAgent, ip, platform', 'deviceId, desktopLegacyDeviceId, fingerprint, rememberMe, userAgent, ip, platform');
    source = replace(source, '{ user, deviceId, fingerprint, ip, ua: device, platform, appVersion }', '{ user, deviceId, desktopLegacyDeviceId, fingerprint, ip, ua: device, userAgent, platform, appVersion }');
    source = replace(source, '      rememberMe: !!rememberMe,\n      ...device,', '      rememberMe: !!rememberMe,\n      platform,\n      ...device,');
  } else if (file === 'modules/auth/device.service.js') {
    source = replace(source, "new Set(['web', 'android', 'ios'])", "new Set(['web', 'android', 'ios', 'windows'])");
    source = replace(source, "deviceId, fingerprint, ip, ua = {}, platform = 'web'", "deviceId, desktopLegacyDeviceId, fingerprint, ip, ua = {}, userAgent = '', platform = 'web'");
    source = replace(source, '    if (!multiDevice && !safeEqual(active.deviceKeyHash, keyHash)) {\n      return { device: active, rejected: true };\n    }\n', mismatch);
    source = replace(source, '  /**\n   * Revoke the target', `${helper}  /**\n   * Revoke the target`);
  } else if (file === 'models/Device.js') {
    source = replace(source, "enum: ['web', 'android', 'ios', 'other']", "enum: ['web', 'android', 'ios', 'windows', 'other']");
  } else if (file === 'models/Session.js') {
    source = replace(source, "    deviceType: { type: String, default: 'desktop' },", "    deviceType: { type: String, default: 'desktop' },\n    platform: { type: String, enum: ['web', 'android', 'ios', 'windows', 'other'], default: 'web' },");
  } else source = read(file);
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, source);
  manifest.push({ file: `server/src/${file}`, before: sha256, after: createHash('sha256').update(source).digest('hex') });
}
fs.writeFileSync(path.join(output, '../../../manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Prepared ${manifest.length} focused files while preserving the live device/session policy.`);
