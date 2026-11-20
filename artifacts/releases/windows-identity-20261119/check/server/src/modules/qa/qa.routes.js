const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { requireCourseAccess } = require('../../middleware/courseAccess');
const { validate, paginationSchema, objectId } = require('../../middleware/validate');
const { qaAskLimiter } = require('../../middleware/rateLimiters');
const { paginatedQuery } = require('../../core/pagination');
const QAThread = require('../../models/QAThread');
const QAReport = require('../../models/QAReport');
const UserBlock = require('../../models/UserBlock');
const User = require('../../models/User');
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
const replyModerationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reason: z.string().max(300).trim().optional(),
});
const reportSchema = z.object({
  replyId: objectId.optional(),
  reason: z.enum(['harassment', 'inappropriate', 'spam', 'other']),
  details: z.string().max(1000).trim().optional(),
});
const reportQuerySchema = paginationSchema.extend({
  status: z.enum(['open', 'resolved', 'dismissed']).optional(),
});
const resolveReportSchema = z.object({
  action: z.enum(['remove', 'dismiss']),
  note: z.string().max(500).trim().optional(),
});
const userIdParamsSchema = z.object({ userId: objectId });
const threadIdParamsSchema = z.object({ threadId: objectId });
const reportIdParamsSchema = z.object({ reportId: objectId });
const threadReplyParamsSchema = z.object({ threadId: objectId, replyId: objectId });
// paginationSchema strips unknown keys, so the moderation filter has to be
// declared here or req.query.status would always arrive undefined.
const qaListSchema = paginationSchema.extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

router.use(authenticate);

router.get('/blocked-users', asyncHandler(async (req, res) => {
  const blocks = await UserBlock.find({ blocker: req.user.id })
    .sort({ createdAt: -1 }).populate('blocked', 'name role').lean();
  res.json(blocks
    .filter((block) => block.blocked)
    .map((block) => ({ id: String(block.blocked._id), name: block.blocked.name, role: block.blocked.role })));
}));

router.post('/blocked-users/:userId', validate(userIdParamsSchema, 'params'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only students can block classmates');
  if (String(req.user.id) === String(req.params.userId)) throw ApiError.badRequest('You cannot block your own account');
  const target = await User.findOne({ _id: req.params.userId, deletedAt: null }).select('role');
  if (!target || target.role !== 'student') throw ApiError.notFound('Student not found');
  const result = await UserBlock.updateOne(
    { blocker: req.user.id, blocked: target._id },
    { $setOnInsert: { blocker: req.user.id, blocked: target._id } },
    { upsert: true }
  );
  if (result.upsertedCount) {
    await audit({ user: req.user.id, action: 'USER_BLOCKED', targetUser: target._id, ip: req.ip });
  }
  res.status(result.upsertedCount ? 201 : 200).json({ message: 'Student blocked' });
}));

router.delete('/blocked-users/:userId', validate(userIdParamsSchema, 'params'), asyncHandler(async (req, res) => {
  const result = await UserBlock.deleteOne({ blocker: req.user.id, blocked: req.params.userId });
  if (result.deletedCount) {
    await audit({ user: req.user.id, action: 'USER_UNBLOCKED', targetUser: req.params.userId, ip: req.ip });
  }
  res.json({ message: 'Block removed' });
}));

const blockedIdsFor = async (userId) => UserBlock.distinct('blocked', { blocker: userId });

/**
 * Ask a question. It is held for moderation: nobody but the asker and the
 * course staff can see it until a teacher approves it.
 */
router.post('/courses/:courseId', qaAskLimiter, requireCourseAccess, validate(threadSchema), asyncHandler(async (req, res) => {
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
    const blockedIds = await blockedIdsFor(req.user.id);
    if (blockedIds.length) filter.author = { $nin: blockedIds };
  }
  if (req.query.search) filter.$text = { $search: req.query.search };

  const page = await paginatedQuery(QAThread, filter, {
    page: req.query.page, limit: req.query.limit,
    populate: [{ path: 'author', select: 'name role' }, { path: 'replies.author', select: 'name role' }],
    sort: { createdAt: -1 },
  });

  if (!staff) {
    const blocked = new Set((await blockedIdsFor(req.user.id)).map(String));
    page.items = page.items.map((thread) => ({
      ...thread,
      replies: (thread.replies || []).filter((reply) => {
        const authorId = String(reply.author?._id || reply.author);
        const status = reply.status || 'approved';
        const ownPending = authorId === String(req.user.id) && status !== 'approved';
        return !blocked.has(authorId) && (status === 'approved' || ownPending);
      }),
    }));
  }

  if (staff) {
    page.pendingCount = await QAThread.countDocuments({ course: req.course._id, deletedAt: null, status: 'pending' });
  }
  res.json(page);
}));

router.get('/courses/:courseId/reports', requireCourseAccess, validate(reportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  if (!isCourseStaff(req.course, req.user)) throw ApiError.forbidden('Only course staff can review reports');
  const filter = { course: req.course._id, status: req.query.status || 'open' };
  const page = await paginatedQuery(QAReport, filter, {
    page: req.query.page,
    limit: req.query.limit,
    sort: { createdAt: 1 },
    populate: [
      { path: 'reporter', select: 'name role' },
      { path: 'reportedUser', select: 'name role' },
      { path: 'thread', select: 'title body author replies', populate: { path: 'replies.author', select: 'name role' } },
    ],
  });
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

  if (!staff && await UserBlock.exists({
    $or: [
      { blocker: user.id, blocked: thread.author },
      { blocker: thread.author, blocked: user.id },
    ],
  })) throw ApiError.notFound('Thread not found');

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
router.post('/:threadId/approve', validate(threadIdParamsSchema, 'params'), asyncHandler(async (req, res) => {
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
router.post('/:threadId/reject', validate(threadIdParamsSchema, 'params'), validate(rejectSchema), asyncHandler(async (req, res) => {
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

router.post('/:threadId/reports', validate(threadIdParamsSchema, 'params'), validate(reportSchema), asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only students can report course content');
  const { thread, course, member } = await loadThread(req.params.threadId, req.user);
  if (!member) throw ApiError.forbidden('Not enrolled in this course', 'NOT_ENROLLED');
  if (thread.status !== 'approved') throw ApiError.notFound('Content not found');

  let reply = null;
  if (req.body.replyId) {
    reply = thread.replies.id(req.body.replyId);
    if (!reply || (reply.status && reply.status !== 'approved')) throw ApiError.notFound('Content not found');
  }
  const reportedUser = reply?.author || thread.author;
  if (String(reportedUser) === String(req.user.id)) throw ApiError.badRequest('You cannot report your own content');
  if (await UserBlock.exists({
    $or: [
      { blocker: req.user.id, blocked: reportedUser },
      { blocker: reportedUser, blocked: req.user.id },
    ],
  })) throw ApiError.notFound('Content not found');

  const reportData = {
    course: course._id,
    thread: thread._id,
    replyId: reply?._id || null,
    reporter: req.user.id,
    reportedUser,
    reason: req.body.reason,
    details: req.body.details || '',
  };
  let report;
  let created = false;
  try {
    report = await QAReport.create(reportData);
    created = true;
  } catch (err) {
    if (err.code !== 11000) throw err;
    report = await QAReport.findOne({ reporter: req.user.id, thread: thread._id, replyId: reply?._id || null });
  }
  if (created && report?.status === 'open') {
    await audit({ user: req.user.id, action: 'QA_CONTENT_REPORTED', targetUser: reportedUser, course: course._id, ip: req.ip, resource: `qa-report:${report._id}` });
    for (const staffId of courseStaffIds(course)) {
      await notifyUser(staffId, {
        type: 'qa_reply',
        title: `A course post was reported in ${course.title}`,
        body: thread.title,
        link: `/teacher/courses/${course._id}/qa`,
        course: course._id,
      });
    }
  }
  res.status(201).json({ message: 'Report received' });
}));

router.post('/reports/:reportId/resolve', validate(reportIdParamsSchema, 'params'), validate(resolveReportSchema), asyncHandler(async (req, res) => {
  const report = await QAReport.findOne({ _id: req.params.reportId, status: 'open' });
  if (!report) throw ApiError.notFound('Open report not found');
  const course = await Course.findOne({ _id: report.course, deletedAt: null });
  if (!isCourseStaff(course, req.user)) throw ApiError.forbidden('Only course staff can resolve reports');

  const thread = await QAThread.findOne({ _id: report.thread, deletedAt: null });
  if (req.body.action === 'remove' && thread) {
    if (report.replyId) {
      const reply = thread.replies.id(report.replyId);
      if (reply) {
        reply.status = 'rejected';
        reply.moderatedBy = req.user.id;
        reply.moderatedAt = new Date();
        reply.rejectionReason = req.body.note || 'Removed after review';
      }
    } else {
      thread.status = 'rejected';
      thread.moderatedBy = req.user.id;
      thread.moderatedAt = new Date();
      thread.rejectionReason = req.body.note || 'Removed after review';
    }
    await thread.save();
  }

  report.status = req.body.action === 'remove' ? 'resolved' : 'dismissed';
  report.resolution = req.body.action === 'remove' ? 'removed' : 'dismissed';
  report.resolutionNote = req.body.note || '';
  report.resolvedBy = req.user.id;
  report.resolvedAt = new Date();
  await report.save();
  await audit({
    user: req.user.id,
    action: req.body.action === 'remove' ? 'QA_REPORT_RESOLVED' : 'QA_REPORT_DISMISSED',
    targetUser: report.reportedUser,
    course: report.course,
    ip: req.ip,
    resource: `qa-report:${report._id}`,
  });
  if (req.body.action === 'remove') {
    await notifyUser(report.reportedUser, {
      type: 'qa_reply',
      title: 'Your course content was removed after review',
      body: report.resolutionNote || 'Please follow the course community guidelines.',
      link: `/student/courses/${report.course}`,
      course: report.course,
    });
  }
  res.json({ message: 'Report reviewed', status: report.status });
}));

router.post('/:threadId/replies/:replyId/moderate', validate(threadReplyParamsSchema, 'params'), validate(replyModerationSchema), asyncHandler(async (req, res) => {
  const { thread, course, staff } = await loadThread(req.params.threadId, req.user);
  if (!staff) throw ApiError.forbidden('Only course staff can moderate replies');
  const reply = thread.replies.id(req.params.replyId);
  if (!reply) throw ApiError.notFound('Reply not found');
  reply.status = req.body.status;
  reply.moderatedBy = req.user.id;
  reply.moderatedAt = new Date();
  reply.rejectionReason = req.body.status === 'rejected' ? (req.body.reason || 'It did not meet the course guidelines.') : null;
  await thread.save();
  const approved = req.body.status === 'approved';
  await audit({
    user: req.user.id,
    action: approved ? 'QA_REPLY_APPROVED' : 'QA_REPLY_REJECTED',
    course: course._id,
    targetUser: reply.author,
    ip: req.ip,
    resource: `qa:${thread._id}:reply:${reply._id}`,
  });
  await notifyUser(reply.author, {
    type: 'qa_reply',
    title: approved ? 'Your reply was published' : 'Your reply was not published',
    body: approved ? thread.title : reply.rejectionReason,
    link: `/student/courses/${thread.course}`,
    course: thread.course,
  });
  if (approved && String(thread.author) !== String(reply.author)) {
    await notifyUser(thread.author, {
      type: 'qa_reply',
      title: 'Your question received a reply',
      body: reply.body.slice(0, 200),
      link: `/student/courses/${thread.course}`,
      course: thread.course,
    });
  }
  res.json(thread);
}));

router.post('/:threadId/replies', validate(threadIdParamsSchema, 'params'), validate(replySchema), asyncHandler(async (req, res) => {
  const { thread, staff, member, isAuthor } = await loadThread(req.params.threadId, req.user);

  if (!member) throw ApiError.forbidden('Not enrolled in this course', 'NOT_ENROLLED');
  // Students — the author included — may only join an approved discussion.
  if (!staff && thread.status !== 'approved') {
    throw ApiError.forbidden('This question is not open for replies', 'QA_NOT_APPROVED');
  }

  const replyStatus = staff ? 'approved' : 'pending';
  thread.replies.push({
    author: req.user.id,
    body: req.body.body,
    status: replyStatus,
    ...(staff && { moderatedBy: req.user.id, moderatedAt: new Date() }),
  });
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

  if (!isAuthor && staff) {
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

router.post('/:threadId/resolve', validate(threadIdParamsSchema, 'params'), asyncHandler(async (req, res) => {
  const { thread, staff, member, isAuthor } = await loadThread(req.params.threadId, req.user);
  if (!staff && !(member && isAuthor)) throw ApiError.forbidden('Not allowed');
  thread.resolved = !thread.resolved;
  await thread.save();
  res.json(thread);
}));

module.exports = router;
