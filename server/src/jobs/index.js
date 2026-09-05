const { logger } = require('../config/logger');

/**
 * Lightweight in-process background jobs. For multi-instance deployments,
 * move these to a dedicated worker with a distributed queue (BullMQ/Redis) —
 * the job bodies are already side-effect safe / idempotent.
 */

/**
 * End sessions idle past the configured timeout (belt-and-braces sweep).
 *
 * Remembered sessions are exempt, exactly as they are in `authenticate`. They
 * were not before, and the two disagreed: the middleware let a remembered
 * session through while this job — running every five minutes — closed it half
 * an hour after the app stopped making requests. Ticking "Remember me" and
 * closing the app therefore signed you out anyway, which is the opposite of
 * what the checkbox promises, and on a phone it also ended the notifications.
 */
const sweepStaleSessions = async () => {
  const Session = require('../models/Session');
  const { getSettings } = require('../config/settingsCache');
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - (settings.sessionTimeoutMinutes || 30) * 60000);
  const result = await Session.updateMany(
    { isActive: true, rememberMe: { $ne: true }, lastActivityAt: { $lt: cutoff } },
    { $set: { isActive: false, endedAt: new Date(), endReason: 'inactivity_timeout' } }
  );
  if (result.modifiedCount) logger.info(`Session sweep: closed ${result.modifiedCount} idle session(s)`);
};

/** Expire enrollments past their end date. */
const sweepExpiredEnrollments = async () => {
  const Enrollment = require('../models/Enrollment');
  const result = await Enrollment.updateMany(
    { status: 'active', expiresAt: { $ne: null, $lt: new Date() } },
    { $set: { status: 'expired' } }
  );
  if (result.modifiedCount) logger.info(`Enrollment sweep: expired ${result.modifiedCount} enrollment(s)`);
};

/** Auto-submit quiz attempts whose deadline passed (client vanished). */
const sweepOverdueAttempts = async () => {
  const QuizAttempt = require('../models/QuizAttempt');
  const QuizService = require('../modules/quizzes/quizzes.service');
  const overdue = await QuizAttempt.find({
    status: 'in_progress',
    deadlineAt: { $ne: null, $lt: new Date(Date.now() - 60000) },
  }).select('_id student');
  for (const attempt of overdue) {
    await QuizService.submitAttempt(attempt._id, attempt.student, null, 'system').catch(() => {});
  }
  if (overdue.length) logger.info(`Attempt sweep: auto-submitted ${overdue.length} overdue attempt(s)`);
};

/**
 * Remind students of assignments due within 24h. reminderSentAt is claimed
 * atomically per assignment, so restarts and concurrent instances cannot double-send.
 */
const assignmentDeadlineReminders = async () => {
  const Assignment = require('../models/Assignment');
  const Enrollment = require('../models/Enrollment');
  const Submission = require('../models/Submission');
  const { notifyMany } = require('../modules/notifications/notifications.service');

  const soon = new Date(Date.now() + 24 * 3600000);
  for (;;) {
    const assignment = await Assignment.findOneAndUpdate(
      { deletedAt: null, isPublished: true, reminderSentAt: null, dueAt: { $gte: new Date(), $lte: soon } },
      { $set: { reminderSentAt: new Date() } },
      { new: true }
    ).populate('course', 'title');
    if (!assignment) break;

    const [enrollments, submissions] = await Promise.all([
      Enrollment.find({ course: assignment.course._id, status: 'active' }).select('student'),
      Submission.find({ assignment: assignment._id }).select('student'),
    ]);
    const submitted = new Set(submissions.map((s) => String(s.student)));
    const pending = enrollments.map((e) => e.student).filter((s) => !submitted.has(String(s)));
    await notifyMany(pending, {
      type: 'deadline',
      title: `Due soon: ${assignment.title}`,
      body: `${assignment.course.title} — due ${assignment.dueAt.toLocaleString()}`,
      link: `/student/courses/${assignment.course._id}`,
      course: assignment.course._id,
      email: true,
    });
  }
};

const startJobs = () => {
  const safe = (fn, name) => () => fn().catch((err) => logger.error(`Job ${name} failed: ${err.message}`));
  setInterval(safe(sweepStaleSessions, 'sweepStaleSessions'), 5 * 60000);
  setInterval(safe(sweepExpiredEnrollments, 'sweepExpiredEnrollments'), 15 * 60000);
  setInterval(safe(sweepOverdueAttempts, 'sweepOverdueAttempts'), 60000);
  setInterval(safe(assignmentDeadlineReminders, 'assignmentDeadlineReminders'), 30 * 60000);
  logger.info('Background jobs scheduled');
};

module.exports = { startJobs, sweepStaleSessions, sweepExpiredEnrollments, sweepOverdueAttempts, assignmentDeadlineReminders };
