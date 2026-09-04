const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { requireCourseAccess } = require('../../middleware/courseAccess');
const { validate, paginationSchema, objectId } = require('../../middleware/validate');
const { paginatedQuery } = require('../../core/pagination');
const QAThread = require('../../models/QAThread');
const Course = require('../../models/Course');
const { notifyUser } = require('../notifications/notifications.service');
const { isCourseStaff, courseStaffIds } = require('../courses/courseStaff');

const threadSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  body: z.string().min(1).max(10000).trim(),
  lesson: objectId.nullable().optional(),
});
const replySchema = z.object({ body: z.string().min(1).max(10000).trim() });
const rejectSchema = z.object({ reason: z.string().max(300).trim().optional() });
// paginationSchema strips unknown keys, so the moderation filter has to be
// declared here or req.query.status would always arrive undefined.
const qaListSchema = paginationSchema.extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

router.use(authenticate);

/**
 * Ask a question. It is held for moderation: nobody but the asker and the
 * course staff can see it until a teacher approves it.
 */
router.post('/courses/:courseId', requireCourseAccess, validate(threadSchema), asyncHandler(async (req, res) => {
  const staff = isCourseStaff(req.course, req.user);
  const thread = await QAThread.create({
    ...req.body,
    course: req.course._id,
    author: req.user.id,
    // A question posted by the teacher is already vetted — it is the teacher's
    // own words, and holding it for their own approval is pointless friction.
    status: staff ? 'approved' : 'pending',
    ...(staff && { moderatedBy: req.user.id, moderatedAt: new Date() }),
  });

  if (!staff) {
    await audit({ user: req.user.id, action: 'QA_QUESTION_ASKED', course: req.course._id, ip: req.ip, resource: `qa:${thread._id}` });
    // Every teacher on the course is told, so a co-taught course does not rely
    // on one person happening to look.
    for (const staffId of courseStaffIds(req.course)) {
      await notifyUser(staffId, {
        type: 'qa_reply',
        title: `New question awaiting approval in ${req.course.title}`,
        body: req.body.title,
        link: `/teacher/courses/${req.course._id}/qa`,
        course: req.course._id,
      });
    }
  }
  res.status(201).json(thread);
}));

/**
 * List questions.
 *   staff   — everything, filterable by status (the moderation queue)
 *   student — approved questions, plus their own whatever its state, so a
 *             pending question does not appear to have vanished
 */
router.get('/courses/:courseId', requireCourseAccess, validate(qaListSchema, 'query'), asyncHandler(async (req, res) => {
  const staff = isCourseStaff(req.course, req.user);
  const filter = { course: req.course._id, deletedAt: null };

  if (staff) {
    if (req.query.status) filter.status = req.query.status;
  } else {
    filter.$or = [{ status: 'approved' }, { author: req.user.id }];
  }
  if (req.query.search) filter.$text = { $search: req.query.search };

  const page = await paginatedQuery(QAThread, filter, {
    page: req.query.page, limit: req.query.limit,
    populate: [{ path: 'author', select: 'name role' }, { path: 'replies.author', select: 'name role' }],
    sort: { createdAt: -1 },
  });

  if (staff) {
    page.pendingCount = await QAThread.countDocuments({ course: req.course._id, deletedAt: null, status: 'pending' });
  }
  res.json(page);
}));

/**
 * Loads a thread plus its course, and says who the caller is on it.
 *
 * `member` is the gate for taking part at all: course staff, or a student with
 * a live enrollment. Being the author is deliberately NOT enough — a student
 * removed from the course must not keep posting into it through an old thread
 * of their own.
 */
const loadThread = async (threadId, user) => {
  const thread = await QAThread.findOne({ _id: threadId, deletedAt: null });
  if (!thread) throw ApiError.notFound('Thread not found');
  const course = await Course.findOne({ _id: thread.course, deletedAt: null });
  const staff = isCourseStaff(course, user);

  let member = staff;
  if (!member && course) {
    const Enrollment = require('../../models/Enrollment');
    member = !!(await Enrollment.findOne({ student: user.id, course: course._id, status: 'active' }));
  }
  return {
    thread,
    course,
    staff,
    member,
    isAuthor: String(thread.author) === String(user.id),
  };
};

/** Approve a pending question so the course can see it. */
router.post('/:threadId/approve', asyncHandler(async (req, res) => {
  const { thread, staff } = await loadThread(req.params.threadId, req.user);
  if (!staff) throw ApiError.forbidden('Only the course teachers can moderate questions');
  if (thread.status === 'approved') return res.json(thread);

  thread.status = 'approved';
  thread.moderatedBy = req.user.id;
  thread.moderatedAt = new Date();
  thread.rejectionReason = null;
  await thread.save();

  await audit({ user: req.user.id, action: 'QA_QUESTION_APPROVED', course: thread.course, targetUser: thread.author, ip: req.ip, resource: `qa:${thread._id}` });
  await notifyUser(thread.author, {
    type: 'qa_reply',
    title: 'Your question was published',
    body: thread.title,
    link: `/student/courses/${thread.course}`,
    course: thread.course,
  });
  res.json(thread);
}));

/** Reject a question. It never becomes visible to the rest of the course. */
router.post('/:threadId/reject', validate(rejectSchema), asyncHandler(async (req, res) => {
  const { thread, staff } = await loadThread(req.params.threadId, req.user);
  if (!staff) throw ApiError.forbidden('Only the course teachers can moderate questions');

  thread.status = 'rejected';
  thread.moderatedBy = req.user.id;
  thread.moderatedAt = new Date();
  thread.rejectionReason = req.body.reason || null;
  await thread.save();

  await audit({ user: req.user.id, action: 'QA_QUESTION_REJECTED', course: thread.course, targetUser: thread.author, ip: req.ip, resource: `qa:${thread._id}` });
  await notifyUser(thread.author, {
    type: 'qa_reply',
    title: 'Your question was not published',
    body: thread.rejectionReason || 'It did not meet the course guidelines.',
    link: `/student/courses/${thread.course}`,
    course: thread.course,
  });
  res.json(thread);
}));

router.post('/:threadId/replies', validate(replySchema), asyncHandler(async (req, res) => {
  const { thread, staff, member, isAuthor } = await loadThread(req.params.threadId, req.user);

  if (!member) throw ApiError.forbidden('Not enrolled in this course', 'NOT_ENROLLED');
  // Students — the author included — may only join an approved discussion.
  if (!staff && thread.status !== 'approved') {
    throw ApiError.forbidden('This question is not open for replies', 'QA_NOT_APPROVED');
  }

  thread.replies.push({ author: req.user.id, body: req.body.body });
  if (staff) {
    // "See the question, accept it, answer it" in one step.
    if (thread.status === 'pending') {
      thread.status = 'approved';
      thread.moderatedBy = req.user.id;
      thread.moderatedAt = new Date();
      await audit({ user: req.user.id, action: 'QA_QUESTION_APPROVED', course: thread.course, targetUser: thread.author, ip: req.ip, resource: `qa:${thread._id}` });
    }
    thread.resolved = true;
  }
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
  const { thread, staff, member, isAuthor } = await loadThread(req.params.threadId, req.user);
  if (!staff && !(member && isAuthor)) throw ApiError.forbidden('Not allowed');
  thread.resolved = !thread.resolved;
  await thread.save();
  res.json(thread);
}));

module.exports = router;
