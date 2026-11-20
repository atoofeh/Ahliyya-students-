const mongoose = require('mongoose');
const { QUESTION_TYPES } = require('../config/constants');

const optionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // stable option id (a, b, c... or uuid)
    text: { type: String, default: '' },
    image: { type: String, default: null }, // FileAsset id (image_choice questions)
    isCorrect: { type: Boolean, default: false, select: false },
  },
  { _id: false }
);

/**
 * Course question bank. Questions belong to a course and are referenced by
 * quizzes directly or drawn from pools by tag/difficulty.
 *
 * Grading data (isCorrect, correctAnswers) is select:false so student-facing
 * queries can never leak answers by accident.
 */
const questionSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    text: { type: String, required: true, trim: true, maxlength: 10000 },
    image: { type: String, default: null }, // FileAsset id shown with the prompt

    // multiple_choice / true_false / image_choice
    options: { type: [optionSchema], default: [] },
    multipleCorrect: { type: Boolean, default: false },

    // short_answer / fill_blanks: accepted answers (case-insensitive match)
    // fill_blanks uses text with {{blank}} markers; correctAnswers aligns by index.
    correctAnswers: { type: [String], default: [], select: false },
    caseSensitive: { type: Boolean, default: false },

    points: { type: Number, default: 1, min: 0 },
    negativePoints: { type: Number, default: 0, min: 0 }, // deducted when wrong
    explanation: { type: String, trim: true, maxlength: 5000, default: '' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    tags: { type: [String], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

questionSchema.index({ course: 1, deletedAt: 1 });
questionSchema.index({ course: 1, tags: 1, difficulty: 1 });
questionSchema.index({ text: 'text' });

module.exports = mongoose.model('Question', questionSchema);
