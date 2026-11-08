const ApiError = require('../../core/ApiError');
const crypto = require('crypto');
const audit = require('../../core/audit');
const { paginatedQuery } = require('../../core/pagination');
const { invalidateSettingsCache, SETTING_DEFAULTS, getSettings } = require('../../config/settingsCache');
const { ROLES } = require('../../config/constants');
const { PERMISSIONS: P, hasPermission, canAssignRole, isAdminRole } = require('../../core/permissions');
const User = require('../../models/User');
const Session = require('../../models/Session');
const LoginHistory = require('../../models/LoginHistory');
const AuditLog = require('../../models/AuditLog');
const PlatformSetting = require('../../models/PlatformSetting');
const Enrollment = require('../../models/Enrollment');
const DeviceService = require('../auth/device.service');

/** Settings keys only the owner may change. */
const OWNER_ONLY_SETTINGS = ['sessionTimeoutMinutes', 'maxLoginAttempts', 'lockoutMinutes', 'requireEmailVerification', 'deviceBindingEnabled'];

class AdminService {
  static OWNER_ONLY_SETTINGS = OWNER_ONLY_SETTINGS;

  /**
   * Single guard for every mutating admin action.
   * actor: req.user ({ id, role }); target: User document; intent: string label for the audit row.
   */
  static async assertCanManage(actor, target, intent, ip) {
    if (String(actor.id) === String(target._id)) {
      throw ApiError.badRequest('You cannot perform this action on your own account', 'SELF_ACTION');
    }
    if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
      await audit({ user: actor.id, action: 'OWNER_ACTION_BLOCKED', targetUser: target._id, ip, meta: { intent } });
      throw ApiError.forbidden('The platform owner account is protected', 'OWNER_PROTECTED');
    }
    if (target.role === ROLES.ADMIN && !hasPermission(actor.role, P.ADMINS_MANAGE)) {
      throw ApiError.forbidden('Only the platform owner can manage administrator accounts', 'FORBIDDEN');
    }
  }

  static async #loadTarget(userId) {
    const user = await User.findOne({ _id: userId, deletedAt: null });
    if (!user) throw ApiError.notFound('User not found');
    return user;
  }

  static async #killSessions(userId, reason) {
    await Session.updateMany(
      { user: userId, isActive: true },
      { $set: { isActive: false, endedAt: new Date(), endReason: reason } }
    );
  }

  // ── User management ─────────────────────────────────────────────────

  static async createUser(actor, { name, username, email, password, role, mustChangePassword, reviewerAccess }, ip) {
    if (role === ROLES.SUPER_ADMIN) {
      throw ApiError.badRequest('The owner account can only be created by the bootstrap seed', 'ROLE_NOT_ASSIGNABLE');
    }
    if (reviewerAccess && (actor.role !== ROLES.SUPER_ADMIN || role !== ROLES.STUDENT)) {
      throw ApiError.forbidden('Only the owner can create a student reviewer account', 'FORBIDDEN');
    }
    if (!canAssignRole(actor.role, role)) {
      throw ApiError.forbidden(`You cannot create accounts with role "${role}"`, 'FORBIDDEN');
    }
    const user = await User.create({
      name, username, email: email?.toLowerCase(), password, role,
      mustChangePassword: reviewerAccess ? false : (mustChangePassword ?? true),
      allowMultipleDevices: reviewerAccess === true,
      emailVerified: false,
      createdBy: actor.id,
    });
    await audit({ user: actor.id, action: role === ROLES.ADMIN ? 'ADMIN_CREATED' : 'USER_CREATED', targetUser: user._id, ip, meta: { role, reviewerAccess: reviewerAccess === true } });
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

  static async updateUser(actor, userId, data, ip) {
    const user = await AdminService.#loadTarget(userId);
    const roleChanged = data.role && data.role !== user.role;
    await AdminService.assertCanManage(actor, user, roleChanged ? 'role_change' : 'update', ip);
    if (roleChanged && !canAssignRole(actor.role, data.role)) {
      throw ApiError.forbidden(`You cannot assign role "${data.role}"`, 'FORBIDDEN');
    }

    // Exempting an account from the one-device rule weakens the platform's
    // central anti-sharing control, so only the owner may grant it.
    const grantChanged = data.allowMultipleDevices !== undefined
      && !!data.allowMultipleDevices !== !!user.allowMultipleDevices;
    if (grantChanged && actor.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Only the owner can change multi-device access', 'FORBIDDEN');
    }

    if (data.name) user.name = data.name;
    if (data.email !== undefined) user.email = data.email?.toLowerCase() || undefined;
    if (roleChanged) {
      user.role = data.role;
      user.tokenVersion += 1;
    }
    if (grantChanged) user.allowMultipleDevices = !!data.allowMultipleDevices;
    await user.save();

    if (grantChanged) {
      await audit({
        user: actor.id, action: 'USER_UPDATED', targetUser: userId, ip,
        meta: { allowMultipleDevices: user.allowMultipleDevices },
      });
    }
    if (roleChanged) {
      await AdminService.#killSessions(userId, 'admin_force_logout');
      await audit({ user: actor.id, action: 'ROLE_CHANGED', targetUser: userId, ip, meta: { role: data.role } });
    } else {
      await audit({ user: actor.id, action: 'USER_UPDATED', targetUser: userId, ip });
    }
    return user.toPublicJSON();
  }

  static async setUserStatus(actor, userId, status, ip) {
    const user = await AdminService.#loadTarget(userId);
    await AdminService.assertCanManage(actor, user, 'status', ip);
    const wasAdmin = isAdminRole(user.role);
    user.status = status;
    user.tokenVersion += 1; // invalidate outstanding tokens
    await user.save();
    if (status !== 'active') await AdminService.#killSessions(userId, 'admin_force_logout');
    const action = status === 'suspended' ? 'USER_SUSPENDED' : status === 'banned' ? 'USER_BANNED' : 'USER_ACTIVATED';
    await audit({ user: actor.id, action, targetUser: userId, ip });
    if (wasAdmin && status !== 'active') {
      await audit({ user: actor.id, action: 'ADMIN_DISABLED', targetUser: userId, ip, meta: { status } });
    }
    return user.toPublicJSON();
  }

  static async deleteUser(actor, userId, ip, { retainGrades = false } = {}) {
    const user = await AdminService.#loadTarget(userId);
    await AdminService.assertCanManage(actor, user, 'delete', ip);
    const deletedAt = new Date();
    const avatarId = user.avatar;
    // Lock the account before removing associated data. If file cleanup fails,
    // it stays banned but can still be retried from the open admin request.
    user.status = 'banned';
    user.tokenVersion += 1;
    await user.save();
    await AdminService.#killSessions(userId, 'admin_force_logout');

    const Submission = require('../../models/Submission');
    const submissions = await Submission.find({ student: userId }).select('attachment').lean();
    const assetIds = [avatarId, ...submissions.map((submission) => submission.attachment)].filter(Boolean);
    const FileService = require('../files/files.service');
    for (const assetId of new Set(assetIds.map(String))) {
      try { await FileService.remove(assetId, actor, ip); }
      catch (err) { if (err.statusCode !== 404) throw err; }
    }

    const QuizAttempt = require('../../models/QuizAttempt');
    const Certificate = require('../../models/Certificate');
    const LessonProgress = require('../../models/LessonProgress');
    const Bookmark = require('../../models/Bookmark');
    const VideoView = require('../../models/VideoView');
    const CheatEvent = require('../../models/CheatEvent');
    const DeviceResetRequest = require('../../models/DeviceResetRequest');
    const AccessCode = require('../../models/AccessCode');
    if (retainGrades) {
      await Submission.updateMany({ student: userId }, { $set: { text: '', attachment: null, feedback: '' } });
      await QuizAttempt.updateMany({ student: userId }, {
        $set: {
          answers: [], answersSavedAt: null, pendingManualGrading: false,
          violationCount: 0, riskScore: 0, invalidatedReason: null,
        },
      });
      await Enrollment.updateMany({ student: userId }, {
        $set: {
          status: 'removed', amountPaid: 0, paymentNote: '', paymentRecordedBy: null,
          paymentRecordedAt: null, progressPercent: 0, completedLessons: 0, completedAt: null,
          lastAccessedAt: null, isFavorite: false,
        },
      });
    } else {
      await Promise.all([
        Submission.deleteMany({ student: userId }),
        QuizAttempt.deleteMany({ student: userId }),
        Enrollment.deleteMany({ student: userId }),
      ]);
    }
    await Promise.all([
      // Certificates are not grade records; they can be reissued if needed.
      Certificate.deleteMany({ student: userId }),
      LessonProgress.deleteMany({ student: userId }),
      Bookmark.deleteMany({ student: userId }),
      VideoView.deleteMany({ student: userId }),
      CheatEvent.deleteMany({ student: userId }),
      DeviceResetRequest.deleteMany({ user: userId }),
      // Preserve aggregate redemption counts while removing the student's
      // identity from access-code history.
      AccessCode.updateMany(
        { 'usedBy.user': userId },
        { $pull: { usedBy: { user: userId } } }
      ),
    ]);

    // Remove student-authored Q&A and reports when deleting an account.
    const QAThread = require('../../models/QAThread');
    const QAReport = require('../../models/QAReport');
    const UserBlock = require('../../models/UserBlock');
    await QAThread.deleteMany({ author: userId });
    await QAThread.updateMany(
      { author: { $ne: userId }, 'replies.author': userId },
      { $pull: { replies: { author: userId } } }
    );
    await Promise.all([
      QAReport.deleteMany({ $or: [{ reporter: userId }, { reportedUser: userId }] }),
      UserBlock.deleteMany({ $or: [{ blocker: userId }, { blocked: userId }] }),
      require('../../models/Device').deleteMany({ user: userId }),
      require('../../models/PushToken').deleteMany({ user: userId }),
      require('../../models/Notification').deleteMany({ user: userId }),
      LoginHistory.deleteMany({ user: userId }),
      AuditLog.updateMany(
        { $or: [{ user: userId }, { targetUser: userId }] },
        { $unset: { user: '', targetUser: '', course: '', ip: '', deviceId: '', meta: '', resource: '' } }
      ),
      Session.deleteMany({ user: userId }),
    ]);

    // Remove direct account identifiers while retaining only the anonymous
    // account key needed to associate grades when retention is legally required.
    user.deletedAt = deletedAt;
    user.name = 'Deleted account';
    user.username = `deleted_${Date.now()}_${user.username}`.slice(0, 50);
    user.email = undefined;
    user.avatar = null;
    user.password = crypto.randomBytes(32).toString('hex');
    user.emailVerifyCodeHash = null;
    user.emailVerifyExpires = null;
    user.passwordResetCodeHash = null;
    user.passwordResetExpires = null;
    user.emailVerified = false;
    user.passwordChangedAt = null;
    user.lastLoginAt = null;
    user.tourCompletedAt = null;
    user.mustChangePassword = false;
    user.preferences = { theme: 'system', emailNotifications: true, language: 'en' };
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();
    await audit({ user: actor.id, action: 'USER_DELETED', ip });
  }

  static async resetUserPassword(actor, userId, newPassword, ip) {
    const user = await User.findOne({ _id: userId, deletedAt: null }).select('+password');
    if (!user) throw ApiError.notFound('User not found');
    await AdminService.assertCanManage(actor, user, 'reset_password', ip);
    user.password = newPassword;
    user.mustChangePassword = true;
    user.tokenVersion += 1;
    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
    await user.save();
    await AdminService.#killSessions(userId, 'password_changed');
    await audit({ user: actor.id, action: 'PASSWORD_RESET', targetUser: userId, ip });
    return { message: 'Password reset. User must change it at next login.' };
  }

  // ── Session / device management ────────────────────────────────────

  static async listActiveSessions({ page, limit }) {
    return paginatedQuery(Session, { isActive: true }, {
      page, limit,
      populate: { path: 'user', select: 'name username role' },
      sort: { lastActivityAt: -1 },
    });
  }

  static async forceLogout(actor, sessionId, ip) {
    const session = await Session.findById(sessionId);
    if (!session || !session.isActive) throw ApiError.notFound('Active session not found');
    const target = await AdminService.#loadTarget(session.user);
    await AdminService.assertCanManage(actor, target, 'force_logout', ip);
    session.isActive = false;
    session.endedAt = new Date();
    session.endReason = 'admin_force_logout';
    await session.save();
    await audit({ user: actor.id, action: 'FORCE_LOGOUT', targetUser: session.user, ip, meta: { sessionId } });
    return { message: 'Session terminated' };
  }

  static async forceLogoutUser(actor, userId, ip) {
    const user = await AdminService.#loadTarget(userId);
    await AdminService.assertCanManage(actor, user, 'force_logout', ip);
    await AdminService.#killSessions(userId, 'admin_force_logout');
    user.tokenVersion += 1;
    await user.save();
    await audit({ user: actor.id, action: 'FORCE_LOGOUT', targetUser: userId, ip, meta: { all: true } });
    return { message: 'All sessions for user terminated' };
  }

  // ── Authorized devices ─────────────────────────────────────────────

  static async getUserDevice(userId) {
    await AdminService.#loadTarget(userId);
    const [active, history] = await Promise.all([DeviceService.activeFor(userId), DeviceService.historyFor(userId)]);
    return { active, history };
  }

  static async revokeUserDevice(actor, userId, reason, ip) {
    const user = await AdminService.#loadTarget(userId);
    await AdminService.assertCanManage(actor, user, 'device_reset', ip);
    return DeviceService.revoke({ targetUserId: userId, actor, reason, ip });
  }

  // ── Platform settings ──────────────────────────────────────────────

  static async getPlatformSettings() {
    const settings = await getSettings();
    return { settings, defaults: SETTING_DEFAULTS, ownerOnlyKeys: OWNER_ONLY_SETTINGS };
  }

  static async updateSettings(actor, values, ip) {
    // Whitelist: only known settings keys are persisted.
    const clean = {};
    for (const key of Object.keys(SETTING_DEFAULTS)) {
      if (values[key] !== undefined) clean[key] = values[key];
    }
    const securityKeys = Object.keys(clean).filter((k) => OWNER_ONLY_SETTINGS.includes(k));
    if (securityKeys.length && !hasPermission(actor.role, P.SECURITY_MANAGE)) {
      await audit({ user: actor.id, action: 'OWNER_ACTION_BLOCKED', ip, meta: { intent: 'security_settings', keys: securityKeys } });
      throw ApiError.forbidden(`Only the platform owner can change: ${securityKeys.join(', ')}`, 'OWNER_PROTECTED');
    }

    const doc = await PlatformSetting.findOneAndUpdate(
      { key: 'global' },
      { $set: { updatedBy: actor.id }, $setOnInsert: { key: 'global' } },
      { upsert: true, new: true }
    );
    doc.values = { ...doc.values, ...clean };
    doc.markModified('values');
    await doc.save();
    invalidateSettingsCache();

    if (clean.maintenanceMode !== undefined) {
      await audit({ user: actor.id, action: clean.maintenanceMode ? 'MAINTENANCE_ON' : 'MAINTENANCE_OFF', ip });
    }
    if (securityKeys.length) {
      await audit({ user: actor.id, action: 'SECURITY_SETTING_CHANGED', ip, meta: { keys: securityKeys } });
    }
    await audit({ user: actor.id, action: 'SETTINGS_UPDATED', ip, meta: { keys: Object.keys(clean) } });
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
