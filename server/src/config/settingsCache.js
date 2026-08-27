/**
 * In-memory cache for platform settings with short TTL.
 * Settings live in a MongoDB singleton document (see models/PlatformSetting)
 * so admin changes apply across the cluster within TTL seconds.
 */
const TTL_MS = 15 * 1000;

let cached = null;
let cachedAt = 0;

const DEFAULTS = Object.freeze({
  platformName: 'Students Alahliyya',
  maintenanceMode: false,
  maintenanceMessage: 'The platform is under scheduled maintenance. Please check back soon.',
  sessionTimeoutMinutes: 30,
  requireEmailVerification: true,
  deviceBindingEnabled: true, // one account ↔ one authorized device (owner-only setting)
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
  recordingProtection: true,
  screenshotProtection: true,
  watermarkEnabled: true,
  watermarkShowIp: false,
  antiCheatEnabled: true,
  antiCheatStrictness: 'medium', // low | medium | high
  maxUploadMb: 2048,
  defaultQuizRetakeLimit: 1,
  enrollmentOpen: true,
  storageQuotaGb: 100,
});

const getSettings = async () => {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  try {
    const PlatformSetting = require('../models/PlatformSetting');
    const doc = await PlatformSetting.findOne({ key: 'global' }).lean();
    cached = { ...DEFAULTS, ...(doc?.values || {}) };
  } catch {
    cached = { ...DEFAULTS };
  }
  cachedAt = Date.now();
  return cached;
};

const invalidateSettingsCache = () => {
  cached = null;
  cachedAt = 0;
};

module.exports = { getSettings, invalidateSettingsCache, SETTING_DEFAULTS: DEFAULTS };
