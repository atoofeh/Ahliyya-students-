const crypto = require('crypto');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { paginatedQuery } = require('../../core/pagination');
const { sendMail, templates } = require('../../core/mailer');
const Course = require('../../models/Course');
const Enrollment = require('../../models/Enrollment');
const AccessCode = require('../../models/AccessCode');
const Lesson = require('../../models/Lesson');
const LessonProgress = require('../../models/LessonProgress');
const Certificate = require('../../models/Certificate');
const QuizAttempt = require('../../models/QuizAttempt');
const User = require('../../models/User');
const { notifyUser } = require('../notifications/notifications.service');
const { ENROLLMENT_PACKAGES, DEFAULT_CURRENCY } = require('../../config/constants');

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

/**
 * The payment fields, as a Mongoose projection that removes them.
 *
 * Money is administrator-and-owner only. Every read path that can reach a
 * teacher or a student applies this, so the fields never leave the database
 * rather than being hidden by the interface — a client that hides a value it
 * was sent is not access control.
 */
const WITHOUT_PAYMENT = '-amountPaid -currency -paymentNote -paymentRecordedBy -paymentRecordedAt';

const generateCode = (len = 10) => {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
};

class EnrollmentService {
  // ── Access codes ────────────────────────────────────────────────────

  static async generateCodes(courseId, createdBy, {
    count, maxUses, expiresInDays, grantsAccessDays, package: pkg, amountPaid,
  }) {
    const docs = [];
    for (let i = 0; i < count; i++) {
      docs.push({
        code: generateCode(),
        course: courseId,
        package: pkg || 'full',
        amountPaid: amountPaid || 0,
        maxUses,
        grantsAccessDays: grantsAccessDays || 0,
        expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
        createdBy,
      });
    }
    return AccessCode.insertMany(docs);
  }

  static async listCodes(courseId, { page, limit }) {
    return paginatedQuery(AccessCode, { course: courseId }, {
      page, limit, populate: { path: 'usedBy.user', select: 'name username' },
    });
  }

  static async revokeCode(courseId, codeId) {
    const code = await AccessCode.findOneAndUpdate(
      { _id: codeId, course: courseId }, { $set: { isRevoked: true } }, { new: true });
    if (!code) throw ApiError.notFound('Code not found');
    return code;
  }

  // ── Enrollment ──────────────────────────────────────────────────────

  static async enrollWithCode(studentId, rawCode, ip) {
    const code = await AccessCode.findOne({ code: rawCode.toUpperCase().trim() });
    if (!code || !code.isAvailable) {
      throw ApiError.badRequest('Invalid or expired access code', 'CODE_INVALID');
    }
    const course = await Course.findOne({ _id: code.course, deletedAt: null });
    if (!course) throw ApiError.notFound('Course no longer exists');

    return EnrollmentService.#enroll(studentId, course, { joinedViaCode: code, ip });
  }

  static async assignStudent(courseId, studentIdentifier, actorId, ip, payment = {}) {
    const course = await Course.findOne({ _id: courseId, deletedAt: null });
    if (!course) throw ApiError.notFound('Course not found');
    const student = await User.findOne({
      $or: [{ username: studentIdentifier.toLowerCase() }, { email: studentIdentifier.toLowerCase() }],
      role: 'student',
      deletedAt: null,
    });
    if (!student) throw ApiError.notFound('Student not found');
    return EnrollmentService.#enroll(student._id, course, {
      enrolledBy: actorId, ip, bypassLimit: true, payment,
    });
  }

  /**
   * Change what a student is recorded as having taken and paid.
   *
   * Amounts get mistyped and packages get upgraded mid-term, so the figures
   * have to be correctable. Every correction is audited with the old and the
   * new value, because "who changed this number" is the first question anyone
   * asks of a payment record.
   */
  static async recordPayment(courseId, studentId, changes, actorId, ip) {
    const enrollment = await Enrollment.findOne({ course: courseId, student: studentId });
    if (!enrollment) throw ApiError.notFound('Enrollment not found');

    const before = { package: enrollment.package, amountPaid: enrollment.amountPaid };
    if (changes.package !== undefined) enrollment.package = changes.package;
    if (changes.amountPaid !== undefined) enrollment.amountPaid = changes.amountPaid;
    if (changes.paymentNote !== undefined) enrollment.paymentNote = changes.paymentNote;
    enrollment.paymentRecordedBy = actorId;
    enrollment.paymentRecordedAt = new Date();
    await enrollment.save();

    await audit({
      user: actorId, action: 'ENROLLMENT_PAYMENT_RECORDED', targetUser: studentId, course: courseId, ip,
      meta: { before, after: { package: enrollment.package, amountPaid: enrollment.amountPaid } },
    });
    return enrollment;
  }

  static async #enroll(studentId, course, {
    joinedViaCode = null, enrolledBy = null, ip, bypassLimit = false, payment = {},
  }) {
    const { getSettings } = require('../../config/settingsCache');
    const settings = await getSettings();
    if (!settings.enrollmentOpen && !enrolledBy) {
      throw ApiError.forbidden('Enrollment is currently closed', 'ENROLLMENT_CLOSED');
    }

    const existing = await Enrollment.findOne({ student: studentId, course: course._id });
    if (existing && existing.status === 'active') {
      throw ApiError.conflict('Already enrolled in this course', 'ALREADY_ENROLLED');
    }

    if (!bypassLimit && course.enrollmentLimit > 0 && course.enrollmentCount >= course.enrollmentLimit) {
      throw ApiError.forbidden('This course has reached its enrollment limit', 'COURSE_FULL');
    }

    let expiresAt = course.expiresAt;
    if (joinedViaCode?.grantsAccessDays > 0) {
      expiresAt = new Date(Date.now() + joinedViaCode.grantsAccessDays * 86400000);
    }

    // A code carries what it was sold as; a direct assignment carries what the
    // administrator typed. Either way the enrollment ends up with both, so the
    // course's figures cover every student however they got in.
    const pkg = payment.package || joinedViaCode?.package || 'full';
    const amountPaid = payment.amountPaid ?? joinedViaCode?.amountPaid ?? 0;
    const recorded = payment.package !== undefined || payment.amountPaid !== undefined;

    let enrollment;
    if (existing) {
      existing.status = 'active';
      existing.expiresAt = expiresAt;
      existing.joinedViaCode = joinedViaCode?._id || existing.joinedViaCode;
      existing.enrolledBy = enrolledBy;
      existing.package = pkg;
      existing.amountPaid = amountPaid;
      existing.currency = course.currency || DEFAULT_CURRENCY;
      if (payment.paymentNote !== undefined) existing.paymentNote = payment.paymentNote;
      if (recorded) { existing.paymentRecordedBy = enrolledBy; existing.paymentRecordedAt = new Date(); }
      enrollment = await existing.save();
    } else {
      enrollment = await Enrollment.create({
        student: studentId,
        course: course._id,
        joinedViaCode: joinedViaCode?._id || null,
        enrolledBy,
        expiresAt,
        package: pkg,
        amountPaid,
        currency: course.currency || DEFAULT_CURRENCY,
        paymentNote: payment.paymentNote || '',
        ...(recorded && { paymentRecordedBy: enrolledBy, paymentRecordedAt: new Date() }),
      });
      await Course.updateOne({ _id: course._id }, { $inc: { enrollmentCount: 1 } });
    }

    if (joinedViaCode) {
      joinedViaCode.usedCount += 1;
      joinedViaCode.usedBy.push({ user: studentId });
      await joinedViaCode.save();
      await audit({ user: studentId, action: 'CODE_REDEEM', course: course._id, ip });
    }
    await audit({ user: enrolledBy || studentId, action: 'ENROLLED', targetUser: studentId, course: course._id, ip });

    const student = await User.findById(studentId);
    await notifyUser(studentId, {
      type: 'enrollment',
      title: `Enrolled in ${course.title}`,
      body: 'You now have access to all course content.',
      link: `/student/courses/${course._id}`,
      course: course._id,
    });
    if (student?.email) {
      await sendMail({ to: student.email, ...templates.enrollmentConfirmed(student.name, course.title) });
    }

    return enrollment;
  }

  static async removeStudent(courseId, studentId, actorId, ip) {
    const enrollment = await Enrollment.findOne({ course: courseId, student: studentId, status: 'active' });
    if (!enrollment) throw ApiError.notFound('Active enrollment not found');
    enrollment.status = 'removed';
    await enrollment.save();
    await Course.updateOne({ _id: courseId }, { $inc: { enrollmentCount: -1 } });
    await audit({ user: actorId, action: 'UNENROLLED', targetUser: studentId, course: courseId, ip });
  }

  static async expireStudentAccess(courseId, studentId, expiresAt, actorId, ip) {
    const enrollment = await Enrollment.findOne({ course: courseId, student: studentId });
    if (!enrollment) throw ApiError.notFound('Enrollment not found');
    enrollment.expiresAt = expiresAt;
    if (expiresAt && expiresAt < new Date()) enrollment.status = 'expired';
    await enrollment.save();
    await audit({ user: actorId, action: 'ENROLLMENT_EXPIRED', targetUser: studentId, course: courseId, ip, meta: { expiresAt } });
    return enrollment;
  }

  /**
   * The course roster.
   *
   * `canSeePayments` comes from the caller's permission, not from a query
   * parameter, and decides whether the money columns are read at all. A teacher
   * still gets each student's package — they need to know who is with them for
   * the midterm and who for the whole course.
   */
  static async listStudents(courseId, { page, limit, search }, { canSeePayments = false } = {}) {
    const filter = { course: courseId, status: { $in: ['active', 'completed'] } };
    const result = await paginatedQuery(Enrollment, filter, {
      page, limit,
      populate: { path: 'student', select: 'name username email lastLoginAt status' },
      sort: { createdAt: -1 },
      ...(canSeePayments ? {} : { select: WITHOUT_PAYMENT }),
    });
    if (search) {
      const q = search.toLowerCase();
      result.items = result.items.filter(
        (e) => e.student && (e.student.name?.toLowerCase().includes(q) || e.student.username?.includes(q))
      );
    }
    return result;
  }

  static async myEnrollments(studentId) {
    const enrollments = await Enrollment.find({ student: studentId, status: { $in: ['active', 'completed'] } })
      .select(WITHOUT_PAYMENT)
      .populate({ path: 'course', select: 'title description category difficulty durationMinutes lessonCount quizCount thumbnail teacher expiresAt', populate: { path: 'teacher', select: 'name' } })
      .sort({ lastAccessedAt: -1, createdAt: -1 })
      .lean();
    return enrollments.filter((e) => e.course);
  }

  /**
   * What this course has taken in, split by what students bought.
   *
   * Administrators and the owner only — the route enforces that. Removed and
   * expired enrollments still count: the money was paid, and dropping them
   * would make the totals disagree with the books.
   */
  static async courseRevenue(courseId) {
    const course = await Course.findById(courseId).select('title currency');
    const paid = { course: courseId, status: { $ne: 'removed' } };

    const [byPackage, monthly, overall] = await Promise.all([
      Enrollment.aggregate([
        { $match: paid },
        {
          $group: {
            _id: { $ifNull: ['$package', 'full'] },
            students: { $sum: 1 },
            collected: { $sum: { $ifNull: ['$amountPaid', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Enrollment.aggregate([
        { $match: { ...paid, createdAt: { $gte: daysAgo(365) } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            students: { $sum: 1 },
            collected: { $sum: { $ifNull: ['$amountPaid', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Enrollment.aggregate([
        { $match: paid },
        {
          $group: {
            _id: null,
            students: { $sum: 1 },
            collected: { $sum: { $ifNull: ['$amountPaid', 0] } },
            // Someone enrolled with nothing recorded — usually a code redeemed
            // before its price was set. Worth surfacing rather than averaging away.
            unrecorded: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$amountPaid', 0] }, 0] }, 0, 1] } },
          },
        },
      ]),
    ]);

    const totals = overall[0] || { students: 0, collected: 0, unrecorded: 0 };
    return {
      course: { _id: courseId, title: course?.title, currency: course?.currency || DEFAULT_CURRENCY },
      totals: {
        students: totals.students,
        collected: totals.collected,
        unrecorded: totals.unrecorded,
        average: totals.students ? Math.round((totals.collected / totals.students) * 100) / 100 : 0,
      },
      byPackage: ENROLLMENT_PACKAGES.map((name) => {
        const row = byPackage.find((r) => r._id === name);
        const students = row?.students || 0;
        const collected = row?.collected || 0;
        return {
          package: name,
          students,
          collected,
          average: students ? Math.round((collected / students) * 100) / 100 : 0,
        };
      }),
      monthly: monthly.map((m) => ({ month: m._id, students: m.students, collected: m.collected })),
    };
  }

  static async toggleFavorite(studentId, courseId) {
    const enrollment = await Enrollment.findOne({ student: studentId, course: courseId });
    if (!enrollment) throw ApiError.notFound('Enrollment not found');
    enrollment.isFavorite = !enrollment.isFavorite;
    await enrollment.save();
    return enrollment;
  }

  // ── Progress & certificates ────────────────────────────────────────

  static async markLessonComplete(studentId, courseId, lessonId) {
    const lesson = await Lesson.findOne({ _id: lessonId, course: courseId, deletedAt: null });
    if (!lesson) throw ApiError.notFound('Lesson not found');

    await LessonProgress.findOneAndUpdate(
      { student: studentId, lesson: lessonId },
      { $set: { course: courseId, completed: true, completedAt: new Date(), lastAccessedAt: new Date() } },
      { upsert: true }
    );
    return EnrollmentService.recomputeProgress(studentId, courseId);
  }

  static async recomputeProgress(studentId, courseId) {
    const [totalLessons, completedLessons, enrollment, course] = await Promise.all([
      Lesson.countDocuments({ course: courseId, deletedAt: null, isPublished: true }),
      LessonProgress.countDocuments({ student: studentId, course: courseId, completed: true }),
      Enrollment.findOne({ student: studentId, course: courseId }),
      Course.findById(courseId),
    ]);
    if (!enrollment || !course) return null;

    enrollment.completedLessons = completedLessons;
    enrollment.progressPercent = totalLessons ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;
    enrollment.lastAccessedAt = new Date();

    const threshold = course.completionThreshold ?? 80;
    if (enrollment.progressPercent >= threshold && !enrollment.completedAt) {
      enrollment.completedAt = new Date();
      enrollment.status = 'completed';
      if (course.certificateEnabled && !enrollment.certificate) {
        const cert = await EnrollmentService.#issueCertificate(studentId, course);
        enrollment.certificate = cert._id;
      }
    }
    await enrollment.save();
    return enrollment;
  }

  static async #issueCertificate(studentId, course) {
    const serial = `CERT-${course._id.toString().slice(-6).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const attempts = await QuizAttempt.find({ student: studentId, course: course._id, status: { $in: ['graded', 'submitted', 'auto_submitted'] } });
    const avgScore = attempts.length
      ? Math.round(attempts.reduce((sum, a) => sum + (a.percent || 0), 0) / attempts.length)
      : null;

    const cert = await Certificate.create({ student: studentId, course: course._id, serial, finalScore: avgScore });

    const student = await User.findById(studentId);
    await notifyUser(studentId, {
      type: 'certificate',
      title: `Certificate earned: ${course.title}`,
      body: `Serial ${serial}`,
      link: '/student/certificates',
      course: course._id,
    });
    if (student?.email) {
      await sendMail({ to: student.email, ...templates.certificateIssued(student.name, course.title, serial) });
    }
    return cert;
  }

  static async myCertificates(studentId) {
    return Certificate.find({ student: studentId, revokedAt: null })
      .populate('course', 'title category')
      .sort({ issuedAt: -1 })
      .lean();
  }

  static async verifyCertificate(serial) {
    const cert = await Certificate.findOne({ serial: serial.toUpperCase(), revokedAt: null })
      .populate('course', 'title')
      .populate('student', 'name')
      .lean();
    if (!cert) throw ApiError.notFound('Certificate not found or revoked');
    return { serial: cert.serial, student: cert.student?.name, course: cert.course?.title, issuedAt: cert.issuedAt, finalScore: cert.finalScore };
  }
}

module.exports = EnrollmentService;
