const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { requireCourseAccess, requireCourseOwnership } = require('../../middleware/courseAccess');
const { validate, paginationSchema } = require('../../middleware/validate');
const v = require('./quizzes.validators');
const c = require('./quizzes.controller');

router.use(authenticate);

// Student: own attempt history (not course-scoped)
router.get('/attempts/mine', authorize('student'), validate(paginationSchema, 'query'), c.myAttempts);
router.get('/attempts/:attemptId', c.attemptResult);
router.post('/attempts/:attemptId/answers', authorize('student'), validate(v.saveAnswersSchema), c.saveAnswers);
router.post('/attempts/:attemptId/submit', authorize('student'), validate(v.saveAnswersSchema.partial()), c.submitAttempt);
router.post('/attempts/:attemptId/grade', authorize('teacher', 'admin'), validate(v.gradeSchema), c.gradeAttempt);
router.post('/attempts/:attemptId/invalidate', authorize('teacher', 'admin'),
  validate(z.object({ reason: z.string().max(500).optional() })), c.invalidateAttempt);

// Question bank (owner/admin)
router.get('/courses/:courseId/questions', requireCourseOwnership, validate(v.questionListQuery, 'query'), c.listQuestions);
router.post('/courses/:courseId/questions', requireCourseOwnership, validate(v.questionSchema), c.createQuestion);
router.put('/courses/:courseId/questions/:questionId', requireCourseOwnership, validate(v.questionSchema.partial()), c.updateQuestion);
router.delete('/courses/:courseId/questions/:questionId', requireCourseOwnership, c.deleteQuestion);

// Quizzes
router.get('/courses/:courseId', requireCourseAccess, c.listQuizzes);
router.post('/courses/:courseId', requireCourseOwnership, validate(v.quizSchema), c.createQuiz);
router.put('/courses/:courseId/:quizId', requireCourseOwnership, validate(v.quizSchema.partial()), c.updateQuiz);
router.delete('/courses/:courseId/:quizId', requireCourseOwnership, c.deleteQuiz);

// Attempt lifecycle (enrolled students)
router.post('/courses/:courseId/:quizId/start', authorize('student'), requireCourseAccess, c.startAttempt);

// Teacher insights
router.get('/courses/:courseId/:quizId/attempts', requireCourseOwnership, validate(paginationSchema, 'query'), c.listAttempts);
router.get('/courses/:courseId/:quizId/stats', requireCourseOwnership, c.quizStats);
router.get('/courses/:courseId/:quizId/leaderboard', requireCourseAccess, c.leaderboard);
router.post('/courses/:courseId/:quizId/remind', requireCourseOwnership,
  validate(z.object({ message: z.string().max(1000).optional() })), c.remindStudents);

module.exports = router;
