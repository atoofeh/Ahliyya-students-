const router = require('express').Router();
const { isAdminRole } = require('../../core/permissions');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const { validate } = require('../../middleware/validate');
const { searchLimiter } = require('../../middleware/rateLimiters');
const { staffCourseFilter } = require('../courses/courseStaff');

const searchQuery = z.object({ q: z.string().min(2).max(200).trim() });

/**
 * Global search, role-scoped:
 *  - students search their enrolled courses' content + the listed catalog
 *  - teachers search their own courses, students, and content
 *  - admins search everything including users
 */
router.get('/', authenticate, searchLimiter, validate(searchQuery, 'query'), asyncHandler(async (req, res) => {
  const { q } = req.query;
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const user = req.user;

  const Course = require('../../models/Course');
  const Lesson = require('../../models/Lesson');
  const Quiz = require('../../models/Quiz');
  const Video = require('../../models/Video');
  const Assignment = require('../../models/Assignment');
  const User = require('../../models/User');
  const Enrollment = require('../../models/Enrollment');

  // Scope: which course ids can this user see content for?
  let courseScope = null; // null = all (admin)
  if (user.role === 'teacher') {
    const owned = await Course.find({ ...staffCourseFilter(user.id), deletedAt: null }).select('_id');
    courseScope = owned.map((c) => c._id);
  } else if (user.role === 'student') {
    const enrolled = await Enrollment.find({ student: user.id, status: 'active' }).select('course');
    courseScope = enrolled.map((e) => e.course);
  }
  const scoped = (extra = {}) => (courseScope ? { course: { $in: courseScope }, ...extra } : extra);

  const courseFilter = isAdminRole(user.role)
    ? { deletedAt: null, title: regex }
    : user.role === 'teacher'
      ? { deletedAt: null, ...staffCourseFilter(user.id), title: regex }
      : { deletedAt: null, title: regex, $or: [{ _id: { $in: courseScope } }, { isPublished: true, visibility: 'listed' }] };

  const [courses, lessons, quizzes, videos, assignments, users] = await Promise.all([
    Course.find(courseFilter).select('title category difficulty teacher').populate('teacher', 'name').limit(10).lean(),
    Lesson.find({ ...scoped({ deletedAt: null }), title: regex }).select('title type course section').limit(10).lean(),
    Quiz.find({ ...scoped({ deletedAt: null }), title: regex }).select('title course isPublished').limit(10).lean(),
    Video.find({ ...scoped({ deletedAt: null }), title: regex }).select('title course status durationSeconds').limit(10).lean(),
    Assignment.find({ ...scoped({ deletedAt: null }), title: regex }).select('title course dueAt').limit(10).lean(),
    isAdminRole(user.role)
      ? User.find({ deletedAt: null, $or: [{ name: regex }, { username: regex }, { email: regex }] })
          .select('name username email role status').limit(10).lean()
      : user.role === 'teacher'
        ? Enrollment.aggregate([
            { $match: { course: { $in: courseScope || [] }, status: 'active' } },
            { $lookup: { from: 'users', localField: 'student', foreignField: '_id', as: 'student' } },
            { $unwind: '$student' },
            { $match: { $or: [{ 'student.name': regex }, { 'student.username': regex }] } },
            { $limit: 10 },
            { $project: { name: '$student.name', username: '$student.username', role: '$student.role', _id: '$student._id' } },
          ])
        : Promise.resolve([]),
  ]);

  res.json({ courses, lessons, quizzes, videos, assignments, users });
}));

module.exports = router;
