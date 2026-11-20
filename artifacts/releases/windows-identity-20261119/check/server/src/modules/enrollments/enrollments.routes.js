const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { requirePermission } = require('../../middleware/authorize');
const { PERMISSIONS: P } = require('../../core/permissions');
const { requireCourseAccess, requireCourseOwnership } = require('../../middleware/courseAccess');
const { validate, paginationSchema } = require('../../middleware/validate');
const { codeRedemptionLimiter } = require('../../middleware/rateLimiters');
const { ENROLLMENT_PACKAGES } = require('../../config/constants');
const c = require('./enrollments.controller');

// What a student took, and what they paid for it. Both are optional so an
// enrollment can still be made in a hurry and corrected afterwards.
const paymentFields = {
  package: z.enum(ENROLLMENT_PACKAGES).optional(),
  amountPaid: z.number().min(0).max(1000000).optional(),
  paymentNote: z.string().max(300).trim().optional(),
};

const generateCodesSchema = z.object({
  count: z.number().int().min(1).max(500).default(1),
  maxUses: z.number().int().min(1).max(10000).default(1),
  expiresInDays: z.number().int().min(1).max(730).optional(),
  grantsAccessDays: z.number().int().min(0).max(3650).optional(),
  package: paymentFields.package,
  amountPaid: paymentFields.amountPaid,
});
const redeemSchema = z.object({ code: z.string().min(4).max(30).trim() });
const assignSchema = z.object({ student: z.string().min(3).max(200).trim(), ...paymentFields });
const paymentSchema = z.object(paymentFields).refine(
  (v) => v.package !== undefined || v.amountPaid !== undefined || v.paymentNote !== undefined,
  { message: 'Nothing to change' }
);
const expireSchema = z.object({ expiresAt: z.coerce.date().nullable() });

// Public certificate verification (QR-code target) — no auth required.
router.get('/certificates/verify/:serial', c.verifyCertificate);

router.use(authenticate);

// Student self-service
router.post('/redeem', authorize('student'), codeRedemptionLimiter, validate(redeemSchema), c.redeemCode);
router.get('/mine', authorize('student'), c.myEnrollments);
router.post('/courses/:courseId/favorite', authorize('student'), c.toggleFavorite);
router.get('/certificates/mine', authorize('student'), c.myCertificates);
router.post('/courses/:courseId/lessons/:lessonId/complete', authorize('student'), requireCourseAccess, c.completeLesson);

// Codes (access_codes.manage — admin and owner)
router.post('/courses/:courseId/codes', requirePermission(P.ACCESS_CODES_MANAGE), requireCourseOwnership, validate(generateCodesSchema), c.generateCodes);
router.get('/courses/:courseId/codes', requirePermission(P.ACCESS_CODES_MANAGE), requireCourseOwnership, validate(paginationSchema, 'query'), c.listCodes);
router.post('/courses/:courseId/codes/:codeId/revoke', requirePermission(P.ACCESS_CODES_MANAGE), requireCourseOwnership, c.revokeCode);

// Roster (course staff / admin); direct assignment needs enrollments.manage.
// listStudents returns each student's package to everyone here, and the money
// only to callers holding payments.manage — decided in the controller.
router.get('/courses/:courseId/students', requireCourseOwnership, validate(paginationSchema, 'query'), c.listStudents);
router.post('/courses/:courseId/students', requirePermission(P.ENROLLMENTS_MANAGE), requireCourseOwnership, validate(assignSchema), c.assignStudent);

// Payments: administrators and the owner only. A teacher gets 403 here even on
// their own course — the roster tells them the package, never the amount.
router.patch('/courses/:courseId/students/:studentId/payment', requirePermission(P.PAYMENTS_MANAGE), requireCourseOwnership, validate(paymentSchema), c.recordPayment);
router.get('/courses/:courseId/revenue', requirePermission(P.PAYMENTS_MANAGE), requireCourseOwnership, c.courseRevenue);
router.delete('/courses/:courseId/students/:studentId', requireCourseOwnership, c.removeStudent);
router.post('/courses/:courseId/students/:studentId/expire', requireCourseOwnership, validate(expireSchema), c.expireAccess);

module.exports = router;
