const asyncHandler = require('../../core/asyncHandler');
const CourseService = require('./courses.service');

const clientIp = (req) => req.ip || '';

// ── Courses ───────────────────────────────────────────────────────────
const createCourse = asyncHandler(async (req, res) => {
  // Teachers always own what they create; only admins may assign others.
  if (req.user.role !== 'admin') delete req.body.teacher;
  const course = await CourseService.createCourse(req.user.id, req.body, clientIp(req));
  res.status(201).json(course);
});

const updateCourse = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') delete req.body.teacher;
  res.json(await CourseService.updateCourse(req.course, req.body, req.user.id, clientIp(req)));
});

const deleteCourse = asyncHandler(async (req, res) => {
  await CourseService.deleteCourse(req.course, req.user.id, clientIp(req));
  res.json({ message: 'Course deleted' });
});

const catalog = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  res.json(await CourseService.catalog({ page, limit, search, category: req.query.category }));
});

const myCourses = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  if (req.user.role === 'teacher') {
    return res.json(await CourseService.teacherCourses(req.user.id, { page, limit, search }));
  }
  res.json(await CourseService.allCourses({ page, limit, search }));
});

const courseDetail = asyncHandler(async (req, res) => {
  res.json(await CourseService.courseDetail(req.course, req.user, req.enrollment));
});

// ── Sections ──────────────────────────────────────────────────────────
const createSection = asyncHandler(async (req, res) => {
  res.status(201).json(await CourseService.createSection(req.course._id, req.body));
});
const updateSection = asyncHandler(async (req, res) => {
  res.json(await CourseService.updateSection(req.course._id, req.params.sectionId, req.body));
});
const deleteSection = asyncHandler(async (req, res) => {
  await CourseService.deleteSection(req.course._id, req.params.sectionId);
  res.json({ message: 'Section deleted' });
});

// ── Lessons ───────────────────────────────────────────────────────────
const createLesson = asyncHandler(async (req, res) => {
  res.status(201).json(await CourseService.createLesson(req.course._id, req.body));
});
const updateLesson = asyncHandler(async (req, res) => {
  res.json(await CourseService.updateLesson(req.course._id, req.params.lessonId, req.body));
});
const deleteLesson = asyncHandler(async (req, res) => {
  await CourseService.deleteLesson(req.course._id, req.params.lessonId);
  res.json({ message: 'Lesson deleted' });
});
const getLesson = asyncHandler(async (req, res) => {
  res.json(await CourseService.getLesson(req.course._id, req.params.lessonId, req.user));
});
const reorder = asyncHandler(async (req, res) => {
  await CourseService.reorder(req.course._id, req.body);
  res.json({ message: 'Order updated' });
});

module.exports = {
  createCourse, updateCourse, deleteCourse, catalog, myCourses, courseDetail,
  createSection, updateSection, deleteSection,
  createLesson, updateLesson, deleteLesson, getLesson, reorder,
};
