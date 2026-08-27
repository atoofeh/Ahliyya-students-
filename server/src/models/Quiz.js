const mongoose = require('mongoose');

/**
 * Quiz definition. Question selection is either an explicit list or a pool
 * (random draw filtered by tags/difficulty at attempt start).
 */
const quizSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },

    // Question selection
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    pool: {
      enabled: { type: Boolean, default: false },
      drawCount: { type: Number, default: 10 },
      tags: { type: [String], default: [] },
      difficulty: { type: String, enum: [null, 'easy', 'medium', 'hard'], default: null },
    },

    // Behavior
    timeLimitMinutes: { type: Number, default: 0 }, // 0 = untimed
    shuffleQuestions: { type: Boolean, default: true },
    shuffleAnswers: { type: Boolean, default: true },
    passingScore: { type: Number, default: 60, min: 0, max: 100 },
    maxAttempts: { type: Number, default: 1, min: 0 }, // 0 = unlimited
    negativeMarking: { type: Boolean, default: false },
    showExplanations: { type: Boolean, default: true },
    showResultsImmediately: { type: Boolean, default: true },
    leaderboardEnabled: { type: Boolean, default: false },

    // Scheduling & locking
    availableFrom: { type: Date, default: null },
    availableUntil: { type: Date, default: null },
    isLocked: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },

    // Anti-cheat policy for this quiz
    antiCheat: {
      enabled: { type: Boolean, default: true },
      requireFullscreen: { type: Boolean, default: true },
      maxViolations: { type: Number, default: 10 }, // auto-submit past this
      blockCopyPaste: { type: Boolean, default: true },
    },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

quizSchema.index({ course: 1, deletedAt: 1, isPublished: 1 });
quizSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Quiz', quizSchema);
