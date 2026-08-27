const mongoose = require('mongoose');
const { ATTEMPT_STATUS } = require('../config/constants');

/**
 * A student's attempt. Questions are snapshotted at start (immune to later
 * edits) with per-attempt shuffled ordering. Answer key lives only in the
 * snapshot's select:false fields.
 */
const snapshotOptionSchema = new mongoose.Schema(
  { id: String, text: String, image: String, isCorrect: { type: Boolean, select: false } },
  { _id: false }
);

const questionSnapshotSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: String,
    text: String,
    image: String,
    options: [snapshotOptionSchema],
    multipleCorrect: Boolean,
    correctAnswers: { type: [String], select: false },
    caseSensitive: Boolean,
    points: Number,
    negativePoints: Number,
    explanation: { type: String, select: false },
  },
  { _id: false }
);

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    selectedOptionIds: { type: [String], default: [] }, // choice questions
    textAnswer: { type: String, default: '' }, // short answer / essay
    blanks: { type: [String], default: [] }, // fill_blanks
    // Grading
    autoGraded: { type: Boolean, default: false },
    isCorrect: { type: Boolean, default: null },
    pointsAwarded: { type: Number, default: 0 },
    graderFeedback: { type: String, default: '' },
    needsManualGrading: { type: Boolean, default: false },
  },
  { _id: false }
);

const quizAttemptSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    attemptNumber: { type: Number, default: 1 },

    questionsSnapshot: { type: [questionSnapshotSchema], required: true },
    answers: { type: [answerSchema], default: [] },
    answersSavedAt: { type: Date, default: null }, // client timestamp of the last accepted autosave

    status: { type: String, enum: ATTEMPT_STATUS, default: 'in_progress' },
    score: { type: Number, default: 0 }, // points earned
    maxScore: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
    passed: { type: Boolean, default: null },
    pendingManualGrading: { type: Boolean, default: false },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Anti-cheat aggregation for this attempt
    violationCount: { type: Number, default: 0 },
    riskScore: { type: Number, default: 0 }, // weighted, 0-100
    invalidatedReason: { type: String, default: null },

    startedAt: { type: Date, default: Date.now },
    deadlineAt: { type: Date, default: null }, // startedAt + time limit
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

quizAttemptSchema.index({ quiz: 1, student: 1 });
quizAttemptSchema.index({ student: 1, status: 1, createdAt: -1 });
quizAttemptSchema.index({ course: 1, status: 1 });
quizAttemptSchema.index({ quiz: 1, percent: -1 }); // leaderboard

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
