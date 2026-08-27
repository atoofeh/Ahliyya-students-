const router = require('express').Router();
const { requirePermission } = require('../../middleware/authorize');
const { PERMISSIONS: P } = require('../../core/permissions');
const { isAdminRole } = require('../../core/permissions');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { requireCourseAccess, requireCourseOwnership } = require('../../middleware/courseAccess');
const { validate, paginationSchema } = require('../../middleware/validate');
const { paginatedQuery } = require('../../core/pagination');
const Announcement = require('../../models/Announcement');
const Enrollment = require('../../models/Enrollment');
const { notifyMany } = require('../notifications/notifications.service');

const announcementSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  body: z.string().min(1).max(10000).trim(),
  pinned: z.boolean().optional().default(false),
  expiresAt: z.coerce.date().nullable().optional(),
});

router.use(authenticate);

// Global feed: platform announcements + announcements from enrolled courses.
router.get('/feed', asyncHandler(async (req, res) => {
  const now = new Date();
  const activeFilter = { deletedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };

  let courseIds = [];
  if (req.user.role === 'student') {
    const enrollments = await Enrollment.find({ student: req.user.id, status: 'active' }).select('course');
    courseIds = enrollments.map((e) => e.course);
  } else if (req.user.role === 'teacher') {
    const Course = require('../../models/Course');
    const courses = await Course.find({ teacher: req.user.id, deletedAt: null }).select('_id');
    courseIds = courses.map((c) => c._id);
  }

  const items = await Announcement.find({
    ...activeFilter,
    $and: [{ $or: [{ course: null }, { course: { $in: courseIds } }] }],
  })
    .populate('author', 'name role')
    .populate('course', 'title')
    .sort({ pinned: -1, publishedAt: -1 })
    .limit(50)
    .lean();
  res.json(items);
}));

// Platform-wide announcements (admin)
router.post('/global', requirePermission(P.ANNOUNCEMENTS_GLOBAL), validate(announcementSchema), asyncHandler(async (req, res) => {
  const announcement = await Announcement.create({ ...req.body, author: req.user.id, course: null });
  await audit({ user: req.user.id, action: 'ANNOUNCEMENT_CREATED', ip: req.ip, resource: `announcement:${announcement._id}` });
  const User = require('../../models/User');
  const users = await User.find({ deletedAt: null, status: 'active' }).select('_id');
  await notifyMany(users.map((u) => u._id), {
    type: 'announcement', title: req.body.title, body: req.body.body.slice(0, 300), link: '/announcements',
  });
  res.status(201).json(announcement);
}));

// Course announcements (owner/admin)
router.post('/courses/:courseId', requireCourseOwnership, validate(announcementSchema), asyncHandler(async (req, res) => {
  const announcement = await Announcement.create({ ...req.body, author: req.user.id, course: req.course._id });
  await audit({ user: req.user.id, action: 'ANNOUNCEMENT_CREATED', course: req.course._id, ip: req.ip });
  const enrollments = await Enrollment.find({ course: req.course._id, status: 'active' }).select('student');
  await notifyMany(enrollments.map((e) => e.student), {
    type: 'announcement',
    title: `${req.course.title}: ${req.body.title}`,
    body: req.body.body.slice(0, 300),
    link: `/student/courses/${req.course._id}`,
    course: req.course._id,
    email: true,
  });
  res.status(201).json(announcement);
}));

router.get('/courses/:courseId', requireCourseAccess, validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
  res.json(await paginatedQuery(Announcement, { course: req.course._id, deletedAt: null }, {
    page: req.query.page, limit: req.query.limit,
    populate: { path: 'author', select: 'name role' },
    sort: { pinned: -1, publishedAt: -1 },
  }));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const announcement = await Announcement.findOne({ _id: req.params.id, deletedAt: null });
  if (!announcement) throw ApiError.notFound('Announcement not found');
  const isAuthor = String(announcement.author) === String(req.user.id);
  if (!isAdminRole(req.user.role) && !isAuthor) throw ApiError.forbidden('Not your announcement');
  announcement.deletedAt = new Date();
  await announcement.save();
  await audit({ user: req.user.id, action: 'ANNOUNCEMENT_DELETED', ip: req.ip, resource: `announcement:${req.params.id}` });
  res.json({ message: 'Announcement deleted' });
}));

module.exports = router;
