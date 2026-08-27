const ApiError = require('../core/ApiError');
const { isAdminRole } = require('../core/permissions');
const asyncHandler = require('../core/asyncHandler');

/**
 * Course-scoped access control.
 *
 * requireCourseAccess: admin → always; teacher → must own the course;
 * student → must hold an active, unexpired enrollment.
 * Attaches req.course (and req.enrollment for students).
 *
 * requireCourseOwnership: admin or the owning teacher only (content editing).
 */
const loadCourse = async (req) => {
  const Course = require('../models/Course');
  const courseId = req.params.courseId || req.body.courseId;
  if (!courseId) throw ApiError.badRequest('courseId is required');
  const course = await Course.findOne({ _id: courseId, deletedAt: null });
  if (!course) throw ApiError.notFound('Course not found');
  return course;
};

const requireCourseAccess = asyncHandler(async (req, _res, next) => {
  const course = await loadCourse(req);
  req.course = course;

  if (isAdminRole(req.user.role)) return next();

  if (req.user.role === 'teacher') {
    if (String(course.teacher) !== String(req.user.id)) {
      throw ApiError.forbidden('You do not own this course');
    }
    return next();
  }

  // Student
  const Enrollment = require('../models/Enrollment');
  const enrollment = await Enrollment.findOne({
    student: req.user.id,
    course: course._id,
    status: 'active',
  });
  if (!enrollment) throw ApiError.forbidden('You are not enrolled in this course', 'NOT_ENROLLED');
  if (enrollment.expiresAt && enrollment.expiresAt < new Date()) {
    enrollment.status = 'expired';
    await enrollment.save();
    throw ApiError.forbidden('Your access to this course has expired', 'ENROLLMENT_EXPIRED');
  }
  if (course.expiresAt && course.expiresAt < new Date()) {
    throw ApiError.forbidden('This course has ended', 'COURSE_EXPIRED');
  }
  req.enrollment = enrollment;
  next();
});

const requireCourseOwnership = asyncHandler(async (req, _res, next) => {
  const course = await loadCourse(req);
  req.course = course;

  if (isAdminRole(req.user.role)) return next();
  if (req.user.role === 'teacher' && String(course.teacher) === String(req.user.id)) return next();
  throw ApiError.forbidden('Only the course owner or an administrator can do this');
});

module.exports = { requireCourseAccess, requireCourseOwnership };
