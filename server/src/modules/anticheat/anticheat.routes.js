const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../core/asyncHandler');
const { requireCourseOwnership } = require('../../middleware/courseAccess');
const { validate, paginationSchema, objectId } = require('../../middleware/validate');
const { antiCheatLimiter } = require('../../middleware/rateLimiters');
const { CHEAT_EVENTS } = require('../../config/constants');
const AntiCheatService = require('./anticheat.service');

const eventsSchema = z.object({
  attemptId: objectId,
  events: z.array(z.object({
    type: z.enum(CHEAT_EVENTS),
    detail: z.string().max(1000).optional(),
    occurredAt: z.coerce.date().optional(),
  })).min(1).max(50),
});

router.use(authenticate);

// Student proctor beacon (batched events)
router.post('/events', authorize('student'), antiCheatLimiter, validate(eventsSchema),
  asyncHandler(async (req, res) => {
    const result = await AntiCheatService.recordEvents(req.user.id, req.body.attemptId, req.body.events, {
      ip: req.ip,
      fingerprint: req.headers['x-fingerprint'],
    });
    res.json(result);
  }));

// Reports
router.get('/attempts/:attemptId', authorize('teacher', 'admin'), asyncHandler(async (req, res) => {
  res.json(await AntiCheatService.attemptReport(req.params.attemptId));
}));
router.get('/courses/:courseId', requireCourseOwnership, validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await AntiCheatService.courseReport(req.course._id, req.query));
  }));
router.get('/platform', authorize('admin'), validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await AntiCheatService.platformReport(req.query));
  }));

module.exports = router;
