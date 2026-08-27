const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { sendMail, templates } = require('../../core/mailer');
const { paginatedQuery } = require('../../core/pagination');

/**
 * Notification fan-out: in-app always; email when the user opted in.
 */
const notifyUser = async (userId, { type, title, body = '', link = null, course = null, email = false }) => {
  try {
    const notification = await Notification.create({ user: userId, type, title, body, link, course });
    if (email) {
      const user = await User.findById(userId);
      if (user?.email && user.preferences?.emailNotifications) {
        await sendMail({ to: user.email, ...templates.genericNotification(user.name, title, body) });
        notification.emailSent = true;
        await notification.save();
      }
    }
    return notification;
  } catch {
    return null; // notifications must never break the main flow
  }
};

const notifyMany = async (userIds, payload) => {
  await Promise.all(userIds.map((id) => notifyUser(id, payload)));
};

class NotificationService {
  static async list(userId, { page, limit, unreadOnly }) {
    const filter = { user: userId, ...(unreadOnly ? { readAt: null } : {}) };
    return paginatedQuery(Notification, filter, { page, limit });
  }

  static async unreadCount(userId) {
    return Notification.countDocuments({ user: userId, readAt: null });
  }

  static async markRead(userId, notificationId) {
    await Notification.updateOne({ _id: notificationId, user: userId }, { $set: { readAt: new Date() } });
  }

  static async markAllRead(userId) {
    await Notification.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
  }
}

module.exports = { NotificationService, notifyUser, notifyMany };
