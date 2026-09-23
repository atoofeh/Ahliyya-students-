const mongoose = require('mongoose');

/**
 * A practice question attached to a past paper.
 *
 * Separate from `Question`, which belongs to a course and is drawn into graded
 * `Quiz` attempts with an anti-cheat policy behind it. These are revision:
 * institution-wide like the papers themselves, answered as often as a student
 * likes, never scored and never reported. Keeping them apart leaves the graded
 * path — and its enrollment and ownership rules — untouched.
 *
 * `isCorrect` is `select:false`, the same rule the question bank follows: a
 * student-facing read cannot leak the key by forgetting to project it away.
 */
const optionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // 'a', 'b', 'c'… assigned server-side
    text: { type: String, default: '', trim: true, maxlength: 500 },
    isCorrect: { type: Boolean, default: false, select: false },
  },
  { _id: false }
);

const practiceQuestionSchema = new mongoose.Schema(
  {
    paper: { type: mongoose.Schema.Types.ObjectId, ref: 'FileAsset', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: Number, default: 0 },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
    options: { type: [optionSchema], default: [] },
    multipleCorrect: { type: Boolean, default: false },
    explanation: { type: String, trim: true, maxlength: 2000, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

practiceQuestionSchema.index({ paper: 1, deletedAt: 1, order: 1 });

module.exports = mongoose.model('PracticeQuestion', practiceQuestionSchema);
