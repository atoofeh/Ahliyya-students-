const ApiError = require('../../core/ApiError');
const { securityLogger } = require('../../config/logger');
const { paginatedQuery } = require('../../core/pagination');
const CheatEvent = require('../../models/CheatEvent');
const QuizAttempt = require('../../models/QuizAttempt');
const Quiz = require('../../models/Quiz');

/** Severity weights per event type — feeds the attempt risk score. */
const WEIGHTS = {
  tab_switch: 3,
  window_blur: 2,
  devtools_open: 8,
  copy: 2,
  paste: 5,
  cut: 2,
  right_click: 1,
  shortcut_blocked: 2,
  idle: 1,
  page_refresh: 3,
  network_offline: 1,
  multiple_tabs: 8,
  fullscreen_exit: 3,
  fingerprint_mismatch: 10,
  screen_capture_suspected: 8,
  mouse_inactive: 1,
};

const STRICTNESS_MULTIPLIER = { low: 0.5, medium: 1, high: 1.5 };

class AntiCheatService {
  /**
   * Ingest a batch of client-side proctor events for an in-progress attempt.
   * Recomputes risk score and auto-submits past the violation threshold.
   */
  static async recordEvents(studentId, attemptId, events, { ip, fingerprint }) {
    const { getSettings } = require('../../config/settingsCache');
    const settings = await getSettings();
    if (!settings.antiCheatEnabled) return { recorded: 0, riskScore: 0 };

    const attempt = await QuizAttempt.findOne({ _id: attemptId, student: studentId });
    if (!attempt) throw ApiError.notFound('Attempt not found');
    const quiz = await Quiz.findById(attempt.quiz);
    if (quiz && !quiz.antiCheat?.enabled) return { recorded: 0, riskScore: attempt.riskScore };

    const multiplier = STRICTNESS_MULTIPLIER[settings.antiCheatStrictness] ?? 1;
    const docs = events.map((e) => ({
      student: studentId,
      course: attempt.course,
      quiz: attempt.quiz,
      attempt: attempt._id,
      type: e.type,
      detail: (e.detail || '').slice(0, 1000),
      weight: Math.round((WEIGHTS[e.type] || 1) * multiplier * 10) / 10,
      ip,
      fingerprint: fingerprint || '',
      occurredAt: e.occurredAt ? new Date(e.occurredAt) : new Date(),
    }));
    await CheatEvent.insertMany(docs);

    // Aggregate risk for this attempt.
    const agg = await CheatEvent.aggregate([
      { $match: { attempt: attempt._id } },
      { $group: { _id: null, totalWeight: { $sum: '$weight' }, count: { $sum: 1 } } },
    ]);
    const totalWeight = agg[0]?.totalWeight || 0;
    attempt.violationCount = agg[0]?.count || 0;
    attempt.riskScore = Math.min(100, Math.round(totalWeight));

    let autoSubmitted = false;
    const maxViolations = quiz?.antiCheat?.maxViolations ?? 10;
    if (attempt.status === 'in_progress' && attempt.violationCount >= maxViolations) {
      securityLogger.warn('Attempt auto-submitted for excessive violations', {
        attempt: String(attempt._id), student: String(studentId), violations: attempt.violationCount,
      });
      await attempt.save();
      const QuizService = require('../quizzes/quizzes.service');
      await QuizService.submitAttempt(attemptId, studentId, null, ip).catch(() => {});
      autoSubmitted = true;
    } else {
      await attempt.save();
    }

    securityLogger.info('CHEAT_EVENTS', {
      student: String(studentId), attempt: String(attemptId),
      types: events.map((e) => e.type), riskScore: attempt.riskScore,
    });

    return { recorded: docs.length, riskScore: attempt.riskScore, violationCount: attempt.violationCount, autoSubmitted };
  }

  /** Detailed report for one attempt (teacher/admin). */
  static async attemptReport(attemptId) {
    const [attempt, events] = await Promise.all([
      QuizAttempt.findById(attemptId)
        .populate('student', 'name username email')
        .populate('quiz', 'title antiCheat')
        .select('quiz student course attemptNumber status score maxScore percent passed pendingManualGrading violationCount riskScore invalidatedReason startedAt deadlineAt submittedAt createdAt'),
      CheatEvent.find({ attempt: attemptId }).sort({ occurredAt: 1 }).lean(),
    ]);
    if (!attempt) throw ApiError.notFound('Attempt not found');

    const byType = {};
    for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1;
    return { attempt, events, summary: { total: events.length, byType, riskScore: attempt.riskScore } };
  }

  /** Course-level suspicious activity overview. */
  static async courseReport(courseId, { page, limit }) {
    const flagged = await QuizAttempt.find({ course: courseId, riskScore: { $gte: 10 } })
      .populate('student', 'name username')
      .populate('quiz', 'title')
      .select('quiz student course attemptNumber status score maxScore percent passed pendingManualGrading violationCount riskScore invalidatedReason startedAt deadlineAt submittedAt createdAt')
      .sort({ riskScore: -1 })
      .limit(100)
      .lean();

    const recent = await paginatedQuery(CheatEvent, { course: courseId }, {
      page, limit,
      populate: [{ path: 'student', select: 'name username' }, { path: 'quiz', select: 'title' }],
      sort: { createdAt: -1 },
    });
    return { flagged, recentEvents: recent };
  }

  /** Platform-wide report for admins. */
  static async platformReport({ page, limit }) {
    const [topOffenders, eventVolume, recent] = await Promise.all([
      CheatEvent.aggregate([
        { $group: { _id: '$student', events: { $sum: 1 }, weight: { $sum: '$weight' } } },
        { $sort: { weight: -1 } },
        { $limit: 20 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'student' } },
        { $unwind: '$student' },
        { $project: { events: 1, weight: 1, name: '$student.name', username: '$student.username' } },
      ]),
      CheatEvent.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      paginatedQuery(CheatEvent, {}, {
        page, limit,
        populate: [{ path: 'student', select: 'name username' }, { path: 'course', select: 'title' }],
        sort: { createdAt: -1 },
      }),
    ]);
    return { topOffenders, eventVolume, recentEvents: recent };
  }
}

module.exports = AntiCheatService;
