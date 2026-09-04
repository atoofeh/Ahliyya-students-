const ApiError = require('../core/ApiError');
const { isAdminRole } = require('../core/permissions');
const { isCourseStaff } = require('../modules/courses/courseStaff');
const asyncHandler = require('../core/asyncHandler');

/**
 * Course-scoped access control.
 *
 * requireCourseAccess: admin → always; teacher → must run the course (creator
 * or accepted co-teacher); student → must hold an active, unexpired enrollment.
 * Attaches req.course (and req.enrollment for students).
 *
 * requireCourseOwnership: admin or a teacher of the course (content editing).
 *
 * Both delegate "is this my course?" to modules/courses/courseStaff, so
 * co-teaching cannot leave a stale single-teacher comparison behind.
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
    if (!isCourseStaff(course, req.user)) {
      throw ApiError.forbidden('You do not teach this course');
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

  if (isCourseStaff(course, req.user)) return next();
  throw ApiError.forbidden('Only the teachers of this course or an administrator can do this');
});

/**
 * May this signed-in user watch this lesson without being enrolled?
 *
 * Only when all four hold: the course is published, its teacher listed it, the
 * lesson is published, and the teacher marked it free. Anything less and the
 * caller falls back to the ordinary enrollment rule.
 */
const isFreeLesson = (course, lesson) => (
  !!course && !!lesson
  && course.isPublished === true
  && course.visibility === 'listed'
  && course.deletedAt === null
  && lesson.deletedAt === null
  && lesson.isPublished === true
  && lesson.isFree === true
  && String(lesson.course) === String(course._id)
);

/**
 * Is this media attached to a free lesson?
 *
 * The media routes (video streaming, file serving) authorize independently of
 * the lesson route, so they ask here rather than re-deriving the rule — a video
 * or document must never be more, or less, reachable than the lesson holding it.
 *
 * Pass exactly one of `video` / `fileAsset`.
 */
const isFreeLessonMedia = async ({ courseId, video, fileAsset }) => {
  if (!video && !fileAsset) return false;
  const Course = require('../models/Course');
  const Lesson = require('../models/Lesson');
  const [course, lesson] = await Promise.all([
    Course.findOne({ _id: courseId, deletedAt: null }),
    Lesson.findOne({
      course: courseId,
      deletedAt: null,
      isFree: true,
      isPublished: true,
      ...(video ? { video } : { fileAsset }),
    }),
  ]);
  return isFreeLesson(course, lesson);
};

/**
 * Lesson access: everything requireCourseAccess allows, plus a signed-in user
 * opening a free lesson on a listed course.
 *
 * Sets req.previewOnly when the caller got in through the free-lesson door, so
 * the controller knows not to record progress or hand back enrolled-only data.
 */
const requireLessonAccess = asyncHandler(async (req, res, next) => {
  const Lesson = require('../models/Lesson');
  const course = await loadCourse(req);
  const lesson = await Lesson.findOne({ _id: req.params.lessonId, course: course._id, deletedAt: null });
  if (!lesson) throw ApiError.notFound('Lesson not found');

  req.course = course;
  req.lesson = lesson;
  req.previewOnly = false;

  // Try the normal rule first; a free lesson must never *narrow* access.
  let denied = null;
  await new Promise((resolve) => {
    requireCourseAccess(req, res, (err) => { denied = err || null; resolve(); });
  });
  if (!denied) return next();

  if (isFreeLesson(course, lesson)) {
    // loadCourse ran again inside requireCourseAccess; restore what we loaded.
    req.course = course;
    req.previewOnly = true;
    return next();
  }
  throw denied;
});

module.exports = { requireCourseAccess, requireCourseOwnership, requireLessonAccess, isFreeLesson, isFreeLessonMedia };
