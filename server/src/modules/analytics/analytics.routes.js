const router = require('express').Router();
const { requirePermission } = require('../../middleware/authorize');
const { PERMISSIONS: P } = require('../../core/permissions');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../core/asyncHandler');
const audit = require('../../core/audit');
const { requireCourseOwnership } = require('../../middleware/courseAccess');
const AnalyticsService = require('./analytics.service');

router.use(authenticate);

router.get('/student', authorize('student'), asyncHandler(async (req, res) => {
  res.json(await AnalyticsService.studentDashboard(req.user.id));
}));

router.get('/teacher', authorize('teacher'), asyncHandler(async (req, res) => {
  res.json(await AnalyticsService.teacherDashboard(req.user.id));
}));

router.get('/courses/:courseId', requireCourseOwnership, asyncHandler(async (req, res) => {
  res.json(await AnalyticsService.courseAnalytics(req.course._id));
}));

router.get('/admin', requirePermission(P.ANALYTICS_GLOBAL), asyncHandler(async (req, res) => {
  res.json(await AnalyticsService.adminDashboard());
}));

router.get('/admin/report', requirePermission(P.ANALYTICS_GLOBAL), asyncHandler(async (req, res) => {
  const report = await AnalyticsService.platformReport();
  await audit({ user: req.user.id, action: 'REPORT_GENERATED', ip: req.ip });
  res.json(report);
}));

module.exports = router;
