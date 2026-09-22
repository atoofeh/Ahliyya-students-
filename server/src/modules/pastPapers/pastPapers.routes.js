const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/authorize');
const { PERMISSIONS: P } = require('../../core/permissions');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const { validate, objectId } = require('../../middleware/validate');
const { documentUpload } = require('../../middleware/uploads');
const { uploadLimiter } = require('../../middleware/rateLimiters');
const FileService = require('../files/files.service');
const FileAsset = require('../../models/FileAsset');

/**
 * Past questions: papers from earlier exams — at present the answer papers for
 * the استدراكي — that every student can read and administrators curate.
 *
 * Deliberately not tied to a course. A student retaking an exam may no longer
 * be enrolled in anything, and those are exactly the people these are for.
 * The bytes are served through the ordinary authorized file route; this module
 * only lists, adds, renames and removes.
 */

const LIST_FIELDS = 'title subject originalName mimeType sizeBytes createdAt';

const metaSchema = z.object({
  title: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(100).optional(),
});
const idParams = z.object({ id: objectId });

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const items = await FileAsset.find({ scope: 'past_paper', deletedAt: null })
    .select(LIST_FIELDS)
    .sort({ subject: 1, title: 1, createdAt: -1 })
    .lean();
  res.json({ items });
}));

router.post('/', uploadLimiter, requirePermission(P.FILES_GLOBAL), documentUpload, validate(metaSchema),
  asyncHandler(async (req, res) => {
    // A title nobody typed falls back to the filename without its extension.
    const fallback = String(req.file?.originalname || '').replace(/\.[^.]+$/, '');
    const asset = await FileService.upload(req.file, {
      uploadedBy: req.user.id,
      kind: 'documents',
      scope: 'past_paper',
      title: req.body.title || fallback,
      subject: req.body.subject || '',
    }, req.ip);
    res.status(201).json(await FileAsset.findById(asset._id).select(LIST_FIELDS).lean());
  }));

router.patch('/:id', requirePermission(P.FILES_GLOBAL), validate(idParams, 'params'), validate(metaSchema),
  asyncHandler(async (req, res) => {
    const doc = await FileAsset.findOneAndUpdate(
      { _id: req.params.id, scope: 'past_paper', deletedAt: null },
      { $set: { ...(req.body.title !== undefined && { title: req.body.title }), ...(req.body.subject !== undefined && { subject: req.body.subject }) } },
      { new: true }
    ).select(LIST_FIELDS).lean();
    if (!doc) throw ApiError.notFound('Paper not found');
    res.json(doc);
  }));

router.delete('/:id', requirePermission(P.FILES_GLOBAL), validate(idParams, 'params'),
  asyncHandler(async (req, res) => {
    // Only a paper can be removed through here — never a course file by id.
    const exists = await FileAsset.exists({ _id: req.params.id, scope: 'past_paper', deletedAt: null });
    if (!exists) throw ApiError.notFound('Paper not found');
    await FileService.remove(req.params.id, req.user, req.ip);
    res.json({ message: 'Paper removed' });
  }));

module.exports = router;
