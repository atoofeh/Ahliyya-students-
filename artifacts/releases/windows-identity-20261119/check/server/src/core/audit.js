const { securityLogger } = require('../config/logger');

/**
 * Writes an audit trail entry to MongoDB and the security log file.
 * Fire-and-forget: audit failures never break the request path.
 */
const audit = async ({ user, action, targetUser, course, resource, ip, deviceId, meta }) => {
  try {
    const AuditLog = require('../models/AuditLog');
    await AuditLog.create({
      user: user || undefined,
      action,
      targetUser: targetUser || undefined,
      course: course || undefined,
      resource: resource || undefined,
      ip,
      deviceId,
      meta: meta || undefined,
    });
    securityLogger.info(action, { user: String(user || ''), targetUser: String(targetUser || ''), ip, meta });
  } catch (err) {
    securityLogger.warn(`Audit write failed for ${action}: ${err.message}`);
  }
};

module.exports = audit;
