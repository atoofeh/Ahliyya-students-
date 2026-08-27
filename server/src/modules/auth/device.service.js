const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { securityLogger } = require('../../config/logger');
const { sha256, safeEqual } = require('../../core/cryptoUtils');
const Device = require('../../models/Device');
const Session = require('../../models/Session');
const User = require('../../models/User');

const PLATFORMS = new Set(['web', 'android', 'ios']);

/**
 * One account ↔ one authorized device.
 * The device credential is the client's random device id; only its SHA-256
 * is stored. The Device collection's partial unique index guarantees a single
 * active device per user even under concurrent first logins.
 */
class DeviceService {
  static hashDeviceId(deviceId) {
    return sha256(String(deviceId));
  }

  static publicIdFor(deviceId, userId) {
    return sha256(`${deviceId}:${userId}`).slice(0, 8).toUpperCase();
  }

  static normalizePlatform(header) {
    const v = String(header || 'web').toLowerCase();
    return PLATFORMS.has(v) ? v : 'other';
  }

  /**
   * Called by login after the password is verified.
   * Returns { device, rejected }. Never throws for a foreign device — the
   * caller records LoginHistory and audits before failing the request.
   */
  static async bindOrVerify({ user, deviceId, fingerprint, ip, ua = {}, platform = 'web', appVersion = '' }) {
    const keyHash = DeviceService.hashDeviceId(deviceId);
    const fingerprintHash = fingerprint ? sha256(String(fingerprint)) : null;

    let active = await Device.findOne({ user: user._id, status: 'active' }).select('+deviceKeyHash');

    if (!active) {
      const hadPrevious = await Device.exists({ user: user._id, status: 'revoked' });
      const publicId = DeviceService.publicIdFor(deviceId, user._id);
      try {
        active = await Device.create({
          user: user._id,
          deviceKeyHash: keyHash,
          publicId,
          fingerprintHash,
          platform,
          browser: ua.browser || '',
          os: ua.os || '',
          deviceType: ua.deviceType || 'desktop',
          appVersion: appVersion || '',
          firstAuthorizedAt: new Date(),
          lastSeenAt: new Date(),
          lastIp: ip || '',
          status: 'active',
        });
        await audit({
          user: user._id, action: hadPrevious ? 'DEVICE_CHANGED' : 'DEVICE_BOUND', targetUser: user._id,
          ip, deviceId: publicId, meta: { platform, browser: ua.browser, os: ua.os },
        });
        return { device: active, rejected: false };
      } catch (err) {
        if (err.code !== 11000) throw err;
        // Lost the race: another login bound a device a moment ago.
        active = await Device.findOne({ user: user._id, status: 'active' }).select('+deviceKeyHash');
        if (!active) throw err;
      }
    }

    if (!safeEqual(active.deviceKeyHash, keyHash)) {
      return { device: active, rejected: true };
    }

    if (active.fingerprintHash && fingerprintHash && active.fingerprintHash !== fingerprintHash) {
      securityLogger.warn('DEVICE_FINGERPRINT_DRIFT', { user: String(user._id), device: active.publicId });
      await audit({ user: user._id, action: 'DEVICE_FINGERPRINT_DRIFT', targetUser: user._id, ip, deviceId: active.publicId });
    }
    active.lastSeenAt = new Date();
    active.lastIp = ip || active.lastIp;
    if (fingerprintHash) active.fingerprintHash = fingerprintHash;
    if (appVersion) active.appVersion = appVersion;
    active.platform = platform;
    if (ua.browser) active.browser = ua.browser;
    if (ua.os) active.os = ua.os;
    await active.save();
    return { device: active, rejected: false };
  }

  /**
   * Revoke the target's authorized device: end every session, bump
   * tokenVersion, audit. The next login from any device binds fresh.
   */
  static async revoke({ targetUserId, actor, reason, ip, self = false }) {
    const now = new Date();
    const revoked = await Device.updateMany(
      { user: targetUserId, status: 'active' },
      { $set: { status: 'revoked', revokedAt: now, revokedBy: actor.id, revocationReason: reason } }
    );
    await Session.updateMany(
      { user: targetUserId, isActive: true },
      { $set: { isActive: false, endedAt: now, endReason: 'device_revoked' } }
    );
    await User.updateOne({ _id: targetUserId }, { $inc: { tokenVersion: 1 } });
    await audit({ user: actor.id, action: 'DEVICE_REVOKED', targetUser: targetUserId, ip, meta: { reason, self, devices: revoked.modifiedCount } });
    return { revoked: revoked.modifiedCount };
  }

  /** Store a reset request only when the account exists; the caller's reply is identical either way. */
  static async requestReset({ username, note, ip, userAgent }) {
    const DeviceResetRequest = require('../../models/DeviceResetRequest');
    const user = await User.findOne({ username: String(username).toLowerCase(), deletedAt: null }).select('_id');
    await audit({ user: user?._id, action: 'DEVICE_RESET_REQUESTED', targetUser: user?._id, ip, meta: { username, known: !!user } });
    if (!user) return null;
    const open = await DeviceResetRequest.findOne({ user: user._id, status: 'open' });
    if (open) return open; // one open request per account
    return DeviceResetRequest.create({ username, user: user._id, note, ip, userAgent });
  }

  static async activeFor(userId) {
    const device = await Device.findOne({ user: userId, status: 'active' });
    return device ? device.toPublicJSON() : null;
  }

  static async historyFor(userId, limit = 20) {
    const rows = await Device.find({ user: userId, status: 'revoked' }).sort({ revokedAt: -1 }).limit(limit)
      .populate('revokedBy', 'name username');
    return rows.map((d) => ({ ...d.toPublicJSON(), revokedBy: d.revokedBy ? { name: d.revokedBy.name, username: d.revokedBy.username } : null }));
  }

  /** Throws unless the presented device id matches the session's pinned hash. */
  static assertSessionDevice(session, presentedDeviceId) {
    if (!session.deviceKeyHash) return;
    if (!presentedDeviceId || !safeEqual(DeviceService.hashDeviceId(presentedDeviceId), session.deviceKeyHash)) {
      throw ApiError.unauthorized('Your session has ended. Please sign in again.', 'SESSION_TERMINATED');
    }
  }
}

module.exports = DeviceService;
