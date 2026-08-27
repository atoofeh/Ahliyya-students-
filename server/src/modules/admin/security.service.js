const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { paginatedQuery } = require('../../core/pagination');
const Session = require('../../models/Session');
const LoginHistory = require('../../models/LoginHistory');
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');
const Device = require('../../models/Device');
const DeviceResetRequest = require('../../models/DeviceResetRequest');
const AdminService = require('./admin.service');

/** Audit actions that indicate someone is pushing on the security controls. */
const SUSPICIOUS = ['DEVICE_LOGIN_REJECTED', 'DEVICE_MISMATCH', 'TOKEN_REUSE_DETECTED', 'OWNER_ACTION_BLOCKED', 'ACCOUNT_LOCKED'];
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

class SecurityService {
  static async overview() {
    const [activeSessions, failedLogins24h, lockedAccounts, deviceResets7d, openResetRequests, suspicious, recent] = await Promise.all([
      Session.countDocuments({ isActive: true }),
      LoginHistory.countDocuments({ success: false, createdAt: { $gte: daysAgo(1) } }),
      User.countDocuments({ deletedAt: null, lockedUntil: { $gt: new Date() } }),
      AuditLog.countDocuments({ action: 'DEVICE_REVOKED', createdAt: { $gte: daysAgo(7) } }),
      DeviceResetRequest.countDocuments({ status: 'open' }),
      AuditLog.aggregate([
        { $match: { action: { $in: SUSPICIOUS }, createdAt: { $gte: daysAgo(7) } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $project: { _id: 0, action: '$_id', count: 1 } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.find({ action: { $in: SUSPICIOUS } }).sort({ createdAt: -1 }).limit(20)
        .populate('user', 'name username role').populate('targetUser', 'name username').lean(),
    ]);
    return { activeSessions, failedLogins24h, lockedAccounts, deviceResets7d, openResetRequests, suspiciousEvents7d: suspicious, recentSecurityAudit: recent };
  }

  static async listDevices({ page, limit, search, status }) {
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const users = await User.find({ $or: [{ name: regex }, { username: regex }, { email: regex }] }).select('_id');
      filter.user = { $in: users.map((u) => u._id) };
    }
    const result = await paginatedQuery(Device, filter, {
      page, limit, sort: { lastSeenAt: -1 }, populate: { path: 'user', select: 'name username role' },
    });
    result.items = result.items.map((d) => ({
      id: d._id, publicId: d.publicId, platform: d.platform, browser: d.browser, os: d.os, status: d.status,
      firstAuthorizedAt: d.firstAuthorizedAt, lastSeenAt: d.lastSeenAt, lastIp: d.lastIp, revokedAt: d.revokedAt, revocationReason: d.revocationReason,
      user: d.user ? { id: d.user._id, name: d.user.name, username: d.user.username, role: d.user.role } : null,
    }));
    return result;
  }

  static async listResetRequests({ page, limit, status = 'open' }) {
    return paginatedQuery(DeviceResetRequest, { status }, {
      page, limit, sort: { createdAt: -1 },
      populate: [{ path: 'user', select: 'name username role' }, { path: 'resolvedBy', select: 'name username' }],
    });
  }

  static async resolveResetRequest(actor, requestId, { action, resolution }, ip) {
    const request = await DeviceResetRequest.findOne({ _id: requestId, status: 'open' });
    if (!request) throw ApiError.notFound('Open request not found');
    if (action === 'revoke') {
      // assertCanManage runs inside revokeUserDevice: owner-targeted requests are refused for admins.
      await AdminService.revokeUserDevice(actor, request.user, resolution || 'Device reset request approved', ip);
    }
    request.status = action === 'revoke' ? 'resolved' : 'dismissed';
    request.resolvedBy = actor.id;
    request.resolvedAt = new Date();
    request.resolution = resolution || '';
    await request.save();
    await audit({ user: actor.id, action: 'DEVICE_RESET_REQUEST_RESOLVED', targetUser: request.user, ip, meta: { action, requestId: String(request._id) } });
    return request;
  }
}

module.exports = SecurityService;
