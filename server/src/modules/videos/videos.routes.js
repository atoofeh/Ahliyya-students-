const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { requireCourseOwnership } = require('../../middleware/courseAccess');
const { validate, objectId } = require('../../middleware/validate');
const { chunkUpload } = require('../../middleware/uploads');
const { chunkLimiter } = require('../../middleware/rateLimiters');
const c = require('./videos.controller');

const initSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  originalName: z.string().min(1).max(300),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().max(100).optional(),
});

const progressSchema = z.object({
  lessonId: objectId,
  positionSeconds: z.number().min(0),
  watchedDelta: z.number().min(0).max(600).optional(),
});

/**
 * The stream endpoint authenticates via signed token (HTML5 <video> cannot
 * send Authorization headers), so it sits OUTSIDE the authenticate chain.
 * Token = HMAC(resource + user + session + expiry), verified server-side,
 * and the bound session must still be active.
 */
router.get('/:videoId/stream', c.stream);

router.use(authenticate);

// Upload lifecycle (course owner/admin)
router.post('/courses/:courseId/uploads', authorize('teacher', 'admin'), requireCourseOwnership, validate(initSchema), c.initUpload);
router.post('/uploads/:uploadId/chunks', authorize('teacher', 'admin'), chunkLimiter, chunkUpload, c.uploadChunk);
router.get('/uploads/:uploadId/status', authorize('teacher', 'admin'), c.uploadStatus);
router.post('/uploads/:uploadId/complete', authorize('teacher', 'admin'), c.completeUpload);

// Course video listing (owner/admin)
router.get('/courses/:courseId', requireCourseOwnership, c.listCourseVideos);

// Playback (enrolled student / owner / admin)
router.post('/:videoId/token', c.streamToken);
router.post('/:videoId/progress', authorize('student'), validate(progressSchema), c.saveProgress);
router.get('/watermark/me', c.watermark);

router.delete('/:videoId', authorize('teacher', 'admin'), c.deleteVideo);

module.exports = router;
