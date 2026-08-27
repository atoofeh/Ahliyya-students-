const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { paginatedQuery } = require('../../core/pagination');
const { invalidateSettingsCache, SETTING_DEFAULTS, getSettings } = require('../../config/settingsCache');
const User = require('../../models/User');
const Session = require('../../models/Session');
const LoginHistory = require('../../models/LoginHistory');
const AuditLog = require('../../models/AuditLog');
const PlatformSetting = require('../../models/PlatformSetting');
const Enrollment = require('../../models/Enrollment');

class AdminService {
  // ── User management ─────────────────────────────────────────────────

  static async createUser(adminId, { name, username, email, password, role, mustChangePassword }, ip) {
    const user = await User.create({
      name, username, email: email?.toLowerCase(), password, role,
      mustChangePassword: mustChangePassword ?? true,
      emailVerified: false,
      createdBy: adminId,
    });
    await audit({ user: adminId, action: 'USER_CREATED', targetUser: user._id, ip, meta: { role } });
    return user.toPublicJSON();
  }

  static async listUsers({ page, limit, search, role, status }) {
    const filter = { deletedAt: null };
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { username: regex }, { email: regex }];
    }
    return paginatedQuery(User, filter, { page, limit, sort: { createdAt: -1 } });
  }

  static async getUserDetail(userId) {
    const [user, sessions, history, enrollments] = await Promise.all([
      User.findOne({ _id: userId, deletedAt: null }),
      Session.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
      LoginHistory.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean(),
      Enrollment.find({ student: userId }).populate('course', 'title').lean(),
    ]);
    if (!user) throw ApiError.notFound('User not found');
    return { user: user.toPublicJSON(), sessions, loginHistory: history, enrollments };
  }

  static async updateUser(adminId, userId, data, ip) {
    const user = await User.findOne({ _id: userId, deletedAt: null });
    if (!user) throw ApiError.notFound('User not found');

    const roleChanged = data.role && data.role !== user.role;
    if (data.name) user.name = data.name;
    if (data.email !== undefined) user.email = data.email?.toLowerCase() || undefined;
    if (data.role) user.role = data.role;
    await user.save();

    if (roleChanged) {
      await AdminService.#killSessions(userId, 'admin_force_logout');
      await audit({ user: adminId, action: 'ROLE_CHANGED', targetUser: userId, ip, meta: { role: data.role } });
    } else {
      await audit({ user: adminId, action: 'USER_UPDATED', targetUser: userId, ip });
    }
    return user.toPublicJSON();
  }

  static async setUserStatus(adminId, userId, status, ip) {
    if (String(adminId) === String(userId)) throw ApiError.badRequest('You cannot change your own status');
    const user = await User.findOne({ _id: userId, deletedAt: null });
    if (!user) throw ApiError.notFound('User not found');
    user.status = status;
    user.tokenVersion += 1; // invalidate outstanding tokens
    await user.save();
    if (status !== 'active') await AdminService.#killSessions(userId, 'admin_force_logout');
    const action = status === 'suspended' ? 'USER_SUSPENDED' : status === 'banned' ? 'USER_BANNED' : 'USER_ACTIVATED';
    await audit({ user: adminId, action, targetUser: userId, ip });
    return user.toPublicJSON();
  }

  static async deleteUser(adminId, userId, ip) {
    if (String(adminId) === String(userId)) throw ApiError.badRequest('You cannot delete yourself');
    const user = await User.findOne({ _id: userId, deletedAt: null });
    if (!user) throw ApiError.notFound('User not found');
    user.deletedAt = new Date();
    user.status = 'banned';
    user.tokenVersion += 1;
    // Free the unique keys for future reuse while preserving the record.
    user.username = `deleted_${Date.now()}_${user.username}`.slice(0, 50);
    user.email = undefined;
    await user.save();
    await AdminService.#killSessions(userId, 'admin_force_logout');
    await Enrollment.updateMany({ student: userId, status: 'active' }, { $set: { status: 'removed' } });
    await audit({ user: adminId, action: 'USER_DELETED', targetUser: userId, ip });
  }

  static async resetUserPassword(adminId, userId, newPassword, ip) {
    const user = await User.findOne({ _id: userId, deletedAt: null }).select('+password');
    if (!user) throw ApiError.notFound('User not found');
    user.password = newPassword;
    user.mustChangePassword = true;
    user.tokenVersion += 1;
    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
    await user.save();
    await AdminService.#killSessions(userId, 'password_changed');
    await audit({ user: adminId, action: 'PASSWORD_RESET', targetUser: userId, ip });
    return { message: 'Password reset. User must change it at next login.' };
  }

  static async #killSessions(userId, reason) {
    await Session.updateMany(
      { user: userId, isActive: true },
      { $set: { isActive: false, endedAt: new Date(), endReason: reason } }
    );
  }

  // ── Session / device management ────────────────────────────────────

  static async listActiveSessions({ page, limit }) {
    return paginatedQuery(Session, { isActive: true }, {
      page, limit,
      populate: { path: 'user', select: 'name username role' },
      sort: { lastActivityAt: -1 },
    });
  }

  static async forceLogout(adminId, sessionId, ip) {
    const session = await Session.findById(sessionId);
    if (!session || !session.isActive) throw ApiError.notFound('Active session not found');
    session.isActive = false;
    session.endedAt = new Date();
    session.endReason = 'admin_force_logout';
    await session.save();
    await audit({ user: adminId, action: 'FORCE_LOGOUT', targetUser: session.user, ip, meta: { sessionId } });
    return { message: 'Session terminated' };
  }

  static async forceLogoutUser(adminId, userId, ip) {
    await AdminService.#killSessions(userId, 'admin_force_logout');
    const user = await User.findById(userId);
    if (user) {
      user.tokenVersion += 1;
      await user.save();
    }
    await audit({ user: adminId, action: 'FORCE_LOGOUT', targetUser: userId, ip, meta: { all: true } });
    return { message: 'All sessions for user terminated' };
  }

  // ── Platform settings ──────────────────────────────────────────────

  static async getPlatformSettings() {
    const settings = await getSettings();
    return { settings, defaults: SETTING_DEFAULTS };
  }

  static async updateSettings(adminId, values, ip) {
    // Whitelist: only known settings keys are persisted.
    const clean = {};
    for (const key of Object.keys(SETTING_DEFAULTS)) {
      if (values[key] !== undefined) clean[key] = values[key];
    }
    const doc = await PlatformSetting.findOneAndUpdate(
      { key: 'global' },
      { $set: { updatedBy: adminId }, $setOnInsert: { key: 'global' } },
      { upsert: true, new: true }
    );
    doc.values = { ...doc.values, ...clean };
    doc.markModified('values');
    await doc.save();
    invalidateSettingsCache();

    if (clean.maintenanceMode !== undefined) {
      await audit({ user: adminId, action: clean.maintenanceMode ? 'MAINTENANCE_ON' : 'MAINTENANCE_OFF', ip });
    }
    await audit({ user: adminId, action: 'SETTINGS_UPDATED', ip, meta: { keys: Object.keys(clean) } });
    return AdminService.getPlatformSettings();
  }

  // ── Audit & login logs ─────────────────────────────────────────────

  static async auditLogs({ page, limit, action, userId, from, to }) {
    const filter = {};
    if (action) filter.action = action;
    if (userId) filter.$or = [{ user: userId }, { targetUser: userId }];
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    return paginatedQuery(AuditLog, filter, {
      page, limit,
      populate: [
        { path: 'user', select: 'name username role' },
        { path: 'targetUser', select: 'name username' },
        { path: 'course', select: 'title' },
      ],
      sort: { createdAt: -1 },
    });
  }

  static async loginHistory({ page, limit, success }) {
    const filter = {};
    if (success !== undefined) filter.success = success;
    return paginatedQuery(LoginHistory, filter, {
      page, limit,
      populate: { path: 'user', select: 'name username role' },
      sort: { createdAt: -1 },
    });
  }
}

module.exports = AdminService;
