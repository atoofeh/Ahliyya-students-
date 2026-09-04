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

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

const generateCode = (len = 10) => {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
};

class EnrollmentService {
  // ── Access codes ────────────────────────────────────────────────────

  static async generateCodes(courseId, createdBy, { count, maxUses, expiresInDays, grantsAccessDays }) {
    const docs = [];
    for (let i = 0; i < count; i++) {
      docs.push({
        code: generateCode(),
        course: courseId,
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

  static async assignStudent(courseId, studentIdentifier, actorId, ip) {
    const course = await Course.findOne({ _id: courseId, deletedAt: null });
    if (!course) throw ApiError.notFound('Course not found');
    const student = await User.findOne({
      $or: [{ username: studentIdentifier.toLowerCase() }, { email: studentIdentifier.toLowerCase() }],
      role: 'student',
      deletedAt: null,
    });
    if (!student) throw ApiError.notFound('Student not found');
    return EnrollmentService.#enroll(student._id, course, { enrolledBy: actorId, ip, bypassLimit: true });
  }

  static async #enroll(studentId, course, { joinedViaCode = null, enrolledBy = null, ip, bypassLimit = false }) {
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

    let enrollment;
    if (existing) {
      existing.status = 'active';
      existing.expiresAt = expiresAt;
      existing.joinedViaCode = joinedViaCode?._id || existing.joinedViaCode;
      existing.enrolledBy = enrolledBy;
      enrollment = await existing.save();
    } else {
      enrollment = await Enrollment.create({
        student: studentId,
        course: course._id,
        joinedViaCode: joinedViaCode?._id || null,
        enrolledBy,
        expiresAt,
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

  static async listStudents(courseId, { page, limit, search }) {
    const filter = { course: courseId, status: { $in: ['active', 'completed'] } };
    const result = await paginatedQuery(Enrollment, filter, {
      page, limit,
      populate: { path: 'student', select: 'name username email lastLoginAt status' },
      sort: { createdAt: -1 },
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
      .populate({ path: 'course', select: 'title description category difficulty durationMinutes lessonCount quizCount thumbnail teacher expiresAt', populate: { path: 'teacher', select: 'name' } })
      .sort({ lastAccessedAt: -1, createdAt: -1 })
      .lean();
    return enrollments.filter((e) => e.course);
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
