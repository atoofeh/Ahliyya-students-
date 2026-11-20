const router = require('express').Router();

/**
 * API v1 — versioned module mounting. New versions mount alongside as
 * routes/v2.js without touching module internals.
 */
router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/account', require('../modules/accounts/accounts.routes'));
router.use('/admin', require('../modules/admin/admin.routes'));
router.use('/courses', require('../modules/courses/courses.routes'));
router.use('/co-teaching', require('../modules/courses/coteach.routes'));
router.use('/enrollments', require('../modules/enrollments/enrollments.routes'));
router.use('/videos', require('../modules/videos/videos.routes'));
router.use('/quizzes', require('../modules/quizzes/quizzes.routes'));
router.use('/assignments', require('../modules/assignments/assignments.routes'));
router.use('/files', require('../modules/files/files.routes'));
router.use('/anticheat', require('../modules/anticheat/anticheat.routes'));
router.use('/notifications', require('../modules/notifications/notifications.routes'));
router.use('/announcements', require('../modules/announcements/announcements.routes'));
router.use('/news', require('../modules/news/news.routes'));
router.use('/past-papers', require('../modules/pastPapers/pastPapers.routes'));
router.use('/analytics', require('../modules/analytics/analytics.routes'));
router.use('/search', require('../modules/search/search.routes'));
router.use('/qa', require('../modules/qa/qa.routes'));
router.use('/bookmarks', require('../modules/bookmarks/bookmarks.routes'));

module.exports = router;
