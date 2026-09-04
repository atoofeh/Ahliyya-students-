const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const { requireCourseAccess, requireCourseOwnership } = require('../../middleware/courseAccess');
const { validate, paginationSchema, objectId } = require('../../middleware/validate');
const { paginatedQuery } = require('../../core/pagination');
const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');
const Enrollment = require('../../models/Enrollment');
const { notifyUser, notifyMany } = require('../notifications/notifications.service');
const { staffCourseFilter } = require('../courses/courseStaff');

const assignmentSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  instructions: z.string().max(20000).optional().default(''),
  attachment: objectId.nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  maxPoints: z.number().min(0).max(10000).optional().default(100),
  allowLateSubmission: z.boolean().optional().default(false),
  isPublished: z.boolean().optional().default(true),
});

const submitSchema = z.object({
  text: z.string().max(50000).optional().default(''),
  attachment: objectId.nullable().optional(),
});

const gradeSchema = z.object({
  points: z.number().min(0),
  feedback: z.string().max(10000).optional().default(''),
});

router.use(authenticate);

// Teacher: assignment CRUD
router.post('/courses/:courseId', requireCourseOwnership, validate(assignmentSchema), asyncHandler(async (req, res) => {
  const assignment = await Assignment.create({ ...req.body, course: req.course._id, createdBy: req.user.id });
  const enrollments = await Enrollment.find({ course: req.course._id, status: 'active' }).select('student');
  await notifyMany(enrollments.map((e) => e.student), {
    type: 'assignment_due',
    title: `New assignment: ${assignment.title}`,
    body: assignment.dueAt ? `Due ${assignment.dueAt.toLocaleString()}` : 'No due date',
    link: `/student/courses/${req.course._id}`,
    course: req.course._id,
  });
  res.status(201).json(assignment);
}));

router.get('/courses/:courseId', requireCourseAccess, asyncHandler(async (req, res) => {
  const filter = { course: req.course._id, deletedAt: null };
  if (req.user.role === 'student') filter.isPublished = true;
  const assignments = await Assignment.find(filter).populate('attachment', 'originalName sizeBytes').sort({ dueAt: 1, createdAt: -1 }).lean();

  if (req.user.role === 'student') {
    const submissions = await Submission.find({ course: req.course._id, student: req.user.id }).lean();
    const byAssignment = Object.fromEntries(submissions.map((s) => [String(s.assignment), s]));
    return res.json(assignments.map((a) => ({ ...a, mySubmission: byAssignment[String(a._id)] || null })));
  }
  res.json(assignments);
}));

router.put('/courses/:courseId/:assignmentId', requireCourseOwnership, validate(assignmentSchema.partial()), asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOneAndUpdate(
    { _id: req.params.assignmentId, course: req.course._id, deletedAt: null }, { $set: req.body }, { new: true });
  if (!assignment) throw ApiError.notFound('Assignment not found');
  res.json(assignment);
}));

router.delete('/courses/:courseId/:assignmentId', requireCourseOwnership, asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOne({ _id: req.params.assignmentId, course: req.course._id, deletedAt: null });
  if (!assignment) throw ApiError.notFound('Assignment not found');
  assignment.deletedAt = new Date();
  await assignment.save();
  res.json({ message: 'Assignment deleted' });
}));

// Student: submit
router.post('/courses/:courseId/:assignmentId/submit', authorize('student'), requireCourseAccess, validate(submitSchema), asyncHandler(async (req, res) => {
  const assignment = await Assignment.findOne({ _id: req.params.assignmentId, course: req.course._id, deletedAt: null, isPublished: true });
  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (!req.body.text && !req.body.attachment) throw ApiError.badRequest('Provide text or an attachment');

  const isLate = assignment.dueAt && new Date() > assignment.dueAt;
  if (isLate && !assignment.allowLateSubmission) {
    throw ApiError.forbidden('The due date has passed', 'PAST_DUE');
  }

  const submission = await Submission.findOneAndUpdate(
    { assignment: assignment._id, student: req.user.id },
    {
      $set: {
        course: req.course._id, text: req.body.text, attachment: req.body.attachment || null,
        submittedAt: new Date(), isLate: !!isLate, status: 'submitted',
      },
    },
    { upsert: true, new: true }
  );
  res.status(201).json(submission);
}));

// Teacher: submissions list + grading
router.get('/courses/:courseId/:assignmentId/submissions', requireCourseOwnership, validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
  res.json(await paginatedQuery(Submission, { assignment: req.params.assignmentId, course: req.course._id }, {
    page: req.query.page, limit: req.query.limit,
    populate: [{ path: 'student', select: 'name username email' }, { path: 'attachment', select: 'originalName sizeBytes' }],
    sort: { submittedAt: -1 },
  }));
}));

router.post('/submissions/:submissionId/grade', authorize('teacher', 'admin'), validate(gradeSchema), asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.submissionId).populate('assignment', 'title maxPoints course');
  if (!submission) throw ApiError.notFound('Submission not found');
  if (req.user.role === 'teacher') {
    const Course = require('../../models/Course');
    const owns = await Course.findOne({ _id: submission.course, ...staffCourseFilter(req.user.id) });
    if (!owns) throw ApiError.forbidden('Not your course');
  }
  submission.pointsAwarded = Math.min(req.body.points, submission.assignment.maxPoints);
  submission.feedback = req.body.feedback;
  submission.status = 'graded';
  submission.gradedBy = req.user.id;
  submission.gradedAt = new Date();
  await submission.save();

  await notifyUser(submission.student, {
    type: 'assignment_graded',
    title: `Assignment graded: ${submission.assignment.title}`,
    body: `${submission.pointsAwarded}/${submission.assignment.maxPoints} points`,
    link: `/student/courses/${submission.course}`,
    course: submission.course,
  });
  res.json(submission);
}));

module.exports = router;
