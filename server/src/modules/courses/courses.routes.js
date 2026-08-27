const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { requireCourseAccess, requireCourseOwnership } = require('../../middleware/courseAccess');
const { validate, paginationSchema } = require('../../middleware/validate');
const v = require('./courses.validators');
const c = require('./courses.controller');

router.use(authenticate);

// Catalog & listings
router.get('/catalog', validate(paginationSchema, 'query'), c.catalog);
router.get('/mine', authorize('teacher', 'admin'), validate(paginationSchema, 'query'), c.myCourses);

// Course CRUD
router.post('/', authorize('teacher', 'admin'), validate(v.courseSchema), c.createCourse);
router.get('/:courseId', requireCourseAccess, c.courseDetail);
router.put('/:courseId', requireCourseOwnership, validate(v.courseSchema.partial()), c.updateCourse);
router.delete('/:courseId', requireCourseOwnership, c.deleteCourse);

// Curriculum management (owner/admin)
router.post('/:courseId/sections', requireCourseOwnership, validate(v.sectionSchema), c.createSection);
router.put('/:courseId/sections/:sectionId', requireCourseOwnership, validate(v.sectionSchema.partial()), c.updateSection);
router.delete('/:courseId/sections/:sectionId', requireCourseOwnership, c.deleteSection);
router.post('/:courseId/lessons', requireCourseOwnership, validate(v.lessonSchema), c.createLesson);
router.put('/:courseId/lessons/:lessonId', requireCourseOwnership, validate(v.lessonSchema.partial()), c.updateLesson);
router.delete('/:courseId/lessons/:lessonId', requireCourseOwnership, c.deleteLesson);
router.post('/:courseId/reorder', requireCourseOwnership, validate(v.reorderSchema), c.reorder);

// Lesson consumption (enrolled students, owner, admin)
router.get('/:courseId/lessons/:lessonId', requireCourseAccess, c.getLesson);

module.exports = router;
