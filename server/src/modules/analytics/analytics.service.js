const Course = require('../../models/Course');
const Enrollment = require('../../models/Enrollment');
const QuizAttempt = require('../../models/QuizAttempt');
const LessonProgress = require('../../models/LessonProgress');
const User = require('../../models/User');
const Session = require('../../models/Session');
const LoginHistory = require('../../models/LoginHistory');
const CheatEvent = require('../../models/CheatEvent');
const Video = require('../../models/Video');
const Certificate = require('../../models/Certificate');

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

class AnalyticsService {
  /** Student home dashboard: progress, activity, achievements. */
  static async studentDashboard(studentId) {
    const [enrollments, attempts, recentProgress, certificates] = await Promise.all([
      Enrollment.find({ student: studentId, status: { $in: ['active', 'completed'] } })
        .populate({ path: 'course', select: 'title thumbnail category lessonCount durationMinutes teacher', populate: { path: 'teacher', select: 'name' } })
        .sort({ lastAccessedAt: -1 })
        .lean(),
      QuizAttempt.find({ student: studentId, status: { $ne: 'in_progress' } })
        .populate('quiz', 'title passingScore')
        .populate('course', 'title')
        .select('quiz student course attemptNumber status score maxScore percent passed pendingManualGrading violationCount riskScore invalidatedReason startedAt deadlineAt submittedAt createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      LessonProgress.find({ student: studentId })
        .populate('lesson', 'title type durationMinutes')
        .populate('course', 'title')
        .sort({ lastAccessedAt: -1 })
        .limit(8)
        .lean(),
      Certificate.countDocuments({ student: studentId, revokedAt: null }),
    ]);

    const active = enrollments.filter((e) => e.course);
    const graded = attempts.filter((a) => a.percent != null);
    const avgScore = graded.length
      ? Math.round(graded.reduce((s, a) => s + a.percent, 0) / graded.length * 10) / 10
      : null;

    // Continue learning = most recently touched incomplete lesson.
    const continueLearning = recentProgress.find((p) => p.lesson && !p.completed) || null;

    return {
      stats: {
        enrolledCourses: active.length,
        completedCourses: active.filter((e) => e.status === 'completed' || e.progressPercent >= 100).length,
        certificates,
        quizzesTaken: graded.length,
        avgScore,
        passRate: graded.length ? Math.round((graded.filter((a) => a.passed).length / graded.length) * 100) : null,
      },
      enrollments: active,
      recentAttempts: attempts,
      recentActivity: recentProgress.filter((p) => p.lesson),
      continueLearning,
    };
  }

  /** Teacher dashboard: portfolio stats + per-course engagement. */
  static async teacherDashboard(teacherId) {
    const courses = await Course.find({ teacher: teacherId, deletedAt: null }).lean();
    const courseIds = courses.map((c) => c._id);

    const [enrollmentAgg, attemptAgg, pendingGrading, cheatCount, videoAgg] = await Promise.all([
      Enrollment.aggregate([
        { $match: { course: { $in: courseIds }, status: { $in: ['active', 'completed'] } } },
        { $group: { _id: '$course', students: { $sum: 1 }, avgProgress: { $avg: '$progressPercent' } } },
      ]),
      QuizAttempt.aggregate([
        { $match: { course: { $in: courseIds }, status: { $ne: 'in_progress' } } },
        { $group: { _id: '$course', attempts: { $sum: 1 }, avgPercent: { $avg: '$percent' } } },
      ]),
      QuizAttempt.countDocuments({ course: { $in: courseIds }, pendingManualGrading: true }),
      CheatEvent.countDocuments({ course: { $in: courseIds }, createdAt: { $gte: daysAgo(7) } }),
      Video.aggregate([
        { $match: { course: { $in: courseIds }, deletedAt: null } },
        { $group: { _id: null, videos: { $sum: 1 }, views: { $sum: '$viewCount' } } },
      ]),
    ]);

    const enrollByCourse = Object.fromEntries(enrollmentAgg.map((e) => [String(e._id), e]));
    const attemptsByCourse = Object.fromEntries(attemptAgg.map((a) => [String(a._id), a]));

    return {
      stats: {
        courses: courses.length,
        publishedCourses: courses.filter((c) => c.isPublished).length,
        totalStudents: enrollmentAgg.reduce((s, e) => s + e.students, 0),
        pendingGrading,
        cheatEventsThisWeek: cheatCount,
        totalVideos: videoAgg[0]?.videos || 0,
        totalVideoViews: videoAgg[0]?.views || 0,
      },
      courses: courses.map((c) => ({
        ...c,
        students: enrollByCourse[String(c._id)]?.students || 0,
        avgProgress: Math.round(enrollByCourse[String(c._id)]?.avgProgress || 0),
        quizAttempts: attemptsByCourse[String(c._id)]?.attempts || 0,
        avgQuizScore: Math.round((attemptsByCourse[String(c._id)]?.avgPercent || 0) * 10) / 10,
      })),
    };
  }

  /** Per-course drill-down for teachers: engagement + completion. */
  static async courseAnalytics(courseId) {
    const [enrollStats, progressDist, quizPerf, engagementByDay] = await Promise.all([
      Enrollment.aggregate([
        { $match: { course: courseId } },
        { $group: { _id: '$status', count: { $sum: 1 }, avgProgress: { $avg: '$progressPercent' } } },
      ]),
      Enrollment.aggregate([
        { $match: { course: courseId, status: { $in: ['active', 'completed'] } } },
        { $bucket: { groupBy: '$progressPercent', boundaries: [0, 20, 40, 60, 80, 101], default: 'other', output: { count: { $sum: 1 } } } },
      ]),
      QuizAttempt.aggregate([
        { $match: { course: courseId, status: { $ne: 'in_progress' } } },
        { $lookup: { from: 'quizzes', localField: 'quiz', foreignField: '_id', as: 'quizDoc' } },
        { $unwind: '$quizDoc' },
        { $group: { _id: '$quiz', title: { $first: '$quizDoc.title' }, attempts: { $sum: 1 }, avgPercent: { $avg: '$percent' }, passRate: { $avg: { $cond: ['$passed', 1, 0] } } } },
      ]),
      LessonProgress.aggregate([
        { $match: { course: courseId, lastAccessedAt: { $gte: daysAgo(30) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$lastAccessedAt' } }, activeStudents: { $addToSet: '$student' }, events: { $sum: 1 } } },
        { $project: { activeStudents: { $size: '$activeStudents' }, events: 1 } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    return { enrollStats, progressDist, quizPerf, engagementByDay };
  }

  /** Admin platform dashboard. */
  static async adminDashboard() {
    const [userCounts, courseCounts, activeSessions, logins7d, attempts7d, cheat7d, storage, popularCourses, loginTrend, deviceStats] = await Promise.all([
      User.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } },
      ]),
      Course.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: '$isPublished', count: { $sum: 1 } } },
      ]),
      Session.countDocuments({ isActive: true, lastActivityAt: { $gte: daysAgo(1) } }),
      LoginHistory.countDocuments({ success: true, createdAt: { $gte: daysAgo(7) } }),
      QuizAttempt.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
      CheatEvent.countDocuments({ createdAt: { $gte: daysAgo(7) } }),
      require('../files/files.service').storageStats(),
      Enrollment.aggregate([
        { $match: { status: { $in: ['active', 'completed'] } } },
        { $group: { _id: '$course', students: { $sum: 1 } } },
        { $sort: { students: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
        { $unwind: '$course' },
        { $project: { title: '$course.title', students: 1 } },
      ]),
      LoginHistory.aggregate([
        { $match: { createdAt: { $gte: daysAgo(14) } } },
        { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, success: '$success' }, count: { $sum: 1 } } },
        { $sort: { '_id.day': 1 } },
      ]),
      Session.aggregate([
        { $match: { createdAt: { $gte: daysAgo(30) } } },
        { $group: { _id: '$os', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
    ]);

    const users = { total: 0, byRole: {}, suspended: 0, banned: 0 };
    for (const u of userCounts) {
      users.total += u.count;
      users.byRole[u._id.role] = (users.byRole[u._id.role] || 0) + u.count;
      if (u._id.status === 'suspended') users.suspended += u.count;
      if (u._id.status === 'banned') users.banned += u.count;
    }

    return {
      users,
      courses: {
        total: courseCounts.reduce((s, c) => s + c.count, 0),
        published: courseCounts.find((c) => c._id === true)?.count || 0,
      },
      activity: { activeSessions, logins7d, attempts7d, cheat7d },
      storage,
      popularCourses,
      loginTrend,
      deviceStats,
    };
  }

  /** Course-completion and engagement report (admin, exportable). */
  static async platformReport() {
    const [completionByCourse, certificates, monthlyEnrollments] = await Promise.all([
      Enrollment.aggregate([
        { $group: { _id: '$course', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, avgProgress: { $avg: '$progressPercent' } } },
        { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
        { $unwind: '$course' },
        { $project: { title: '$course.title', total: 1, completed: 1, avgProgress: { $round: ['$avgProgress', 1] } } },
        { $sort: { total: -1 } },
      ]),
      Certificate.countDocuments({ revokedAt: null }),
      Enrollment.aggregate([
        { $match: { createdAt: { $gte: daysAgo(180) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    return { completionByCourse, certificates, monthlyEnrollments, generatedAt: new Date() };
  }
}

module.exports = AnalyticsService;
