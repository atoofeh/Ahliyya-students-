const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { requirePermission } = require('../../middleware/authorize');
const { PERMISSIONS: P } = require('../../core/permissions');
const { requireCourseAccess, requireCourseOwnership } = require('../../middleware/courseAccess');
const { validate, paginationSchema } = require('../../middleware/validate');
const { codeRedemptionLimiter } = require('../../middleware/rateLimiters');
const c = require('./enrollments.controller');

const generateCodesSchema = z.object({
  count: z.number().int().min(1).max(500).default(1),
  maxUses: z.number().int().min(1).max(10000).default(1),
  expiresInDays: z.number().int().min(1).max(730).optional(),
  grantsAccessDays: z.number().int().min(0).max(3650).optional(),
});
const redeemSchema = z.object({ code: z.string().min(4).max(30).trim() });
const assignSchema = z.object({ student: z.string().min(3).max(200).trim() });
const expireSchema = z.object({ expiresAt: z.coerce.date().nullable() });

// Public certificate verification (QR-code target) — no auth required.
router.get('/certificates/verify/:serial', c.verifyCertificate);

router.use(authenticate);

// Student self-service
router.post('/redeem', authorize('student'), codeRedemptionLimiter, validate(redeemSchema), c.redeemCode);
router.post('/courses/:courseId/enroll', authorize('student'), c.enrollPublic);
router.get('/mine', authorize('student'), c.myEnrollments);
router.post('/courses/:courseId/favorite', authorize('student'), c.toggleFavorite);
router.get('/certificates/mine', authorize('student'), c.myCertificates);
router.post('/courses/:courseId/lessons/:lessonId/complete', authorize('student'), requireCourseAccess, c.completeLesson);

// Codes (access_codes.manage — admin and owner)
router.post('/courses/:courseId/codes', requirePermission(P.ACCESS_CODES_MANAGE), requireCourseOwnership, validate(generateCodesSchema), c.generateCodes);
router.get('/courses/:courseId/codes', requirePermission(P.ACCESS_CODES_MANAGE), requireCourseOwnership, validate(paginationSchema, 'query'), c.listCodes);
router.post('/courses/:courseId/codes/:codeId/revoke', requirePermission(P.ACCESS_CODES_MANAGE), requireCourseOwnership, c.revokeCode);

// Roster (course owner / admin); direct assignment needs enrollments.manage
router.get('/courses/:courseId/students', requireCourseOwnership, validate(paginationSchema, 'query'), c.listStudents);
router.post('/courses/:courseId/students', requirePermission(P.ENROLLMENTS_MANAGE), requireCourseOwnership, validate(assignSchema), c.assignStudent);
router.delete('/courses/:courseId/students/:studentId', requireCourseOwnership, c.removeStudent);
router.post('/courses/:courseId/students/:studentId/expire', requireCourseOwnership, validate(expireSchema), c.expireAccess);

module.exports = router;
