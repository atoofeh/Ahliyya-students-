const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const Announcement = require('../../models/Announcement');
const FileAsset = require('../../models/FileAsset');
const Enrollment = require('../../models/Enrollment');
const User = require('../../models/User');
const { notifyMany } = require('../notifications/notifications.service');

const sameId = (a, b) => String(a || '') === String(b || '');

const replay = (announcement, data, courseId) => {
  const sameExpiry = (announcement.expiresAt?.getTime() || null) === (data.expiresAt?.getTime() || null);
  if (announcement.deletedAt || !sameId(announcement.course, courseId)
    || announcement.title !== data.title || announcement.body !== data.body
    || announcement.pinned !== Boolean(data.pinned) || !sameId(announcement.image, data.image) || !sameExpiry) {
    throw ApiError.conflict('This publish request was already used. Start a new announcement.', 'ANNOUNCEMENT_REQUEST_REUSED');
  }
  return { announcement, created: false };
};

class AnnouncementService {
  static async create(data, author, course, ip) {
    const courseId = course?._id || null;
    const requestFilter = data.requestId ? { author, requestId: data.requestId } : null;
    if (requestFilter) {
      const previous = await Announcement.findOne(requestFilter);
      if (previous) return replay(previous, data, courseId);
    }

    if (data.image) {
      // A photo is uploaded through the existing authenticated, scanned image
      // endpoint. Never accept a different course's file or an arbitrary id.
      const image = await FileAsset.findOne({
        _id: data.image, uploadedBy: author, course: courseId, kind: 'images',
        scope: courseId ? 'course' : 'news', deletedAt: null,
        mimeType: { $in: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] },
      });
      if (!image) throw ApiError.badRequest('Choose an uploaded photo for this announcement.', 'ANNOUNCEMENT_IMAGE_INVALID');
    }

    let announcement;
    try {
      announcement = await Announcement.create({ ...data, author, course: courseId });
    } catch (err) {
      if (err.code !== 11000 || !requestFilter) throw err;
      const previous = await Announcement.findOne(requestFilter);
      if (!previous) throw err;
      return replay(previous, data, courseId);
    }
    await audit({ user: author, action: 'ANNOUNCEMENT_CREATED', course: courseId, ip, resource: `announcement:${announcement._id}` });

    const recipients = courseId
      ? (await Enrollment.find({ course: courseId, status: 'active' }).select('student')).map((e) => e.student)
      : (await User.find({ deletedAt: null, status: 'active' }).select('_id')).map((u) => u._id);
    await notifyMany(recipients, {
      type: 'announcement',
      title: course ? `${course.title}: ${data.title}` : data.title,
      body: data.body.slice(0, 300),
      link: course ? `/student/courses/${courseId}` : '/announcements',
      ...(course && { course: courseId, email: true }),
    });
    return { announcement, created: true };
  }
}

module.exports = AnnouncementService;
