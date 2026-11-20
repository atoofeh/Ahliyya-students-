const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { requireCourseOwnership } = require('../../middleware/courseAccess');
const { validate } = require('../../middleware/validate');
const { coTeachInviteLimiter } = require('../../middleware/rateLimiters');
const { ROLES } = require('../../config/constants');
const { isAdminRole } = require('../../core/permissions');
const { courseStaffIds } = require('./courseStaff');
const Course = require('../../models/Course');
const User = require('../../models/User');
const CoTeachInvite = require('../../models/CoTeachInvite');
const { notifyUser } = require('../notifications/notifications.service');

/**
 * Co-teaching: a teacher invites a colleague onto a course they already run.
 * On acceptance the colleague joins `Course.coTeachers` and every course-scoped
 * check (middleware/courseAccess → modules/courses/courseStaff) treats them the
 * same as the creator — content, students, grading, Q&A moderation.
 *
 * Mounted at /co-teaching, so nothing here can shadow a /courses route.
 */
const inviteSchema = z.object({
  teacher: z.string().min(3).max(200).trim(), // username or email
  message: z.string().max(500).trim().optional(),
});

router.use(authenticate);

/** Who teaches this course, plus its open invitations. */
router.get('/courses/:courseId', requireCourseOwnership, asyncHandler(async (req, res) => {
  const course = await Course.findById(req.course._id)
    .populate('teacher', 'name username email')
    .populate('coTeachers', 'name username email');
  const invites = await CoTeachInvite.find({ course: req.course._id, status: 'pending' })
    .populate('invitee', 'name username')
    .populate('invitedBy', 'name username')
    .sort({ createdAt: -1 });
  res.json({
    owner: course.teacher,
    coTeachers: course.coTeachers,
    pendingInvites: invites,
    canManage: String(course.teacher._id) === String(req.user.id) || isAdminRole(req.user.role),
  });
}));

/** Invite another teacher to co-teach. */
router.post('/courses/:courseId/invite', coTeachInviteLimiter, requireCourseOwnership, validate(inviteSchema), asyncHandler(async (req, res) => {
  const key = req.body.teacher.toLowerCase();
  const invitee = await User.findOne({
    $or: [{ username: key }, { email: key }],
    deletedAt: null,
  });
  // One message whether the account is missing, suspended, or not a teacher —
  // otherwise this endpoint tells an attacker which usernames exist.
  if (!invitee || invitee.role !== ROLES.TEACHER || invitee.status !== 'active') {
    throw ApiError.badRequest('No active teacher account matches that username or email', 'TEACHER_NOT_FOUND');
  }
  if (courseStaffIds(req.course).includes(String(invitee._id))) {
    throw ApiError.badRequest('That teacher already teaches this course', 'ALREADY_CO_TEACHER');
  }

  let invite;
  try {
    invite = await CoTeachInvite.create({
      course: req.course._id,
      invitedBy: req.user.id,
      invitee: invitee._id,
      message: req.body.message || '',
    });
  } catch (err) {
    // The partial unique index rejects a second open invitation.
    if (err.code === 11000) throw ApiError.conflict('That teacher already has a pending invitation', 'INVITE_EXISTS');
    throw err;
  }

  await audit({ user: req.user.id, action: 'COTEACH_INVITED', course: req.course._id, targetUser: invitee._id, ip: req.ip });
  await notifyUser(invitee._id, {
    type: 'system',
    title: 'Invitation to co-teach a course',
    body: `${req.user.name} invited you to co-teach "${req.course.title}".`,
    link: '/teacher/invitations',
    course: req.course._id,
  });
  res.status(201).json(invite);
}));

/** Withdraw an invitation that has not been answered. */
router.post('/courses/:courseId/invites/:inviteId/cancel', requireCourseOwnership, asyncHandler(async (req, res) => {
  const invite = await CoTeachInvite.findOne({ _id: req.params.inviteId, course: req.course._id, status: 'pending' });
  if (!invite) throw ApiError.notFound('Invitation not found');
  invite.status = 'cancelled';
  invite.respondedAt = new Date();
  await invite.save();
  res.json({ message: 'Invitation withdrawn' });
}));

/**
 * Remove a co-teacher.
 *
 * Only the course creator or an administrator — otherwise an invited
 * co-teacher could remove the person who invited them and take the course.
 */
router.delete('/courses/:courseId/teachers/:teacherId', requireCourseOwnership, asyncHandler(async (req, res) => {
  const isCreator = String(req.course.teacher) === String(req.user.id);
  if (!isCreator && !isAdminRole(req.user.role)) {
    throw ApiError.forbidden('Only the teacher who created the course can remove a co-teacher', 'NOT_COURSE_CREATOR');
  }
  if (String(req.course.teacher) === String(req.params.teacherId)) {
    throw ApiError.badRequest('The course creator cannot be removed', 'CANNOT_REMOVE_CREATOR');
  }
  if (!courseStaffIds(req.course).includes(String(req.params.teacherId))) {
    throw ApiError.notFound('That teacher does not co-teach this course');
  }

  await Course.updateOne({ _id: req.course._id }, { $pull: { coTeachers: req.params.teacherId } });
  await audit({ user: req.user.id, action: 'COTEACH_REMOVED', course: req.course._id, targetUser: req.params.teacherId, ip: req.ip });
  await notifyUser(req.params.teacherId, {
    type: 'system',
    title: 'Removed from a course',
    body: `You no longer co-teach "${req.course.title}".`,
    link: '/teacher/courses',
    course: req.course._id,
  });
  res.json({ message: 'Co-teacher removed' });
}));

/** Invitations addressed to me. */
router.get('/invitations', asyncHandler(async (req, res) => {
  const invites = await CoTeachInvite.find({ invitee: req.user.id, status: 'pending' })
    .populate({ path: 'course', select: 'title category thumbnail deletedAt' })
    .populate('invitedBy', 'name username')
    .sort({ createdAt: -1 });
  // Deleting a course cancels its invitations, but a race (or an old record)
  // could still leave one pointing at a course that is gone.
  res.json({ items: invites.filter((i) => i.course && !i.course.deletedAt) });
}));

/** Loads a pending invitation addressed to the caller. */
const myPendingInvite = async (inviteId, userId) => {
  if (!/^[a-f\d]{24}$/i.test(String(inviteId))) throw ApiError.notFound('Invitation not found');
  const invite = await CoTeachInvite.findOne({ _id: inviteId, invitee: userId, status: 'pending' });
  if (!invite) throw ApiError.notFound('Invitation not found');
  return invite;
};

/** Accept: join the course's teaching staff. */
router.post('/invitations/:inviteId/accept', asyncHandler(async (req, res) => {
  const invite = await myPendingInvite(req.params.inviteId, req.user.id);
  // Re-check the role now, not only when the invitation was sent: the account
  // may have been demoted or suspended in between.
  if (req.user.role !== ROLES.TEACHER) {
    throw ApiError.forbidden('Only a teacher account can co-teach a course', 'NOT_A_TEACHER');
  }
  const course = await Course.findOne({ _id: invite.course, deletedAt: null });
  if (!course) {
    invite.status = 'cancelled';
    invite.respondedAt = new Date();
    await invite.save();
    throw ApiError.notFound('That course no longer exists');
  }

  // $addToSet, so a double submission cannot list the same teacher twice.
  await Course.updateOne({ _id: course._id }, { $addToSet: { coTeachers: req.user.id } });
  invite.status = 'accepted';
  invite.respondedAt = new Date();
  await invite.save();

  await audit({ user: req.user.id, action: 'COTEACH_ACCEPTED', course: course._id, targetUser: invite.invitedBy, ip: req.ip });
  await notifyUser(invite.invitedBy, {
    type: 'system',
    title: 'Co-teaching invitation accepted',
    body: `${req.user.name} now co-teaches "${course.title}".`,
    link: `/teacher/courses/${course._id}`,
    course: course._id,
  });
  res.json({ message: 'You now co-teach this course', course: course._id });
}));

router.post('/invitations/:inviteId/decline', asyncHandler(async (req, res) => {
  const invite = await myPendingInvite(req.params.inviteId, req.user.id);
  invite.status = 'declined';
  invite.respondedAt = new Date();
  await invite.save();

  await audit({ user: req.user.id, action: 'COTEACH_DECLINED', course: invite.course, targetUser: invite.invitedBy, ip: req.ip });
  await notifyUser(invite.invitedBy, {
    type: 'system',
    title: 'Co-teaching invitation declined',
    body: `${req.user.name} declined your invitation.`,
    link: `/teacher/courses/${invite.course}`,
    course: invite.course,
  });
  res.json({ message: 'Invitation declined' });
}));

module.exports = router;
