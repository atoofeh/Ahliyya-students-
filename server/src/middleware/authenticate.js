const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../core/ApiError');
const { getSettings } = require('../config/settingsCache');

/**
 * Access-token authentication with single-active-session enforcement.
 *
 * Token payload: { userId, role, tokenVersion, sid }
 *  - tokenVersion: bumping invalidates every token for the user (global logout)
 *  - sid: the Session document id — the session must still be active, which is
 *    how "logging in on device B kills device A" takes effect immediately.
 *
 * Also enforces the admin-configurable inactivity timeout by tracking
 * Session.lastActivityAt on every authenticated request.
 */
const authenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication required');
    }

    let decoded;
    try {
      decoded = jwt.verify(header.slice(7), env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Token expired', 'TOKEN_EXPIRED');
      }
      throw ApiError.unauthorized('Invalid token');
    }

    const User = require('../models/User');
    const Session = require('../models/Session');

    const [user, session, settings] = await Promise.all([
      User.findById(decoded.userId),
      Session.findById(decoded.sid),
      getSettings(),
    ]);

    if (!user || user.deletedAt) throw ApiError.unauthorized('Account not found');
    if (user.status === 'banned') throw ApiError.forbidden('Account is banned', 'ACCOUNT_BANNED');
    if (user.status === 'suspended') throw ApiError.forbidden('Account is suspended', 'ACCOUNT_SUSPENDED');
    if (user.tokenVersion !== decoded.tokenVersion) {
      throw ApiError.unauthorized('Token has been revoked', 'TOKEN_REVOKED');
    }

    if (!session || !session.isActive) {
      throw ApiError.unauthorized(
        'Your session was ended because this account signed in on another device.',
        'SESSION_TERMINATED'
      );
    }

    // Inactivity timeout (admin configurable).
    const timeoutMs = (settings.sessionTimeoutMinutes || 30) * 60 * 1000;
    if (session.lastActivityAt && Date.now() - session.lastActivityAt.getTime() > timeoutMs) {
      session.isActive = false;
      session.endedAt = new Date();
      session.endReason = 'inactivity_timeout';
      await session.save();
      throw ApiError.unauthorized('Session expired due to inactivity', 'SESSION_INACTIVE');
    }

    // Throttled activity write (at most once per 30s) to avoid a DB write per request.
    if (!session.lastActivityAt || Date.now() - session.lastActivityAt.getTime() > 30 * 1000) {
      session.lastActivityAt = new Date();
      session.save().catch(() => {});
    }

    // Maintenance mode: only admins may pass.
    if (settings.maintenanceMode && user.role !== 'admin') {
      throw new ApiError(503, settings.maintenanceMessage, 'MAINTENANCE');
    }

    req.user = {
      id: user._id,
      role: user.role,
      name: user.name,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
    };
    req.session = session;
    req.settings = settings;

    // Onboarding gate: force first-login flow before anything else.
    if (user.mustChangePassword) {
      const allowed = ['/auth/verify-email', '/auth/set-password', '/auth/me', '/auth/refresh', '/auth/logout', '/auth/resend-verification'];
      if (!allowed.some((p) => req.originalUrl.includes(p))) {
        throw ApiError.forbidden('Complete account onboarding first', 'ONBOARDING_REQUIRED');
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
