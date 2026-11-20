const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { requirePermission } = require('../../middleware/authorize');
const { PERMISSIONS: P } = require('../../core/permissions');
const { validate, paginationSchema, objectId } = require('../../middleware/validate');
const { paginatedQuery } = require('../../core/pagination');
const NewsPost = require('../../models/NewsPost');

/**
 * The institution's news feed.
 *
 * Anyone signed in can read it; only administrators and the owner post. It is
 * a wall, not a notification channel — nothing here pushes to a phone, which
 * is what keeps a photo of a prize-giving from buzzing three hundred students.
 * Announcements remain the way to actually tell a course something.
 */
const postSchema = z.object({
  title: z.string().max(200).trim().optional().default(''),
  body: z.string().max(5000).trim().optional().default(''),
  images: z.array(objectId).max(10).optional().default([]),
  pinned: z.boolean().optional().default(false),
}).refine(
  (v) => v.title.trim() || v.body.trim() || v.images.length,
  { message: 'A post needs a picture, some words, or both' }
);

router.use(authenticate);

/** The feed. Pinned posts first, then newest. */
router.get('/', validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
  const page = await paginatedQuery(NewsPost, { deletedAt: null }, {
    page: req.query.page,
    limit: req.query.limit,
    populate: { path: 'author', select: 'name role' },
    sort: { pinned: -1, createdAt: -1 },
  });
  res.json(page);
}));

router.post('/', requirePermission(P.ANNOUNCEMENTS_GLOBAL), validate(postSchema), asyncHandler(async (req, res) => {
  const post = await NewsPost.create({ ...req.body, author: req.user.id });
  await audit({ user: req.user.id, action: 'NEWS_POSTED', ip: req.ip, resource: `news:${post._id}` });
  res.status(201).json(post);
}));

router.patch('/:postId', requirePermission(P.ANNOUNCEMENTS_GLOBAL), validate(postSchema), asyncHandler(async (req, res) => {
  const post = await NewsPost.findOneAndUpdate(
    { _id: req.params.postId, deletedAt: null }, { $set: req.body }, { new: true }
  );
  if (!post) throw ApiError.notFound('Post not found');
  await audit({ user: req.user.id, action: 'NEWS_UPDATED', ip: req.ip, resource: `news:${post._id}` });
  res.json(post);
}));

router.delete('/:postId', requirePermission(P.ANNOUNCEMENTS_GLOBAL), asyncHandler(async (req, res) => {
  const post = await NewsPost.findOne({ _id: req.params.postId, deletedAt: null });
  if (!post) throw ApiError.notFound('Post not found');
  post.deletedAt = new Date();
  await post.save();
  await audit({ user: req.user.id, action: 'NEWS_DELETED', ip: req.ip, resource: `news:${post._id}` });
  res.json({ message: 'Post removed' });
}));

module.exports = router;
