const fs = require('fs');
const { requirePermission } = require('../../middleware/authorize');
const { PERMISSIONS: P } = require('../../core/permissions');
const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const { requireCourseOwnership, requireCourseAccess, isFreeLessonMedia } = require('../../middleware/courseAccess');
const { documentUpload, imageUpload } = require('../../middleware/uploads');
const { uploadLimiter } = require('../../middleware/rateLimiters');
const { validate, paginationSchema } = require('../../middleware/validate');
const FileService = require('./files.service');
const { staffCourseFilter } = require('../courses/courseStaff');

router.use(authenticate);

// Course-scoped uploads (owner/admin)
router.post('/courses/:courseId/documents', uploadLimiter, requireCourseOwnership, documentUpload,
  asyncHandler(async (req, res) => {
    const asset = await FileService.upload(req.file, {
      uploadedBy: req.user.id, course: req.course._id, kind: 'documents', scope: 'course',
      downloadable: req.body.downloadable !== 'false',
    }, req.ip);
    res.status(201).json(asset);
  }));

router.post('/courses/:courseId/images', uploadLimiter, requireCourseOwnership, imageUpload,
  asyncHandler(async (req, res) => {
    const scope = req.body.scope === 'thumbnail' ? 'thumbnail' : req.body.scope === 'question' ? 'question' : 'course';
    const asset = await FileService.upload(req.file, {
      uploadedBy: req.user.id, course: req.course._id, kind: 'images', scope,
      allowSvg: scope === 'thumbnail', // SVG can carry scripts; thumbnails are served as attachments only
    }, req.ip);
    res.status(201).json(asset);
  }));

// News images (admin only). Not course-scoped: the feed belongs to the
// institution. Served like any other file, through the authorised route.
router.post('/news-image', uploadLimiter, requirePermission(P.ANNOUNCEMENTS_GLOBAL), imageUpload,
  asyncHandler(async (req, res) => {
    const asset = await FileService.upload(req.file, {
      uploadedBy: req.user.id, kind: 'images', scope: 'news',
    }, req.ip);
    res.status(201).json(asset);
  }));

// Global documents (admin only)
router.post('/global', uploadLimiter, requirePermission(P.FILES_GLOBAL), documentUpload,
  asyncHandler(async (req, res) => {
    const asset = await FileService.upload(req.file, {
      uploadedBy: req.user.id, kind: 'documents', scope: 'global',
    }, req.ip);
    res.status(201).json(asset);
  }));
router.get('/global', validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
  res.json(await FileService.listGlobalFiles(req.query));
}));

// Student submission attachments (any authenticated student)
router.post('/submissions', uploadLimiter, authorize('student'), documentUpload,
  asyncHandler(async (req, res) => {
    const asset = await FileService.upload(req.file, {
      uploadedBy: req.user.id, kind: 'documents', scope: 'submission',
    }, req.ip);
    res.status(201).json(asset);
  }));

// Avatars
router.post('/avatar', uploadLimiter, imageUpload, asyncHandler(async (req, res) => {
  const asset = await FileService.upload(req.file, {
    uploadedBy: req.user.id, kind: 'images', scope: 'avatar',
  }, req.ip);
  const User = require('../../models/User');
  await User.updateOne({ _id: req.user.id }, { $set: { avatar: String(asset._id) } });
  res.status(201).json(asset);
}));

// Course file listing
router.get('/courses/:courseId', requireCourseAccess, validate(paginationSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await FileService.listCourseFiles(req.course._id, req.query));
  }));

/**
 * Serve file content. Access:
 *  - global/avatar/thumbnail/news/past_paper scope → any authenticated user
 *  - course scope → enrolled student / owner / admin
 *  - submission scope → uploader, course staff, admin
 */
router.get('/:fileId/content', asyncHandler(async (req, res) => {
  const asset = await FileService.getForServing(req.params.fileId);

  if (asset.scope === 'course' || asset.scope === 'question') {
    // A document on a free lesson opens for anyone signed in — the same rule the
    // lesson route applies, asked in one place so the two cannot drift.
    // Question images are never free: only Lesson.fileAsset can match.
    const free = () => isFreeLessonMedia({ courseId: asset.course, fileAsset: asset._id });
    if (req.user.role === 'student') {
      const Enrollment = require('../../models/Enrollment');
      const enrolled = await Enrollment.findOne({ student: req.user.id, course: asset.course, status: 'active' });
      if (!enrolled && !(await free())) throw ApiError.forbidden('Not enrolled');
    } else if (req.user.role === 'teacher') {
      const Course = require('../../models/Course');
      const owns = await Course.findOne({ _id: asset.course, ...staffCourseFilter(req.user.id) });
      if (!owns && !(await free())) throw ApiError.forbidden('Not your course');
    }
  } else if (asset.scope === 'submission') {
    if (req.user.role === 'student' && String(asset.uploadedBy) !== String(req.user.id)) {
      throw ApiError.forbidden('Not your file');
    }
  }

  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Length', asset.sizeBytes);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // SVG is never rendered inline from this origin (script execution); everything else that browsers render safely is.
  const inline = (asset.mimeType.startsWith('image/') && asset.mimeType !== 'image/svg+xml') || asset.mimeType === 'application/pdf';
  res.setHeader(
    'Content-Disposition',
    `${inline && !req.query.download ? 'inline' : 'attachment'}; filename="${encodeURIComponent(asset.originalName)}"`
  );
  fs.createReadStream(asset.storagePath).pipe(res);
}));

router.delete('/:fileId', asyncHandler(async (req, res) => {
  await FileService.remove(req.params.fileId, req.user, req.ip);
  res.json({ message: 'File deleted' });
}));

module.exports = router;
