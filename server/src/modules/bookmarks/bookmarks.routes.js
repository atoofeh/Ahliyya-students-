const router = require('express').Router();
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const { validate, objectId } = require('../../middleware/validate');
const Bookmark = require('../../models/Bookmark');
const Lesson = require('../../models/Lesson');

const createSchema = z.object({
  lesson: objectId,
  note: z.string().max(1000).optional().default(''),
  timestampSeconds: z.number().min(0).nullable().optional(),
});

router.use(authenticate, authorize('student'));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const lesson = await Lesson.findOne({ _id: req.body.lesson, deletedAt: null });
  if (!lesson) throw ApiError.notFound('Lesson not found');
  const Enrollment = require('../../models/Enrollment');
  const enrolled = await Enrollment.findOne({ student: req.user.id, course: lesson.course, status: 'active' });
  if (!enrolled) throw ApiError.forbidden('Not enrolled in this course');

  const bookmark = await Bookmark.create({
    student: req.user.id,
    course: lesson.course,
    lesson: lesson._id,
    note: req.body.note,
    timestampSeconds: req.body.timestampSeconds ?? null,
  });
  res.status(201).json(bookmark);
}));

router.get('/', asyncHandler(async (req, res) => {
  const bookmarks = await Bookmark.find({ student: req.user.id })
    .populate('lesson', 'title type')
    .populate('course', 'title')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json(bookmarks.filter((b) => b.lesson && b.course));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await Bookmark.deleteOne({ _id: req.params.id, student: req.user.id });
  if (!result.deletedCount) throw ApiError.notFound('Bookmark not found');
  res.json({ message: 'Bookmark removed' });
}));

module.exports = router;
