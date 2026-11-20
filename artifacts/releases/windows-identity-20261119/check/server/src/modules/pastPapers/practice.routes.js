const router = require('express').Router({ mergeParams: true });
const { z } = require('zod');
const { requirePermission } = require('../../middleware/authorize');
const { PERMISSIONS: P, hasPermission } = require('../../core/permissions');
const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const { validate, objectId } = require('../../middleware/validate');
const FileAsset = require('../../models/FileAsset');
const PracticeQuestion = require('../../models/PracticeQuestion');

/**
 * Practice questions under a past paper — revision, not an exam.
 *
 * A student answers a question and is told at once whether it was right, as
 * often as they like; nothing is stored and no score goes anywhere. The key
 * never travels: the client posts what was chosen and the server answers.
 *
 * Administrators write the questions (the papers are photographs of
 * handwriting — nothing can read them out) and publish a paper's set once
 * they have checked it. Until then students see no practice at all.
 */

const LETTERS = 'abcdefghij';

const optionInput = z.object({
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean().optional(),
});
const questionInput = z.object({
  text: z.string().trim().min(1).max(4000),
  options: z.array(optionInput).min(2).max(10),
  explanation: z.string().trim().max(2000).optional(),
}).refine((q) => q.options.some((o) => o.isCorrect), {
  message: 'Mark the correct answer',
  path: ['options'],
});
// One question, or a batch pasted in at once.
const createSchema = z.union([questionInput, z.object({ items: z.array(questionInput).min(1).max(300) })]);
const publishSchema = z.object({ published: z.boolean() });
const checkSchema = z.object({ selectedOptionIds: z.array(z.string().max(4)).max(10) });
const paperParams = z.object({ id: objectId });
const questionParams = z.object({ id: objectId, questionId: objectId });

const canEdit = (user) => hasPermission(user.role, P.FILES_GLOBAL);

/** The paper, or 404 — never a course file that happens to share an id. */
const getPaper = async (id) => {
  const paper = await FileAsset.findOne({ _id: id, scope: 'past_paper', deletedAt: null })
    .select('title practicePublished').lean();
  if (!paper) throw ApiError.notFound('Paper not found');
  return paper;
};

const shape = (q) => ({
  _id: q._id,
  text: q.text,
  multipleCorrect: q.multipleCorrect,
  options: q.options.map((o) => ({ id: o.id, text: o.text })),
});

const toDoc = (q, paperId, userId, order) => {
  const options = q.options.map((o, i) => ({ id: LETTERS[i], text: o.text, isCorrect: !!o.isCorrect }));
  return {
    paper: paperId,
    createdBy: userId,
    order,
    text: q.text,
    options,
    multipleCorrect: options.filter((o) => o.isCorrect).length > 1,
    explanation: q.explanation || '',
  };
};

// ── reading ──────────────────────────────────────────────────────────
router.get('/', validate(paperParams, 'params'), asyncHandler(async (req, res) => {
  const paper = await getPaper(req.params.id);
  const staff = canEdit(req.user);
  if (!staff && !paper.practicePublished) return res.json({ published: false, items: [] });

  const query = PracticeQuestion.find({ paper: paper._id, deletedAt: null }).sort({ order: 1, createdAt: 1 });
  // Staff are editing the answers, so they get the key; nobody else can.
  const items = await (staff ? query.select('+options.isCorrect') : query).lean();
  res.json({
    published: !!paper.practicePublished,
    items: staff
      ? items.map((q) => ({ ...shape(q), explanation: q.explanation, options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: !!o.isCorrect })) }))
      : items.map(shape),
  });
}));

/** Was that right? The one place a student's answer meets the key. */
router.post('/:questionId/check', validate(questionParams, 'params'), validate(checkSchema),
  asyncHandler(async (req, res) => {
    const paper = await getPaper(req.params.id);
    if (!canEdit(req.user) && !paper.practicePublished) throw ApiError.notFound('Paper not found');
    const question = await PracticeQuestion.findOne({ _id: req.params.questionId, paper: paper._id, deletedAt: null })
      .select('+options.isCorrect').lean();
    if (!question) throw ApiError.notFound('Question not found');

    const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
    const chosen = [...new Set(req.body.selectedOptionIds)];
    const correct = chosen.length === correctIds.length && chosen.every((id) => correctIds.includes(id));
    res.json({ correct, correctOptionIds: correctIds, explanation: question.explanation || '' });
  }));

// ── writing (administrators and the owner) ───────────────────────────
router.post('/', requirePermission(P.FILES_GLOBAL), validate(paperParams, 'params'), validate(createSchema),
  asyncHandler(async (req, res) => {
    const paper = await getPaper(req.params.id);
    const incoming = Array.isArray(req.body.items) ? req.body.items : [req.body];
    const last = await PracticeQuestion.findOne({ paper: paper._id, deletedAt: null }).sort({ order: -1 }).select('order').lean();
    let order = (last?.order ?? -1) + 1;
    const created = await PracticeQuestion.insertMany(
      incoming.map((q) => toDoc(q, paper._id, req.user.id, order++))
    );
    res.status(201).json({ added: created.length });
  }));

router.patch('/:questionId', requirePermission(P.FILES_GLOBAL), validate(questionParams, 'params'), validate(questionInput),
  asyncHandler(async (req, res) => {
    const paper = await getPaper(req.params.id);
    const existing = await PracticeQuestion.findOne({ _id: req.params.questionId, paper: paper._id, deletedAt: null });
    if (!existing) throw ApiError.notFound('Question not found');
    const doc = toDoc(req.body, paper._id, existing.createdBy, existing.order);
    await PracticeQuestion.updateOne({ _id: existing._id }, { $set: doc });
    res.json({ message: 'Question saved' });
  }));

router.delete('/:questionId', requirePermission(P.FILES_GLOBAL), validate(questionParams, 'params'),
  asyncHandler(async (req, res) => {
    const paper = await getPaper(req.params.id);
    const { modifiedCount } = await PracticeQuestion.updateOne(
      { _id: req.params.questionId, paper: paper._id, deletedAt: null },
      { $set: { deletedAt: new Date() } }
    );
    if (!modifiedCount) throw ApiError.notFound('Question not found');
    res.json({ message: 'Question removed' });
  }));

/** Open the set to students, or take it back for more editing. */
router.post('/publish', requirePermission(P.FILES_GLOBAL), validate(paperParams, 'params'), validate(publishSchema),
  asyncHandler(async (req, res) => {
    const paper = await getPaper(req.params.id);
    if (req.body.published) {
      const count = await PracticeQuestion.countDocuments({ paper: paper._id, deletedAt: null });
      if (!count) throw ApiError.badRequest('Add a question before publishing');
    }
    await FileAsset.updateOne({ _id: paper._id }, { $set: { practicePublished: req.body.published } });
    res.json({ published: req.body.published });
  }));

module.exports = router;
