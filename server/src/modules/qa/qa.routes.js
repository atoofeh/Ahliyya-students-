const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const { requireCourseAccess } = require('../../middleware/courseAccess');
const { validate, paginationSchema, objectId } = require('../../middleware/validate');
const { paginatedQuery } = require('../../core/pagination');
const QAThread = require('../../models/QAThread');
const Course = require('../../models/Course');
const { notifyUser } = require('../notifications/notifications.service');

const threadSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  body: z.string().min(1).max(10000).trim(),
  lesson: objectId.nullable().optional(),
});
const replySchema = z.object({ body: z.string().min(1).max(10000).trim() });

router.use(authenticate);

router.post('/courses/:courseId', requireCourseAccess, validate(threadSchema), asyncHandler(async (req, res) => {
  const thread = await QAThread.create({ ...req.body, course: req.course._id, author: req.user.id });
  // Notify the course teacher about new student questions.
  if (String(req.course.teacher) !== String(req.user.id)) {
    await notifyUser(req.course.teacher, {
      type: 'qa_reply',
      title: `New question in ${req.course.title}`,
      body: req.body.title,
      link: `/teacher/courses/${req.course._id}/qa`,
      course: req.course._id,
    });
  }
  res.status(201).json(thread);
}));

router.get('/courses/:courseId', requireCourseAccess, validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
  const filter = { course: req.course._id, deletedAt: null };
  if (req.query.search) filter.$text = { $search: req.query.search };
  res.json(await paginatedQuery(QAThread, filter, {
    page: req.query.page, limit: req.query.limit,
    populate: [{ path: 'author', select: 'name role' }, { path: 'replies.author', select: 'name role' }],
    sort: { createdAt: -1 },
  }));
}));

router.post('/:threadId/replies', validate(replySchema), asyncHandler(async (req, res) => {
  const thread = await QAThread.findOne({ _id: req.params.threadId, deletedAt: null });
  if (!thread) throw ApiError.notFound('Thread not found');

  const course = await Course.findById(thread.course);
  const isStaff = req.user.role === 'admin' || String(course?.teacher) === String(req.user.id);
  const isAuthor = String(thread.author) === String(req.user.id);
  if (!isStaff && !isAuthor) {
    // Other enrolled students may also reply.
    const Enrollment = require('../../models/Enrollment');
    const enrolled = await Enrollment.findOne({ student: req.user.id, course: thread.course, status: 'active' });
    if (!enrolled) throw ApiError.forbidden('Not enrolled in this course');
  }

  thread.replies.push({ author: req.user.id, body: req.body.body });
  if (isStaff) thread.resolved = true;
  await thread.save();

  if (!isAuthor) {
    await notifyUser(thread.author, {
      type: 'qa_reply',
      title: 'Your question received a reply',
      body: req.body.body.slice(0, 200),
      link: `/student/courses/${thread.course}`,
      course: thread.course,
    });
  }
  res.status(201).json(thread);
}));

router.post('/:threadId/resolve', asyncHandler(async (req, res) => {
  const thread = await QAThread.findOne({ _id: req.params.threadId, deletedAt: null });
  if (!thread) throw ApiError.notFound('Thread not found');
  const course = await Course.findById(thread.course);
  const isStaff = req.user.role === 'admin' || String(course?.teacher) === String(req.user.id);
  if (!isStaff && String(thread.author) !== String(req.user.id)) throw ApiError.forbidden('Not allowed');
  thread.resolved = !thread.resolved;
  await thread.save();
  res.json(thread);
}));

module.exports = router;
