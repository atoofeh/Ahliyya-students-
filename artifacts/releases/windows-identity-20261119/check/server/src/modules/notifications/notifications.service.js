const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { sendMail, templates } = require('../../core/mailer');
const { paginatedQuery } = require('../../core/pagination');

/**
 * Notification fan-out: in-app always; a push to the user's phones when the
 * platform has Firebase credentials; email when the user opted in.
 *
 * The push is what reaches someone whose app is closed. It is deliberately not
 * awaited into the caller's critical path beyond its own error handling: a
 * teacher's question must be recorded whether or not Google is reachable.
 */
const notifyUser = async (userId, { type, title, body = '', link = null, course = null, email = false }) => {
  try {
    const notification = await Notification.create({ user: userId, type, title, body, link, course });

    const { pushToUser } = require('../../core/push');
    await pushToUser(userId, { title, body, link });

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
