const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { UAParser } = require('ua-parser-js');
const env = require('../../config/env');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { sendMail, templates } = require('../../core/mailer');
const { sha256, safeEqual, randomToken } = require('../../core/cryptoUtils');
const { getSettings } = require('../../config/settingsCache');
const { isMultiDeviceUser } = require('../../core/permissions');
const User = require('../../models/User');
const Session = require('../../models/Session');
const LoginHistory = require('../../models/LoginHistory');
const DeviceService = require('./device.service');

// Compared against when the username is unknown so response timing does not reveal account existence.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-password', 12);
const GENERIC_CREDENTIALS_MESSAGE = 'Invalid username or password';
const DEVICE_NOT_AUTHORIZED_MESSAGE = 'This account is already linked to another device. Contact an administrator or request a device reset.';

const parseDevice = (userAgent = '') => {
  const ua = new UAParser(userAgent).getResult();
  return {
    browser: [ua.browser.name, ua.browser.version].filter(Boolean).join(' '),
    os: [ua.os.name, ua.os.version].filter(Boolean).join(' '),
    deviceType: ua.device.type || 'desktop',
  };
};

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

class AuthService {
  static signTokens(user, sessionId, rememberMe) {
    const payload = { userId: user._id, role: user.role, tokenVersion: user.tokenVersion, sid: sessionId };
    const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
    // jti makes every refresh token unique even when issued within the same second,
    // so rotation always changes the stored hash and replay detection can work.
    const refreshToken = jwt.sign({ ...payload, jti: randomToken(8) }, env.JWT_REFRESH_SECRET, {
      expiresIn: rememberMe ? '30d' : env.JWT_REFRESH_EXPIRES_IN,
    });
    return { accessToken, refreshToken };
  }

  /**
   * Login, in enumeration-safe order:
   *   password → (only then) lock / ban / suspension → device binding → session.
   * A wrong password always yields the generic message, whatever the account state.
   * The single-active-session policy still applies: a new login ends other sessions.
   */
  static async login({ username, password, deviceId, fingerprint, rememberMe, userAgent, ip, platform = 'web', appVersion = '' }) {
    const settings = await getSettings();
    const device = parseDevice(userAgent);
    const historyBase = { username, ip, userAgent, deviceId: deviceId || '', fingerprint: fingerprint || '', ...device };

    const fail = async (user, reason, message, status = 401, code, extraAudit) => {
      await LoginHistory.create({ ...historyBase, user: user?._id, success: false, reason });
      await audit({ user: user?._id, action: 'LOGIN_FAILED', ip, deviceId, meta: { username, reason } });
      if (extraAudit) await audit({ user: user?._id, action: extraAudit, targetUser: user?._id, ip, deviceId, meta: { reason } });
      throw new ApiError(status, message, code);
    };

    if (!deviceId) throw ApiError.badRequest('Device ID is required', 'DEVICE_REQUIRED');

    const user = await User.findOne({ username: username.toLowerCase(), deletedAt: null })
      .select('+password +failedLoginAttempts +lockedUntil');

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return fail(null, 'unknown_user', GENERIC_CREDENTIALS_MESSAGE);
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      user.failedLoginAttempts += 1;
      let reason = 'bad_password';
      if (user.failedLoginAttempts >= (settings.maxLoginAttempts || 5)) {
        user.lockedUntil = new Date(Date.now() + (settings.lockoutMinutes || 15) * 60000);
        user.failedLoginAttempts = 0;
        reason = 'locked';
        await user.save();
        await audit({ user: user._id, action: 'ACCOUNT_LOCKED', ip, deviceId });
      } else {
        await user.save();
      }
      return fail(user, reason, GENERIC_CREDENTIALS_MESSAGE);
    }

    // Password is correct — account state may now be disclosed.
    if (user.status === 'banned') return fail(user, 'banned', 'This account has been banned', 403, 'ACCOUNT_BANNED');
    if (user.status === 'suspended') return fail(user, 'suspended', 'This account is suspended', 403, 'ACCOUNT_SUSPENDED');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return fail(user, 'locked', `Account locked. Try again in ${mins} minute(s).`, 423, 'ACCOUNT_LOCKED');
    }

    // Reset lockout counters, stamp login.
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    // ONE ACCOUNT, ONE AUTHORIZED DEVICE.
    let boundDevice = null;
    if (settings.deviceBindingEnabled !== false) {
      const result = await DeviceService.bindOrVerify({ user, deviceId, fingerprint, ip, ua: device, platform, appVersion });
      if (result.rejected) {
        return fail(user, 'device_not_authorized', DEVICE_NOT_AUTHORIZED_MESSAGE, 403, 'DEVICE_NOT_AUTHORIZED', 'DEVICE_LOGIN_REJECTED');
      }
      boundDevice = result.device;
    }

    // SINGLE ACTIVE SESSION: terminate every other session for this user.
    // Multi-device accounts (the owner, plus anyone granted it) are exempt:
    // signing in on a phone must not end the session on the laptop. Their
    // sessions stay pinned to their own devices, so nothing is loosened
    // beyond concurrency.
    if (!isMultiDeviceUser(user)) {
      const terminated = await Session.updateMany(
        { user: user._id, isActive: true },
        { $set: { isActive: false, endedAt: new Date(), endReason: 'new_device_login' } }
      );
      if (terminated.modifiedCount > 0) {
        await audit({ user: user._id, action: 'SESSION_TERMINATED', ip, deviceId, meta: { count: terminated.modifiedCount, cause: 'new_login' } });
      }
    }

    const session = await Session.create({
      user: user._id,
      refreshTokenHash: 'pending',
      deviceId,
      device: boundDevice?._id || null,
      deviceKeyHash: DeviceService.hashDeviceId(deviceId),
      fingerprint: fingerprint || null,
      userAgent,
      ip,
      rememberMe: !!rememberMe,
      ...device,
    });

    const tokens = AuthService.signTokens(user, session._id, rememberMe);
    session.refreshTokenHash = sha256(tokens.refreshToken);
    await session.save();

    await LoginHistory.create({ ...historyBase, user: user._id, success: true });
    await audit({ user: user._id, action: 'LOGIN', ip, deviceId });

    return { user: user.toPublicJSON(), session, ...tokens };
  }

  /**
   * Refresh-token rotation with reuse detection: a refresh token may be used
   * exactly once. Reuse of a rotated token kills the session.
   */
  static async refresh(refreshToken, { ip, deviceId } = {}) {
    if (!refreshToken) throw ApiError.unauthorized('Refresh token required', 'NO_REFRESH');

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token', 'REFRESH_INVALID');
    }

    const [user, session] = await Promise.all([
      User.findById(decoded.userId),
      Session.findById(decoded.sid).select('+refreshTokenHash +deviceKeyHash'),
    ]);

    if (!user || user.deletedAt || user.status !== 'active') {
      throw ApiError.unauthorized('Account unavailable', 'REFRESH_INVALID');
    }
    if (user.tokenVersion !== decoded.tokenVersion) {
      throw ApiError.unauthorized('Token revoked', 'REFRESH_INVALID');
    }
    if (!session || !session.isActive) {
      throw ApiError.unauthorized('Session ended', 'SESSION_TERMINATED');
    }

    // Device pinning: a refresh token presented from another device ends the session.
    if (session.deviceKeyHash) {
      try {
        DeviceService.assertSessionDevice(session, deviceId);
      } catch (err) {
        session.isActive = false;
        session.endedAt = new Date();
        session.endReason = 'device_mismatch';
        await session.save();
        await audit({ user: user._id, action: 'DEVICE_MISMATCH', ip, meta: { sessionId: String(session._id), during: 'refresh' } });
        throw err;
      }
    }

    if (!safeEqual(session.refreshTokenHash, sha256(refreshToken))) {
      // Rotated token replayed — likely theft. Kill the session.
      session.isActive = false;
      session.endedAt = new Date();
      session.endReason = 'refresh_rotated_reuse';
      await session.save();
      await audit({ user: user._id, action: 'TOKEN_REUSE_DETECTED', ip, meta: { sessionId: String(session._id) } });
      await audit({ user: user._id, action: 'SESSION_TERMINATED', ip, meta: { cause: 'refresh_reuse_detected' } });
      throw ApiError.unauthorized('Refresh token reuse detected — session terminated', 'SESSION_TERMINATED');
    }

    const tokens = AuthService.signTokens(user, session._id, session.rememberMe);
    session.refreshTokenHash = sha256(tokens.refreshToken);
    session.lastActivityAt = new Date();
    await session.save();

    return { user: user.toPublicJSON(), rememberMe: !!session.rememberMe, ...tokens };
  }

  static async logout(sessionId, userId, ip, { forgetDevice = false } = {}) {
    const session = await Session.findById(sessionId);
    if (session && session.isActive) {
      session.isActive = false;
      session.endedAt = new Date();
      session.endReason = 'logout';
      await session.save();
    }
    await audit({ user: userId, action: 'LOGOUT', ip });
    if (forgetDevice) {
      await DeviceService.revoke({ targetUserId: userId, actor: { id: userId }, reason: 'user_forget_device', ip, self: true });
    }
  }

  // ── Email verification ─────────────────────────────────────────────

  static async sendVerificationCode(userId, email) {
    const user = await User.findById(userId).select('+emailVerifyCodeHash +emailVerifyExpires');
    if (!user) throw ApiError.notFound('User not found');
    if (email) {
      const taken = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (taken) throw ApiError.conflict('Email already in use');
      user.email = email.toLowerCase();
    }
    if (!user.email) throw ApiError.badRequest('No email address on file');

    const code = generateOtp();
    user.emailVerifyCodeHash = sha256(code);
    user.emailVerifyExpires = new Date(Date.now() + 15 * 60000);
    await user.save();
    await sendMail({ to: user.email, ...templates.verifyEmail(user.name, code) });
    return { email: user.email };
  }

  static async verifyEmail(userId, code, ip) {
    const user = await User.findById(userId).select('+emailVerifyCodeHash +emailVerifyExpires');
    if (!user) throw ApiError.notFound('User not found');
    if (!user.emailVerifyCodeHash || !user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
      throw ApiError.badRequest('Verification code expired — request a new one', 'CODE_EXPIRED');
    }
    if (!safeEqual(user.emailVerifyCodeHash, sha256(code))) {
      throw ApiError.badRequest('Invalid verification code', 'CODE_INVALID');
    }
    user.emailVerified = true;
    user.emailVerifyCodeHash = null;
    user.emailVerifyExpires = null;
    await user.save();
    await audit({ user: user._id, action: 'EMAIL_VERIFIED', ip });
    return user.toPublicJSON();
  }

  // ── Password management ────────────────────────────────────────────

  static async setPassword(userId, newPassword, ip) {
    const settings = await getSettings();
    const user = await User.findById(userId).select('+password');
    if (!user) throw ApiError.notFound('User not found');
    if (settings.requireEmailVerification && !user.emailVerified) {
      throw ApiError.forbidden('Verify your email first', 'EMAIL_UNVERIFIED');
    }
    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();
    await audit({ user: user._id, action: 'PASSWORD_CHANGED', ip });
    return user.toPublicJSON();
  }

  static async changePassword(userId, currentPassword, newPassword, sessionId, ip) {
    const user = await User.findById(userId).select('+password');
    if (!user) throw ApiError.notFound('User not found');
    if (!(await user.comparePassword(currentPassword))) {
      throw ApiError.unauthorized('Current password is incorrect');
    }
    user.password = newPassword;
    user.tokenVersion += 1; // revoke every outstanding token
    await user.save();

    // End all sessions except the current one, then re-issue for this session.
    await Session.updateMany(
      { user: user._id, isActive: true, _id: { $ne: sessionId } },
      { $set: { isActive: false, endedAt: new Date(), endReason: 'password_changed' } }
    );
    const session = await Session.findById(sessionId);
    const tokens = AuthService.signTokens(user, session._id, session.rememberMe);
    session.refreshTokenHash = sha256(tokens.refreshToken);
    await session.save();

    await audit({ user: user._id, action: 'PASSWORD_CHANGED', ip });
    return { user: user.toPublicJSON(), rememberMe: !!session.rememberMe, ...tokens };
  }

  static async requestPasswordReset(email, ip) {
    const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null })
      .select('+passwordResetCodeHash +passwordResetExpires');
    // Always report success to avoid account enumeration.
    if (!user) return;
    const code = generateOtp();
    user.passwordResetCodeHash = sha256(code);
    user.passwordResetExpires = new Date(Date.now() + 15 * 60000);
    await user.save();
    await sendMail({ to: user.email, ...templates.resetPassword(user.name, code) });
    await audit({ user: user._id, action: 'PASSWORD_RESET_REQUESTED', ip });
  }

  static async resetPassword(email, code, newPassword, ip) {
    const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null })
      .select('+passwordResetCodeHash +passwordResetExpires');
    if (!user || !user.passwordResetCodeHash || user.passwordResetExpires < new Date()) {
      throw ApiError.badRequest('Invalid or expired reset code', 'CODE_INVALID');
    }
    if (!safeEqual(user.passwordResetCodeHash, sha256(code))) {
      throw ApiError.badRequest('Invalid or expired reset code', 'CODE_INVALID');
    }
    user.password = newPassword;
    user.passwordResetCodeHash = null;
    user.passwordResetExpires = null;
    user.tokenVersion += 1;
    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
    await user.save();
    await Session.updateMany(
      { user: user._id, isActive: true },
      { $set: { isActive: false, endedAt: new Date(), endReason: 'password_changed' } }
    );
    await audit({ user: user._id, action: 'PASSWORD_RESET', ip });
  }

  // ── Sessions & profile ────────────────────────────────────────────

  static async getSessions(userId, currentSessionId) {
    const sessions = await Session.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean();
    return sessions.map((s) => ({ ...s, isCurrent: String(s._id) === String(currentSessionId) }));
  }

  static async getLoginHistory(userId, limit = 20) {
    return LoginHistory.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  static async getProfile(userId) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');
    return user.toPublicJSON();
  }

  static async updateProfile(userId, { name, preferences }) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');
    if (name) user.name = name;
    if (preferences) user.preferences = { ...user.preferences.toObject(), ...preferences };
    await user.save();
    return user.toPublicJSON();
  }
}

module.exports = AuthService;
